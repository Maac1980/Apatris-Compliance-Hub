/**
 * Case Document Generator — AI generates stage-specific legal documents.
 *
 * At each case stage transition, generates the appropriate document:
 *  - Pulls worker data (name, PESEL, nationality, dates)
 *  - Pulls case context (stage, voivodeship, case number, history)
 *  - Pulls KB articles for legal citations
 *  - Pulls similar cases from knowledge graph for precedent
 *  - Generates bilingual (PL + EN) document draft
 *  - Drops into lawyer review queue (status: DRAFT)
 *  - Logs in case notebook
 *
 * Lawyer reviews, edits, approves → document locked and ready for filing/sending.
 */

import { query, queryOne, execute } from "../lib/db.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type DocStatus = "DRAFT" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "SENT";

export interface GeneratedDoc {
  id: string;
  case_id: string;
  worker_id: string;
  tenant_id: string;
  doc_type: string;
  stage_trigger: string;
  title: string;
  content_pl: string;
  content_en: string;
  legal_basis: string[];
  similar_cases_used: number;
  kb_articles_used: string[];
  ai_model: string | null;
  ai_confidence: number | null;
  status: DocStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  sent_to: string | null;
  sent_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// ═══ STAGE → DOCUMENT TYPE MAPPING ═════════════════════════════════════════

interface StageDocConfig {
  docType: string;
  title: string;
  promptPl: string;
  promptEn: string;
  legalArticles: string[];
}

const STAGE_DOC_MAP: Record<string, StageDocConfig> = {
  NEW: {
    docType: "CASE_ASSESSMENT",
    title: "Case Assessment & Document Checklist",
    promptPl: "Przygotuj ocenę przypadku imigracyjnego i listę wymaganych dokumentów dla pracownika. Wymień brakujące dokumenty i określ priorytet.",
    promptEn: "Prepare an immigration case assessment and required document checklist for this worker. List missing documents and set priority.",
    legalArticles: ["Art. 108 Ustawy o cudzoziemcach", "Art. 87 Ustawy o promocji zatrudnienia"],
  },
  DOCS_PENDING: {
    docType: "WORKER_NOTIFICATION",
    title: "Worker Document Request Letter",
    promptPl: "Napisz oficjalne pismo do pracownika z listą brakujących dokumentów wymaganych do złożenia wniosku. Podaj terminy i konsekwencje opóźnienia.",
    promptEn: "Write a formal letter to the worker listing missing documents required for the application. Include deadlines and consequences of delay.",
    legalArticles: ["Art. 108 Ustawy o cudzoziemcach"],
  },
  READY_TO_FILE: {
    docType: "APPLICATION_COVER_LETTER",
    title: "Application Cover Letter & Annex 1",
    promptPl: "Przygotuj pismo przewodnie do wniosku o kartę pobytu (TRC) składanego w urzędzie wojewódzkim. Dołącz odniesienie do Aneksu 1 i wymaganych załączników. Uwzględnij wymogi MOS 2026.",
    promptEn: "Prepare a cover letter for the TRC application to the voivodeship office. Reference Annex 1 and required attachments. Include MOS 2026 electronic filing requirements.",
    legalArticles: ["Art. 108 Ustawy o cudzoziemcach", "Art. 104 KPA", "MOS 2.0 electronic filing requirements"],
  },
  FILED: {
    docType: "FILING_CONFIRMATION",
    title: "Filing Confirmation to Worker",
    promptPl: "Przygotuj potwierdzenie złożenia wniosku dla pracownika. Zawrzyj numer UPO, datę złożenia i wyjaśnienie ochrony z Art. 108.",
    promptEn: "Prepare a filing confirmation letter for the worker. Include UPO number, filing date, and explanation of Art. 108 protection.",
    legalArticles: ["Art. 108 Ustawy o cudzoziemcach", "Art. 108 ust. 1 pkt 2"],
  },
  UNDER_REVIEW: {
    docType: "STATUS_INQUIRY",
    title: "Status Inquiry to Voivodeship",
    promptPl: "Przygotuj oficjalne zapytanie o status sprawy skierowane do urzędu wojewódzkiego. Powołaj się na Art. 35-36 KPA dotyczące terminów rozpatrywania.",
    promptEn: "Prepare a formal status inquiry letter to the voivodeship office. Reference KPA Art. 35-36 regarding processing timelines.",
    legalArticles: ["Art. 35 KPA", "Art. 36 KPA", "Art. 37 KPA (bezczynność organu)"],
  },
  DEFECT_NOTICE: {
    docType: "DEFECT_RESPONSE",
    title: "Defect Notice Response",
    promptPl: "Przygotuj odpowiedź na wezwanie do uzupełnienia braków formalnych. Odnieś się do każdego wymaganego dokumentu. Uzasadnij prawnie każdą odpowiedź. Termin: 14 dni.",
    promptEn: "Prepare a response to the formal defect notice. Address each required document point by point. Provide legal justification. Deadline: 14 days.",
    legalArticles: ["Art. 64 §2 KPA", "Art. 108 Ustawy o cudzoziemcach", "Art. 7 KPA (zasada prawdy obiektywnej)"],
  },
  DECISION_RECEIVED: {
    docType: "DECISION_ANALYSIS",
    title: "Decision Analysis Memo",
    promptPl: "Przeanalizuj decyzję wydaną przez urząd. Określ podstawę prawną, terminy odwoławcze i zalecane dalsze kroki. Oceń szanse powodzenia ewentualnego odwołania.",
    promptEn: "Analyze the decision issued by the authority. Identify legal basis, appeal deadlines, and recommended next steps. Assess appeal success probability.",
    legalArticles: ["Art. 127 KPA (odwołanie)", "Art. 129 §2 KPA (termin 14 dni)", "Art. 138 KPA"],
  },
  REJECTED: {
    docType: "APPEAL_LETTER",
    title: "Appeal Letter with Legal Grounds",
    promptPl: "Przygotuj odwołanie od decyzji odmownej. Podaj konkretne zarzuty naruszenia prawa. Powołaj się na orzecznictwo NSA/WSA. Wskaż błędy w uzasadnieniu decyzji organu I instancji. Termin: 14 dni od doręczenia.",
    promptEn: "Prepare an appeal against the rejection decision. Cite specific legal violations. Reference NSA/WSA case law. Identify errors in the first-instance authority's reasoning. Deadline: 14 days from delivery.",
    legalArticles: ["Art. 127 KPA", "Art. 129 §2 KPA", "Art. 7 KPA", "Art. 77 KPA", "Art. 80 KPA", "Art. 107 §3 KPA"],
  },
  APPROVED: {
    docType: "COMPLIANCE_CONFIRMATION",
    title: "Compliance Confirmation for Worker & Client",
    promptPl: "Przygotuj potwierdzenie pozytywnego rozpatrzenia sprawy dla pracownika i klienta. Zawrzyj daty ważności nowego dokumentu i obowiązki dalszego monitorowania.",
    promptEn: "Prepare a compliance confirmation for the worker and client. Include new document validity dates and ongoing monitoring obligations.",
    legalArticles: ["Art. 100 Ustawy o cudzoziemcach"],
  },
};

// ═══ AI DOCUMENT GENERATION ════════════════════════════════════════════════

export async function generateDocumentForStage(
  caseId: string,
  tenantId: string,
  stage: string,
): Promise<GeneratedDoc | null> {
  const config = STAGE_DOC_MAP[stage];
  if (!config) return null;

  // Fetch case + worker data
  const caseData = await queryOne<any>(
    `SELECT c.*, w.first_name, w.last_name, w.nationality, w.pesel, w.passport_number,
            w.trc_expiry, w.work_permit_expiry, w.date_of_birth,
            w.specialization, w.contract_type
     FROM legal_cases c JOIN workers w ON c.worker_id = w.id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [caseId, tenantId]
  );
  if (!caseData) return null;

  // Fetch relevant KB articles
  let kbContext = "";
  const kbArticlesUsed: string[] = [];
  try {
    const articles = await query<any>(
      "SELECT title, content, category FROM legal_knowledge WHERE tenant_id = $1 ORDER BY category LIMIT 12",
      [tenantId]
    );
    if (articles.length > 0) {
      kbContext = "\n\nVERIFIED LEGAL KNOWLEDGE BASE:\n" +
        articles.map(a => `[${a.category}] ${a.title}: ${a.content}`).join("\n\n");
      kbArticlesUsed.push(...articles.map(a => a.title));
    }
  } catch { /* no KB articles */ }

  // Fetch similar cases from knowledge graph
  let similarContext = "";
  let similarCount = 0;
  try {
    const { findSimilarCases } = await import("./knowledge-graph.service.js");
    const similar = await findSimilarCases(tenantId, caseData.case_type, caseData.nationality, undefined, 5);
    if (similar.length > 0) {
      similarCount = similar.length;
      similarContext = "\n\nSIMILAR CASES (anonymized precedent):\n" +
        similar.map(s => `- ${s.label}: outcome=${s.outcome ?? "pending"}, voivodeship=${s.voivodeship ?? "unknown"}, days_to_decision=${s.daysToDecision ?? "unknown"}, similarity=${s.similarity}%`).join("\n");
    }
  } catch { /* no similar cases */ }

  // Fetch case notebook entries for context
  let notebookContext = "";
  try {
    const { getNotebookEntries } = await import("./case-notebook.service.js");
    const entries = await getNotebookEntries(caseId, tenantId);
    if (entries.length > 0) {
      notebookContext = "\n\nCASE HISTORY (from notebook):\n" +
        entries.slice(0, 15).map(e => `- ${new Date(e.created_at).toISOString().slice(0, 10)}: [${e.entry_type}] ${e.title} — ${e.content.slice(0, 100)}`).join("\n");
    }
  } catch { /* no notebook entries */ }

  // Build worker context
  const workerContext = `
WORKER DATA:
- Name: ${caseData.first_name} ${caseData.last_name}
- Nationality: ${caseData.nationality ?? "Unknown"}
- PESEL: ${caseData.pesel ?? "Not assigned"}
- Passport: ${caseData.passport_number ?? "Unknown"}
- Date of Birth: ${caseData.date_of_birth ?? "Unknown"}
- Specialization: ${caseData.specialization ?? "General"}
- Contract Type: ${caseData.contract_type ?? "Unknown"}
- TRC Expiry: ${caseData.trc_expiry ?? "None"}
- Work Permit Expiry: ${caseData.work_permit_expiry ?? "None"}

CASE DATA:
- Case Type: ${caseData.case_type}
- Current Status: ${caseData.status}
- Stage: ${stage}
- Next Action: ${caseData.next_action ?? "N/A"}
- Appeal Deadline: ${caseData.appeal_deadline ?? "N/A"}
- MOS Status: ${caseData.mos_status ?? "N/A"}
- Created: ${caseData.created_at}

LEGAL ARTICLES TO REFERENCE:
${config.legalArticles.join("\n")}`;

  // Generate with Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  let contentPl = "";
  let contentEn = "";
  let aiModel = "template-fallback";
  let confidence = 60;

  if (apiKey) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const anthropic = new Anthropic({ apiKey });

      // Generate Polish version
      const plResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: `You are a senior Polish immigration lawyer drafting formal legal documents. You work at an outsourcing company managing 200+ foreign workers in Poland. Your documents must be precise, legally sound, and reference specific Polish law articles. Use formal Polish legal language. Always cite: article number, full law name, and relevant paragraphs. Today's date: ${new Date().toISOString().slice(0, 10)}.${kbContext}${similarContext}${notebookContext}`,
        messages: [{ role: "user", content: `${config.promptPl}\n\n${workerContext}\n\nWrite the complete document in formal Polish. Include all relevant legal citations.` }],
      });
      contentPl = plResponse.content[0]?.type === "text" ? plResponse.content[0].text : "";

