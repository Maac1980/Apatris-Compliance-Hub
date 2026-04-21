# Wiring Audit 1A — Dead-Code Candidates from AI-LEGAL-TRC-AUDIT-2026-04-21

Read-only follow-up to Section 5 of the prior audit. Goal: resolve the 6 services flagged as potentially orphaned, by tracing route → frontend → navigation for each.

**Headline:** The prior audit's "dead code" claim was **largely incorrect**. 4 of the 6 function names it listed don't actually exist (slight name drift between the claim and the code); the real exported functions are mostly wired. Only one true backend-only orphan remains, and both the TRC dashboard gap and the SSE consumer gap flagged in the prior audit are resolved.

---

## 1. Candidate-by-Candidate Verdicts

### Legend
- **Actual fn name** — the export present in the service file (the prior audit's spelling, where different)
- **Backend route** — HTTP method + path + file:line
- **Frontend caller** — dashboard file:line that fetches the route
- **Navigable** — whether the component is on a navigable top-level Wouter route

| # | Prior-audit name | Actual fn name | Backend route | Frontend caller | Navigable | **Verdict** |
|---|---|---|---|---|---|---|
| 1 | `generateLegalBrief` | ✅ same | `POST /api/v1/legal/brief/generate` at `routes/legal-brief.ts:16` (`requireRole Admin/Executive/LegalHead`) | `pages/LegalBrief.tsx:47`; also `pages/LegalIntelligence.tsx:413` | ✅ `/legal-brief` at `App.tsx:304` | **FULLY WIRED** |
| 2 | `askLegalCopilot` | ✅ same | `POST /api/v1/legal/copilot/ask` at `routes/legal-copilot.ts:8` (`requireRole Admin/Executive/LegalHead`) | `components/LegalCopilot.tsx:44`; imported by `pages/ImmigrationDashboard.tsx:8` | ✅ `/immigration` at `App.tsx:358` (ImmigrationDashboard embeds LegalCopilot) | **FULLY WIRED** |
| 3 | `answerQuestion` | ❌ **name wrong** — actual export is `routeIntelligenceQuery` at `intelligence-router.service.ts:155` | `POST /api/legal-kb/ask` at `routes/legal-kb.ts:142` | `pages/LegalKB.tsx` (wires the legal-kb path tree) | Likely yes (LegalKB is a page component) | **WIRED (under a different name)** |
| 4 | `generateMOSPackage` | ✅ same | `POST /api/workers/:id/mos-package` at `routes/mos.ts:91` (`requireRole Admin/Executive/LegalHead`) | `pages/LegalCommandCenter.tsx:787`; `pages/LegalImmigrationCommand.tsx:594, 686, 1874` | ✅ both parent pages navigable (`/command-center`, `/legal-immigration`) | **FULLY WIRED** |
| 5 | `buildAuthorityResponsePack` | ❌ **name wrong** — actual export is `generateAuthorityPack` at `authority-response.service.ts:106` | `POST /api/v1/legal/authority-pack/generate` at `routes/authority-response.ts:29` (`requireRole Admin/Executive/LegalHead`) | `pages/AuthorityPacks.tsx:58` (generate), `:74` (approve), `:38` (list); `pages/LegalImmigrationCommand.tsx:229` (list); `pages/LegalQueue.tsx:142` (approve) | ✅ `/authority-packs` at `App.tsx:292` | **FULLY WIRED (under a different name)** |
| 6 | `analyzeCaseState` | ❌ **name wrong** — actual export is `analyzeCaseIntelligence` at `case-intelligence.service.ts:115` | `POST /api/v1/case-intelligence/:workerId/analyze` at `routes/case-intelligence.ts:18` + 2 siblings (`:27 GET /latest`, `:36 POST /batch`) | ❌ **zero dashboard callers** — grep for `case-intelligence` in `apatris-dashboard/src/` returns no hits | ❌ no page found | **BACKEND-ONLY — genuine frontend orphan** |

### Additional detail per candidate

**#1 generateLegalBrief — FULLY WIRED**
- Route file imports the function at `routes/legal-brief.ts:11`, calls it at line 23.
- Two frontend pages use the endpoint, the primary one (`LegalBrief.tsx`) is the dedicated UI for the 6-stage pipeline.

**#2 askLegalCopilot — FULLY WIRED**
- Corrects the prior audit's "Implied `/api/ai/copilot` — route not cleanly located." Actual route is `/api/v1/legal/copilot/ask`.
- `LegalCopilot.tsx` is embedded (not standalone); the reachable parent is `ImmigrationDashboard` at `/immigration`.

**#3 answerQuestion — WIRED under `routeIntelligenceQuery`**
- The prior audit listed a function name that doesn't exist. The closest real export is `routeIntelligenceQuery`, which serves `POST /api/legal-kb/ask` (a 3-tier KB → Perplexity → Claude router).
- Frontend has a `LegalKB.tsx` page that references the path. Depth of wiring (button → query → answer UI) not traced here — partial confidence.

**#4 generateMOSPackage — FULLY WIRED**
- Route at `routes/mos.ts:91` also emits `mos_ready` to `intelligence-emitter` on success (relevant to SSE section E below).
- Three pages call the endpoint; both parent pages are navigable.

**#5 buildAuthorityResponsePack — FULLY WIRED (real name: `generateAuthorityPack`)**
- Dedicated `/authority-packs` page exists and calls the `/generate` endpoint at `AuthorityPacks.tsx:58`, plus `/approve` (line 74) and `/all` (line 38).
- `LegalImmigrationCommand.tsx` and `LegalQueue.tsx` consume the same family of endpoints (list + approve) from their own contexts.
- Prior audit claimed "zero callers" — that was incorrect.

**#6 analyzeCaseState — BACKEND-ONLY**
- Real function `analyzeCaseIntelligence`; route lives at `routes/case-intelligence.ts:18` (+ 2 siblings).
- Service is imported by `services/test-scenario.service.ts` (internal test scenario) at lines 26, 228, 301 — not from any route, not from the dashboard.
- Grep across `apatris-dashboard/src/` for `case-intelligence` (path or identifier) returns **zero matches**.
- This is the only genuine orphan-in-frontend among the 6.

---

## 2. TRC Dashboard Gap — RESOLVED

Prior audit (section 2 of AI-LEGAL-TRC-AUDIT-2026-04-21.md): "No dedicated TrcPage.tsx / CaseDetailPage.tsx found."

**Finding on second look:**

| File | Role | Navigable route |
|---|---|---|
| `artifacts/apatris-dashboard/src/pages/TRCService.tsx` | TRC case management | `/trc-service` (App.tsx:241) |
| `artifacts/apatris-dashboard/src/pages/TRCWorkspace.tsx` | TRC case workspace | `/trc-workspace` (App.tsx:319) |

**Verdict:** TRC UI exists and is navigable. The prior audit's "confidence: medium" flag was appropriately hedged; this resolves the gap.

Not examined here: quality/completeness of TRCService vs TRCWorkspace, whether they overlap, whether they wire every TRC route. Those are separate UX questions.

---

## 3. SSE Producer + Consumer Gap — RESOLVED

Prior audit: "SSE endpoint exists but no producers found calling the emitter … no `EventSource` client usage that would consume the SSE endpoint."

### Emitter contract (`lib/intelligence-emitter.ts`)
Event types: `"status_change" | "doc_verified" | "mos_ready"`. Exports `emitIntelligenceEvent(event)` and `onIntelligenceEvent(handler)`.

### Producers (3 found)
| File | Line | Event type |
|---|---|---|
| `services/legal-status.service.ts` | 525 | `status_change` |
| `routes/mos.ts` | 92 | `mos_ready` (fires after successful `generateMOSPackage`) |
| `routes/document-intelligence.ts` | 261 | `doc_verified` |

### Frontend consumer (1 found — prior audit missed this)
| File | Line | Detail |
|---|---|---|
| `pages/LegalCommandCenter.tsx` | 65 | `new EventSource(\`${BASE}api/intelligence/stream?token=${token}\`)` with `onmessage` handler and reconnect via `useEffect` cleanup |

**Verdict:** the SSE stream has a real producer/consumer chain. LegalCommandCenter subscribes; 3 backend emit sites feed it.

Not examined here: whether the dashboard actually *reacts* to events usefully (UI toast? auto-refresh a query?) versus just logging. That's a UX question separate from the wiring audit.

---

## 4. Kill / Wire / Polish — Per Candidate

My judgment per candidate, given the above findings:

| # | Actual fn | Verdict | Recommendation |
|---|---|---|---|
| 1 | `generateLegalBrief` | FULLY WIRED | **POLISH** — this is the richest AI endpoint; UX is presumably the next lever (streaming, confidence surfacing, visible validation stages). Don't touch the wiring. |
| 2 | `askLegalCopilot` | FULLY WIRED | **POLISH** — works, but embedded in ImmigrationDashboard rather than standalone. Consider if lawyers want a dedicated `/legal-copilot` page for a focused chat mode. UX call. |
| 3 | `routeIntelligenceQuery` (was listed as `answerQuestion`) | WIRED (via LegalKB) | **POLISH** — works via `/api/legal-kb/ask` + `LegalKB.tsx`. Worth a light UX trace to confirm the 3-tier source attribution is surfaced to the user. |
| 4 | `generateMOSPackage` | FULLY WIRED | **POLISH** — wired from two command-center pages. MOS is time-sensitive (2026 deadline); worth inspecting whether the current UX flow matches what a lawyer needs under deadline pressure. |
| 5 | `generateAuthorityPack` (was listed as `buildAuthorityResponsePack`) | FULLY WIRED | **POLISH** — dedicated `/authority-packs` page exists; consumers across 3 pages. No wiring work needed. |
| 6 | `analyzeCaseIntelligence` (was listed as `analyzeCaseState`) | BACKEND-ONLY | **WIRE or KILL.** This is the one genuine orphan. Route exists; no dashboard consumer. Options: (a) **Wire** it into a case-detail panel (it produces a 7-section lawyer-focused analysis — high-value for the target user), or (b) **kill** the route if the product direction is covered by the legal-brief pipeline. Flag for product decision before investing in a UI. |

### Net conclusion

- **5 of 6 candidates are fully wired or wired under a different name.** The prior audit's "dead code" framing was misleading.
- **1 true backend-only orphan:** `analyzeCaseIntelligence`. Either productize (build a case-intelligence panel) or retire.
- **Both side gaps resolved:** TRC dashboard pages exist; SSE consumer exists.

### What the prior audit got wrong, and why

The 5-section `services/*legal*.ts` audit was written from `find + grep services/` without the matching frontend pass. Four of the six function names were spelled slightly differently in the audit vs the code (`answerQuestion`/`routeIntelligenceQuery`, `buildAuthorityResponsePack`/`generateAuthorityPack`, `analyzeCaseState`/`analyzeCaseIntelligence`, `generateMOSPackage`/same). Grepping the audit's spellings produced false "no route found" results; grepping the actual exports reveals the real wiring.

Fix going forward: audits of "is this wired?" should grep the actual `export function X` / `export async function X` names out of the service file first, then search for those names in routes and the frontend. Never trust the audit-author's recollection of the function name.

---

## What's out of scope for this audit

- Quality of the prompts, outputs, or UX for the wired services (that's the content of the prior audit section 3).
- Whether the dashboard actually **displays** streamed SSE events usefully (UX question).
- Route depth-tracing for candidate 3 (`routeIntelligenceQuery`): confirmed LegalKB page exists and references legal-kb paths; did not trace the click-to-answer flow.
- Whether TRCService.tsx and TRCWorkspace.tsx duplicate each other or serve distinct lifecycle stages.
- Any test coverage assessment — no new test checks were run.

---

*Audit complete. No code changes. File uncommitted. Prod v290 and staging v13 untouched.*
