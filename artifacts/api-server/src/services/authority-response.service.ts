/**
 * Authority Response Service — generates formal, evidence-backed response packs
 * for labour/immigration authorities.
 *
 * Review-first system:
 *  - All packs default to DRAFT or REVIEW_REQUIRED
 *  - Never auto-approved
 *  - Never auto-sent externally
 *
 * Uses ONLY existing Apatris data:
 *  - Worker facts (workers table)
 *  - Legal snapshot (legal engine output)
 *  - Legal case (legal_cases)
 *  - Filing evidence (legal_evidence)
 *  - Immigration permits
 *
 * Does NOT modify any existing legal engine logic.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { getWorkerLegalSnapshot, type LegalSnapshot } from "./legal-status.service.js";
import { decrypt } from "../lib/encryption.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type PackStatus = "DRAFT" | "REVIEW_REQUIRED" | "APPROVED" | "ARCHIVED";

export interface AuthorityPack {
  id: string;
  worker_id: string;
  tenant_id: string;
  legal_case_id: string | null;
  pack_status: PackStatus;
  authority_question: string | null;
  legal_conclusion: string;
  legal_basis: string;
  risk_level: string | null;
  response_text_pl: string | null;
  response_text_en: string | null;
  response_text_uk: string | null;
  evidence_links_json: unknown;
  citation_refs_json: unknown;
  worker_facts_json: unknown;
  snapshot_data_json: unknown;
  generated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkerFacts {
  workerId: string;
  fullName: string;
  nationality: string | null;
  pesel: string | null;
  passportNumber: string | null;
  employerName: string | null;
  assignedSite: string | null;
  sameEmployer: boolean;
  sameRole: boolean;
}

interface EvidenceLink {
  type: string;
  fileName: string | null;
  filingDate: string | null;
  uploadedAt: string;
}

interface CitationRef {
  code: string;
  label: string;
  article?: string;
}

// ═══ CITATION REGISTRY ══════════════════════════════════════════════════════

const CITATION_MAP: Record<string, CitationRef> = {
  ART_108: {
    code: "ART_108",
    label: "Art. 108 of the Act on Foreigners (Ustawa o cudzoziemcach)",
    article: "Art. 108 ust. 1 pkt 2",
  },
  SPECUSTAWA_UKR: {
    code: "SPECUSTAWA_UKR",
    label: "Special Act for Ukrainian Citizens (Specustawa / CUKR)",
    article: "Ustawa z dnia 12 marca 2022 r. o pomocy obywatelom Ukrainy",
  },
  PERMIT_VALID: {
    code: "PERMIT_VALID",
    label: "Valid work permit / residence card",
  },
  NO_LEGAL_BASIS: {
    code: "NO_LEGAL_BASIS",
    label: "No applicable legal basis identified",
  },
  REVIEW_REQUIRED: {
    code: "REVIEW_REQUIRED",
    label: "Legal basis pending manual review",
  },
};

// ═══ CORE SERVICE ═══════════════════════════════════════════════════════════

export async function generateAuthorityPack(
  caseId: string,
  tenantId: string,
  authorityQuestion?: string,
): Promise<AuthorityPack> {
  // 1. Load legal case
  const legalCase = await queryOne<any>(
    "SELECT * FROM legal_cases WHERE id = $1 AND tenant_id = $2",
    [caseId, tenantId]
  );
  if (!legalCase) throw new Error("Legal case not found");

  const workerId = legalCase.worker_id;

  // 2. Load worker facts
  const worker = await queryOne<any>(
    "SELECT id, full_name, nationality, pesel, passport_number, assigned_site FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");

  // 3. Get current legal snapshot (live calculation, not cached)
  const snapshot = await getWorkerLegalSnapshot(workerId, tenantId);

  // 4. Load filing evidence
  const evidenceRows = await query<any>(
    "SELECT source_type, file_name, filing_date, created_at FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
    [workerId, tenantId]
  );

  // 5. Load linked TRC case data if available
  const trcCase = await queryOne<any>(
    "SELECT employer_name, voivodeship, status as trc_status FROM trc_cases WHERE worker_id = $1::text AND tenant_id = $2::text ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  // 6. Load immigration permit
  const permit = await queryOne<any>(
    "SELECT permit_type, country, expiry_date, status, trc_application_submitted FROM immigration_permits WHERE worker_id = $1 AND tenant_id = $2 ORDER BY expiry_date DESC NULLS LAST LIMIT 1",
    [workerId, tenantId]
  );

  // ── Compile structured data ─────────────────────────────────────────────

  const workerFacts: WorkerFacts = {
    workerId: worker.id,
    fullName: worker.full_name ?? "Unknown",
    nationality: worker.nationality ?? permit?.country ?? null,
    // Decrypt PII for authority response letter (legal-required plaintext)
    pesel: decrypt(worker.pesel) ?? null,
    passportNumber: decrypt(worker.passport_number) ?? null,
    employerName: trcCase?.employer_name ?? null,
    assignedSite: worker.assigned_site ?? null,
    sameEmployer: snapshot.sameEmployerFlag,
    sameRole: snapshot.sameRoleFlag,
  };

  const evidenceLinks: EvidenceLink[] = evidenceRows.map((e: any) => ({
    type: e.source_type,
    fileName: e.file_name,
    filingDate: e.filing_date ? new Date(e.filing_date).toISOString().slice(0, 10) : null,
    uploadedAt: new Date(e.created_at).toISOString(),
  }));

  // Add permit as implicit evidence if present
  if (permit) {
    evidenceLinks.push({
      type: `PERMIT_${permit.permit_type ?? "UNKNOWN"}`.toUpperCase(),
      fileName: null,
      filingDate: null,
      uploadedAt: "system_record",
    });
  }

  const citationRefs: CitationRef[] = [];
  const basis = snapshot.legalBasis;
  if (CITATION_MAP[basis]) citationRefs.push(CITATION_MAP[basis]);
  // Always include ART_108 reference if status involves continuity
  if (basis === "ART_108" || snapshot.legalProtectionFlag) {
    if (!citationRefs.find(c => c.code === "ART_108")) {
      citationRefs.push(CITATION_MAP.ART_108);
    }
  }

  // ── Generate formal texts ───────────────────────────────────────────────

  const responseTextPL = generatePolishDraft(workerFacts, snapshot, legalCase, evidenceLinks, citationRefs);
  const responseTextEN = generateEnglishSummary(workerFacts, snapshot, legalCase, evidenceLinks, citationRefs);
  const responseTextUK = generateUkrainianSummary(workerFacts, snapshot);

  // ── Determine pack status ───────────────────────────────────────────────
  // Critical/high risk or expired = REVIEW_REQUIRED; otherwise DRAFT
  const packStatus: PackStatus =
    snapshot.riskLevel === "CRITICAL" || snapshot.riskLevel === "HIGH"
      ? "REVIEW_REQUIRED"
      : "DRAFT";

  // ── Persist ─────────────────────────────────────────────────────────────

  const pack = await queryOne<AuthorityPack>(
    `INSERT INTO authority_response_packs (
      worker_id, tenant_id, legal_case_id, pack_status,
      authority_question, legal_conclusion, legal_basis, risk_level,
      response_text_pl, response_text_en, response_text_uk,
      evidence_links_json, citation_refs_json, worker_facts_json, snapshot_data_json,
      generated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW()) RETURNING *`,
    [
      workerId, tenantId, caseId, packStatus,
      authorityQuestion ?? null,
      snapshot.legalStatus, snapshot.legalBasis, snapshot.riskLevel,
      responseTextPL, responseTextEN, responseTextUK,
      JSON.stringify(evidenceLinks), JSON.stringify(citationRefs),
      JSON.stringify(workerFacts),
      JSON.stringify({
        legalStatus: snapshot.legalStatus, legalBasis: snapshot.legalBasis,
        riskLevel: snapshot.riskLevel, summary: snapshot.summary,
        conditions: snapshot.conditions, warnings: snapshot.warnings,
        requiredActions: snapshot.requiredActions,
        permitExpiresAt: snapshot.permitExpiresAt,
        trcApplicationSubmitted: snapshot.trcApplicationSubmitted,
        legalProtectionFlag: snapshot.legalProtectionFlag,
        formalDefectStatus: snapshot.formalDefectStatus,
      }),
    ]
  );
  if (!pack) throw new Error("Failed to create authority response pack");

  return pack;
}

export async function getAuthorityPack(packId: string, tenantId: string): Promise<AuthorityPack | null> {
  return queryOne<AuthorityPack>(
    "SELECT * FROM authority_response_packs WHERE id = $1 AND tenant_id = $2",
    [packId, tenantId]
  );
}

export async function listAuthorityPacksByWorker(workerId: string, tenantId: string): Promise<AuthorityPack[]> {
  return query<AuthorityPack>(
    "SELECT * FROM authority_response_packs WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
    [workerId, tenantId]
  );
}

export async function approveAuthorityPack(packId: string, tenantId: string, approvedBy: string): Promise<AuthorityPack> {
  const pack = await queryOne<AuthorityPack>(
    `UPDATE authority_response_packs
     SET pack_status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 AND pack_status IN ('DRAFT','REVIEW_REQUIRED')
     RETURNING *`,
    [approvedBy, packId, tenantId]
  );
  if (!pack) throw new Error("Pack not found or already approved/archived");
  return pack;
}

// ═══ TEXT GENERATION — RULE-BASED, NO AI ════════════════════════════════════
// These functions draft from structured facts only.
// They do NOT invent legal basis or claim more than facts support.

function generatePolishDraft(
  worker: WorkerFacts,
  snapshot: LegalSnapshot,
  legalCase: any,
  evidence: EvidenceLink[],
  citations: CitationRef[],
): string {
  const lines: string[] = [];

  lines.push("Szanowni Państwo,");
  lines.push("");
  lines.push(`W odpowiedzi na zapytanie dotyczące statusu prawnego pracownika ${worker.fullName}, przedstawiamy poniższe informacje:`);
  lines.push("");

  // Worker identity
  lines.push("1. DANE PRACOWNIKA");
  lines.push(`   Imię i nazwisko: ${worker.fullName}`);
  if (worker.nationality) lines.push(`   Obywatelstwo: ${worker.nationality}`);
  if (worker.pesel) lines.push(`   PESEL: ${worker.pesel}`);
  if (worker.passportNumber) lines.push(`   Numer paszportu: ${worker.passportNumber}`);
  if (worker.employerName) lines.push(`   Pracodawca: ${worker.employerName}`);
  lines.push("");

  // Legal status
  lines.push("2. STATUS PRAWNY");
  lines.push(`   Aktualny status: ${translateStatus(snapshot.legalStatus)}`);
  lines.push(`   Podstawa prawna: ${translateBasis(snapshot.legalBasis)}`);
  if (snapshot.permitExpiresAt) {
    lines.push(`   Data wygaśnięcia zezwolenia: ${new Date(snapshot.permitExpiresAt).toLocaleDateString("pl-PL")}`);
  }
  lines.push("");

  // Conditions
  if (snapshot.conditions.length > 0) {
    lines.push("3. WARUNKI");
    for (const c of snapshot.conditions) {
      lines.push(`   - ${c}`);
    }
    lines.push("");
  }

  // Evidence
  if (evidence.length > 0) {
    lines.push(`${snapshot.conditions.length > 0 ? "4" : "3"}. DOWODY ZŁOŻENIA`);
    for (const e of evidence) {
      const dateStr = e.filingDate ? ` (data złożenia: ${e.filingDate})` : "";
      lines.push(`   - ${translateEvidenceType(e.type)}${dateStr}`);
    }
    lines.push("");
  }

  // Legal basis citations
  if (citations.length > 0) {
    const secNum = 3 + (snapshot.conditions.length > 0 ? 1 : 0) + (evidence.length > 0 ? 1 : 0);
    lines.push(`${secNum}. PODSTAWA PRAWNA`);
    for (const c of citations) {
      lines.push(`   - ${c.label}${c.article ? ` (${c.article})` : ""}`);
    }
    lines.push("");
  }

  // Case reference
  if (legalCase) {
    lines.push(`Sprawa nr: ${legalCase.id}`);
    lines.push(`Typ sprawy: ${legalCase.case_type}`);
    lines.push(`Status sprawy: ${legalCase.status}`);
    if (legalCase.appeal_deadline) {
      lines.push(`Termin odwołania: ${new Date(legalCase.appeal_deadline).toLocaleDateString("pl-PL")}`);
    }
    lines.push("");
  }

  lines.push("Powyższe informacje opierają się na danych zgromadzonych w systemie Apatris.");
  lines.push("Niniejszy dokument wymaga weryfikacji przed przekazaniem do organu.");
  lines.push("");
  lines.push("Z poważaniem,");
  lines.push("Apatris Sp. z o.o.");

  return lines.join("\n");
}

function generateEnglishSummary(
  worker: WorkerFacts,
  snapshot: LegalSnapshot,
  legalCase: any,
  evidence: EvidenceLink[],
  citations: CitationRef[],
): string {
  const lines: string[] = [];

  lines.push("AUTHORITY RESPONSE PACK — INTERNAL SUMMARY");
  lines.push("==========================================");
  lines.push("");
  lines.push(`Worker: ${worker.fullName}`);
  if (worker.nationality) lines.push(`Nationality: ${worker.nationality}`);
  lines.push(`Legal Status: ${snapshot.legalStatus}`);
  lines.push(`Legal Basis: ${snapshot.legalBasis}`);
  lines.push(`Risk Level: ${snapshot.riskLevel}`);
  if (snapshot.permitExpiresAt) {
    lines.push(`Permit Expires: ${new Date(snapshot.permitExpiresAt).toLocaleDateString("en-GB")}`);
  }
  lines.push("");

  lines.push("Summary:");
  lines.push(snapshot.summary);
  lines.push("");

  if (snapshot.conditions.length > 0) {
    lines.push("Conditions:");
    for (const c of snapshot.conditions) lines.push(`  - ${c}`);
    lines.push("");
  }

  if (snapshot.warnings.length > 0) {
    lines.push("Warnings:");
    for (const w of snapshot.warnings) lines.push(`  ! ${w}`);
    lines.push("");
  }

  if (evidence.length > 0) {
    lines.push("Evidence on file:");
    for (const e of evidence) {
      lines.push(`  - ${e.type}${e.filingDate ? ` (filed: ${e.filingDate})` : ""}${e.fileName ? ` [${e.fileName}]` : ""}`);
    }
    lines.push("");
  }

  if (citations.length > 0) {
    lines.push("Legal citations:");
    for (const c of citations) lines.push(`  - ${c.label}`);
    lines.push("");
  }

  if (legalCase) {
    lines.push(`Case: ${legalCase.case_type} — ${legalCase.status}`);
    if (legalCase.appeal_deadline) {
      lines.push(`Appeal deadline: ${new Date(legalCase.appeal_deadline).toLocaleDateString("en-GB")}`);
    }
    lines.push("");
  }

  lines.push("NOTE: This pack requires internal review before submission to any authority.");

  return lines.join("\n");
}

function generateUkrainianSummary(worker: WorkerFacts, snapshot: LegalSnapshot): string {
  const lines: string[] = [];

  lines.push("ІНФОРМАЦІЯ ПРО ПРАВОВИЙ СТАТУС");
  lines.push("==============================");
  lines.push("");
  lines.push(`Працівник: ${worker.fullName}`);
  lines.push(`Правовий статус: ${translateStatusUK(snapshot.legalStatus)}`);
  if (snapshot.permitExpiresAt) {
    lines.push(`Дозвіл діє до: ${new Date(snapshot.permitExpiresAt).toLocaleDateString("uk-UA")}`);
  }
  lines.push("");

  if (snapshot.legalStatus === "VALID" || snapshot.legalStatus === "EXPIRING_SOON") {
    lines.push("Ваш дозвіл на роботу є дійсним. Жодних дій не потрібно на даний момент.");
  } else if (snapshot.legalStatus === "PROTECTED_PENDING") {
    if (snapshot.legalBasis === "SPECUSTAWA_UKR") {
      lines.push("Ви захищені відповідно до Спеціального закону для громадян України.");
      lines.push("Ваше перебування є легальним під час розгляду заяви.");
    } else {
      lines.push("Ваша заява була подана до закінчення дозволу.");
      lines.push("Ви можете продовжувати працювати у того ж роботодавця на тій же посаді.");
    }
  } else if (snapshot.legalStatus === "REVIEW_REQUIRED") {
    lines.push("Ваш правовий статус перевіряється роботодавцем.");
    lines.push("Зверніться до свого роботодавця для отримання додаткової інформації.");
  } else if (snapshot.legalStatus === "EXPIRED_NOT_PROTECTED") {
    lines.push("Термін дії вашого дозволу закінчився.");
    lines.push("Будь ласка, зверніться до свого роботодавця щодо подальших кроків.");
  } else {
    lines.push("Зверніться до свого роботодавця для уточнення вашого статусу.");
  }

  lines.push("");
  lines.push("Ця інформація базується на даних у системі Apatris.");

  return lines.join("\n");
}

// ═══ TRANSLATION HELPERS ════════════════════════════════════════════════════

function translateStatus(status: string): string {
  const map: Record<string, string> = {
    VALID: "Ważny — pracownik posiada aktualne zezwolenie na pracę",
    EXPIRING_SOON: "Ważny — zezwolenie wkrótce wygaśnie",
    PROTECTED_PENDING: "Chroniony — wniosek w toku, ochrona ciągłości pobytu",
    REVIEW_REQUIRED: "Wymaga weryfikacji — status nie może być określony automatycznie",
    EXPIRED_NOT_PROTECTED: "Wygasły — brak ochrony prawnej",
    NO_PERMIT: "Brak zezwolenia na pracę w aktach",
  };
  return map[status] ?? status;
}

function translateBasis(basis: string): string {
  const map: Record<string, string> = {
    PERMIT_VALID: "Aktualne zezwolenie na pracę / karta pobytu",
    ART_108: "Art. 108 Ustawy o cudzoziemcach — ciągłość pobytu",
    SPECUSTAWA_UKR: "Specustawa — Ustawa o pomocy obywatelom Ukrainy",
    REVIEW_REQUIRED: "Podstawa prawna wymaga weryfikacji",
    NO_LEGAL_BASIS: "Brak zidentyfikowanej podstawy prawnej",
  };
  return map[basis] ?? basis;
}

function translateStatusUK(status: string): string {
  const map: Record<string, string> = {
    VALID: "Дійсний",
    EXPIRING_SOON: "Скоро закінчується",
    PROTECTED_PENDING: "Захищений — заява на розгляді",
    REVIEW_REQUIRED: "Потребує перевірки",
    EXPIRED_NOT_PROTECTED: "Закінчився — без захисту",
    NO_PERMIT: "Немає дозволу",
  };
  return map[status] ?? status;
}

function translateEvidenceType(type: string): string {
  const map: Record<string, string> = {
    UPO: "UPO — Urzędowe Poświadczenie Odbioru (ePUAP)",
    MOS: "Potwierdzenie złożenia (MoS)",
    TRC_FILING: "Potwierdzenie złożenia wniosku o kartę pobytu",
    IMMIGRATION_RECEIPT: "Potwierdzenie złożenia w urzędzie imigracyjnym",
  };
  return map[type] ?? type;
}