      // Generate English version
      const enResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: `You are a senior immigration lawyer drafting formal legal documents for Polish immigration cases. Your documents must reference specific Polish law articles with accurate citations. Include legal basis for every recommendation. Today's date: ${new Date().toISOString().slice(0, 10)}.${kbContext}${similarContext}${notebookContext}`,
        messages: [{ role: "user", content: `${config.promptEn}\n\n${workerContext}\n\nWrite the complete document in formal English. Include all relevant Polish law citations.` }],
      });
      contentEn = enResponse.content[0]?.type === "text" ? enResponse.content[0].text : "";

      aiModel = "claude-sonnet-4-6";
      confidence = 85;
    } catch (err) {
      console.error("[CaseDocGen] AI generation failed:", err instanceof Error ? err.message : err);
    }
  }

  // Fallback: template-based generation
  if (!contentPl) {
    contentPl = `[SZABLON — ${config.title}]\n\nDotyczy: ${caseData.first_name} ${caseData.last_name} (${caseData.nationality ?? ""})\nNumer paszportu: ${caseData.passport_number ?? "—"}\nPESEL: ${caseData.pesel ?? "—"}\nTyp sprawy: ${caseData.case_type}\nStatus: ${stage}\n\nPodstawa prawna: ${config.legalArticles.join(", ")}\n\n${config.promptPl}\n\n[Wymaga uzupełnienia przez prawnika]`;
    contentEn = `[TEMPLATE — ${config.title}]\n\nRe: ${caseData.first_name} ${caseData.last_name} (${caseData.nationality ?? ""})\nPassport: ${caseData.passport_number ?? "—"}\nPESEL: ${caseData.pesel ?? "—"}\nCase Type: ${caseData.case_type}\nStatus: ${stage}\n\nLegal Basis: ${config.legalArticles.join(", ")}\n\n${config.promptEn}\n\n[Requires lawyer completion]`;
    confidence = 40;
  }

  // Save to database
  const doc = await queryOne<GeneratedDoc>(
    `INSERT INTO case_generated_docs
     (case_id, worker_id, tenant_id, doc_type, stage_trigger, title, content_pl, content_en,
      legal_basis, similar_cases_used, kb_articles_used, ai_model, ai_confidence, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'DRAFT', $14)
     RETURNING *`,
    [
      caseId, caseData.worker_id, tenantId,
      config.docType, stage, config.title,
      contentPl, contentEn,
      config.legalArticles, similarCount,
      kbArticlesUsed.slice(0, 10), aiModel, confidence,
      JSON.stringify({ workerName: `${caseData.first_name} ${caseData.last_name}`, nationality: caseData.nationality }),
    ]
  );

  // Log in case notebook
  try {
    const { addNotebookEntry } = await import("./case-notebook.service.js");
    await addNotebookEntry(caseId, tenantId, "ai_insight",
      `AI Draft: ${config.title}`,
      `AI generated ${config.docType} for stage ${stage} (${aiModel}, ${confidence}% confidence). ${similarCount} similar cases referenced, ${kbArticlesUsed.length} KB articles used. Awaiting lawyer review.`,
      { metadata: { docId: doc?.id, docType: config.docType, aiModel, confidence } }
    );
  } catch { /* non-blocking */ }

  // Link in knowledge graph
  try {
    const { createNode, createEdge, findNodeByRef } = await import("./knowledge-graph.service.js");
    if (doc) {
      const docNode = await createNode(tenantId, "DOCUMENT", config.title, {
        generated_doc_id: doc.id, doc_type: config.docType, stage, ai_generated: true,
      });
      const caseNode = await findNodeByRef(tenantId, "CASE", "case_id", caseId);
      if (caseNode) {
        await createEdge(tenantId, caseNode.id, docNode.id, "HAS", 1.0, { relationship: "generated_document" });
      }
      // Link to cited statutes
      for (const article of config.legalArticles) {
        const artNum = article.match(/Art\.\s*(\d+)/)?.[1];
        if (artNum) {
          let statuteNode = await findNodeByRef(tenantId, "LEGAL_STATUTE", "article", artNum);
          if (!statuteNode) {
            statuteNode = await createNode(tenantId, "LEGAL_STATUTE", article, { article: artNum, full_citation: article });
          }
          await createEdge(tenantId, docNode.id, statuteNode.id, "BASED_ON", 1.0, { citation: article });
        }
      }
    }
  } catch { /* non-blocking */ }

  return doc;
}

