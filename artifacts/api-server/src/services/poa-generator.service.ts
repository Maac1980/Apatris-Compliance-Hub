/**
 * Power of Attorney (Pełnomocnictwo) Generator
 *
 * Generates Polish pełnomocnictwo drafts using:
 *   - Worker identity (from DB)
 *   - Employer / representative data
 *   - Case linkage
 *
 * PROVIDER SPLIT:
 *   Claude → drafting (only if customization needed)
 *   Deterministic → template fill, field validation
 *
 * Output: print-ready Polish draft, editable, linked to worker + case.
 * Safety: all drafts, requires review, no auto-file.
 */

import { query, queryOne, execute } from "../lib/db.js";
import { linkOutputToDocumentHistory } from "./legal-output-linker.service.js";

// ═══ TYPES ══════════════════════════════════════════════════════════════════

export type PoaType = "GENERAL" | "TRC_PROCEEDINGS" | "APPEAL" | "FILE_INSPECTION" | "WORK_PERMIT";

export interface PoaInput {
  tenantId: string;
  workerId: string;
  caseId?: string;
  poaType: PoaType;
  representativeName: string;
  representativeAddress?: string;
  representativeBarNumber?: string;
  scope?: string; // custom scope override
  generatedBy: string;
}

export interface PoaOutput {
  id: string;
  tenant_id: string;
  worker_id: string;
  case_id: string | null;
  poa_type: PoaType;
  content_pl: string;
  content_editable: string;
  representative_name: string;
  status: "draft" | "reviewed" | "signed";
  requires_review: boolean;
  generated_by: string;
  created_at: string;
}

// ═══ TABLE ══════════════════════════════════════════════════════════════════

