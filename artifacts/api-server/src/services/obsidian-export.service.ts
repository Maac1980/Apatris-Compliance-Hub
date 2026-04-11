/**
 * Obsidian Export Service — generates structured Markdown for knowledge base.
 *
 * RULES:
 * - Only APPROVED_FOR_DEPLOYMENT can be exported
 * - No overwrite allowed (one export per update_id)
 * - No export if missing summary
 * - No raw HTML in markdown
 * - Backend-only file generation
 */

import { query, queryOne, execute } from "../lib/db.js";
import fs from "fs";
import path from "path";

const BASE_EXPORT_DIR = path.resolve(process.cwd(), "obsidian_exports");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function slugify(text: string): string {
  return text.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s-]/g, "").replace(/\s+/g, "-").toLowerCase().slice(0, 80);
}

function escapeMarkdown(text: string): string {
  if (!text) return "";
  return text.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim();
}

// ═══ MAIN EXPORT FUNCTION ═══════════════════════════════════════════════════

export async function exportUpdateToObsidian(updateId: string, exportedBy: string): Promise<{ fileName: string; filePath: string; exportedAt: string }> {
  // 1. Check for duplicate
  const existing = await queryOne<any>("SELECT id FROM obsidian_exports WHERE update_id = $1 OR entity_id = $1", [updateId]);
  if (existing) throw new Error("Export already exists for this update — no duplicates allowed");

  // 2. Fetch update
  const u = await queryOne<any>(`SELECT ru.*, rs.name as source_name FROM regulatory_updates ru LEFT JOIN regulatory_sources rs ON rs.id = ru.source_id WHERE ru.id = $1`, [updateId]);
  if (!u) throw new Error("Update not found");

  // 3. Status check — ONLY APPROVED_FOR_DEPLOYMENT
  if (u.status !== "APPROVED_FOR_DEPLOYMENT") {
    throw new Error(`Only APPROVED_FOR_DEPLOYMENT updates can be exported. Current status: ${u.status}`);
  }

  // 4. Validation
  if (!u.summary_pl && !u.summary_en && !u.summary) throw new Error("Cannot export: no summary available");
  if (!u.severity) throw new Error("Cannot export: severity not set");

  // 5. Fetch related data
  const impacts = await query<any>("SELECT * FROM regulatory_impacts WHERE update_id = $1 ORDER BY impact_severity DESC", [updateId]);
  const sim = await queryOne<any>("SELECT * FROM regulatory_simulations WHERE update_id = $1", [updateId]);
  const approvals = await query<any>("SELECT * FROM regulatory_approvals WHERE update_id = $1 ORDER BY approved_at", [updateId]);
  const deployments = await query<any>("SELECT * FROM regulatory_deployments WHERE update_id = $1", [updateId]);

  let auditCount = 0;
  let lastAuditAction = "—";
  try {
    const auditStats = await queryOne<any>("SELECT COUNT(*)::int as c FROM regulatory_audit_log WHERE update_id = $1", [updateId]);
    auditCount = auditStats?.c ?? 0;
    const lastAudit = await queryOne<any>("SELECT event_type FROM regulatory_audit_log WHERE update_id = $1 ORDER BY created_at DESC LIMIT 1", [updateId]);
    lastAuditAction = lastAudit?.event_type ?? "—";
  } catch {}

  // 6. Generate markdown
  const md = buildMarkdown(u, impacts, sim, approvals, deployments, auditCount, lastAuditAction);

  // 7. File naming: YYYY-MM-DD-[slugified-title].md
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const slug = slugify(u.title || "untitled");
  const fileName = `${dateStr}-${slug}.md`;

  // 8. File path: /obsidian_exports/regulatory/YYYY/MM/
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(5, 7);
  const dirPath = path.join(BASE_EXPORT_DIR, "regulatory", year, month);
  const fullPath = path.join(dirPath, fileName);
  const relativePath = path.join("regulatory", year, month, fileName);

  ensureDir(dirPath);
  if (fs.existsSync(fullPath)) throw new Error("File already exists on disk — will not overwrite");
  fs.writeFileSync(fullPath, md, "utf-8");

  // 9. Insert DB record
  const exportedAt = now.toISOString();
  await execute(
    `INSERT INTO obsidian_exports (entity_type, entity_id, update_id, file_name, file_path, title, exported_by, exported_at, status)
     VALUES ('regulatory_update',$1,$2,$3,$4,$5,$6,$7::timestamptz,'EXPORTED')`,
    [updateId, updateId, fileName, relativePath, u.title ?? "", exportedBy, exportedAt]
  );

  return { fileName, filePath: relativePath, exportedAt };
}

// ═══ RESEARCH MEMO EXPORT ═══════════════════════════════════════════════════