// ═══ REVIEW QUEUE OPERATIONS ═══════════════════════════════════════════════

export async function getDraftDocuments(tenantId: string): Promise<GeneratedDoc[]> {
  return query<GeneratedDoc>(
    `SELECT d.*, c.case_type, w.first_name || ' ' || w.last_name AS worker_name
     FROM case_generated_docs d
     JOIN legal_cases c ON d.case_id = c.id
     JOIN workers w ON d.worker_id = w.id
     WHERE d.tenant_id = $1 AND d.status IN ('DRAFT','UNDER_REVIEW')
     ORDER BY d.created_at DESC`,
    [tenantId]
  );
}

export async function getAllGeneratedDocs(tenantId: string, limit: number = 50): Promise<GeneratedDoc[]> {
  return query<GeneratedDoc>(
    `SELECT d.*, c.case_type, w.first_name || ' ' || w.last_name AS worker_name
     FROM case_generated_docs d
     JOIN legal_cases c ON d.case_id = c.id
     JOIN workers w ON d.worker_id = w.id
     WHERE d.tenant_id = $1
     ORDER BY d.created_at DESC LIMIT $2`,
    [tenantId, limit]
  );
}

export async function getDocsByCaseId(caseId: string, tenantId: string): Promise<GeneratedDoc[]> {
  return query<GeneratedDoc>(
    "SELECT * FROM case_generated_docs WHERE case_id = $1 AND tenant_id = $2 ORDER BY created_at DESC",
    [caseId, tenantId]
  );
}

