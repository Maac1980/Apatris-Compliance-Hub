# MIGRATION LEDGER — Phase 2 (first formal version)

**Authored:** Day 20, May 7 2026 — Manish + chat-Claude (Stage 2 Pass 1 of Session 5 synthesis).
**Status:** Working draft until Apatris Claude commits as part of Session 5 close (with all 8 dimension files atomically).
**Origin:** Audit Sessions 1-5 (BUILD_INTEGRITY_AUDIT framework, Days 14-20). Phase 1 was implicit in commit history and prior decisions; this is the first formal ledger that captures migrations as a structured durable record.

---

## Purpose of this ledger

This ledger formalizes every "we changed X to Y" or "we deprecated A in favor of B" type decision visible across the audit's 9 source files (8 dimensions + operational pass). It exists so that:

1. Future-Manish, future-chat-Claude, future-Apatris Claude have one canonical record of what migrations happened, when, and what their state is
2. Future audits don't re-discover migrations that are already complete (avoiding re-flagging closed work as drift)
3. Pending verifications are tracked explicitly, not lost as "fix shipped, presumed working"
4. The North Star criterion is applied uniformly: **does each migration serve real cases — Monica, Anna, the 70 welders + future expansion?**

## Two categories of entry

The ledger uses two categories with different decision shapes:

**Category A — Active migrations:** Completed transitions from old approach to new approach. Decision lens = KEEP (wasn't actually a migration, drop entry) / REFRAME (in-flight or needs verification) / CLOSE (verified delivered).

**Category B — Deliberate dormant scaffolding:** Code present but never activated, retained as first-step optionality for future need. Decision lens = Pattern 1A (built locally, dormant locally) / 1B (cross-build awaits replication) / overbuilt (more than first-step, needs strip-back) / classify-N/A (architectural pattern, not migration).

**Why two categories matter:** without this distinction, dormant scaffolding (M7 multi-tenant) would either be misclassified as "incomplete migration" (false alarm) or as "drift from build philosophy" (also false — Day 19 audit did this). The discipline lesson from Day 20: pattern + intent + first-step-vs-overbuilt = verdict.

---

## CATEGORY A — Active migrations (10 entries)

### M1 — XOR → AES-256-GCM messaging

| Field | Value |
|---|---|
| **Migration name** | Replace messaging XOR with AES-256-GCM via lib/encryption.ts |
| **Status** | ✅ COMPLETE |
| **Decision** | CLOSE |
| **Item** | Item 2.2 (Day 18) |
| **Commit** | `b02b326` "fix(security): replace messaging XOR with AES-256-GCM + legacy read-fallback" |
| **Surfaced by** | Dimension 4 Production fix #6; Operational Pass item (e)-4 (parallel-encryption discovery) |
| **North Star service** | YES — protects worker/lawyer message data (PII at rest); untrusted communication = trap, AES eliminates trap |
| **Verification** | Prod deploy v297 healthy. 30-min observation clean. _BACKUP keys provide legacy read-fallback. |
| **Day 19 → Day 20 delta** | None. STRATEGIC_RECOMMENDATIONS marked DONE 2026-05-05 (Day 18). |
| **Follow-up** | None. Paired with M6 closure. |

---

### M2 — pino-sentry-transport → custom main-thread Sentry capture hook

| Field | Value |
|---|---|
| **Migration name** | Wire Sentry capture for `error+` logger calls via main-thread `hooks.logMethod` in lib/logger.ts (bypassing pino-sentry-transport worker_threads issue) |
| **Status** | ✅ COMPLETE in code |
| **Decision** | REFRAME — close pending verification of full coverage |
| **Item** | Item 2.3 (Day 19) |
| **Commit** | `f33d067` "feat(observability): main-thread Sentry capture hook (Item 2.3 Option 2)" |
| **Surfaced by** | Tier-2 #5 (Pino-Sentry transport upgrade); Day 19 Phase A definitive root cause (esbuild bundling pino + worker_threads spawn-by-path) |
| **North Star service** | YES — observability prevents silent failures from harming real cases. The 61977ad cluster (M9) proved silent failures CAN persist 19 days hurting real users. |
| **Verification (partial)** | Prod deploy v298 image `01KQY9E50KR2TMNSM9MQ3H95WR` healthy. 14 logger.error/fatal sites confirmed wired (Day 20 D5 5.2 grep). |
| **Verification (pending)** | Stage 1 Pattern 4 flag: did Item 2.3 cover ALL 5 silent-catch sites? — `pool.on("error")`, legal-case fan-out, init-db.ts catches, cron handlers, Sentry init silent catch. Needs per-site coverage check. |
| **Day 19 → Day 20 delta** | Day 19 attempt with pino-sentry-transport (`321564a`) failed at staging boot. Phase A identified root cause. Option 2 (main-thread hook) shipped. |
| **Follow-up** | Action Candidate AC-1: "Verify Pino-Sentry coverage at all 5 silent-catch sites post-Item-2.3." Expected ~30 min Apatris Claude read-only investigation. |

---

### M3 — PAT-on-disk → SSH key authentication

| Field | Value |
|---|---|
| **Migration name** | Switch git remote from PAT-embedded HTTPS to SSH; revoke prior PATs; rewrite RECOVERY references |
| **Status** | ✅ COMPLETE |
| **Decision** | CLOSE |
| **Item** | Item 2.5.y (Day 18) |
| **Commit** | (Item 2.5.y was a remediation, not a single feature commit; covered in subsequent Items' commit metadata) |
| **Surfaced by** | Dimension 6 6.3 (RECOVERY_PROCEDURES.md PAT-on-disk inventory) |
| **North Star service** | YES (indirectly) — protects against credential leak that could compromise prod data → workers' PII |
| **Verification** | 3 PATs revoked. SSH ed25519 key generated and registered. Remote switched to `git@github.com:Maac1980/Apatris-Compliance-Hub.git`. All 4 RECOVERY references updated by Item 2.4.x (commit `3858b30`). |
| **Day 19 → Day 20 delta** | None. |
| **Follow-up** | None. |

---

### M4 — Legacy Airtable → Neon Postgres (data layer)

| Field | Value |
|---|---|
| **Migration name** | Migration of data layer from Airtable (Day-2 foundation) to Neon Postgres |
| **Status** | PARTIAL/UNCLEAR |
| **Decision** | REFRAME — investigation required before closure or reopening |
| **Item** | None yet (was implicit Phase 1 work; needs explicit Phase 2 closure Item) |
| **Genesis commits** | `b427991` 2026-03-14 "Improve Airtable connection by extracting correct base ID" — Airtable was foundational |
| **Surfaced by** | Dimension 7 D7-1 DISCOVERY-FIRST refinement (AIRTABLE_API_KEY/AIRTABLE_BASE_ID/AIRTABLE_TABLE_NAME env-var refs in code, not in Fly secrets); Dimension 6 6.5 (README still mentions "Auth: JWT, Airtable integration"); Operational Pass item (d) (`trc_cases.tenant_id` TEXT outlier "likely Airtable record-ID legacy") |
| **North Star service** | YES (direction correct) — Postgres is proper data layer for case management; residue uncertain |
| **Investigation needed** | (a) Are Airtable env-var refs in dead code paths or live code paths? (b) Is `trc_cases.tenant_id` TEXT actually carrying Airtable record IDs, or is the type mismatch unrelated? (c) What runtime calls (if any) still hit Airtable? |
| **Day 19 → Day 20 delta** | README staleness unchanged; no deprecation commit found in audit |
| **Follow-up** | Action Candidate AC-2: "Phase A investigation of Airtable residue — env vars, runtime call paths, trc_cases.tenant_id origin. ~1 hour read-only Apatris Claude work. Outcome shapes either Migration Phase 2 closure Item or expanded Movement 3 work." |

---

### M5 — Manual recovery → documented procedures

| Field | Value |
|---|---|
| **Migration name** | Author RECOVERY_PROCEDURES.md across 5 surfaces (code, database, Fly app, configuration, cross-repo) |
| **Status** | ✅ COMPLETE |
| **Decision** | CLOSE |
| **Item** | Item 2.5 (Day 18) refined by Items 2.5.x (Appendix B Day 19) and 2.4.x (Day 19) |
| **Commits** | `3733aaf` (initial 881 lines) + `ce18114` (refinement) + `3858b30` (Item 2.4.x updates) + `c0f12fa` (Item 2.5.x Appendix B secret source-of-truth) |
| **North Star service** | YES — operational resilience protects real cases from outages and recovery confusion during crisis |
| **Verification** | RECOVERY_PROCEDURES.md final state: 966 lines including Appendix B. 5 surfaces covered. Day 19 Phase A root cause replaces speculative original. |
| **Follow-up** | None. (RECOVERY lines 57-58 staleness handled separately as AC-3 cross-pass cleanup.) |

---

### M6 — Single-secret → backup-key cryptographic strategy

| Field | Value |
|---|---|
| **Migration name** | Add APATRIS_ENCRYPTION_KEY_BACKUP + APATRIS_LOOKUP_KEY_BACKUP for legacy-decrypt fallback during AES migration |
| **Status** | ✅ COMPLETE |
| **Decision** | CLOSE — with critical operational note preserved |
| **Item** | Paired with M1 (Item 2.2 — Day 18 commit `b02b326`) |
| **North Star service** | YES — enables zero-downtime cryptographic key rotation; protects worker PII access continuity |
| **Verification** | Both _BACKUP secrets present on prod Fly app. Used by lib/encryption.ts legacy-decrypt fallback path. |
| **Critical operational note** | **"Never delete _BACKUP keys until legacy-data migration verified complete."** Preserved in Appendix B. |
| **Follow-up** | None. |

---

### M7 — Single-tenant → multi-tenant scaffolding

| Field | Value |
|---|---|
| **Migration name** | Multi-tenant scaffolding (tenant_id columns + tenant-scoped query patterns) — Pattern 1A first-step dormant capability |
| **Status** | DELIBERATE DORMANT — moved to Category B |
| **Decision** | KEEP (Pattern 1A first-step ALIGNED) |
| **Cross-reference** | See Category B entry M7-DORMANT for full classification |

---

### M8 — DB connection pool config (longstanding regression)

| Field | Value |
|---|---|
| **Migration name** | Update pg-pool config to Option A (`min:0`, retain `idleTimeoutMillis: 30_000`) addressing Neon idle-close vs pg-pool warm-connection retention mismatch |
| **Status** | ✅ COMPLETE in code |
| **Decision** | REFRAME — close pending operational verification |
| **Commit** | `6ef9087` (Day 17) |
| **North Star service** | YES — pool stability prevents request failures harming real case workflows |
| **Verification (pending)** | Post-fix error rate measurement from Fly logs since Day 17 deploy. |
| **Follow-up** | Action Candidate AC-4: measure DB pool error rate. |

---

### M9 — 61977ad schema-assumption bug cluster fix sweep

| Field | Value |
|---|---|
| **Migration name** | Replace `workers.first_name`/`last_name` references with `full_name`; replace `notification_log.message` with `message_preview` |
| **Status** | code CLOSED-with-completion-sweep / runtime PENDING (escalation cycle verification) |
| **Decision** | CLOSED-with-completion-sweep — Day 17 commit `77267dc` was incomplete (4 of 12 files / 8 of 53 sites). Day 22 Sentry email caught 16 events/day firing in prod. Phase A enumeration revealed full 8-file / 53-site scope. Phase B Holmes-reviewed completion sweep shipped Day 22 commit `c28e207` (8 files / 60 insertions / 51 deletions). Deployed to prod v299 Day 23 at 08:00:22Z. |
| **Commits** | `77267dc` (Day 17 — partial 4 files) + `c28e207` (Day 22 — completion sweep 8 files Holmes-reviewed) |
| **North Star service** | CRITICAL — features (regulatory scan, escalation, weekly digest, public-verify, push-sender, deadline-engine, worker-email, case-doc-generator, compliance-enforcement, vault-search, data-copilot, case-notebook) directly serve case workflows. Worker permit-renewal awareness was compromised pre-fix. |
| **Runtime verification** | ✅ CLOSED Day 24 (corrected from Day 23 misframing) — apatris-api Fly prod v300 multiple cycles fired post-deploy with zero schema-assumption errors; runDeadlineCheck workers JOIN executed clean. **Day 23 framing self-corrected Day 24:** Sentry M9 events did NOT come from Replit zombie. Actual source was apatris-api-staging on Fly, running stale May 6 image (deployment-01KQY5NGWTAYQQ7Z8MPDFZ9R89, pre-c28e207), sharing SENTRY_DSN with prod. 2 staging machines (7847550b10e358 + d897570ae11798) firing M9 bug at ~6 errors/day each, ~76 events over 4 days matched Sentry inbox count. Manish suspended staging Day 24 via flyctl scale count 0. M9 fix on prod (apatris-api v300) was always working correctly; pollution came from staging. Replit deletion Day 23 was correct cleanup but did not close the Sentry chain — staging was the real source. |
| **Cross-pass learnings** | (a) Deploy-gap discovered Day 23 — code shipped to main but not deployed to Fly for ~13 hours; bug continued firing 12 events in that window. Codified as Hard Boundary 15 (deployment claim integrity). (b) Same audit-pattern weakness Holmes flagged across portfolio (claimed-verified-without-verification-mechanism). Codified as Hard Boundary 12 + AC-8.X expanded (see below). |
| **Follow-up** | (1) Re-verify post-cycle ~09:23Z or ~11:58Z. (2) AC-8 Operational Verification Sweep includes M9 schema-assumption sweep verification element per AC-8.X discipline. (3) eod-health-check skill (Layer 1 ritual) verifies absence-of-regression nightly. |

---

### M10 — Staging reactivation

| Field | Value |
|---|---|
| **Migration name** | Wake `apatris-api-staging` from suspended state |
| **Status** | ✅ COMPLETE |
| **Decision** | CLOSE |
| **Item** | Day 19 (verified during Item 2.3 staging deploy) |
| **North Star service** | YES (indirectly) — staging unblocks safe pre-prod verification |
| **Follow-up** | Bonus: unblocks deferred Operational Pass items (a) `agent_queries` observability + (b) `kg_*` health verification → AC-6. |

---

## CATEGORY B — Deliberate dormant scaffolding (Pass 2 classifications complete)

13 entries: 8 Pattern 1A first-step ALIGNED, 2 Pattern Y architectural, 1 architectural intent, 1 tech debt Movement 3 Item, 1 operational regression (B13 startScheduler).

### B1 — Multi-tenant scaffolding (Pattern 1A first-step ALIGNED)

Code-shape evidence (Day 20 verified): ~2,978 grep hits for tenant/organization/workspace; 1,287 for tenant_id; 141 for billing/stripe; multi-tenant DELETE patterns in 4 routes.

First-step verification: `grep -E "signup|register-tenant|tenant-admin|customer.onboard|onboard-tenant"` → **zero matches**. Genuinely first-step (columns + query patterns), NOT entire SaaS pre-built. **The spare tyre, not 4 spare tyres.**

Intent (Day 20 Manish confirmation): deliberate decision earlier in build to keep multi-tenant capability for future expansion option.

Activation gate: Phase 2 SaaS scaling + AC-7 DELETE discipline tightening.

Reclassification: Day 19 🟡 DRIFT → Day 20 🟢 ALIGNED Pattern 1A first-step.

### B2 — Twilio + WhatsApp (Pattern 1A first-step ALIGNED)

`lib/whatsapp.ts` (~150 lines), 6 src callers, 3 live scheduler integrations. `package.json` `"twilio": "^5.13.0"`. Zero TWILIO_*/WHATSAPP_* secrets on prod or staging Fly. Zero cross-app HTTP calls to EEJ.

EEJ has parallel Twilio implementation operationally. APATRIS has parallel implementation, dormant on secrets unset. NOT cross-build replication (Pattern 1B) — both builds independently implemented Pattern 1A.

Activation gate: M4+ + AC-9-Twilio pre-activation scheduler call-site audit (REQUIRED before secret provisioning — schedulers reference live alerts).

### B3 — Voyage embeddings (Pattern 1A first-step ALIGNED — exemplar)

Library committed deliberately (commits `43ab0c2` + `6ced45d`). Service wiring deferred. APATRIS_VOYAGE_API_KEY exists on staging Fly only (active testing).

Activation gate: Layer 3 readiness (Movement 3). Build philosophy followed exactly: internal use first (staging testing), then expand.

### B4 — Upstash Redis (Pattern 1A first-step ALIGNED — exemplar)

`@upstash/redis` package, fetch-based with REDIS_URL/REDIS_TOKEN env-var detection. Zero REDIS_* secrets on Fly.

Activation gate: 2 env vars when caching priority (likely Phase 2 scale).

### B5 — DeepL translation (Pattern 1A first-step ALIGNED — exemplar with Claude fallback)

`lib/translation/`, fetch-based with DEEPL_API_KEY. Operational Claude fallback when key absent. Zero DEEPL_* secrets on Fly.

Activation gate: 1 env var when translation quality priority.

### B6 — Google OAuth (Pattern 1A first-step ALIGNED — rich first-step)

`routes/google.ts` (287 lines), Gmail/Calendar/Drive API access, refresh-token flow, `google_integrations` DB table. Empty default `''`. Zero GOOGLE_* secrets on Fly.

Activation gate: OAuth client registration + 2 env vars.

### B7 — DocuSign / SignNow (Pattern 1A first-step ALIGNED — skeletal)

`signatures.provider` DB column, env-var refs, no SDK installed. Thinner than other Pattern 1A entries.

Activation gate: SDK install + actual API wiring + 1 env var. Larger activation effort.

### B8 — Stripe billing (Pattern 1A first-step LARGE — borderline overbuilt)

Full SDK installed (vs fetch-pattern of others). 2 routes, 61 src refs, webhook handlers + customer creation + subscription cancellation + DB sync wired. Zero `customer_portal` matches in src. Zero STRIPE_* secrets on Fly.

"Spare tyre, not 4 spare tyres" test holds (at upper bound of first-step). Functionally complete billing flow that activates as a unit.

Activation gate: Stripe account + 3 env vars + webhook URL registration.

Re-evaluation trigger AC-14: if Stripe activation deferred past Movement 5+, reassess SDK-vs-fetch tradeoff (alternative: extract to billing-service repo).

### B9 — OODA tables (Pattern Y architectural — NOT a migration)

3 tables + 2 services + 5+ routes. Active write paths, NOT dormant. Architectural choice. Activation question is real-world usage volume, not dormancy.

### B10 — Sub-agents architecture (Pattern Y architectural — NOT a migration)

6 sub-agents (Compliance/Payroll/Immigration/Workforce/Legal/Finance) — keyword-dispatch entries in `routes/ai-copilot.ts:9-67` (175 lines). "Thin agents, thick orchestrator" pattern. Active dispatch, not dormant.

Cross-pass items: AC-13 (CLAUDE.md says 4, code has 6 — doc drift), AC-12 (substrate routing bug — separate Item).

### B11 — knowledge_nodes orphan vs kg_* (TECH DEBT — NOT Pattern 1A)

`knowledge_nodes` flat table vs `kg_nodes` + `kg_edges` real graph. AI Copilot queries the FLAT table. The kg_* substrate exists, is being populated correctly, but AI Copilot is wired to wrong substrate.

Routing bug from before discipline arrived. Real impact on case reasoning quality.

Movement 3 Item AC-12: rewire AI Copilot to `kg_*`, decide knowledge_nodes flat fate, update CLAUDE.md "LightRAG" labeling. Pre-Layer-3 prerequisite.

### B12 — OpenAI provider abstraction (architectural intent — NOT a migration)

Comment-only stub at `provider.ts:5` and `:53`. No SDK. No implementation. Two stub comments only.

Not Pattern 1A first-step — there's no code to activate. That's TODO, not scaffolding.

Action Candidate AC-13b: cleanup as documentation hygiene.

### B13 — startScheduler() dead-cron (REFRAME — operational regression)

Substantive 13-job daily 08:00 fan-out, ZERO call sites.

AC-10b investigation outcome (Day 20): 10/13 GAPPED, 1 partial gap, 1 deliberate-or-gapped, 0 replaced. Booted granular schedulers replaced ~3-4 of original jobs but NOT the other 9-10. Incomplete refactor pattern.

**HIGH severity gap (Job 12):** `runDailyLegalScan` — proactive legal-status transition detection engine. Creates `legal_alerts` for STATUS_CHANGED / RISK_INCREASED / EXPIRY_WARNING etc. **Workers' legal status transitions NOT detected automatically.** Mission-critical for North Star (Anna's case shape, Monica's, the 70 welders' permit-renewal awareness). Currently fires only on manual HTTP trigger.

MEDIUM severity gaps: Job 4 partial (3 of 8 doc types not auto-alerted); Job 11 (Posted Workers Directive — EU compliance); Job 1 (refresh_tokens unbounded growth); Jobs 2/3/7/8/9 (fraud/legal/fines/trust/churn predictive scans degraded to manual).

LOW severity: Jobs 6 (bench), 10 (insurance) — defined, never invoked anywhere.

Already-blocked: Job 5 (Twilio-blocked). Possibly-deliberate: Job 13 (automation_mode gating).

**Movement 3 Item AC-15** — startScheduler selective re-wire. Tier 1 (Job 1 + Job 12) lowest risk + HIGH severity addressed. Tier 2 (decide Jobs 6, 10, 11). Tier 3 (verify and re-wire Jobs 2, 3, 4, 7, 8, 9). Tier 4 (deferred Jobs 5, 13).

**Pre-boot prerequisite:** AC-5 verifies `daily-legal-scan.service.ts` schema integrity post-77267dc fix BEFORE Tier 1 boots Job 12 (avoid re-introducing 61977ad bug pattern).

Movement positioning: Movement 3 EARLY PRIORITY. After Item 3.0, before AC-12.

---

## ACTION CANDIDATES (54 total)

| ID | Action | Movement |
|---|---|---|
| AC-1 | Verify Pino-Sentry coverage at all 5 silent-catch sites (M2 follow-up) | M3 |
| AC-2 | Phase A investigation of Airtable residue (M4 follow-up) | M3 |
| AC-3 | RECOVERY_PROCEDURES.md lines 57-58 staleness cleanup | M3 hygiene |
| AC-4 | Measure DB pool error rate Day 17+ (M8 follow-up) | M3 |
| AC-5 | Verify 5 features fire in prod logs + daily-legal-scan.service.ts schema integrity (M9 + AC-15 prerequisite) | M3 |
| AC-6 | Run deferred Operational Pass items (a) + (b) (M10 unlocked) | M3 |
| AC-7 | Multi-tenant DELETE discipline tighten (gates B1 activation) | M3 |
| AC-8 | **Operational verification sweep** — bundles AC-1+AC-4+AC-5+AC-6 | M3 |
| AC-8.X | **Verification Mechanism Discipline** — for any fix or refactor with scope claim ("4 files affected," "all callers updated," "schema-assumption removed," "deployed"), verification must mechanize the claim: grep/AST-walk for scope claims (complete enumeration not sample); multiple search patterns for coverage claims (synonyms + aliases + indirect references); exhaustive search with documented terms for negative claims ("no X remains"); explicit deploy step for deployment claims (code-on-main ≠ code-in-production per Hard Boundary 15); verification artifact saved to docs/ for audit trail. If verification cannot be mechanized, claim must be scoped down to what CAN be verified. Pattern violations across portfolio: Phase A audit undercounts, files claimed-in-repo but actually gitignored, route count plan-vs-reality drift, M9 4-vs-8-file scope, M9 deploy-gap (Day 22-23), Hard Boundaries list (1-vs-16). | M3 |
| AC-9-Twilio | Twilio pre-activation scheduler call-site audit (gates B2 activation) | M4+ |
| AC-10b | startScheduler 13-job mapping | COMPLETED Day 20. Outcome → AC-15. |
| AC-12 | Knowledge graph substrate consolidation (B11 tech debt) | M3 (Layer 3 prerequisite) |
| AC-13 | CLAUDE.md sub-agents list update (4 → 6) | M3 hygiene |
| AC-13b | OpenAI provider abstraction stub cleanup | M3 hygiene |
| AC-14 | Stripe SDK-vs-fetch re-evaluation at M5+ if not activated | M5 (deferred trigger) |
| AC-15 | **startScheduler selective re-wire (B13 outcome) — Job 12 North Star + Job 11 EU compliance + Job 1 hygiene** — STATUS: Tier 1 operationally CLOSED 2026-05-16. Chain observed working in automatic mode via May 15 04:00Z cycle: both Fly machines fired clean (31 workers, 0 alerts, 0 errors, ~24s each). Dedup at daily-legal-scan.service.ts:124-128 prevented duplicate INSERTs across the dual-machine race window (AC-30 first cycle empirically harmless). AC-15 Tier 1 Job 12 closure achieved via v303 deploy (commit 0a4c40c + AC-33 packageManager pin). AC-15 Tier 2-4 (the other 11 GAPPED jobs) remain open and follow AC-29 dead-code-audit-before-wiring discipline. | **M3 EARLY PRIORITY** |
| AC-16 | **Worker portal first-step extension** — extend `GET /workers/me` with case-status + deadlines + 5 most recent notifications. Activates 10 existing Pattern 1A spare tyres. ~1-2 days, Holmes review trigger. | M3 |
| AC-17 | **Daily Health Check Ritual Layer 1 codification** — extract `eod-health-check` SKILL.md as 8th skill in artifacts/api-server/skills/. Codifies Sentry sweep + prod smoke test + cron job verification + scheduler-job-by-job status + database health + background jobs + manual review. ~10-15 min/day at EOD. | M3 |
| AC-18 | **PreToolUse Hook destructive command firewall** — `.claude/settings.json` hook intercepts destructive commands at infrastructure layer. Firewall list: rm -rf broad scope, DROP TABLE/DATABASE, TRUNCATE without WHERE, DELETE FROM whole-table, flyctl destroy, flyctl secrets unset on production, force-push to main. Defense-in-depth alongside Hard Boundary 14. ~1-2 hours implementation. | M3 |
| AC-19 | **Skills directory CLAUDE.md addition** — codify 3-location skills convention discovered Day 21 (artifacts/api-server/skills/ APATRIS-specific + .agents/skills/ caveman family + .claude/skills/superpowers/ plugin-managed). Prevents future re-discovery confusion. ~10 min targeted edit. Folds into M3-Item-3.7 doc sweep batch. | M3 |
| AC-20 | **Operator Transition Plan Phase 1A drafting** — Layer 1 1-7 day absence procedures per APATRIS_CORE_PLAN.md Section 12. APATRIS-specific (Akshay welding president, Yulia immigration partner, Piotr+Łukasz lawyers, production coordinator, Anna's separate agencja pracy). Substantive standalone work, ~1-2 sessions. Hard Boundary 12 applies — claim of operator-redundancy without verification mechanism is hope, not plan. | M3 |
| AC-21a | ✅ CLOSED Day 23 — **Alert recipient consolidation (build fix)** — escalation-engine.service.ts:73 + weekly-digest.service.ts:143 hardcoded `manish@apatris.pl` replaced with `getAdminContacts(tenantId)` lookup. `getAdminContacts` promoted from private scheduler.ts wrapper to exported `lib/admins-db.ts` helper (single import for 3 callers). Includes idempotent `admins.email` backfill for Manish + Akshay (commit a9eb4f7). Caught + fixed pre-existing silent bug in weekly-digest.service.ts (`sendAlertEmail` payload shape mismatch — call would throw and be swallowed by try/catch; weekly digest likely never actually emailed pre-fix). Commits a7e23c1 + a9eb4f7; deployed v300 at 10:35Z. Runtime verification: next escalation cycle ~14:34Z (consolidated with M9). | M3 |
| AC-21b | ✅ CLOSED Day 23 — **OTP From-address fix (deliverability + branding)** — mailer.ts:175 From-address changed from `manishshetty79@gmail.com` (Manish's personal Gmail, sent through Brevo SMTP — DKIM domain misalignment) to `noreply@apatris.pl` (aligns with Brevo apatris.pl domain — SPF/DKIM correct). Branding improvement + deliverability improvement. Commit a7e23c1; deployed v300 at 10:35Z. Runtime verification: Manish next dashboard login confirms OTP arrives From `noreply@apatris.pl`. Manish-action: verify Brevo console has `noreply@apatris.pl` configured as send-only address. | M3 |
| AC-22 | **External-systems provisioning audit (procedural)** — provision Akshay access on Sentry (priority — early-warning channel) + Fly.io app membership (deploy + log access) + Neon dashboard (DB health visibility) + R2 (file storage) + Anthropic Console (billing-sensitive, optional) + Perplexity (billing-sensitive, optional). Dashboard-side work, not code. ~30 min total clicking through admin UIs. Manish-action only. Closes external-systems-single-bound gap surfaced in audit Zone 4. | M3 |
| AC-23 | **Layer 1 alternate-authority designation** — operator-presence audit confirmed Hard Boundaries 6/8/13/16 are INTENTIONAL safety gates, not gaps. Layer 1 of Operator Transition Plan (per APATRIS_CORE_PLAN.md Section 12) must specify alternate-authority routing per boundary (e.g., Akshay-as-alternate-Manish for time-bounded scenarios; Piotr/Łukasz for legal compliance decisions) without weakening boundaries themselves. Drafts AFTER AC-21 + AC-22 land so Layer 1 reflects corrected state (Hard Boundary 12 self-applies). | M3 |
| AC-24 | **Audit existing contract-generation capability** — Day 23 audit-first investigation surfaced 517 contract grep matches + routes/contract-gen.ts + routes/contracts.ts + generated_contracts + contracts schema + role-gated AI flow ("Umowa Zlecenie" / "Umowa o Pracę" / "B2B") + lib/contract-generator.ts PDF generation + CONTRACT_GENERATED audit logging. Movement 4 framing as greenfield was wrong premise. Audit determines: does existing AI flow use Polish labor code + EU directive + regulatory_intelligence integration? Is there lawyer-review-workflow surface? Does it integrate with kg_* knowledge graph? Output: scope decision (Movement 3 hygiene Item / no work needed / requires Movement 4) based on audit baseline. Activation: Movement 3 close. | M3-or-later |
| AC-25 | **Backfill UPDATE row-count logging (Hygiene Item)** — Day 23 AC-21 backfill (init-db.ts:596) executes silently with no console.log of row count. Future backfills should log `[init-db] AC-NN backfill: N rows updated` so post-deploy verification can confirm without prod DB read. Hard Boundary 12 self-application. Folds into M3-Item-3.7 doc/code sweep batch. ~5 min targeted edit. | M3 |
| AC-26 | **scheduler.ts unused fetchAdmins import (Hygiene Item)** — Day 23 AC-21 promoted getAdminContacts to lib/admins-db.ts; scheduler.ts retained `import { fetchAdmins, getAdminContacts, type AdminContact }` but no longer calls fetchAdmins directly. Tighten to `import { getAdminContacts, type AdminContact }`. Folds into M3-Item-3.7 doc/code sweep batch. ~2 min targeted edit. Verify no other indirect usage before removing. | M3 |
| AC-27 | **Unconditional cycle-complete logging (Hygiene Item)** — Day 23 runtime verification surfaced silent-success cron pattern: cycles with no work to do log NOTHING (escalation-engine.service.ts:620-622 conditional log). Silence is ambiguous — could be success OR cycle-not-fired. Fly log buffer retention compounds. Add unconditional `console.log('[Escalation] cycle complete: N checked, N escalated')` at end of runEscalationScan. Hard Boundary 12 self-application. Folds into M3-Item-3.7 doc/code sweep batch. ~5 min targeted edit. | M3 |
| AC-28 | **Staging deploy strategy decision (Phase 2 deferred, measured-trigger)** — Day 24 surfaced apatris-api-staging hadn't deployed since May 6 (4 days behind prod) because save-prompts stopped bundling staging deploy after early build phase. Staging suspended Day 24. Decision deferred to measured trigger: (a) production-readiness milestone (cutover-to-real-production), (b) first destructive change needing pre-prod test (e.g., AC-12 knowledge graph substrate consolidation), (c) 200+ workers scale milestone. Three options at trigger: deploy + automate via CI/CD, manual deploy gate per release, or destroy app permanently. Five-Tyre Principle: spare tyre held in suspended state at zero cost. | Phase 2 |
| AC-29 | **Dead-code services schema-assumption audit before AC-15 Tier 2-4 wiring** - Day 25 Phase A.5 self-review surfaced this preventive discipline after Job 12 (Tier 1) dry-run revealed workers.status schema bug in dead code. Same audit-pattern-weakness as M9 (Day 22): schema-assumption bug surfaces only when previously-dead code path becomes cron-driven exercised. Before wiring any of the remaining 11 GAPPED jobs (Job 2 runFraudScan, Job 4 runDailyScan, Job 6 runBenchAlerts, Job 7 runFinesScan, Job 8 runTrustScores, Job 9 runChurnScan, Job 10 runInsuranceAlerts, Job 11 runPostingExpiryAlertsJob, Job 13 runAutomationCycle, Job 1 cleanupExpiredTokens, Job 3 runLegalScanJob), audit each service's SQL for schema assumptions: grep against current init-db.ts schema for nonexistent columns; cross-file grep for copy-paste bug pattern; surface findings BEFORE drafting Phase B wire-up. Same one-line audit-first cost; prevents same-shape regression Day 26+. Hard Boundary 12 audit-first sub-discipline made explicit for AC-15 follow-up tiers. | M3 |
| AC-30 | **Dual-machine cron coordination** - Day 26 Phase B.2 review surfaced: both Fly machines (891361 + d8d505) scan all 31 workers in parallel during Job 12 daily cycle. In-service dedup check at daily-legal-scan.service.ts:124-128 (same worker + type + day) prevents most duplicates, but INSERT race window exists between SELECT and INSERT - both machines could see existing=null and proceed to duplicate INSERT. Currently harmless in dry-run; latent risk for live mode at scale. Mitigation options: (a) leader election via Fly machine-state, (b) per-machine cron-affinity (only primary fires), (c) INSERT with ON CONFLICT for legal_alerts table. Captured Day 26 from log analysis after Phase B.2 confirmed cycle clean. | M3 |
| AC-31 | **Command Center person-detail interconnections gap** - Day 26 Phase A audit surfaced: clicking into person in Command Center does NOT surface connected data. WorkerProfilePanel.tsx is column-level field editor (TRC dates, BHP, passport - no joined entity fetches). Base GET /workers/:id returns workers row only (zero JOINs). 27+ tables FK'd to workers (hours_log, documents, contracts, signatures, certified_signatures, payroll_commits, payroll_snapshots, gps_checkins, audit_logs, worker_legal_snapshots, legal_alerts, legal_cases, deadline_countdowns, case_generated_docs, case_notebook_entries, etc.) - all unsurfaced. Per-slice routes exist (legal-status, files, doc-log, validate) but fragmented. Verdict YELLOW - both backend + frontend gap. Recommended: Option C per-entity inventory (Phase A.8 - scope 27+ to 8-12 priority) → Option B incremental tab-by-tab Phase B (Cases tab first for North Star value). Operator-visible feature gap blocking team handoff. — STATUS: Phase A complete 2026-05-14. Audit doc committed at artifacts/api-server/docs/AC-31_Phase_A_Audit.md (commit f6cb3a2). YELLOW verdict. 4 tabs scoped (Cases/Documents/Alerts/Site & Hours), ~14-21h Phase B effort estimate, 2-3 dedicated build sessions. Phase B gated on AC-35 operator interviews confirming tab priority + must build /workers/:id route alongside the tabbed page (per AC-38 Phase A finding). | M3 |
| AC-32 | **Document-driven auto-profile orchestration wrapper** - Day 26 Phase A.6 audit surfaced: feature discussed Phase 1 Week 2 April 2026, primitives all built but autonomous orchestration missing. BUILT: OCR (scanDocument + scanBulkDocument Claude Vision), person identification (matchWorkerMultiSignal using pesel_hash + passport_hash), new-vs-existing detection (document_intake.matched_worker_id), auto-fill-from-OCR for EXISTING workers. MISSING: "If no match → auto-create from ai_extracted_json" branch, client-app autonomous entry point. Currently admin-gated PENDING_REVIEW workflow. Recommended Option C hybrid: match_confidence ≥ 0.85 auto-action (link or create), < 0.85 fall back PENDING_REVIEW. Effort ~1.5 days. Operator-visible feature gap blocking team handoff. | M3 |
| AC-33 | **Build-pipeline determinism + cross-environment pnpm strictness** - Day 26 surfaced through 5 deploy attempts that the build pipeline has cross-environment strictness gaps: local pnpm v10.33.0 + Fly pnpm v11.0.9 + workspace overrides + lockfile format all interact. Today's individual fixes (--frozen-lockfile in both Dockerfiles + esbuild YAML alignment 0.27.3 → 0.27.4) closed real layers but a 6th layer remains: pnpm v11 stricter overrides validation requires lockfile-format alignment that v10-generated lockfile doesn't have. Substantive hygiene workstream required: (a) pin pnpm version via packageManager field in root package.json, (b) align lockfile format under target pnpm version, (c) explicit fly.toml [build].dockerfile reference (HB12-preventive), (d) evaluate artifacts/api-server/Dockerfile dead-code deletion, (e) audit all 5 pnpm strictness layers (package.json + catalog + overrides + patchedDependencies + onlyBuiltDependencies). Day 26 attempts revealed each layer; full Phase A.12 + Phase B work pending. Operational urgency: low (v302 still serves cleanly, Job 12 dry-runs harmlessly). Blocks: Phase B.2 operational closure (Job 12 live mode) until v303 deploys. — STATUS: CLOSED 2026-05-14. Resolved via single packageManager: pnpm@10.33.0 pin in root package.json (commit 0a4c40c). v303 deployed; both machines healthy; scheduler boot log confirms 'Daily legal scan (LIVE)' - Job 12 cron operationally live. 6 stacked commits since v302 landed. Remaining AC-33-adjacent hygiene items (artifacts-level Dockerfile dead-code, fly.toml dockerfile reference, 5 pnpm strictness layers audit) are now low-priority non-blocking hygiene, tracked separately if needed. | M3 |
| AC-34 | **Job 12 manual-trigger workaround** - Day 27 round-2 Q&A audit surfaced: `POST /v1/legal/scan/run` route in `routes/legal-alerts.ts` calls `runDailyLegalScan(req.tenantId!)` with single arg → `dryRun` defaults to `false` (LIVE mode per service signature). Admin HTTP route is ALREADY firing real alert writes to legal_alerts table on v302; only the cron path (lib/scheduler.ts:688 `startDailyLegalScan(true)`) is dryRun-gated. Workaround: Yulia or admin (requireRole("Admin")) hits `POST /v1/legal/scan/run` daily on v302 to fire real alerts while v303 deploy proceeds in parallel (AC-33). Recursive HB12 lesson: when blocked on one execution path (cron), check ALL execution paths to the same service (cron + manual route + future API entrypoints). Anti-hallucination check Day 27 confirmed route path + Admin role + single-arg call. Operational urgency: high (real worker permits expire; alerts can fire today via manual trigger). — STATUS: operationally validated 2026-05-14 (Manish clicked Run Scan Now on /legal-alerts dashboard page; 20 alerts generated; page displayed full breakdown: 21 COMPLIANT / 1 WARNING / 3 CRITICAL / 4 EXPIRED with per-worker per-document table sorted by urgency). Operations guide at docs/AC-34_Manual_Workaround_Guide.md. Becomes SUPERSEDED when AC-33 v303 cron deploys. | M3 |
| AC-35 | **Role-segmented home screens (Akshay welding-view + Yulia legal-view)** - Day 27 round-2 audit Q6+Q7 surfaced: 9-dashboard fragmentation is anti-pattern per 2026 market norm (Personio/Bob HR/Localyze use 1 home + 5 widgets). For APATRIS 3-entity reality, the right pattern is 3 role-based home screens, not 9 topic-dashboards. Akshay welding-view widgets: today's worker state by site, this week's expiring docs, open client requests (Tekra/Izotechnik/Gaztech), compliance % by client, recent activity. Yulia legal-view widgets: open cases priority queue (computePriority), today's deadlines (MOS/A1/court), recent legal_alerts, AI Copilot quick-ask, MOS portal status. Both use existing data + existing per-slice routes; pure surfacing work. Phase A: validate widget priorities with operator interviews (~30 min each). Phase B: 1 week per role-screen. Most actionable visibility fix; closes ~30% of team-handoff gap. | M3 |
| AC-36 | **A1 Posted Workers + RODO-strict PII as visible competitive features** - Day 27 round-2 Q3 surfaced: market audit's "Polish-specific depth" advantage is structurally three things stacked. Surfaceable ones (MOS portal automation, ZUS depth) can be copied by Deel/Localyze within 12 months. Hardest to copy: A1 Posted Workers Directive workflow (because Deel/Localyze are global EOR products serving inbound flow, not Polish outbound-staffing flow) + PESEL/IBAN/passport hash-safe lookup (because they treat Polish as one country among many, not the home market). Currently buried in schema (posted_workers table + pesel_hash columns). Phase B: surface as named visible features in operator UX (Posted Workers compliance dashboard widget + PII-safe lookup demo). Strategic visibility for competitive positioning. | M3 |
| AC-37 | **Multi-scenario AI Phase A - North Star architecture sketch** - Day 27 round-2 Q1 surfaced: multi-scenario AI is architecturally documented in adjacent markets (Brescia Court labor law / ABA Family Law AI / asylum decision support / clinical decision systems). Service sketch: input=(worker_id + case_type + current_legal_status + permit_expiry + worker_profile_facts + external_context), output=3-5 scenarios per case with scenario_name + plausibility_score(0-100) + trigger_event + timeline_to_act + required_documents + legal_basis + risk_factors + lawyer_review_notes. Lawyer UI shows scenario cards side-by-side; selection feeds outcome learning loop. Risk to manage: lawyer-in-the-loop required (over-reliance concern per Brill 2023 + Open Rights Group), explainability per scenario, training-data bias awareness. Phase A: architectural design + first scenario type (TRC rejection appeal pathway). Phase B: incremental scenario type expansion. Fork-point AC: Day 50+ work IF Manish chooses visibility-then-North-Star over hygiene continuation. Q10 base case (60%) is North Star never gets built unless explicitly chosen. | M3 |
| AC-38 | **Worker reference link-out invariant (system-wide)** - Day 28 operator-principle from Manish: every UI surface referencing a worker (by ID, name, or photo) must render as clickable link to that worker's unified profile page (/workers/:id, the AC-31 destination). Not a single feature - a universal rule spanning every page. Applies to: dashboards, lists, tables, legal_alerts, audit_logs, hours/payroll tables, onboarding checklists, AI Copilot responses, email/notification deep links, search results - any worker mention anywhere. Backend: API responses including worker_id should also project worker.id + worker.name as canonical reference shape. Frontend: shared <WorkerLink> / <WorkerChip> component (avatar + name + link) reused everywhere; no orphan worker references rendered as static text. Phase A: enumerate every UI surface with worker references (~half day). Phase B: per-surface replacement of static text with <WorkerLink> (~3-5 days depending on surface count). Sequencing: follows AC-31 (worker unified profile page must exist before links to it are meaningful). Principle generalizes to all entity references (case / client / document / site / alert → respective canonical detail pages) as future scope. Market table-stakes: Bob HR / Localyze / Personio UX maturity depends on this invariant - operator never gets lost. Operator-visible; eliminates hundreds of "now I need to find X" navigation frictions per week. — STATUS: Phase A complete 2026-05-14. Audit doc committed at artifacts/api-server/docs/AC-38_Phase_A_Audit.md (commit 3ae2f59). YELLOW shading toward RED verdict. ~95-105 worker reference renders across 53 dashboard pages + 8 workforce-app tabs. No <WorkerLink> component exists. No /workers/:id route exists. Phase B effort 3-5 dedicated build sessions. Phase B gated on AC-31 Phase B shipping the page + /workers/:id route — links need a destination. | M3 |
| AC-39 | **Worker Leave tab improvements** — extend existing `LeaveTab.tsx` + `/api/self-service/leave` + `leave_requests` table with rule-driven cutoffs, balance display, lateness category. Type: EXTEND. Upstream gate: none. Phase A: pending. Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-40 | **Worker Help tab AI assistant + categorized issues** — extend existing `MessagingTab.tsx` (operator-worker threads) with AI assistant + categorized issue selection. Type: EXTEND. Upstream gate: none. Phase A: pending. Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-41 | **No-show alert engine + escalation cascade** — event-state machine for missed shifts + escalation cascade + replacement suggestions. MUST share matching infrastructure with existing `WorkerMatching.tsx` + `routes/matching.ts`, not create separate scoring engine. Type: NEW BUILD. Upstream gate: AC-35 operator interviews + Yulia legal input on penalty boundaries. Phase A: pending. Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-42 | **Reliability / points system** — configurable points engine rewarding good planning behavior + fair visibility surface. Temporal model (per-shift/week/month + tenure context + rolling vs calendar window) is the key design decision in Phase A. Type: NEW BUILD. Upstream gate: AC-35 operator interviews + Yulia legal review. Phase A: pending. Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-43 | **AI proactive worker-facing communication layer** — shift reminders + document expiry alerts + lateness reminders + payroll prompts via multi-channel (push/SMS/WhatsApp/email). Existing 50+ AI sites are operator-facing — worker-facing AI is a different design discipline. Type: NEW BUILD. Upstream gate: GDPR consent path + channel cost/opt-out analysis + worker-facing AI safety design + timezone handling design decision. Phase A: pending. Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-44 | **Internal AI orchestration (no-show alerts + lateness patterns + replacement-needed + daily attendance digest)** — internal-facing AI surfaces consuming AC-41 signals. Type: NEW BUILD. Upstream gate: AC-41 Phase B (depends on no-show engine event streams existing). Phase A: pending. Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-45 | **Optional client-company AI communication (controlled absence/late/replacement notifications)** — per-client-contract opt-in surface routing internal AI signals out to client company contacts. Type: NEW BUILD (optional). Upstream gate: per-client contract clarification + AC-49 Client Contact role. Phase A: pending. Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-46 | **Worker issue / complaint engine** — categorized issue capture + AI classification + case tracking. Primitive exists in `MessagingTab.tsx` but unstructured. Type: NEW BUILD. Upstream gate: AC-31 Phase B (link-out to worker profile from issue case) + AC-40 (Help tab AI assistant). Phase A: pending. Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-47 | **Time / site intelligence (aggregation layer)** — geofence breaches + wrong-site detection + suspicious patterns + reliability score input. All signal sources exist (`site_geofences` + `gps_checkins` + `worker_availability` + `shifts`); aggregation/scoring layer is new. Type: EXTEND. Upstream gate: none (lowest-risk first Phase A candidate). Phase A: pending. Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-48 | **Manager dashboard refinement + integration with new modules** — existing `ManagerHome.tsx` (fully built with motion + i18n + sheets pattern) extended with hooks into new modules (AC-41 no-show + AC-42 reliability + AC-44 internal AI + AC-47 time/site intel). Type: EXTEND. Upstream gate: AC-35 operator interviews. Phase A: pending. Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-49 | **Client Contact role (RBAC 6th tier extension)** — extend current 5-tier T1-T5 RBAC with Client Contact role for optional client-company portal access. Includes Manager/Office Staff mapping clarification per existing T2/T3 tiers. Type: NEW BUILD (incremental). Upstream gate: RBAC audit + role-mapping clarification with Manish + Yulia. Phase A: pending. Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-50 | **Configurable penalty / reward engine** — rule-driven penalty + reward configuration feeding AC-41 + AC-42. **RED RISK — LEGAL REVIEW REQUIRED.** Polish Labour Code Art. 87 (wage deduction limits) + Art. 108 (penalty procedure: hearing, documentation, time limits) + EU Posted Workers Directive constrain allowed configuration space. Configuration flexibility cannot exceed legal allowed space. Type: NEW BUILD. Upstream gate: Yulia legal-input MANDATORY before Phase A. Phase A: pending (sequenced LAST). Phase B: pending. Source: Worker App Vision Scoping Audit Day 30. | M3 |
| AC-51 | **System-wide admin-route role-gating audit** - admin/management routes across the API check requireAuth but not requireRole. Multiple authenticated users could access tenant-wide data not scoped to their role. Evidence: AC-39 Phase A flagged GET /api/leave + PATCH /api/leave/:id (self-service.ts:190 + 203); AC-40 Phase A flagged messaging admin routes (same pattern). Type: NEW BUILD (security hardening). Upstream gate: none - independent of vision sprint. Phase A: pending (full route-gating sweep across all /api/* routes). Phase B: pending (apply requireRole correctly per route). Source: AC-39 + AC-40 Phase A footnotes Day 30. | M3 |
| AC-52 | **System-wide drift consolidation across paired/duplicated infrastructure** - Multiple instances of duplicate/divergent infrastructure surface across audits. Evidence: AC-44 Phase A flagged ai-provider drift (services/ai-provider.ts vs services/ai/provider.ts); AC-43 Phase A flagged consent table drift (consent_records vs gdpr_consent_records); AC-42 Phase A flagged trust_scores-vs-reliability_points naming consistency. Type: NEW BUILD (hygiene consolidation). Upstream gate: none - independent of vision sprint. Phase A: pending (full /api/* drift sweep + naming convention review). Phase B: pending (consolidate per-instance, deprecate divergent paths). Source: AC-42 + AC-43 + AC-44 Phase A footnotes Day 30. | M3 |
| AC-53 | **APATRIS Worker Profile - AI surfaces enhancement** - APATRIS's existing worker profile layout is operator-validated excellent (Manish Day 30 operator-eyes evaluation, contradicting prior file-count audit). AC-53 scope is NARROW: add specific AI surfaces EEJ has that APATRIS doesn't, while keeping APATRIS layout intact. Three additions: (a) AI Summary narrative paragraph synthesizing worker compliance state (model: EEJ AISummary pattern; APATRIS implementation: APATRIS-domain prompts), (b) AI Action Recommendations - 3-rec structure with reasoning (operator-segmented: Yulia legal recs / Akshay ops recs / Manish strategic), (c) AI Decisions audit log UI panel surfacing existing API-only audit trail. Type: ENHANCE (not port, not redesign). Upstream gate: AC-44 internal AI orchestration Phase B Wave 1 + AC-35 operator interviews establishing per-role rec content. Source: APATRIS-vs-EEJ Feature Audit Day 30 (commit c4355d8) + Manish operator correction commit 90dc87a evening Day 30. | M3 |
| AC-54 | **Deep-link primitive (worker-context navigation) - DEFERRED to Monday walkthrough** - prior framing (port EEJ setDeepLinkWorker) assumed APATRIS lacks this capability without operator-eyes validation. Whether APATRIS already handles deep-link navigation differently (e.g., embedded in WorkerProfilePanel + module routes) needs Monday text-dump walkthrough of APATRIS dashboard pages before scope locks. Status: parked. Phase A audit deferred until Manish renders APATRIS UI and confirms whether the gap is real, partial, or non-existent. Source: APATRIS-vs-EEJ Feature Audit Day 30 (commit c4355d8) + Manish operator correction commit 90dc87a. | parked |

---

## SYNTHESIS PATTERN

Movement 2 shipped fast. Verification discipline gap (Operational Pass INPUT 2 Gap 2) shows up in this ledger:
- 7 clean closes (M1, M3, M5, M6, M7-DORMANT KEEP, M9-with-completion-sweep, M10) — verified delivered + 2 ACs CLOSED Day 23 (AC-21a recipient consolidation, AC-21b OTP From-address) + Day 23 Manish-action: Replit deployment deleted (cross-build observation revealed zombie autoscale instance polluting Sentry; Fly is sole production target since weeks ago; CLAUDE.md aligned at commit 019ed03)
- 2 reframe-with-verification (M2, M8) — code shipped, runtime unverified (M9 reclassified to clean-close-with-completion-sweep)
- 1 reframe-with-investigation (M4 Airtable residue)

Each Item closure passed its own gates. Cross-cutting questions weren't part of any single Item's scope. Remediation: AC-8 Operational verification sweep becomes the recurring discipline.

## NORTH STAR ALIGNMENT VERDICT

Every migration in this ledger serves the North Star:
- Direct: M1, M2, M5, M6, M9, M10
- Indirect: M3, M8, M4
- Future-purpose: M7-DORMANT (B1), B2 Twilio, B3 Voyage, B4-B8 Pattern 1A activations

**No migration is drift from purpose.** Audit's "drift findings" turned out archaeological — pre-discipline-era patterns the post-April-25 discipline regime has been cleaning up.

**Critical audit win:** B13 Job 12 `runDailyLegalScan` silent failure was caught. Without audit, workers' permit-expiry alerts not firing automatically would have continued indefinitely. The discipline framework justified.

---

*End of Migration Ledger Phase 2 (first formal version).*
*Working draft until Apatris Claude commits as part of Session 5 close.*
