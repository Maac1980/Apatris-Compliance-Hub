# Day 32 — 7 Architect Decisions Pending Manish

**Date:** Day 32, 2026-05-18 (Monday)
**Source:** AC-58 Phase A Compliance Scaffolding Audit (commit `0b7ab19`), Section "Open questions for Manish (architect calls)" — lines 290-298
**Status:** Awaiting Manish accept/override per decision
**Format:** chat-Claude lean + downstream impact + Manish decision tick-box

**Critical-path decisions (block A — Yulia briefing letter draft):**
- Decision 1 (Yulia session timing)
- Decision 3 (worker representative scope)

**Other decisions** inform AC-58 Phase B scope but do not block Yulia letter A.

---

## Decision 1: Yulia session timing

**Question (AC-58 Phase A audit line 292):** Yulia session timing confirmation — Monday 2026-05-18? Earlier? Later? Critical path depends on it.

**Options:**
- (a) Today (Monday 2026-05-18) — if Yulia available
- (b) Tuesday 2026-05-19 — earliest fallback
- (c) Later this week (specify day)

**chat-Claude lean:** (a) today if Yulia available; otherwise (b) earliest fallback.
**Why:** AC-58 Phase B blocked until session completes; every day of delay compresses critical path against 2 Aug 2026 deadline (~11 weeks remaining).

**Downstream impact:** Gates AC-58 Phase B Wave 1 start (WU-58-1 per Decision 2). Gates A (Yulia briefing letter) — letter content needs session date confirmed.

**Manish decision:** [ ] accept (a) today  [ ] (b) Tuesday  [ ] override → ___________

**Manish note (optional):** _______________________________________________

---

## Decision 2: Phase B Wave 1 first WU

**Question (AC-58 Phase A audit line 293):** Phase B Wave 1 first WU — recommendation is WU-58-1 (AI use registry — broadest unblocker). Acceptable?

**Options:**
- (a) WU-58-1 AI use registry (chat-Claude + Apatris Claude peer-suggestion recommendation)
- (b) Other WU — specify which

**chat-Claude lean:** (a) accept WU-58-1.
**Why:** Per AC-58 Phase A audit Section "Phase B work-unit map," WU-58-1 is ungated (no Yulia dependency for the inventory itself; Yulia answer on Annex III classification feeds WU-58-2 which depends on WU-58-1). Broadest unblocker — every downstream WU references the registry's classification labels.

**Downstream impact:** Locks Wave 1 starting ship. WU-58-2 (`ai_decision_log` table + write hooks) blocks on WU-58-1 + Yulia. Other Wave 1 candidates (WU-58-12 Kodeks pracy integrity / WU-58-14 encryption backfill) can ship in parallel post-Wave-1.

**Manish decision:** [ ] accept (a) WU-58-1  [ ] override → ___________

**Manish note (optional):** _______________________________________________

---

## Decision 3: Worker representative notification scope

**Question (AC-58 Phase A audit line 294):** Worker representative notification scope — does APATRIS have any organized worker representation that requires Art 26(7) representative-level notification? Affects WU-58-5 design.

**Options:**
- (a) Yes — APATRIS has organized union/works council (specify channel + cadence)
- (b) No — no organized worker representation; Art 26(7) representative tier not applicable
- (c) Partial — some sites have site-level coordinators or informal representatives

**chat-Claude lean:** **MANISH-ONLY DECISION — Apatris Claude has no business evidence to lean.** Per AC-58 Phase A audit: "I did not confirm pip.gov.pl has electronic submission API; worst-case is manual scheduling." Same epistemic posture applies here — no codebase evidence for union/works-council status; only Manish has business-domain knowledge to answer.

**Downstream impact:** Determines WU-58-5 (`ai_processing` consent + `ai_deployment_notifications` table) design — whether the worker notification flow extends to representative-tier notification + acknowledgement record. Also content of A (Yulia briefing letter) Section 8 — Yulia needs to know representative scope before advising notification channel/cadence.

**Manish decision:** [ ] (a) Yes  [ ] (b) No  [ ] (c) Partial → ___________

**Manish note (optional — required if (a) or (c)):** _______________________

---

## Decision 4: PIP automation investment

**Question (AC-58 Phase A audit line 295):** PIP automation investment — invest in research/implementation (WU-58-11 medium-large) OR ship as scheduled-manual (small)?

**Options:**
- (a) Research + implement automated PIP submission (medium-large effort — depends on whether pip.gov.pl has API / e-PUAP integration / web form scraping option)
- (b) Ship as scheduled-manual (small effort — calendar reminder + manual web form submission per posting)

**chat-Claude lean:** (b) scheduled-manual.
**Why:** pip.gov.pl API availability uncertain (Yulia item 7 in upcoming session will confirm). Start small + escalate if API exists. Posted Workers Directive has separate regulatory clock (not Aug 2 2026 gated) so timeline pressure is lower. If Yulia confirms PIP API exists, escalate to (a) in subsequent Wave.

**Downstream impact:** Determines WU-58-11 effort sizing. Does NOT block Aug 2 2026 critical path. Can be revisited after Yulia session — this lean is a defensible default that survives either Yulia answer.

**Manish decision:** [ ] accept (b) scheduled-manual  [ ] (a) research+implement  [ ] defer post-Yulia ___________