export async function approveDocument(
  docId: string, tenantId: string, reviewedBy: string, notes?: string,
): Promise<GeneratedDoc> {
  const doc = await queryOne<GeneratedDoc>(
    `UPDATE case_generated_docs SET status = 'APPROVED', reviewed_by = $1, reviewed_at = NOW(),
     review_notes = $2, updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4 AND status IN ('DRAFT','UNDER_REVIEW') RETURNING *`,
    [reviewedBy, notes ?? null, docId, tenantId]
  );
  if (!doc) throw new Error("Document not found or already reviewed");

  // Log in notebook
  try {
    const { addNotebookEntry } = await import("./case-notebook.service.js");
    await addNotebookEntry(doc.case_id, tenantId, "manual",
      `Document Approved: ${doc.title}`,
      `${doc.doc_type} approved by ${reviewedBy}.${notes ? ` Notes: ${notes}` : ""}`,
      { author: reviewedBy }
    );
  } catch { /* non-blocking */ }

  return doc;
}

export async function rejectDocument(
  docId: string, tenantId: string, reviewedBy: string, notes: string,
): Promise<GeneratedDoc> {
  const doc = await queryOne<GeneratedDoc>(
    `UPDATE case_generated_docs SET status = 'REJECTED', reviewed_by = $1, reviewed_at = NOW(),
     review_notes = $2, updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4 AND status IN ('DRAFT','UNDER_REVIEW') RETURNING *`,
    [reviewedBy, notes, docId, tenantId]
  );
  if (!doc) throw new Error("Document not found or already reviewed");
  return doc;
}

