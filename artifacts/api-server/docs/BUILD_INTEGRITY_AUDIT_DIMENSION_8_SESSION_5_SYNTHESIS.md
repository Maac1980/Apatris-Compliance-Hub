# BUILD_INTEGRITY_AUDIT — Dimension 8: Session 5 Synthesis

**Authored:** Day 20, May 7 2026 — Manish + chat-Claude (Stage 2 Pass 3 of Session 5).
**Origin:** Cumulative synthesis verdict + Movement 3 sequencing produced by reading all 8 dimension files + Operational Pass + Migration Ledger together with North Star + Pattern 1A/1B/first-step + dormant-capability-discipline filters.

---

## CUMULATIVE AUDIT VERDICT

### The build is in better shape than the audit's individual findings suggest

The 8-dimension audit + Operational Pass produced ~41 distinct findings. Read individually, alarming. Read together with Day 20 Operating Principles 1-6 applied:

- **Most "drift" findings are archaeological** — pre-discipline-era patterns the post-April-25 discipline regime has been cleaning up (M1 AES messaging, M2 Sentry hook, M3 SSH auth, M5 recovery, M9 schema-bug-cluster, M10 staging all closed by Movement 2 Items)
- **Most "dormant capability" findings are deliberate Pattern 1A first-step** (8 entries: multi-tenant, Twilio, Voyage, Upstash Redis, DeepL, Google OAuth, DocuSign, Stripe — all KEEP)
- **Most "documentation drift" already closed** by Items 2.4.x + 2.5.x, residual hygiene captured (AC-3, AC-13, AC-13b)
- **Two findings are real Movement 3 substantive Items:** AC-12 (knowledge graph substrate consolidation) + AC-15 (startScheduler selective re-wire)
- **One finding is HIGH severity North Star concern:** AC-15 Job 12 (`runDailyLegalScan` not running automatically) — silent failure for unknown but significant period

### What the audit caught that justifies the entire discipline

**The startScheduler 10-of-13 capability gap (AC-15 / B13) is the audit win that justifies the framework.** Without per-job mapping (AC-10b), Job 12 silently failing would have continued indefinitely — workers' permit-expiry alerts not firing automatically. Same justification applies to AC-12 (knowledge graph routing bug — AI Copilot wired to impoverished `knowledge_nodes` flat table when rich `kg_*` graph exists and is populated correctly).

**Both findings are pre-discipline-era code that the discipline successfully audited. The discipline works.**

### Cross-cutting pattern: "shipped fast, deferred verification"

Movement 2's biggest pattern: 6 clean closes + 3 reframe-with-verification (M2, M8, M9) + 1 reframe-with-investigation (M4 Airtable). Each Item passed its own gates. Cross-cutting questions weren't part of any single Item's scope. **Remediation is process-level, not code-level.** AC-8 Operational Verification Sweep becomes the recurring discipline.

### North Star alignment verdict

**Every closed migration serves the North Star.** Every dormant Pattern 1A serves future expansion. The two real Movement 3 substantive Items (AC-12 + AC-15) BOTH serve North Star directly. **No drift from purpose.** The discipline regime change April 25 has been doing its job.

---

## MOVEMENT 3 SEQUENCING

14 ordered Items after deduplication of 41 candidates.

### Tier 0 — Prerequisites

**M3-Item-3.0 — Infrastructure guardrails** (existing Core Plan): 3.0a Neon read-only role, 3.0b prod NEON_DATABASE_URL off dev machine, 3.0c off-site backups (CRITICAL precondition for Phase 2)

**M3-Item-3.0d — Operational Verification Sweep** (AC-8 bundle): AC-1 (Pino-Sentry coverage 5 sites) + AC-4 (DB pool error rate Day 17+) + AC-5 (5 features from M9 firing in prod, **plus daily-legal-scan.service.ts schema integrity for AC-15 prerequisite**) + AC-6 (deferred OP items (a) `agent_queries` + (b) `kg_*` health). ~3-4 hours read-only.

**M3-Item-3.0e — Airtable residue investigation** (AC-2): ~1 hour read-only. Outcome shapes either small cleanup Item or larger work.

### Tier 1 — Early Priority

**M3-Item-3.1 — startScheduler Selective Re-wire (AC-15) — HIGH PRIORITY**
Job 12 currently silent. Workers' legal status transitions not detected automatically. Direct North Star failure in production. Tier 1 (Job 1 + Job 12) ~30 min after AC-5 prerequisite. Tier 2-3 ~2-4 hours. Tier 4 deferred.

**M3-Item-3.2 — Knowledge graph substrate consolidation (AC-12)**
AI Copilot wired to wrong substrate. Layer 3 prerequisite. Medium effort.

**M3-Item-3.3 — Multi-tenant DELETE discipline tightening (AC-7)**
Gates B1 multi-tenant activation. ~2-4 hours code review + targeted fixes.

