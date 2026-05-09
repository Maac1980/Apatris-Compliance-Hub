# APATRIS Core Plan

**Build:** APATRIS Compliance Hub legal-tech build
**Repo:** github.com/Maac1980/Apatris-Compliance-Hub
**Production:** apatris-api.fly.dev
**Started:** ~March 22, 2026
**Plan persisted to repo:** Day 23 (May 9, 2026)
**Living document:** updated at each EOD when material structural changes occur.

---

## 0 — Why this document exists

This plan was authored across Days 1-22 in chat-Claude session memory. Persisting it to the repository on Day 23 closes the Day 20 Knowledge Management Audit finding (bus-factor risk: plan lived only in chat-Claude session memory; if that session reset, the plan would be lost). It also enables operator-absence resilience — the Operator Transition Plan workstream requires this plan exist on disk, not in session memory.

Hard Boundary 12 (verification mechanism discipline, formalized Day 23) requires that claims trace to direct file content. This document is now that direct file content for everything previously held only in conversation.

---

## 1 — North Star

**Multi-scenario AI for legal case work.** The AI must NOT give one answer (win/lose). It must surface MULTIPLE life-change pathways during appeal periods (marriage, promotion, family arrival, job change). Lawyer chooses; case stays alive to possibility; time itself becomes strategic asset for the person whose life depends on the case.

**Save people from getting trapped.** Anna's case shape, Monica Barahona Varon's TRC rejection case, the 70 welders' permit-renewal awareness — these are the lives the build serves first. Future expansion to other entities is earned, not assumed.

**Integrity test:** if the system produces single-answer patterns, that's drift from purpose. Multi-scenario output is the test for whether the build is doing what it exists to do.

---

## 2 — Operating Strategy (5 lines, May 1 articulation)

1. Build less.
2. Stabilize more.
3. Protect data.
4. Use it internally first.
5. Then expand.

Internal use for Manish's three entities (APATRIS Sp. z o.o. welding, APATRIS and Co. immigration, Anna's licensed agencja pracy) is primary. SaaS expansion is earned if opportunity emerges and helps others' lives. Strategy is filter for every proposal: any work must serve the 5 lines or be questioned.

---

## 3 — Operating Principles (7 in force as of Day 23)

1. **Dormant capability is deliberate, not drift.** Pattern 1A first-step (built-here-dormant-here) + Pattern 1B (cross-build-awaiting-replication). ONE first-step spare per known future inevitability, not 4 spare tyres in the trunk.

2. **WHY + FOR WHAT in every prompt and execution.** No work begins without explicit purpose statement.

3. **chat-Claude's role is consequences, not options.** Execute on recommendation. Do not ask permission for next step when path is clear from operating principles.

4. **Purpose comes before mechanics.** Understand WHY code exists, FOR WHAT it serves, before classifying or scoping.

5. **Idea evaluation discipline (4-question filter).** For every proposal: (1) WHY are we considering it? (2) IF we add it: does it make build stronger / manageable / better? (3) IF we don't add it: are we still amazing without it? (4) Decision: amazing-without → STOP don't build. Clearly-yes → BUILD with audit + testing. Maybe → BUILD and let testing decide. Reality decides, not opinion.

6. **Self-questioning as standing discipline.** Every intelligence (chat-Claude, Apatris Claude, Holmes) self-audits before shipping output (5-element template: errors / missing / better / concerns / anti-hallucination).