export async function updateDocumentContent(
  docId: string, tenantId: string, contentPl: string, contentEn: string,
): Promise<GeneratedDoc> {
  const doc = await queryOne<GeneratedDoc>(
    `UPDATE case_generated_docs SET content_pl = $1, content_en = $2, status = 'UNDER_REVIEW', updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4 AND status IN ('DRAFT','UNDER_REVIEW') RETURNING *`,
    [contentPl, contentEn, docId, tenantId]
  );
  if (!doc) throw new Error("Document not found or locked");
  return doc;
}

export async function markDocumentSent(
  docId: string, tenantId: string, sentTo: string,
): Promise<GeneratedDoc> {
  const doc = await queryOne<GeneratedDoc>(
    `UPDATE case_generated_docs SET status = 'SENT', sent_to = $1, sent_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 AND status = 'APPROVED' RETURNING *`,
    [sentTo, docId, tenantId]
  );
  if (!doc) throw new Error("Document not found or not approved");
  return doc;
}

export async function getReviewQueueStats(tenantId: string): Promise<{
  drafts: number; underReview: number; approved: number; rejected: number; sent: number;
}> {
  const rows = await query<{ status: string; count: string }>(
    "SELECT status, COUNT(*) AS count FROM case_generated_docs WHERE tenant_id = $1 GROUP BY status",
    [tenantId]
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = Number(r.count);
  return {
    drafts: counts.DRAFT ?? 0, underReview: counts.UNDER_REVIEW ?? 0,
    approved: counts.APPROVED ?? 0, rejected: counts.REJECTED ?? 0, sent: counts.SENT ?? 0,
  };
}
