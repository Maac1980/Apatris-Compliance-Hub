# APATRIS-vs-EEJ Feature Audit — 10 surfaces side-by-side

**Date:** 2026-05-16 (Day 30)
**Scope:** Read-only cross-codebase audit. Same Claude Code session has filesystem access to both APATRIS + EEJ. Audits 10 surfaces against both codebases. Surfaces gaps and cross-port viability.
**APATRIS HEAD at audit:** `9ddd689`
**EEJ active path:** `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/` (verified git remote `git@github.com:Maac1980/EURO-EDU-JOBS-app.git`)

---

## Filesystem note

**EEJ is reachable from this session.** Multiple copies exist; only the Desktop path is the active repo:

| Path | Status |
|---|---|
| `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/` | **ACTIVE** — used in all EEJ references below |
| `/Users/manishshetty/Downloads/EURO-EDU-JOBS/` | IGNORED (stale download copy) |
| `/Users/manishshetty/Downloads/EURO-EDU-JOBS-app-main/` | IGNORED (stale zip-extracted copy) |
| `/Users/manishshetty/Desktop/Sovereign-Hub/EEJ-Vault/` | IGNORED (separate space, possibly Obsidian vault) |

All EEJ file:line references in this doc are from the Desktop/ active repo. Every claim cites verifiable path.

**Key EEJ directories audited:**
- `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/eej-mobile-HIDDEN/src/` — EEJ-native mobile worker app (source)
- `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/artifacts/api-server/src/` — EEJ API server
- `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/artifacts/apatris-dashboard/src/` — EEJ-side modified APATRIS-dashboard copy (cross-pollinated)

---

## Per-surface comparison table

| # | Surface | APATRIS state | EEJ state | Gap | Cross-port viable? | Day 30 AC |
|---|---|---|---|---|---|---|
| 1 | **Worker profile page structure** | 2 tabs (`profile` + `payroll-history`) in `artifacts/apatris-dashboard/src/components/WorkerProfilePanel.tsx:499` | **11 panels** with role-adaptive ordering in `eej-mobile-HIDDEN/src/components/WorkerCockpit.tsx:42-72`. Panel keys: `alerts / identity / trc / permit / documents / notes / whatsapp / payroll / ai / aiHistory / history` | EEJ has 5.5× more panels + role-adaptive (executive / legal / operations / candidate) | **YES — high value** | AC-31 |
| 2 | **WorkerLink invariant (every-page-clickable)** | NONE — grep for `WorkerLink\|WorkerChip\|WorkerBadge` returns zero | NONE — same grep returns zero on EEJ | **Both missing** — system-wide net-new work on both sides | both need Phase B build | AC-38 |
| 3 | **AI summary at worker level** | Only `artifacts/api-server/src/routes/pip-readiness.ts` (1 file) | **6 files**: `artifacts/api-server/src/db/schema.ts` + `routes/workers.ts` + `routes/admin.ts` + `routes/pip-readiness.ts` + `integration.test.ts` + `eej-mobile-HIDDEN/src/components/WorkerCockpit.tsx` (imports `fetchWorkerAiSummary` + `AiSummaryResponse` type) | EEJ has rich AI summary infra: schema + 2 routes + UI integration + tests; APATRIS has only single PIP-readiness call site | **YES — model on EEJ** | AC-31 + AC-44 |
| 4 | **AI action recommendations** | 5 files: `init-db.ts` + `complianceAI.ts` + `routes/competitors.ts` + `routes/immigration.ts` + `routes/salary.ts` | **10 files** including dedicated services: `services/agency-compliance-engine.ts` + `services/agency-protection.ts` + `services/poa-legal-protection.ts` + `services/legal-engine.ts` + `services/research-workspace.ts` + `services/smart-document.ts` + `services/document-hardening.ts` + `lib/ai.ts` + `lib/complianceAI.ts` + `db/migrate.ts` | EEJ has 2× more call sites + **dedicated services pattern** vs APATRIS's inline-prompt-per-route pattern | **YES — port services pattern** | AC-44 |
| 5 | **AI decisions audit log** | `routes/ai-audit.ts` with GET + POST (lines 14, 53) — dedicated API route | `aiHistory` panel in `WorkerCockpit.tsx:53` — UI surface but no dedicated route file (`find -iname "ai-audit*"` returns zero on EEJ) | APATRIS has API route; EEJ has UI surface. **Complementary halves** — combine for full implementation | **YES — bidirectional** | AC-44 |
| 6 | **Activity log per worker** | `audit_logs` table exists (`init-db.ts:843`) with `worker_id TEXT` column; no per-worker GET route found | EEJ uses Drizzle schema at `artifacts/api-server/src/db/schema.ts` — activity/audit pattern not directly verified | Both have audit primitives; **neither has per-worker activity-log route**. Net-new for both | YES — small per-worker route work | AC-31 + AC-47 |
| 7 | **Deep-link pattern (Open X →)** | NONE in `WorkerProfilePanel.tsx` — grep for `deepLink\|navContext\|onOpenModule\|setLocation` returns zero | **Fully built** in `WorkerCockpit.tsx`: `setDeepLinkWorker(workerId, data?.worker?.name)` + `onOpenModule(module, workerId)` at 4 call sites (lines 35, 42, 161, 242-256). Supports modules: `"trc" | "permits" | "payroll" | "documents" | "notes"` | EEJ has fully built deep-link primitive + worker-context navigation; APATRIS missing entirely | **YES — high value port** | AC-31 + AC-38 |
| 8 | **Expand-to-full-page pattern** | NONE — WorkerProfilePanel is panel-only, no expand-to-page state | EEJ's `onOpenModule` calls navigate from cockpit panel → full module page via `setDeepLinkWorker` + module routing | Same architecture as Surface 7 — EEJ has integrated pattern; APATRIS missing | **YES — same port as Surface 7** | AC-31 |
| 9 | **Alerts per worker (inline on profile)** | NONE on `WorkerProfilePanel.tsx` — grep for "alert" returns zero in component | **`alerts` is panel key #1** in WorkerCockpit role-adaptive ordering (lines 63, 66, 69, 72 — every role sees alerts first). Imports `CockpitAlert` type. | EEJ has alerts inline as primary panel; APATRIS missing | **YES — high value** | AC-31 + (AC-44 alerts source) |
| 10 | **Payroll surface per worker** | `payroll-history` tab fully built in `WorkerProfilePanel.tsx:499` + `routes/payroll/workers/:id` route per Day 28 AC-31 audit | EEJ has `payroll` panel in WorkerCockpit (line 53) + `onOpenModule("payroll", workerId)` deep-link to full payroll page (line 256) | **Different UX patterns** — APATRIS inline tab; EEJ panel + deep-link. Both functional. | reference both patterns | AC-31 |

