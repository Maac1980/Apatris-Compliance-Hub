/**
 * Employer enrichment via Polish Ministerstwo Finansów "Biała Lista" API.
 *
 * Sub-phase B3 Track 2: when document intake extracts an employer's NIP,
 * this service validates it against wl-api.mf.gov.pl and returns a
 * structured company record (REGON, KRS, addresses, VAT status, bank
 * accounts). Lawyers use this to confirm the employer is registered and
 * VAT-active before relying on intake-extracted facts.
 *
 * Design:
 *  - Fail open: lookup errors return null + structured warning log; intake
 *    flow continues. Never throws.
 *  - statusVat is surfaced even on success ("Czynny" | "Zwolniony" |
 *    "Niezarejestrowany" | "Wykreślony"). An unregistered employer is a
 *    successful response that the UI must show prominently.
 *  - 15-second AbortSignal timeout matching the regulatory-intelligence /
 *    regulatory-ingestion services pattern.
 *  - No caching in B3; ~5 PDFs/day intake volume doesn't justify it.
 *  - Track 3 (name → NIP) is deferred per Step A findings.
 *
 * API confirmed working 2026-04-24 against APATRIS NIP 5252828706
 * (see Step 3A report).
 */

const BIALA_LISTA_BASE = "https://wl-api.mf.gov.pl";
const REQUEST_TIMEOUT_MS = 15_000;

export interface BialaListaCompany {
  nip: string;
  regon: string | null;
  krs: string | null;
  name: string;
  workingAddress: string | null;
  residenceAddress: string | null;
  /** "Czynny" | "Zwolniony" | "Niezarejestrowany" | "Wykreślony" */
  statusVat: string;
  accountNumbers: string[];
  registrationLegalDate: string | null;
}

export interface EmployerLookupResult {
  source: "biala_lista";
  data: BialaListaCompany | null;
  /** Populated when data is null — distinguishes "no such company" from "API down". */
  error?: string;
  /** ISO timestamp of when the lookup completed (success or failure). */
  fetchedAt: string;
}

/** Normalize NIP input: strip dashes, spaces, and any non-digit. Returns
 *  the cleaned NIP if exactly 10 digits remain, otherwise null. */
function normalizeNip(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

function todayDateString(): string {
  // Biała Lista expects YYYY-MM-DD. Use UTC to be deterministic.
  return new Date().toISOString().slice(0, 10);
}

interface BialaListaResponse {
  result?: {
    subject?: {
      name?: string;
      nip?: string;
      regon?: string | null;
      krs?: string | null;
      workingAddress?: string | null;
      residenceAddress?: string | null;
      statusVat?: string;
      accountNumbers?: string[];
      registrationLegalDate?: string | null;
    } | null;
  };
}

function mapSubject(subject: NonNullable<NonNullable<BialaListaResponse["result"]>["subject"]>): BialaListaCompany {
  return {
    nip: String(subject.nip ?? ""),
    regon: subject.regon ?? null,
    krs: subject.krs ?? null,
    name: String(subject.name ?? ""),
    workingAddress: subject.workingAddress ?? null,
    residenceAddress: subject.residenceAddress ?? null,
    statusVat: String(subject.statusVat ?? "Niezarejestrowany"),
    accountNumbers: Array.isArray(subject.accountNumbers) ? subject.accountNumbers : [],
    registrationLegalDate: subject.registrationLegalDate ?? null,
  };
}

/** Look up a Polish employer by NIP via Biała Lista. Fail open — errors
 *  are reported via the returned EmployerLookupResult.error field, never
 *  thrown. Caller is expected to log warnings as appropriate. */
export async function lookupByNip(nip: string | null | undefined): Promise<EmployerLookupResult | null> {
  const fetchedAt = new Date().toISOString();

  if (!nip || typeof nip !== "string" || nip.trim() === "") {
    return null; // Empty input → caller skips enrichment silently.
  }

  const normalized = normalizeNip(nip);
  if (!normalized) {
    console.warn(`[employer-lookup] invalid_format nip=${JSON.stringify(nip)}`);
    return { source: "biala_lista", data: null, error: "invalid_format", fetchedAt };
  }

  const url = `${BIALA_LISTA_BASE}/api/search/nip/${normalized}?date=${todayDateString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { "Accept": "application/json", "User-Agent": "Apatris-Intake/1.0" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const msg = (e as Error).message ?? "fetch_error";
    const isTimeout = /timeout|abort/i.test(msg);
    const errLabel = isTimeout ? "timeout" : `fetch_error:${msg}`;
    console.warn(`[employer-lookup] ${errLabel} nip=${normalized}`);
    return { source: "biala_lista", data: null, error: errLabel, fetchedAt };
  }

  if (res.status >= 400 && res.status < 500) {
    console.warn(`[employer-lookup] biala_lista_${res.status} nip=${normalized}`);
    return { source: "biala_lista", data: null, error: `biala_lista_${res.status}`, fetchedAt };
  }

  if (res.status >= 500) {
    console.warn(`[employer-lookup] biala_lista_${res.status} nip=${normalized}`);
    return { source: "biala_lista", data: null, error: `biala_lista_${res.status}`, fetchedAt };
  }

  let body: BialaListaResponse;
  try {
    body = await res.json() as BialaListaResponse;
  } catch (e) {
    console.warn(`[employer-lookup] parse_error nip=${normalized} msg=${(e as Error).message}`);
    return { source: "biala_lista", data: null, error: "parse_error", fetchedAt };
  }

  const subject = body.result?.subject;
  if (!subject) {
    return { source: "biala_lista", data: null, error: "not_found", fetchedAt };
  }

  return {
    source: "biala_lista",
    data: mapSubject(subject),
    fetchedAt,
  };
}