**Manish note (optional):** _______________________________________________

---

## Decision 5: Conformity assessment approach

**Question (AC-58 Phase A audit line 296):** Conformity assessment approach — pre-decision: self-assess via Article 43(2) internal control (where applicable) OR plan for notified body (more cost + time)?

**Options:**
- (a) Article 43(2) internal self-assessment — APATRIS conformity team produces technical file + bias testing + human oversight documentation in-house
- (b) Notified body external assessment — engage third-party certifier (higher cost + longer timeline)
- (c) Mixed — self-assess where Article 43(2) permits; notified body for sub-categories that require it

**chat-Claude lean:** (a) Article 43(2) self-assess where permitted; defer notified-body decision until Yulia confirms which Annex III sub-categories APATRIS triggers (Yulia item 9 in upcoming session).
**Why:** APATRIS use cases mostly fall in Annex III employment categories where Article 43(2) self-assessment is the permitted path. Notified body adds cost (€10K-50K+ engagement) + timeline risk (~3-6 months) before Aug 2 2026 deadline. Self-assess is feasible; notified body is overcorrection unless Yulia identifies specific sub-categories requiring it.

**Downstream impact:** Determines WU-58-16 (Annex IV technical file skeleton) scope + ownership. Does NOT block Aug 2 2026 critical path. Can be revisited after Yulia session — this lean is a defensible default that survives either Yulia answer.

**Manish decision:** [ ] accept (a) self-assess  [ ] (b) notified body  [ ] (c) mixed  [ ] defer post-Yulia ___________

**Manish note (optional):** _______________________________________________

---

## Decision 6: Encryption backfill priority

**Question (AC-58 Phase A audit line 297):** Encryption backfill priority — ship in Phase B (hygiene) OR park indefinitely (legacy XOR fallback works)?

**Options:**
- (a) Ship in AC-58 Phase B as hygiene work (WU-58-14 backfill + WU-58-15 retire fallback — small effort each)
- (b) Park indefinitely — legacy XOR fallback works for reads; new writes already AES-256-GCM

**chat-Claude lean:** (a) ship in Phase B.
**Why:** AC-58 Phase A surfaced major finding — messaging.ts already AES-256-GCM via `lib/encryption.ts` (132 lines proper Node crypto). Only backfill of legacy XOR-encrypted rows + retire `legacyXorDecrypt` fallback remain. Small effort + closes legacy code path cleanly + removes residual RODO at-rest exposure on legacy messages. Hygiene that pays back in code clarity and audit-defensibility.

**Downstream impact:** Closes AC-55 Category A WU-A5 (originally escalated to AC-58 per Day 31 commit 11). Does NOT block Aug 2 2026 critical path (legacy fallback satisfies "encrypted at rest" today). Sequencing flexibility — can ship after Wave 1 in any later Wave.

**Manish decision:** [ ] accept (a) ship in Phase B  [ ] (b) park indefinitely  [ ] override → ___________

**Manish note (optional):** _______________________________________________

---

## Decision 7: Worker contest flow (WU-58-4) priority

**Question (AC-58 Phase A audit line 298):** Worker contest flow (WU-58-4) priority — ship by Aug 2 OR within 30 days after (Art 22(3) is required but workers-initiated, gives buffer)?

**Options:**
- (a) Ship by Aug 2 2026 — full Art 22(3) compliance live at enforcement cutoff
- (b) Ship within 30 days after Aug 2 — Art 22(3) is worker-initiated so first-month gap is low-probability event; provides buffer for higher-priority pre-deployment items (Art 26(7) + Art 86 + Art 22 review queue)

**chat-Claude lean:** (b) within 30 days after Aug 2.
**Why:** Art 22(3) contest pathway is worker-initiated — workers must request it before the deadline matters. Probability of worker contest in first 30 days post-deadline is low (no pattern of historical worker contests in APATRIS today). Pre-deployment items (Art 26(7) notification + Art 22 review queue + Art 86 reasoning surface) MUST ship by Aug 2 — they apply on every AI decision automatically. Contest flow priority compression preserves engineering capacity for pre-deployment scope where the deadline pressure is harder.

**Downstream impact:** Reduces Aug 2 critical-path scope by 1 WU (WU-58-4 small). Reserves engineering capacity for WU-58-2 / WU-58-3 / WU-58-5 / WU-58-6 / WU-58-7 / WU-58-16 in the 11-week window.

**Manish decision:** [ ] accept (b) within 30 days after Aug 2  [ ] (a) ship by Aug 2  [ ] override → ___________

**Manish note (optional):** _______________________________________________

---

## After Manish ticks decisions

1. Apatris Claude commits decisions to ledger (atomic commit per "implement what you learn — corrections permanent immediately")
2. A (Yulia briefing letter draft) fires immediately using Decision 1 (timing) + Decision 3 (representative scope) as inputs
3. Decisions 4 + 5 surface as Yulia-session items (already in 9-item agenda); Manish revisits post-Yulia
4. Decisions 2 + 6 + 7 inform AC-58 Phase B Wave 1+ sequencing
5. Future-Claude reads this worksheet to know which decisions landed when — Section 0 Discipline #3 continuity preservation