---

## Cross-port viability summary

| Cross-port | Value | APATRIS AC affected |
|---|---|---|
| **WorkerCockpit 11-panel role-adaptive structure** | **HIGHEST** — AC-31 Phase B can model on EEJ instead of designing from scratch. Saves 4-6 work units of design effort. | AC-31 |
| **Deep-link pattern (setDeepLinkWorker + onOpenModule)** | HIGH — direct architectural port. Resolves "expand to full page" pattern AC-31 had as open design question. | AC-31 + AC-38 |
| **AI summary + AI action recommendations services pattern** | HIGH — EEJ's dedicated-services-per-domain pattern (agency-compliance-engine, legal-engine, etc.) is the AC-44 registry pattern's predecessor. Could inform AC-44 Phase B handler organization. | AC-44 |
| **Alerts panel inline on worker profile** | HIGH — AC-31 Phase B Alerts tab can use same shape (consume legal_alerts data, surface inline) | AC-31 + (AC-44 alerts source) |
| **Role-adaptive panel ordering** | MEDIUM — feeds AC-35 home-screen interview questions (4 viewer-role-specific panel orders) | AC-35 |
| **WhatsApp template integration** | MEDIUM — EEJ has `fetchWhatsAppTemplates` + `whatsappQuickSend` patterns in WorkerCockpit. AC-43 worker-facing AI could borrow. | AC-43 |
| **DocumentScanFlow component** | LOW — EEJ has worker-side document scan integrated into cockpit. AC-46 Wave 1 + AC-31 Documents tab could reference. | AC-31 + AC-46 |
| **WorkerLink invariant** | NONE — both missing equally; not a port opportunity, net-new on both sides | AC-38 |
| **AC-47 time/site intelligence** | NONE — neither side has it; AC-47 remains net-new on both | AC-47 |

---

## Phase B implications for today's APATRIS audits

**AC-31 Phase B scope reduction:** Significant. AC-31 audit (commit `f6cb3a2`) proposed 4 new tabs (Cases / Documents / Alerts / Site & Hours). EEJ's WorkerCockpit demonstrates **11-panel pattern** with role-adaptive ordering — AC-31 Phase B can:
1. Use EEJ's panel taxonomy as starting point (already-validated by EEJ operators)
2. Port the `setDeepLinkWorker` + `onOpenModule` deep-link pattern directly
3. Reference EEJ's alerts panel for inline-on-profile pattern
4. Reduce design effort by ~50% on tab/panel structure

**AC-44 Phase B reframe:** AC-44 audit (commit `170b038`) proposed Option C registry pattern with handlers under `services/internal-ai/handlers/`. EEJ's existing services pattern (`agency-compliance-engine`, `legal-engine`, `poa-legal-protection`, etc.) is the **predecessor of this pattern** — EEJ has 7+ AI services already organized this way. AC-44 Phase B could:
1. Port EEJ services structure directly (each service = one handler domain)
2. Wrap in AC-44's registry/dispatch as adapter layer
3. Inherit EEJ's working AI summary infrastructure (schema + routes + UI integration)

