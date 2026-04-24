import { describe, it, expect, vi, beforeEach } from "vitest";
import { lookupByNip } from "./employer-lookup.service.js";

const APATRIS_NIP = "5252828706";

function bialaResponse(subject: Record<string, unknown> | null, status = 200): Response {
  const body = subject === null
    ? { result: { subject: null, requestId: "x", requestDateTime: "test" } }
    : { result: { subject, requestId: "x", requestDateTime: "test" } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupByNip", () => {
  it("happy path: 10-digit NIP → maps Biała Lista response to BialaListaCompany", async () => {
    const fetchMock = vi.fn().mockResolvedValue(bialaResponse({
      name: "APATRIS SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
      nip: APATRIS_NIP,
      regon: "386546470",
      krs: "0000849614",
      workingAddress: "CHŁODNA 51, 00-867 WARSZAWA",
      residenceAddress: null,
      statusVat: "Czynny",
      accountNumbers: ["14109018700000000146743014"],
      registrationLegalDate: "2020-10-31",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await lookupByNip(APATRIS_NIP);

    expect(r).not.toBeNull();
    expect(r!.source).toBe("biala_lista");
    expect(r!.error).toBeUndefined();
    expect(r!.data).toMatchObject({
      nip: APATRIS_NIP,
      regon: "386546470",
      krs: "0000849614",
      statusVat: "Czynny",
    });
    expect(r!.data!.accountNumbers).toContain("14109018700000000146743014");
    expect(r!.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    expect(fetchMock).toHaveBeenCalledOnce();
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`/api/search/nip/${APATRIS_NIP}`);
    expect(url).toContain("date=");
  });

  it("invalid NIP format: < 10 digits → returns error 'invalid_format' without HTTP call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const r = await lookupByNip("123");

    expect(r).not.toBeNull();
    expect(r!.data).toBeNull();
    expect(r!.error).toBe("invalid_format");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("API 4xx (e.g., 404): returns error label, fail open", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    ));

    const r = await lookupByNip(APATRIS_NIP);

    expect(r!.data).toBeNull();
    expect(r!.error).toBe("biala_lista_404");
  });

  it("API 5xx (server down): returns error label, fail open", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("Internal Server Error", { status: 503 }),
    ));

    const r = await lookupByNip(APATRIS_NIP);

    expect(r!.data).toBeNull();
    expect(r!.error).toBe("biala_lista_503");
  });

  it("Timeout: AbortError → returns error 'timeout', fail open", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      return Promise.reject(new Error("The operation was aborted due to timeout"));
    }));

    const r = await lookupByNip(APATRIS_NIP);

    expect(r!.data).toBeNull();
    expect(r!.error).toBe("timeout");
  });

  it("Empty input ('' or null) → returns null immediately, no HTTP call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await lookupByNip("")).toBeNull();
    expect(await lookupByNip(null)).toBeNull();
    expect(await lookupByNip(undefined)).toBeNull();
    expect(await lookupByNip("   ")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("NIP with dashes/spaces: '525-282-87-06' → normalized to 10-digit before request URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(bialaResponse({
      name: "APATRIS", nip: APATRIS_NIP, regon: null, krs: null,
      workingAddress: null, residenceAddress: null,
      statusVat: "Czynny", accountNumbers: [], registrationLegalDate: null,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await lookupByNip("525-282-87-06");
    expect(r!.data!.nip).toBe(APATRIS_NIP);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(`/api/search/nip/${APATRIS_NIP}`);
    // Dashes stripped from NIP segment specifically (URL still contains date dashes).
    expect(url).not.toContain("525-282-87-06");
    const nipSegment = url.split("/api/search/nip/")[1]!.split("?")[0];
    expect(nipSegment).toBe(APATRIS_NIP);
    expect(nipSegment).not.toContain("-");
  });

  it("Biała Lista returns subject:null (NIP not registered) → error 'not_found'", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bialaResponse(null)));

    const r = await lookupByNip("9999999999");
    expect(r!.data).toBeNull();
    expect(r!.error).toBe("not_found");
  });

  it("Inactive employer (statusVat='Wykreślony'): surfaces as successful response, NOT swallowed as error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bialaResponse({
      name: "BANKRUPT EMPLOYER", nip: "1111111111", regon: null, krs: null,
      workingAddress: null, residenceAddress: null,
      statusVat: "Wykreślony", accountNumbers: [], registrationLegalDate: null,
    })));

    const r = await lookupByNip("1111111111");

    // CRITICAL: data populated, no error — UI must render statusVat prominently
    expect(r!.data).not.toBeNull();
    expect(r!.error).toBeUndefined();
    expect(r!.data!.statusVat).toBe("Wykreślony");
  });
});