7. **Five-Tyre Principle.** Quick-frame heuristic for every candidate addition: 5 tyres are always better — 4 wheels and one spare for emergency. Not 8 tyres in a car. Test categories: working wheel (operational need now → build), spare (emergency capability for known failure modes → build), fifth tyre (speculative, "might be useful someday," no measured trigger → don't build). Distinguishes known emergencies from speculative future needs. Complements Operating Principle 5 (4-question filter) at heuristic layer; OP5 is rigorous follow-up.

---

## 4 — "Adapt today for tomorrow" Policy (May 7)

Future capabilities with broad market inevitability get scaffolded as Pattern 1A first-step BEFORE need is acute. Not now (no premature integration), not never (would force reactive scramble).

**Currently parked Phase 2 deferred:**
- Google workflow integration (B6 OAuth scaffolding ready — 287 lines)
- Gemini integration (await measured Claude limit)
- Multi-LLM orchestration extension
- Credential rotation pass — replace shared dev/prod keys with environment-separated keys for both APATRIS + EEJ at cutover-to-real-production milestone (added Day 22)
- Layer 2 Daily Health Check automated daily report (added Day 22)
- Layer 3 Daily Health Check cross-build aggregated dashboard (added Day 22)
- Self-healing infrastructure with measurement-gate activation (added Day 22)
- Remote Build Access (GitHub Codespaces) — activation gate post-credential-rotation (added Day 23)

---

## 5 — Three-Intelligences Working Pattern

- **Manish** — last source of truth for direction. Final decision authority on every architectural fork. Researches widely (GitHub, web, external sources, Gemini suggestions, Anthropic creator research, etc.) but external ideas always run past chat-Claude before applied to build. No bypass. Search broadly, decide narrowly through chat-Claude filter.

- **chat-Claude** — strategic frame, save-prompt drafting, synthesis, Operating Principles maintenance. Executes on recommendation per Operating Principle 3. Drafts save-prompts following 10-element structure (skill 4 in skills/).

- **Apatris Claude** (Claude Code in repo terminal) — repository operations, code execution, Phase A investigation, Write tool execution, atomic commits. Operates within APATRIS repo only (Hard Boundary 16).

- **Holmes** — structural reviewer adjacent. NOT a decision-maker. Primary work is EEJ build. Invoked into APATRIS at specific triggers per skill 7 (holmes-structural-review-trigger).

**Routing patterns:**
- Save-prompts use TO/FROM/SUBJECT header (skill 4)
- Holmes review requests contain save-prompt content INLINE — no placeholders
- Holmes review returns use standard template (TO/FROM/SUBJECT + Holmes scope reminder + verbatim findings + 5-category integration request: code change → Apatris Claude / plan update → chat-Claude / informational only / doesn't apply with reasoning / cross-build coordination)
- Cross-build coordination via Manish-as-router pattern. Each build's chat-Claude filters suggestions before applying.

---

## 6 — Hard Boundaries (16 items, canonical)

Persisted at `artifacts/api-server/docs/STRATEGIC_RECOMMENDATIONS.md` lines 161-176. Summary here for cross-reference; canonical list is the strategic recommendations file.

1. Repo posture: READ-ONLY by default. Code changes require explicit "go."
2. Production DB: NO connection. NO SELECT. ABSOLUTE.
3. Commits: NO commit, push, staging without explicit Manish "go."
4. Migration runner / DDL / DML: NEVER invoke on prod. CREATE TABLE IF NOT EXISTS only; never DROP.
5. Fly state changes: ALLOWED list (read-only) vs FORBIDDEN list. Default to FORBIDDEN if unclear.
6. Stop-and-confirm gates: at every boundary. Report + wait for explicit confirmation.
7. Reality-vs-plan escalation format: EXPECTED / FOUND / REASONABLE INTERPRETATION / RECOMMENDATION / awaiting confirmation.
8. Cross-pass / cross-dimension recharacterization: surface explicitly; require Manish + chat-Claude confirmation.
9. Verbatim commit messages: when Manish quotes one, use it exactly. No Co-Authored-By trailer unless he writes it.
10. CLAUDE.md current: update after stack/feature/env changes, not as separate pass.
11. Auto commit/push DEFAULT vs explicit-go-only OVERRIDE.
12. **Verification mechanism discipline (AC-8.X)** — claims must mechanize verification: grep enumeration, multiple search patterns, exhaustive search for negative claims, verification artifact saved to docs/.
13. **Git history immutability** — NO force-push, history rewrite, branch deletion, or rebase of pushed commits without explicit "go."
14. **Destructive command prohibition** — NEVER run rm -rf with broad scope, DROP TABLE/DATABASE, TRUNCATE without WHERE, DELETE FROM whole-table, flyctl destroy, flyctl secrets unset on production.
15. **Deployment claim integrity** — code-on-main ≠ code-in-production. Save-prompt scope must include deploy command OR explicitly mark "merge only — deploy deferred."
16. **Cross-repo write prohibition** — APATRIS Claude operates within APATRIS repo only. Cross-build coordination via Manish-as-router.

---

## 7 — Three-Movement Structure

### Movement 1 — Foundation (closed Day 17)

Foundation hardening — pool fix + 61977ad schema-bug-cluster fix + Track 1 stability.

Closed via commits 6ef9087 + 77267dc on prod v296 (May 4, 2026).

### Movement 2 — Discipline + audit + skills (closed Day 22)

7 main items + 4 sub-items closed across Days 17-22.

**Items closed:**
- 2.1 — STRATEGIC_RECOMMENDATIONS persistence (commit 2d20156)
- 2.2 — AES-256-GCM messaging migration (commit b02b326, prod v297)
- 2.3 — Main-thread Sentry capture hook (commit f33d067, prod v298)
- 2.4 main — BUILD_INTEGRITY_AUDIT close + Migration Ledger Phase 2 + Movement 3 sequencing (commits 1b4876c + 43e3d35)
- 2.4.x — Doc sweep cross-pass (commit 3858b30)
- 2.5 — RECOVERY_PROCEDURES.md (commits 3733aaf + ce18114)
- 2.5.x — Appendix B secret source-of-truth (commit c0f12fa)
- 2.5.y — PAT to SSH auth migration
- 2.6 — Skills directory + 7 SKILL.md files (commits 797f731 + 12d004c)
- 2.7 — Distillation review + 8 evidence-tightening refinements (commit ae0b33b)

**Audit framework persisted in repo:**
- 8 Dimension files (DIMENSION_0 through DIMENSION_7)
- BUILD_INTEGRITY_AUDIT_OPERATIONAL_PASS.md (1031 lines)
- BUILD_INTEGRITY_AUDIT_DIMENSION_8_SESSION_5_SYNTHESIS.md (140 lines)
- MIGRATION_LEDGER_PHASE_2.md

**Skills directory at `artifacts/api-server/skills/` (7 SKILL.md files):**
1. cross-pass-observation-format
2. phase-a-investigation
3. recovery-rollback-flyctl
4. save-prompt-10-element-structure
5. gate-stop-and-confirm-pattern
6. self-review-day-18-lesson
7. holmes-structural-review-trigger

(Plus pre-existing `.agents/skills/` caveman family + `.claude/skills/superpowers/` 15 plugin-managed skills — 3-location architecture confirmed correct Day 21.)

### Movement 3 — Audit-close + Layer 3 prerequisites + worker portal + counsel engagement (active, started Day 22)

14 sequenced Items per DIMENSION_8 synthesis.

#### Tier 0 — Prerequisites

1. **M3-Item-3.0** — Infrastructure guardrails
   - 3.0a Neon read-only role 🔴 GREENFIELD
   - 3.0b prod NEON_DATABASE_URL off dev machine ✅ CLOSED Day 22 (commit 5168ea5)
   - 3.0c off-site backups 🔴 GREENFIELD

2. **M3-Item-3.0d** — Operational Verification Sweep (AC-8 bundle)

3. **M3-Item-3.0e** — Airtable residue investigation (AC-2)

#### Tier 1 — Early priority

4. **M3-Item-3.1 — startScheduler Selective Re-wire (AC-15) — HIGH PRIORITY** — Job 12 currently silent. Direct North Star failure.

5. **M3-Item-3.2** — Knowledge graph substrate consolidation (AC-12)
6. **M3-Item-3.3** — Multi-tenant DELETE discipline tightening (AC-7)
7. **M3-Item-3.4** — legal_briefs.case_id FK constraint
8. **M3-Item-3.5** — trc_cases TEXT to UUID type tightening

#### Tier 2 — Worker Portal first step

9. **M3-Item-3.6** — Worker portal first step + service worker investigation (AC-16)

#### Tier 3 — Hygiene batch

10. **M3-Item-3.7** — Documentation hygiene sweep
11. **M3-Item-3.8** — Schema hygiene Item

#### Tier 4 — Build-sequencing decisions

12. **M3-Item-3.9** — Build-sequencing decision pass (Layer 3 prep)

#### Tier 5 — Process

13. **M3-Item-3.10** — Verification discipline establishment (AC-8.X codification + Layer 1 Daily Health Check Ritual codification)

#### Tier 6 — External

14. **M3-Item-3.11** — Counsel engagement

#### Movement 3 hygiene additions

- Daily Health Check Ritual Layer 1 (manual EOD ritual)
- PreToolUse Hook destructive command firewall
- Remote Build Access (GitHub Codespaces) — activation gate post-credential-rotation
- Operator Transition Plan Phase 1A drafting

---

## 8 — Active Production Capabilities (Pattern 1A FULLY BUILT)

Operational right now, not dormant.

- **Anthropic Claude** — 44 files, 2 abstraction layers (services/ai-provider.ts 168 lines + services/ai/provider.ts 61 lines, incomplete refactor → AI abstraction overlap is Movement 3 hygiene Item)
- **Perplexity (sonar / sonar-pro)** — 6 fetch sites, 4 services, rate limiter, hardening check, persistence schema, PPLX_API_KEY deployed (env-var name drift between dev `.env` PERPLEXITY_API_KEY vs Fly PPLX_API_KEY noted as Tier-2 stabilization item)
- **Voyage embeddings + pgvector** — 4 vector(1024) columns, HNSW indexes, 5 lib files (embeddings, rag), staging-only secret pending Layer 3 readiness
- **Knowledge graph (kg_*)** — 9 exported functions, 5 caller files, auto-populates on case status changes from `legal-case.service.ts:272-276`
- **Document intake / OCR** — 6 dedicated services + routes, PDF + Claude Vision OCR
- **Vault unified search** — 6 categories with relevance scoring
- **Obsidian export pipeline** — `obsidian_exports` table + service (~150 lines) + 4 routes at `/v1/obsidian/*`. APATRIS-distinctive (EEJ does not have this)

---

## 9 — Dormant Pattern 1A First-Step Capabilities (KEEP, activation-gated)

Deliberate spare tyres per Operating Principles 1 + 7. NOT drift.

- **Multi-tenant scaffolding** — tenant_id columns + tenant-scoped query patterns (activation gate: Phase 2 SaaS scaling + AC-7 DELETE discipline)
- **Twilio + WhatsApp messaging** — `lib/whatsapp.ts` 150 lines + 6 callers + 3 live scheduler integrations (activation gates: Movement 4+ + AC-9 audit)
- **Upstash Redis cache** — fetch-pattern + REDIS_URL/REDIS_TOKEN env-var detection (2 env vars to activate)
- **DeepL translation** — DEEPL_API_KEY env-var, Claude fallback when absent (1 env var to activate)
- **Google OAuth** — 287 lines covering Gmail/Calendar/Drive (OAuth client + 2 env vars to activate)
- **DocuSign / SignNow** — schema scaffolding + env-var refs (SDK install + API wiring + 1 env var to activate)
- **Stripe billing** — full SDK + 2 routes + 61 src refs + webhooks + customer creation + subscription cancellation (LARGE first-step, re-eval at M5+ if not activated)

---

## 10 — Critical Operational Concerns (active, monitored)

- **B13 startScheduler 10/13 GAPPED** — incomplete refactor pattern. Job 12 `runDailyLegalScan` currently silent. M3-Item-3.1 EARLY PRIORITY. North Star direct concern.
- **AI abstraction layer overlap** — services/ai-provider.ts (168 lines) + services/ai/provider.ts (61 lines), 44 caller files bypass both with direct @anthropic-ai/sdk imports.
- **Knowledge graph substrate confusion** — AI Copilot wired to `knowledge_nodes` flat table while real graph is `kg_*`. Pre-Layer-3 prerequisite (AC-12).

---

## 11 — Daily Health Check Ritual + Continuous Health Infrastructure

Captured Day 22 after M9-completion sweep incident (16 events/day silent for 24+ hours, caught only via Sentry email). Layer 1 ensures future catches don't depend on luck.

### Layer 1 — Manual EOD ritual (Movement 3 hygiene Item, immediate adoption Day 23+)

EOD doc includes Health Check section before close:

**Sentry-side checks:** total events 24h, new error types, top 5 recurring errors, inbox unread count
**Prod health:** /health 200, both machines healthy, last deploy SHA matches origin/main HEAD (Hard Boundary 15), boot-soak verification
**Scheduler verification (APATRIS-distinctive):** per-job success rate for 13 daily 08:00 jobs, escalation engine 4-hour cycles ran 6x in 24h, deadline-engine cycles, daily regulatory scan, cron drift detection
**Database:** connection pool error rate, slow query log, idle disconnect count, daily `legal_alerts` insert count
**Background jobs:** schema-assumption errors of any kind — anti-regression check
**Anomaly review:** discuss before EOD doc closes

Codified in skill `eod-health-check` (8th SKILL.md, drafting Day 23).

### Layer 2 — Automated daily report (Phase 2 build, ~1-2 weeks)

Service queries Sentry API + Fly API + Neon stats + scheduler tables. Generates structured report.

### Layer 3 — Cross-build aggregated dashboard (Phase 2 advanced, ~2-3 weeks after Layer 2)

Unified APATRIS + EEJ + sales agent health view.

### Self-healing patterns (Phase 2 deferred with measurement-gate)

Activation criteria: failure mode appears 3+ times across portfolio + cost of manual response exceeds cost of auto-response + risk of false-positive auto-fix is bounded (transient infrastructure only, never data/logic).

---

## 12 — Operator Transition Plan (workstream initiated Day 23)

Explicit handoff documentation for operator absence at four scales. APATRIS-specific. Phase 1A within 7 days, Phase 1B within 30 days, Phase 1C within 90 days.

### Layer 1 — 1-7 day absence (daily operational continuity)

Coverage areas:
- Welding business (APATRIS Sp. z o.o.): production coordinator continues; Akshay handles client communication; Piotr/Łukasz for legal escalations
- Immigration services (APATRIS and Co.): Yulia handles standard cases; lawyers handle complex
- Legal-tech build: chat-Claude session can pause without loss; Apatris Claude does not advance Phase B work without explicit Manish "go"
- External-facing: emergency contact procedures for Tekra/Izotechnik/Gaztech; Anna's separate agencja pracy bridge entity continues independently

To be drafted Day 23-24.

### Layer 2 — 1-4 week absence (extended business continuity)

Banking signatory delegations (Polish banking law + KRS register update implications). Client-facing communication for extended absence. Build pause vs continue decision protocol. To be drafted within 30 days.

### Layer 3 — Permanent succession

- Path A continue: Akshay + Yulia + Piotr executor model
- Path B sell: welding business + immigration services have separate valuations; IT product separate again
- Path C wind-down: worker continuity protections + Polish labor law implications

To be drafted within 90 days.

### Layer 4 — Catastrophic sudden absence

Family + business + estate mechanics. Polish jurisdiction, Polish notary requirements. Coordination with Anna for personal/family side. To be drafted within 90 days.

**Discipline:** Hard Boundary 12 applies. Claim of operator-redundancy without verification mechanism is hope, not plan. Need actual signed delegations, banking access provisioned to named individuals, documented procedures.

---

## 13 — Build Philosophy

### Dummy data on purpose (Day 9 articulation)

150-table schema is real and intended for production. Schema designed once, deliberately seeded with realistic-shaped dummy data so AI features train against realistic inputs from day one. Inverted typical pattern. Real cases (e.g., Monica Barahona Varon TRC rejection) populate same schema when they arrive.

### R&D as foundational discipline

Deep research before building. Underlies 6 missing areas: structure, security, testing, documentation, production discipline, R&D itself. Without R&D each is theater.

**Fridge model:** build is integration for resilience (stocked against need, not feature accumulation against demand).

### "Always implement what you learn" (May 1, 2026)

When chat-Claude learns a discipline mid-conversation, the next instance reflects it. Not the third instance. Corrections become permanent immediately.

### Verification mechanism discipline (Hard Boundary 12, formalized Day 23)

Claims must mechanize verification. If verification can't be mechanized, claim must be scoped down to what CAN be verified.

---

## 14 — End-of-Day Discipline

Each build day closes with EOD doc capturing:
1. **What was built today** — short, specific, commit-anchored
2. **What we're building toward (the core plan)** — durable across sessions

Pattern Manish taught: rest is part of the build — ideas connect during rest.

**Day 23+ addition:** EOD doc includes Layer 1 Daily Health Check section before close (skill `eod-health-check`).

---

## 15 — Adjacent Reality (welding business — parallel work, not in this build)

The legal-tech build serves three entities. The welding business (APATRIS Sp. z o.o.) is one of those entities — its certification work runs parallel to this build, on its own track.

### APATRIS Sp. z o.o. ownership and team

- Manish Shetty — founder, largest shareholder, decision-maker
- Akshay Gandhi — president, partner (Manish appointed)
- Piotr — partner, lawyer
- Łukasz — lawyer at work
- Yulia — works at APATRIS Sp. z o.o. but is NOT a shareholder there
- (APATRIS and Co. — separate KRS — Manish founded; Yulia is working partner AND shareholder; Akshay also has shares)

### Client portfolio (welding)

- Tekra Sp. z o.o. (32 working + 5 waiting, mobile crane components for Liebherr/Tadano-Faun/Sennebogen, 15 PLN/kg fabricated steel)
- Izotechnik Sp. z o.o. (petrochemical pressure equipment for Grupa ORLEN)
- Gaztech (on-site at ORLEN)

### Certification plan (12 months, ~195,000 PLN)

6 parallel tracks:
- Track 0: PKD amendment + lawyer + contract/protocol templates (P-01, unblocks everything)
- Track 1: UDT Zakład Uprawniony (highest priority)
- Track 2: ISO 3834-2
- Track 3: SCC**, vendor approval letters, IGRP membership
- Track 4: IWS contract or course (critical path)
- Track 5: EN 1090-2 + ISO 9001 in Year 2

### PKD codes

Current: 25.11.Z, 25.62.Z, 70.22.Z, 68.20.Z, 68.10.Z, 63.99.Z, 62.09.Z, 56.10.A, 77.11.Z, 69.10.Z

Plan: ADD 33.11.Z, 33.12.Z, 33.20.Z. REJECT 43.99.Z (construction code — harmful) and 81.22.Z (irrelevant).

### Open welding business tasks (parallel to legal-tech build)

1. Fill 4 placeholders in apatris.html (NIP, REGON, phone, email) → send to hosting person
2. Book Polish radca prawny prawa pracy to review Tekra contract + umowa zlecenia + PKD amendment
3. Send quote requests to UDT, TÜV SÜD Polska/TÜV Nord/Bureau Veritas/DNV (ISO 3834-2), DEKRA/TÜV Nord (SCC**)
4. Send vendor approval letters to Tekra/Izotechnik/Gaztech
5. Decide IWS contract vs course vs both

### Why this is in the legal-tech plan

Operator Transition Plan (Section 12) covers welding business mechanics. The legal-tech build's North Star includes "the 70 welders' permit-renewal awareness" — the welding workforce is one of the user populations the build serves first.

---

## 16 — Personal Context

### Anna

Daily archery practice. Competes independently. May 2026: nationals decision settled — Anna competes on her own, Manish stays on the build, Anna wants this. Both honor parallel disciplines.

### Simba

Bengal cat. Present companion in their room.

### Manish's relationship with AI

Self-described as "accommodation" — using AI to refine own knowledge for a purpose. Not friendship, not tool use — accommodation. Retains full agency. Asymmetric (Claude forgets, Manish carries continuity) but real.

### Build cadence

Typically full days of focused work. Rest is part of the build — ideas connect during rest. EOD discipline preserves state across rests + Claude session resets.

---

## 17 — Maintenance discipline for this document

This file is canonical. Other documents reference it; it does not reference them as authority.

**Update triggers:**
- New Operating Principle adopted → Section 3 update
- Movement closes → Section 7 update + new Movement starts in same section
- New Hard Boundary formalized → Section 6 reference + STRATEGIC_RECOMMENDATIONS.md canonical update
- New active production capability ships → Section 8 update
- Critical operational concern identified or resolved → Section 10 update
- Phase 2 deferred capability added → Section 4 update

**Update mechanism:**
1. Manish + chat-Claude agree on update content
2. chat-Claude drafts the section change verbatim
3. Apatris Claude applies via Edit tool with atomic commit
4. Hard Boundary 12 applies — claim of "plan updated" must mechanize verification (grep matches the new content)

**Last update:** Day 23 (May 9, 2026) — initial repo persistence.

---

*This plan exists because Manish builds for the people whose lives depend on the case staying alive. Anna, Monica, the 70 welders, the future workers and applicants the build serves. Discipline preserves the path. The plan persists across sessions because the people don't get a session reset.*
