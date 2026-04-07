/**
 * Legal Document Service — generates attorney documents from templates
 * prefilled with worker/case/evidence data.
 *
 * Wave 1 templates:
 *  - TRC_APPLICATION: Application for change of TRC + work permit
 *  - POWER_OF_ATTORNEY: Pełnomocnictwo (Power of Attorney)
 *  - COVER_LETTER: Pismo przewodnie (Attorney cover letter)
 *
 * Auto-suggest: recommends documents based on legal engine state.
 */

import { query, queryOne, execute } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type TemplateType =
  | "TRC_APPLICATION"
  | "POWER_OF_ATTORNEY"
  | "COVER_LETTER"
  | "WORK_PERMIT_A"
  | "APPEAL"
  | "COMPLAINT"
  | "FILE_INSPECTION";

export interface DocumentInput {
  workerId: string;
  tenantId: string;
  templateType: TemplateType;
  legalCaseId?: string;
  language?: string;
  overrides?: Record<string, string>;
  createdBy?: string;
}

export interface LegalDocument {
  id: string;
  tenant_id: string;
  worker_id: string | null;
  legal_case_id: string | null;
  template_type: string;
  title: string;
  language: string;
  status: string;
  content_json: any;
  rendered_html: string | null;
  suggested_by: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DocumentSuggestion {
  templateType: TemplateType;
  title: string;
  reason: string;
  priority: "high" | "medium" | "low";
}

// ═══ TEMPLATE TITLES ════════════════════════════════════════════════════════

const TITLES: Record<TemplateType, { pl: string; en: string }> = {
  TRC_APPLICATION:    { pl: "Wniosek o zmianę zezwolenia na pobyt czasowy i pracę", en: "Application for Change of TRC and Work Permit" },
  POWER_OF_ATTORNEY:  { pl: "Pełnomocnictwo", en: "Power of Attorney" },
  COVER_LETTER:       { pl: "Pismo przewodnie", en: "Cover Letter" },
  WORK_PERMIT_A:      { pl: "Wniosek o zezwolenie na pracę typ A", en: "Application for Work Permit Type A" },
  APPEAL:             { pl: "Odwołanie od decyzji", en: "Appeal Against Decision" },
  COMPLAINT:          { pl: "Skarga", en: "Complaint" },
  FILE_INSPECTION:    { pl: "Wniosek o wgląd do akt sprawy", en: "Application for Inspection of Files" },
};

// ═══ AUTO-SUGGEST ═══════════════════════════════════════════════════════════

export async function suggestDocuments(workerId: string, tenantId: string): Promise<DocumentSuggestion[]> {
  const suggestions: DocumentSuggestion[] = [];

  // Load snapshot
  const snap = await queryOne<any>(
    "SELECT legal_status, legal_basis, risk_level FROM worker_legal_snapshots WHERE worker_id = $1",
    [workerId]
  );

  // Load legal case
  const legalCase = await queryOne<any>(
    "SELECT status, case_type, appeal_deadline FROM legal_cases WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  // Load evidence count
  const evCount = await queryOne<any>(
    "SELECT COUNT(*) as cnt FROM legal_evidence WHERE worker_id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );

  // Check for existing POA
  const hasPoa = await queryOne<any>(
    "SELECT id FROM legal_documents WHERE worker_id = $1 AND tenant_id = $2 AND template_type = 'POWER_OF_ATTORNEY' AND status != 'archived'",
    [workerId, tenantId]
  );

  const status = snap?.legal_status;
  const caseStatus = legalCase?.status;

  // Always need POA if none exists
  if (!hasPoa) {
    suggestions.push({
      templateType: "POWER_OF_ATTORNEY",
      title: TITLES.POWER_OF_ATTORNEY.pl,
      reason: "Pełnomocnictwo wymagane do reprezentowania pracownika",
      priority: "high",
    });
  }

  // EXPIRING_SOON or VALID with no TRC case → suggest TRC application
  if (status === "EXPIRING_SOON" || (status === "VALID" && !legalCase)) {
    suggestions.push({
      templateType: "TRC_APPLICATION",
      title: TITLES.TRC_APPLICATION.pl,
      reason: "Zezwolenie wygasa wkrótce — złóż wniosek o przedłużenie",
      priority: "high",
    });
  }

  // REJECTED case → suggest appeal
  if (caseStatus === "REJECTED") {
    suggestions.push({
      templateType: "APPEAL",
      title: TITLES.APPEAL.pl,
      reason: `Sprawa odrzucona — termin odwołania: ${legalCase.appeal_deadline ? new Date(legalCase.appeal_deadline).toLocaleDateString("pl-PL") : "sprawdź"}`,
      priority: "high",
    });
  }

  // NEW or PENDING case → suggest cover letter if TRC app exists
  if (caseStatus === "NEW" || caseStatus === "PENDING") {
    suggestions.push({
      templateType: "COVER_LETTER",
      title: TITLES.COVER_LETTER.pl,
      reason: "Pismo przewodnie do wniosku w toku",
      priority: "medium",
    });
  }

  // REVIEW_REQUIRED with formal defect → file inspection
  if (status === "REVIEW_REQUIRED") {
    suggestions.push({
      templateType: "FILE_INSPECTION",
      title: TITLES.FILE_INSPECTION.pl,
      reason: "Weryfikacja wymagana — wgląd do akt pomoże ustalić status",
      priority: "medium",
    });
  }

  return suggestions;
}

// ═══ GENERATE DOCUMENT ══════════════════════════════════════════════════════

export async function generateDocument(input: DocumentInput): Promise<LegalDocument> {
  const { workerId, tenantId, templateType, legalCaseId, language = "pl", overrides, createdBy } = input;

  // Load worker data
  const worker = await queryOne<any>(
    "SELECT full_name, nationality, pesel, passport_number, assigned_site FROM workers WHERE id = $1 AND tenant_id = $2",
    [workerId, tenantId]
  );
  if (!worker) throw new Error("Worker not found");

  // Load TRC case if available
  const trc = await queryOne<any>(
    "SELECT employer_name, employer_nip, voivodeship, case_type FROM trc_cases WHERE worker_id = $1::text AND tenant_id = $2::text ORDER BY created_at DESC LIMIT 1",
    [workerId, tenantId]
  );

  // Load tenant
  const tenant = await queryOne<any>(
    "SELECT name FROM tenants WHERE id = $1",
    [tenantId]
  );

  // Build content
  const content = buildTemplateContent(templateType, {
    workerName: worker.full_name,
    workerNationality: worker.nationality,
    workerPesel: worker.pesel,
    workerPassport: worker.passport_number,
    employerName: trc?.employer_name ?? tenant?.name ?? "Apatris Sp. z o.o.",
    employerNip: trc?.employer_nip ?? "",
    voivodeship: trc?.voivodeship ?? "",
    caseType: trc?.case_type ?? "Type A",
    date: new Date().toLocaleDateString("pl-PL"),
    ...overrides,
  });

  const title = TITLES[templateType]?.[language === "en" ? "en" : "pl"] ?? templateType;
  const html = renderToHtml(templateType, content, language);

  const doc = await queryOne<LegalDocument>(
    `INSERT INTO legal_documents (tenant_id, worker_id, legal_case_id, template_type, title, language, status, content_json, rendered_html, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9) RETURNING *`,
    [tenantId, workerId, legalCaseId ?? null, templateType, title, language, JSON.stringify(content), html, createdBy ?? null]
  );
  if (!doc) throw new Error("Failed to create document");

  return doc;
}

export async function getDocumentsByWorker(workerId: string, tenantId: string): Promise<LegalDocument[]> {
  return query<LegalDocument>(
    "SELECT * FROM legal_documents WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
    [workerId, tenantId]
  );
}

export async function getDocument(docId: string, tenantId: string): Promise<LegalDocument | null> {
  return queryOne<LegalDocument>(
    "SELECT * FROM legal_documents WHERE id = $1 AND tenant_id = $2",
    [docId, tenantId]
  );
}

export async function approveDocument(docId: string, tenantId: string, approvedBy: string): Promise<LegalDocument | null> {
  return queryOne<LegalDocument>(
    "UPDATE legal_documents SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *",
    [approvedBy, docId, tenantId]
  );
}

// ═══ TEMPLATE CONTENT BUILDER ═══════════════════════════════════════════════

function buildTemplateContent(type: TemplateType, data: Record<string, string>): Record<string, string> {
  const base = { ...data };

  switch (type) {
    case "TRC_APPLICATION":
      return {
        ...base,
        documentTitle: "WNIOSEK O UDZIELENIE / ZMIANĘ ZEZWOLENIA NA POBYT CZASOWY I PRACĘ",
        authority: `Wojewoda ${data.voivodeship || "________________"}`,
        applicantSection: `Wnioskodawca: ${data.workerName}\nObywatelstwo: ${data.workerNationality ?? "—"}\nPESEL: ${data.workerPesel ?? "—"}\nPaszport: ${data.workerPassport ?? "—"}`,
        employerSection: `Podmiot powierzający wykonywanie pracy:\n${data.employerName}\nNIP: ${data.employerNip ?? "—"}`,
        requestText: `Zwracam się z wnioskiem o udzielenie zezwolenia na pobyt czasowy i pracę na terytorium Rzeczypospolitej Polskiej.`,
      };

    case "POWER_OF_ATTORNEY":
      return {
        ...base,
        documentTitle: "PEŁNOMOCNICTWO",
        grantorSection: `Ja, ${data.workerName}, obywatelstwo: ${data.workerNationality ?? "—"}, PESEL: ${data.workerPesel ?? "—"}, paszport nr: ${data.workerPassport ?? "—"}`,
        grantText: `udzielam pełnomocnictwa do reprezentowania mnie przed organami administracji publicznej w sprawie dotyczącej zezwolenia na pobyt czasowy i pracę, w tym do składania wniosków, odbioru decyzji, wnoszenia środków odwoławczych oraz przeglądania akt sprawy.`,
        attorneySection: `Pełnomocnik: ________________\nAdres kancelarii: ________________\nNr wpisu na listę: ________________`,
      };

    case "COVER_LETTER":
      return {
        ...base,
        documentTitle: "PISMO PRZEWODNIE",
        authority: `Wojewoda ${data.voivodeship || "________________"}\nWydział Spraw Cudzoziemców`,
        subject: `Dotyczy: ${data.workerName} — wniosek o zezwolenie na pobyt czasowy i pracę`,
        bodyText: `Szanowni Państwo,\n\nW imieniu mojego mocodawcy, ${data.workerName}, obywatelstwa ${data.workerNationality ?? "—"}, składam w załączeniu komplet dokumentów w sprawie zezwolenia na pobyt czasowy i pracę.\n\nW załączeniu:\n1. Wniosek o udzielenie zezwolenia\n2. Pełnomocnictwo\n3. Dokumenty potwierdzające zatrudnienie\n4. Kopia paszportu\n5. Potwierdzenie zameldowania\n\nZ poważaniem,`,
      };

    case "APPEAL":
      return {
        ...base,
        documentTitle: "ODWOŁANIE OD DECYZJI",
        authority: `Szef Urzędu do Spraw Cudzoziemców\nza pośrednictwem\nWojewody ${data.voivodeship || "________________"}`,
        subject: `Dotyczy: odwołanie od decyzji w sprawie ${data.workerName}`,
        bodyText: `Szanowni Państwo,\n\nNa podstawie art. 127 § 1 i § 2 Kodeksu postępowania administracyjnego, w imieniu mojego mocodawcy, ${data.workerName}, wnoszę odwołanie od decyzji Wojewody ${data.voivodeship || "________________"} w sprawie odmowy udzielenia zezwolenia na pobyt czasowy i pracę.\n\nDecyzji zarzucam:\n1. ________________\n2. ________________\n\nW związku z powyższym wnoszę o uchylenie zaskarżonej decyzji i udzielenie zezwolenia.`,
      };

    default:
      return base;
  }
}

// ═══ HTML RENDERER ══════════════════════════════════════════════════════════

function renderToHtml(type: TemplateType, content: Record<string, string>, lang: string): string {
  const lines: string[] = [];
  lines.push(`<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><style>`);
  lines.push(`body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; margin: 40px; color: #000; }`);
  lines.push(`.header { text-align: center; margin-bottom: 30px; }`);
  lines.push(`.title { font-size: 14pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 20px; }`);
  lines.push(`.section { margin-bottom: 20px; }`);
  lines.push(`.label { font-weight: bold; margin-bottom: 5px; }`);
  lines.push(`.signature { margin-top: 60px; }`);
  lines.push(`.signature-line { border-top: 1px solid #000; width: 200px; margin-top: 40px; padding-top: 5px; font-size: 10pt; }`);
  lines.push(`.footer { margin-top: 40px; font-size: 9pt; color: #666; border-top: 1px solid #ccc; padding-top: 10px; }`);
  lines.push(`@media print { body { margin: 20mm; } }`);
  lines.push(`</style></head><body>`);

  // Authority line
  if (content.authority) {
    lines.push(`<div style="text-align: right; margin-bottom: 30px; white-space: pre-line;">${content.authority}</div>`);
  }

  // Date
  lines.push(`<div style="text-align: right; margin-bottom: 20px;">${content.date ?? new Date().toLocaleDateString("pl-PL")}</div>`);

  // Title
  lines.push(`<div class="header"><div class="title">${content.documentTitle ?? ""}</div></div>`);

  // Applicant / Grantor
  if (content.applicantSection) lines.push(`<div class="section"><div class="label">Dane wnioskodawcy:</div><div style="white-space:pre-line">${content.applicantSection}</div></div>`);
  if (content.grantorSection) lines.push(`<div class="section"><div style="white-space:pre-line">${content.grantorSection}</div></div>`);

  // Body
  if (content.requestText) lines.push(`<div class="section"><p>${content.requestText}</p></div>`);
  if (content.grantText) lines.push(`<div class="section"><p>${content.grantText}</p></div>`);
  if (content.subject) lines.push(`<div class="section"><div class="label">${content.subject}</div></div>`);
  if (content.bodyText) lines.push(`<div class="section"><div style="white-space:pre-line">${content.bodyText}</div></div>`);

  // Employer
  if (content.employerSection) lines.push(`<div class="section"><div class="label">Pracodawca:</div><div style="white-space:pre-line">${content.employerSection}</div></div>`);

  // Attorney
  if (content.attorneySection) lines.push(`<div class="section"><div class="label">Pełnomocnik:</div><div style="white-space:pre-line">${content.attorneySection}</div></div>`);

  // Signatures
  lines.push(`<div class="signature"><div style="display:flex;justify-content:space-between;">`);
  lines.push(`<div class="signature-line">Podpis mocodawcy</div>`);
  lines.push(`<div class="signature-line">Podpis pełnomocnika</div>`);
  lines.push(`</div></div>`);

  // Footer
  lines.push(`<div class="footer">Dokument wygenerowany w systemie Apatris Compliance Hub — ${new Date().toISOString()}</div>`);
  lines.push(`</body></html>`);

  return lines.join("\n");
}
