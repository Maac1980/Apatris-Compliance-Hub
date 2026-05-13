# Apatris Day 27 EOD - Wednesday May 13, 2026

**Build:** APATRIS Compliance Hub
**HEAD at close:** d112512 (Day 26 close) + Day 27 close commit pending
**Production:** Fly v302 (Day 25 deploy; Job 12 cron in dry-run; admin manual route discovered LIVE)
**Session:** Manish + chat-Claude + Apatris Claude + AI synthesis (web research) + Holmes (cross-build adjacent)

---

## Health Check (Layer 1) - fourth application of eod-health-check skill

| Zone | Verdict | Notes |
|------|---------|-------|
| 1 Sentry | clean | No new error patterns; M9 schema-assumption history fully closed; staging zombie suspended remains stable |
| 2 Prod | clean | v302 healthy both machines; /health 200; 6 commits stacked on origin/main since Day 26 close awaiting AC-33 fix |
| 3 Scheduler | clean | Job 12 cron fires dry-run daily (harmless); manual route (`POST /v1/legal/scan/run`) ALREADY in LIVE mode on v302 per AC-34 discovery |
| 4 Database | clean | init-db stable; AC-21 backfill stable; admins table populated |
| 5 Background jobs | clean | zero schema-assumption errors; no regression on v302 |
| 6 Anomalies | 3-mirror audit surfaced + captured + Day 28+ anchor set | Pure read-only/research day; no operational anomalies; strategic clarity from audits |

**Layer 1 ritual (fourth application) learnings:**
- "Pure read-only audit day" can be a legitimate Health Check verdict; not every day needs deploys or fixes
- Cross-build observation pattern absent today (no EEJ-routed surprises); discipline remains armed
- AC-34 manual-trigger workaround surfaced via Q9 deep audit → "when blocked on one execution path, check ALL paths" is a recursive HB12 lesson

---

## What was audited today

**3 audit mirrors, all read-only:**

1. **Q&A internal audit (10 questions, plain English)** — covering worker profile aggregation, document auto-profile, AI usage, Job 12 production state, onboarding, language, e-signatures, compliance dashboard, lawyer workflow, 70 welders single-click query
2. **Market research audit (Polish immigration legal-tech + EU workforce/HR + AI legal-tech globally)** — covering competitor enumeration, gap matrix, essential features baseline, edges where we lead vs follow, anti-priorities
3. **Round 2 audit (10 deeper questions, AI-triangulated)** — covering North Star sketch, 9-dashboard consolidation, Polish moat fragility, AI Copilot 2026 bar, predictive risk analysis, Akshay home screen, Yulia legal-team home screen, smallest sequence to team-ready, AC-33 estimate + workaround, 5-year drift

---

## Three-mirror convergence

**50% team-handoff baseline confirmed from BOTH internal AND external angles.**

Internal Q&A: primitives are built and scattered; backend rich, frontend thin; 9 dashboards but no canonical home; Job 12 code-complete but in dry-run; North Star multi-scenario AI is paper.

Market research: Polish-specific compliance depth + multi-scenario AI is our edge if executed; Personio/Bob HR/Localyze/Deel set the operator-visibility baseline; 5 essential features identified that competitors ship as MVP standard.

Round 2 triangulation: surfacing existing primitives is the path forward, not building new. Day 28+ requires explicit choice of visibility-over-hygiene to shift trajectory from base case (60% likely) toward best case.

---

## Critical surprises today

1. **Q9 manual-trigger workaround (AC-34)** — `POST /v1/legal/scan/run` in `routes/legal-alerts.ts` calls `runDailyLegalScan(req.tenantId!)` with single arg, dryRun defaults `false` per service signature. **Admin HTTP route is ALREADY firing real alerts on v302.** Only cron path is dryRun-gated. Yulia can fire Job 12 alerts TODAY without v303 deploy. Recursive HB12 lesson: check ALL execution paths when blocked on one.

2. **Q3 A1 Posted Workers + RODO-strict PII = hardest-to-copy moat (AC-36)** — market audit framed "Polish depth" as the edge; this round-2 question revealed structural decomposition. MOS portal automation + ZUS depth can be copied by Deel/Localyze within 12 months. A1/Posted Workers (Polish outbound-staffing flow vs their inbound EOR pattern) + PII hash-safe lookup (Polish as home market vs one of many countries) are structurally hard. Currently buried in schema; surface as named visible features.

3. **Q1 multi-scenario AI is architecturally well-documented in adjacent markets** — Brescia Court labor law predictive justice system + ABA Family Law AI (custody/property multi-perspective) + asylum law decision support + clinical decision trees. The North Star concept is NOT unprecedented; the immigration-specific application is the novel surface. Service architecture sketch viable (AC-37 captures it).

---

## 4 new ACs captured