export async function exportResearchMemo(memoId: string, exportedBy: string): Promise<{ fileName: string; filePath: string; exportedAt: string }> {
  const existing = await queryOne<any>("SELECT id FROM obsidian_exports WHERE entity_id = $1", [memoId]);
  if (existing) throw new Error("Export already exists for this memo");

  const m = await queryOne<any>("SELECT * FROM research_memos WHERE id = $1", [memoId]);
  if (!m) throw new Error("Memo not found");

  const md = `---
title: "${escapeMarkdown(m.title ?? "")}"
created: ${new Date().toISOString()}
memo_id: ${m.id}
type: research_memo
---

# ${escapeMarkdown(m.title ?? "")}

## Research
${escapeMarkdown(m.perplexity_answer ?? "No research data.")}

## Summary
${escapeMarkdown(m.summary ?? "No summary.")}

## Action Items
${(m.action_items ?? []).map((a: string) => `- ${escapeMarkdown(a)}`).join("\n") || "None."}

## Sources
${(m.sources ?? []).map((s: string) => `- ${s}`).join("\n") || "None."}
`;

  const now = new Date();
  const fileName = `${now.toISOString().slice(0, 10)}-memo-${slugify(m.title || "memo")}.md`;
  const dirPath = path.join(BASE_EXPORT_DIR, "memos", now.toISOString().slice(0, 4));
  const fullPath = path.join(dirPath, fileName);
  const relativePath = path.join("memos", now.toISOString().slice(0, 4), fileName);

  ensureDir(dirPath);
  fs.writeFileSync(fullPath, md, "utf-8");

  await execute(
    "INSERT INTO obsidian_exports (entity_type, entity_id, update_id, file_name, file_path, title, exported_by, exported_at, status) VALUES ('research_memo',$1,NULL,$2,$3,$4,$5,NOW(),'EXPORTED')",
    [memoId, fileName, relativePath, m.title ?? "", exportedBy]
  );

  return { fileName, filePath: relativePath, exportedAt: now.toISOString() };
}

// ═══ READ OPERATIONS ════════════════════════════════════════════════════════

export async function listExports(filters?: { date?: string }): Promise<any[]> {
  if (filters?.date) {
    return query("SELECT * FROM obsidian_exports WHERE exported_at::date = $1::date ORDER BY exported_at DESC", [filters.date]);
  }
  return query("SELECT * FROM obsidian_exports ORDER BY exported_at DESC NULLS LAST, created_at DESC LIMIT 100");
}

export async function getExportContent(id: string): Promise<string | null> {
  const exp = await queryOne<any>("SELECT file_path FROM obsidian_exports WHERE id = $1", [id]);
  if (!exp) return null;
  const fullPath = path.join(BASE_EXPORT_DIR, exp.file_path);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf-8");
}

export async function getExportById(id: string): Promise<any> {
  const exp = await queryOne<any>("SELECT * FROM obsidian_exports WHERE id = $1", [id]);
  if (!exp) return null;
  const fullPath = path.join(BASE_EXPORT_DIR, exp.file_path);
  const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf-8") : null;
  return { ...exp, content };
}

// ═══ MARKDOWN BUILDER ═══════════════════════════════════════════════════════

function buildMarkdown(u: any, impacts: any[], sim: any, approvals: any[], deployments: any[], auditCount: number, lastAuditAction: string): string {
  const topics = (u.relevant_topics ?? []).map((t: string) => `[[${t}]]`).join(", ");
  const topicLinks = (u.relevant_topics ?? []).map((t: string) => `- [[${t}]]`).join("\n");
  const articles = (u.cited_articles ?? []).map((a: string) => `[[${a}]]`).join(", ");
  const articleLinks = (u.cited_articles ?? []).map((a: string) => `- [[${a}]]`).join("\n");

  return `---
title: "${escapeMarkdown(u.title ?? "")}"
update_id: "${u.id}"
status: "${u.status}"
severity: "${u.severity ?? "unknown"}"
confidence: ${u.confidence_score ?? 0}
exported_at: "${new Date().toISOString()}"
---

# ${escapeMarkdown(u.title ?? "")}

## Summary (PL)
${escapeMarkdown(u.summary_pl || u.summary || "Brak podsumowania.")}

## Summary (EN)
${escapeMarkdown(u.summary_en || "No English summary available.")}

## Source
- Authority: ${u.authority_name ?? u.source_name ?? u.source ?? "Unknown"}
- URL: ${u.canonical_url ?? "N/A"}
- Published: ${u.publication_date ?? "Unknown"}
- Effective: ${u.effective_date ?? "Unknown"}

## Classification
- Type: ${u.update_type ?? "Unknown"}
- Topics: ${topics || "None"}
- Articles: ${articles || "None"}

## Impact
${impacts.length === 0 ? "No impact data available." : impacts.map(i => `- Module: **${(i.impacted_module ?? "").replace(/_/g, " ")}**
  - Severity: ${i.impact_severity}
  - Recommendation: ${escapeMarkdown(i.recommended_change ?? "—")}`).join("\n")}

## Simulation
${sim ? `- Workers affected: ${sim.affected_workers_count ?? 0}
- Cases affected: ${sim.affected_cases_count ?? 0}
- Employers affected: ${sim.affected_employers_count ?? 0}
- Legal risk: ${sim.legal_risk_level ?? "LOW"}
- Operational risk: ${sim.operational_risk_level ?? "LOW"}` : "No simulation data available."}

## Decisions
${approvals.length === 0 ? "No approval records." : approvals.map(a => `- ${a.approval_decision} by ${a.approver_user_id} (${new Date(a.approved_at).toLocaleDateString("pl-PL")}): ${escapeMarkdown(a.approval_notes ?? "—")}`).join("\n")}

## Deployment
${deployments.length === 0 ? "Not yet deployed." : deployments.map(d => `- Module: ${(d.target_module ?? "").replace(/_/g, " ")} — Status: ${d.deployment_status} (${d.deployment_type})`).join("\n")}

## Audit Trail (Summary)
- Total events: ${auditCount}
- Last action: ${lastAuditAction}

## Links
${topicLinks || "No topic links."}
${articleLinks || "No article links."}
`;
}