async function ensureTable(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS poa_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id TEXT NOT NULL DEFAULT 'default',
      worker_id TEXT NOT NULL,
      case_id TEXT,
      poa_type TEXT NOT NULL,
      content_pl TEXT NOT NULL,
      content_editable TEXT NOT NULL,
      representative_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      requires_review BOOLEAN NOT NULL DEFAULT true,
      generated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// ═══ SCOPE TEMPLATES ════════════════════════════════════════════════════════

const SCOPE_TEMPLATES: Record<PoaType, string> = {
  GENERAL:
    "do reprezentowania mnie przed organami administracji publicznej Rzeczypospolitej Polskiej, w tym przed Urzędem do Spraw Cudzoziemców, właściwymi urzędami wojewódzkimi, Strażą Graniczną oraz innymi organami państwowymi, we wszystkich sprawach związanych z moim pobytem i pracą na terytorium RP",
  TRC_PROCEEDINGS:
    "do reprezentowania mnie w postępowaniu administracyjnym dotyczącym udzielenia/zmiany zezwolenia na pobyt czasowy i pracę na terytorium Rzeczypospolitej Polskiej, w tym do składania wniosków, odbioru decyzji, wglądu do akt sprawy, składania wyjaśnień i uzupełniania dokumentów",
  APPEAL:
    "do reprezentowania mnie w postępowaniu odwoławczym od decyzji dotyczącej zezwolenia na pobyt czasowy i pracę, w tym do wniesienia odwołania, złożenia skargi do Wojewódzkiego Sądu Administracyjnego, składania wyjaśnień, dowodów oraz wszelkich pism procesowych",
  FILE_INSPECTION:
    "do wglądu do akt sprawy prowadzonej przeze mnie przed właściwym urzędem wojewódzkim/Urzędem do Spraw Cudzoziemców, sporządzania kopii, notatek oraz uzyskiwania informacji o stanie sprawy",
  WORK_PERMIT:
    "do reprezentowania mnie w postępowaniu dotyczącym uzyskania zezwolenia na pracę typu A/B na terytorium Rzeczypospolitej Polskiej, w tym do składania wniosków, odbioru zezwoleń oraz składania wyjaśnień przed właściwym urzędem",
};

// ═══ GENERATE ═══════════════════════════════════════════════════════════════

export async function generatePoa(input: PoaInput): Promise<PoaOutput> {
  await ensureTable();

  const { tenantId, workerId, caseId, poaType, representativeName, representativeAddress, representativeBarNumber, scope, generatedBy } = input;

  // Load worker
  const worker = await queryOne<Record<string, unknown>>(
    `SELECT * FROM workers WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)`, [workerId, tenantId],
  );

  if (!worker) throw new Error("Worker not found");
  const w = worker as any;

  // Build document
  const today = new Date();
  const dateStr = `${today.getDate().toString().padStart(2, "0")}.${(today.getMonth() + 1).toString().padStart(2, "0")}.${today.getFullYear()}`;

  const scopeText = scope ?? SCOPE_TEMPLATES[poaType] ?? SCOPE_TEMPLATES.GENERAL;

  const repLine = representativeBarNumber
    ? `${representativeName}${representativeAddress ? `, ${representativeAddress}` : ""}, nr wpisu na listę: ${representativeBarNumber}`
    : `${representativeName}${representativeAddress ? `, ${representativeAddress}` : ""}`;

  const contentPl = `
                              PEŁNOMOCNICTWO
                              (PROJEKT — do weryfikacji)

Miejscowość: Warszawa
Data: ${dateStr}

Ja, niżej podpisany/a:

   Imię i nazwisko:    ${w.name ?? "___________________"}
   Obywatelstwo:       ${w.nationality ?? "___________________"}
   PESEL:              ${w.pesel ?? "___________________"}
   Nr paszportu:       ${w.passport_number ?? "___________________"}
   Adres zamieszkania: ${w.address ?? "___________________"}

niniejszym udzielam pełnomocnictwa:

   ${repLine}

${scopeText}.

Pełnomocnictwo obejmuje prawo do:
- składania wniosków i pism w moim imieniu,
- odbioru decyzji i postanowień,
- wglądu do akt sprawy,
- składania środków zaskarżenia,
- udzielania dalszych pełnomocnictw (substytucja).

Pełnomocnictwo niniejsze jest ważne do odwołania.


_________________________________          _________________________________
Podpis mocodawcy                          Data i miejsce


Uwaga: Pełnomocnictwo podlega opłacie skarbowej w wysokości 17 PLN
(art. 1 ust. 1 pkt 2 ustawy o opłacie skarbowej).
Zwolnienie: pełnomocnictwo udzielone małżonkowi, wstępnemu, zstępnemu lub rodzeństwu.
`.trim();

  // Editable version (same content, can be modified by user)
  const contentEditable = contentPl;

  // Persist
  const rows = await query<PoaOutput>(
    `INSERT INTO poa_documents
       (tenant_id, worker_id, case_id, poa_type, content_pl, content_editable,
        representative_name, status, requires_review, generated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',true,$8) RETURNING *`,
    [tenantId, workerId, caseId ?? null, poaType, contentPl, contentEditable, representativeName, generatedBy],
  );

  const poa = rows[0];

  // Link to document history
  if (poa) {
    try {
      await linkOutputToDocumentHistory({
        tenantId, workerId, legalCaseId: caseId,
        templateType: "POWER_OF_ATTORNEY",
        title: `Pełnomocnictwo — ${w.name ?? "Worker"} (${poaType})`,
        contentPl: contentPl, source: "POA_GENERATOR", sourceId: poa.id,
        createdBy: generatedBy,
      });
    } catch { /* best-effort */ }
  }

  return poa;
}

// ═══ READ ═══════════════════════════════════════════════════════════════════

export async function getPoasByWorker(workerId: string, tenantId: string) {
  await ensureTable();
  return query<PoaOutput>(
    `SELECT * FROM poa_documents WHERE worker_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`,
    [workerId, tenantId],
  );
}

export async function getPoaById(id: string, tenantId: string) {
  await ensureTable();
  return queryOne<PoaOutput>(
    `SELECT * FROM poa_documents WHERE id = $1 AND tenant_id = $2`, [id, tenantId],
  );
}

// ═══ UPDATE ═════════════════════════════════════════════════════════════════

export async function updatePoaContent(id: string, tenantId: string, editedContent: string) {
  await execute(
    `UPDATE poa_documents SET content_editable = $1 WHERE id = $2 AND tenant_id = $3`,
    [editedContent, id, tenantId],
  );
}

export async function updatePoaStatus(id: string, tenantId: string, status: "draft" | "reviewed" | "signed") {
  await execute(
    `UPDATE poa_documents SET status = $1 WHERE id = $2 AND tenant_id = $3`,
    [status, id, tenantId],
  );
}

// ═══ POA TYPES CATALOG ══════════════════════════════════════════════════════

export function getPoaTypes() {
  return [
    { id: "GENERAL", label: "General Power of Attorney", description: "Full representation before all public administration bodies" },
    { id: "TRC_PROCEEDINGS", label: "TRC Proceedings", description: "Representation in TRC application / change proceedings" },
    { id: "APPEAL", label: "Appeal Proceedings", description: "Representation in appeal and court proceedings" },
    { id: "FILE_INSPECTION", label: "File Inspection", description: "Access to case files and information" },
    { id: "WORK_PERMIT", label: "Work Permit Proceedings", description: "Representation in work permit Type A/B proceedings" },
  ];
}