- **AC-34** Job 12 manual-trigger workaround (operational unblock available TODAY)
- **AC-35** Role-segmented home screens (Akshay welding + Yulia legal) — closes ~30% team-handoff gap
- **AC-36** A1 Posted Workers + RODO-strict PII as visible competitive features — strategic positioning
- **AC-37** Multi-scenario AI Phase A (North Star architecture sketch) — fork-point AC at Day 50+

**33 total → 37 total ACs.** Migration Ledger reflects 3-mirror findings canonically.

---

## Day 28+ visibility sprint anchor

**Week 1 (Day 28-34):**
- AC-33 clean fix path (pin pnpm v10 via packageManager field OR regenerate lockfile)
- v303 deploy → Job 12 goes live via cron (closes AC-15 Phase B.2 operationally)
- AC-34 workaround in parallel — Yulia hits manual route daily until cron live
- AC-35 Phase A: operator interviews (~30 min each with Akshay + Yulia) to validate widget priorities

**Week 2 (Day 35-41):**
- AC-35 Phase B-1: Akshay welding-view home screen (5 widgets, existing data)
- AC-35 Phase B-2: Yulia legal-view home screen (5 widgets, existing data)
- Job 12 alert delivery: email/WhatsApp routing on top of legal_alerts inserts (uses AC-21 admins-table + getAdminContacts)

**Week 3 (Day 42-49):**
- Onboarding 100%-complete trigger sends actual notification (not just notification_log row)
- Compliance "this week action queue" widget (aggregates legal_alerts + document_workflows + deadline_countdowns)
- Language sweep across 5 operator-facing surfaces (clean any `isPl` ternaries)
- E-signature display in worker profile (Q&A audit Q7 gap)

**Week 4-7 (Day 50+):** visibility consolidation
- Per-worker unified profile tabs (AC-31 incremental: Cases / Documents / Alerts / Signatures)
- AC-32 document-driven auto-profile orchestration (admin-gated → autonomous hybrid)
- AI Copilot proactive morning briefing (closes Q4 gap)
- AC-36 A1/Posted Workers + RODO-PII visible feature surfacing

**Day 50+ fork point:** AC-37 Multi-scenario AI Phase A IF explicit choice. Q10 base case (60%) is this never gets built unless chosen.

---

## State for Day 28 inheritance

**Production (unchanged Day 26 → Day 27):**
- HEAD on Fly = v302 (Day 25 09:08Z deploy, image deployment-01KRB4JQTNA9PGEVG9SXRWPZQY)
- Job 12 cron dry-run; manual route LIVE via AC-34 workaround
- Day 26 + Day 27 close commits stacked on origin/main; v303 awaits AC-33 clean fix
- Day 28 ~04:00 UTC: another harmless dry-run cycle on v302 (4th consecutive clean)

**Movement 3 status:**
- 37 total ACs in Migration Ledger (was 28 at Day 25 close; +9 in 2 days from audits)
- AC-15 Tier 1 chain: code complete; operational closure pending AC-33 + v303 OR AC-34 workaround
- AC-31/32/35/36/37 strategic visibility/positioning work captured; Day 28+ execution

**Day 28 first action priority (per Day 28+ anchor):**
1. AC-33 clean fix attempt: pin pnpm version via packageManager field in root package.json, retry deploy
2. If clean fix works: v303 deploys, Job 12 goes live via cron, AC-34 workaround unnecessary
3. If clean fix fails again: chat-Claude drafts Phase A.12 for substantive AC-33 hygiene workstream; AC-34 workaround remains operational

**Pending Phase 2 deferred (no Day 28 work):**
- AC-22 procedural (Akshay Sentry provisioning)
- AC-23 Layer 1 alternate-authority designation
- AC-24 contract-gen audit
- AC-25/26/27 hygiene items
- AC-28 staging deploy strategy
- AC-30 dual-machine cron coordination
- AC-31 Command Center person-detail interconnections (visible-feature; Day 35+ per anchor)
- AC-32 Document-driven auto-profile orchestration (visible-feature; Day 50+ per anchor)

---

## Personal context

3-hour focused audit session this Wednesday afternoon. Pure read-only/research day — no code changes, no deploys, no failed deploy attempts. Bandwidth went entirely to: internal Q&A audit + market research + Round 2 triangulation + 4 AC captures + Day 28+ visibility sprint anchor.

Three mirrors agree: ~50% team-handoff baseline. The discipline that has caught drift Days 17-26 is the same discipline that delays visibility. The honest fork is the next 4-8 weeks. Explicit choice of visibility-over-hygiene shifts trajectory toward best case (15% likely → potentially higher). Default continuation locks in base case (60%).

Day 27 closes with strategic clarity that Days 28-49 require an explicit anchor commitment: surface what's built, route alerts to humans, consolidate dashboards to role-segmented home screens. The Day 50+ multi-scenario AI work is a fork point that requires choice — not a default.

Rest is part of the build.