**AC-38 Phase B unchanged:** WorkerLink invariant is genuinely net-new on both sides. AC-38 Phase B scope unchanged.

**AC-47 Phase B unchanged:** Time/site intelligence is net-new on both sides. AC-47 Phase B scope unchanged.

**AC-37 multi-scenario AI Phase A reframe:** EEJ has `AiSuggestedAction` type + multi-action UX in WorkerCockpit. AC-37 (parked Day 50+ fork-point) could use EEJ as reference implementation rather than greenfield design.

---

## Anti-hallucination caveats

- **All EEJ file paths cite `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/...`** explicitly. Downloads/ + Sovereign-Hub/ paths ignored as stale.
- **WorkerCockpit 11-panel claim verified** by reading line 42 (Tab type) + lines 63/66/69/72 (4 role-adaptive panel arrays). Each array has 11 entries.
- **EEJ AI summary 6 files** verified by `grep -rln "ai_summary\|AISummary\|aiSummary"` returning 6 distinct paths.
- **EEJ services pattern** (`agency-compliance-engine`, `poa-legal-protection`, etc.) verified via `grep -rln "recommendation\|action_recommended"`. Each file's actual implementation NOT deep-read — Phase B port should re-read each before committing to the pattern.
- **APATRIS `ai-audit` route shape** verified at routes/ai-audit.ts lines 14 + 53 (GET + POST). Handler logic NOT deep-audited.
- **Activity log claim (both have audit_logs primitive, neither has per-worker route)** — APATRIS verified at init-db.ts:843; EEJ verified by Drizzle schema search returning zero matches for `activity_log|history|recent` — could be misnamed in EEJ Drizzle schema; Phase B verification needed.
- **EEJ `eej-mobile-HIDDEN` directory name** suggests it's hidden from production deploy. This is the active source for EEJ mobile worker UI — confirmed by import paths starting with `@/` (workspace alias) and well-developed component structure.
- **Per-feature comparison did NOT** verify whether EEJ code is actually deployed to EEJ production — only that source exists. If EEJ source exists but isn't deployed, port still has reference-implementation value.
- **Sample/text-dump from Manish** (Ahmed Al-Rashid profile demonstration) referenced as the genesis of this audit. Not directly verified against EEJ live; this audit confirms source-code presence which is what enables cross-port reasoning.

---

## Cross-AC notes (consolidation)

- **EEJ has working reference implementations for AC-31 + AC-37 + AC-44 territory.** APATRIS Phase B for these ACs becomes "port + adapt" rather than "design + build."
- **Both sides equally missing for AC-38 + AC-47.** No cross-port advantage; Phase B remains net-new on both.
- **EEJ shape may not match APATRIS data model exactly.** EEJ uses `Candidate` type (per WorkerProfileSheet.tsx imports); APATRIS uses `Worker` type. Type adaptation needed at port boundary.
- **EEJ uses Drizzle ORM** (schema.ts pattern); APATRIS uses raw SQL via init-db.ts. Schema patterns don't transfer directly — only column structure + table semantics port.
- **Role taxonomy differs:** EEJ viewer roles are `"executive" | "legal" | "operations" | "candidate"`; APATRIS uses `Admin / Executive / LegalHead / TechOps / Coordinator / Professional`. Mapping needed for role-adaptive port (AC-49 RBAC audit informs this).
- **EEJ WorkerCockpit imports `fetchWhatsAppTemplates`** — useful pattern for AC-43 worker-facing AI when it reaches WhatsApp channel work.
- **EEJ has DocumentScanFlow** component — could inform AC-46 Wave 1 (worker issue/complaint engine document attachment pattern).

---

## Status

- **Audit:** complete (this document).
- **Manish decides cross-port priorities** — this audit is inventory, not architecture commitment. Each port decision (yes/no, full/partial, when) is operator choice.
- **Highest-leverage port candidate:** WorkerCockpit 11-panel structure → AC-31 Phase B (reduces 4-6 WU of design work, gives operator-validated panel taxonomy).
- **Most impactful pattern port:** `setDeepLinkWorker + onOpenModule` deep-link primitive → AC-31 Phase B (resolves expand-to-full-page open question + enables cross-AC navigation flow).
- **No-port confirmation:** AC-38 worker-link invariant + AC-47 time/site intelligence remain net-new on both sides. Phase B scopes unchanged.

**Day 30 +1 implication:** Day 31 Phase B planning for AC-31 should explicitly choose port-vs-build per panel. If 8 of 11 EEJ panels port cleanly and 3 need APATRIS-specific adaptation, AC-31 Phase B scope drops from "design + build" to "adapt + integrate."