**M3-Item-3.4 — legal_briefs.case_id FK constraint** (Stage 1 Critical #1)
Single ALTER fix. ~30 min.

**M3-Item-3.5 — trc_cases TEXT→UUID type tightening**
Bounded-impact per OP item (d). Depends on AC-2 outcome. ~1-2 hours.

### Tier 2 — Worker Portal First Step

**M3-Item-3.6 — Worker portal first step**
Extend `GET /workers/me` with case-status + deadlines + 5 most recent notifications. Activates 10 existing Pattern 1A spare tyres. ~1-2 days. Holmes review trigger.

**M3-Item-3.6-cross — Service worker investigation (AC-16)**
Resolves CLAUDE.md "offline capability" claim. ~30 min.

### Tier 3 — Hygiene Batch

**M3-Item-3.7 — Documentation hygiene sweep**
Bundles AC-3 (RECOVERY lines 57-58) + AC-13 (CLAUDE.md sub-agents 4→6) + AC-13b (OpenAI stub) + AC-17 (CLAUDE.md date markers) + AC-18 (db.ts:5 Replit→Fly+Neon) + AC-19 (README.md cleanup, conditional on AC-2). ~1 hour.

**M3-Item-3.8 — Schema hygiene Item**
Bundles init-db.ts 6 silent-catch points (Pino/Sentry wiring) + dedup 4 duplicate index name declarations. ~1 hour.

### Tier 4 — Build-sequencing Decisions

**M3-Item-3.9 — Build-sequencing decision pass (Layer 3 prep)**
4 decisions: Stage 5 collision resolution, kg_* densification trigger strategy, Voyage embedding service wiring, knowledge graph substrate strategy (overlaps AC-12). ~1 hour decision pass, no code change.

### Tier 5 — Process

**M3-Item-3.10 — Verification discipline establishment**
Process change: pre-merge DB-exercise + post-deploy smoke-test + integration testing pattern. Codified into save-prompt structure + Item closure. Prevents 61977ad-style + AC-15-style gaps recurring. ~1 hour.

### Tier 6 — External

**M3-Item-3.11 — Counsel engagement**
Layer 0 v1, EU AI Act Article 6, RODO Phase 2, litigation hold mechanism, Posted Workers Directive A1 verification. External counsel time + chat-Claude+Manish prepare handoff packet.

### Deferred to Movement 4+ (NOT Movement 3)

- AC-9-Twilio (B2 activation gate) — Movement 4+
- AC-14 (Stripe SDK-vs-fetch re-evaluation) — Movement 5+ if not yet activated
- startScheduler Job 13 (automation_mode) — review after Job 12 + Job 1 land

---

## EXECUTABLE SEQUENCE

1. M3-Item-3.0 — Infrastructure guardrails
2. M3-Item-3.0d — Operational Verification Sweep
3. M3-Item-3.0e — Airtable residue investigation
4. **M3-Item-3.1 — startScheduler Selective Re-wire — HIGH PRIORITY**
5. M3-Item-3.2 — Knowledge graph substrate consolidation
6. M3-Item-3.3 — Multi-tenant DELETE discipline tightening
7. M3-Item-3.4 — legal_briefs.case_id FK constraint
8. M3-Item-3.5 — trc_cases TEXT→UUID tightening
9. M3-Item-3.6 — Worker portal first step + 3.6-cross service worker investigation
10. M3-Item-3.7 — Documentation hygiene sweep
11. M3-Item-3.8 — Schema hygiene Item
12. M3-Item-3.9 — Build-sequencing decision pass (Layer 3 prep)
13. M3-Item-3.10 — Verification discipline establishment
14. M3-Item-3.11 — Counsel engagement

Items 3.4-3.8 in pre-Day-20 numbering (Layer 3 reasoning + Canonical Case Profile + 4-pass) continue per existing Core Plan after this audit-close phase.

---

## META-OBSERVATIONS

**The 8-dimension audit + 5-session structure works.** Cross-cutting patterns surface when dimensions are read together. Per-dimension → operational pass → synthesis structure scales. Future audits should preserve this structure.

**Movement 2 shipped more than running tally suggested.** From inside felt like 4-5 ticked items. From audit's outside-in view: 6 successful migrations + 3 reframe-with-verification + worker portal scoped + agent memory documented + portfolio operating model formalized. Discipline producing output faster than discipline tracking it. Migration Ledger + Movement 3 sequencing now formalize what was happening informally.

**Movement 3 has substantially more work than existing Core Plan Items 3.0-3.8 suggested.** 11 new Items beyond Layer 3 + Canonical Case Profile already planned. Most are SHORT (verification, hygiene, decision pass, single ALTER) — should batch into "Movement 3 audit-close phase" before Layer 3 substantive build begins.

**Recommended Movement 3 phases:**
- Phase A (audit-close) — Items 3.0-3.10 — ~2-3 weeks
- Phase B (Layer 3 build) — existing Core Plan Items — multi-month
- Phase C (Phase 2 transition) — counsel engagement → Phase 2 readiness

---

*End of Dimension 8 — Session 5 Synthesis.*
