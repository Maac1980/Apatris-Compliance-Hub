# AC-55 Architecture Synthesis & Phase B Buildable Plan

**Date:** Day 31, 2026-05-17
**Status:** 3-phase deep research closed — architecture decisions surfaced + Phase B work units mapped
**Source docs:**
- Phase 1 APATRIS audit — `AC-55_Phase_1_APATRIS_Comms_Audit.md` (commit `3bec12e`)
- Phase 2 EEJ audit — `AC-55_Phase_2_EEJ_Comms_Audit.md` (commit `9de9371`)
- Phase 3 web competitive + regulatory — `AC-55_Phase_3_Web_Competitive_Research.md` (commit `8d2e1cd`)
- Ledger updates — AC-58 capture + AC-55 reshape + AC-39 regulatory zone (commit `976e2f6`)

---

## Section 1 — Executive synthesis

APATRIS has rich comms primitives (push + email + WhatsApp + in-app threads + audit log) but no integration spine; EEJ has the spine (WebSocket + typed channel router + 3-tier AI with approval gate) but lacks APATRIS's push stack and in-app threading. Industry validates the **hybrid Push (asynchronous) + WebSocket (in-session) architecture** as standard for mobile workforce comms, and treats **3-tier AI message classification with structurally-visible audit trail** as the canon for regulated industries. Cross-pollination is the architecture: APATRIS push + EEJ WebSocket combine into the transport spine; EEJ's 3-tier AI pattern refines inbound to APATRIS; both sides gain a missing preference center; APATRIS uses Claude in-house for moderation v1; silence-watcher is dropped because no industry precedent exists and GDPR Article 22 makes auto-AI-reply-on-silence high-risk. The reshape is bounded by one hard deadline: **EU AI Act Article 6 + Annex III + Article 26(7) + Article 86 enforce on 2 August 2026** — approximately 11 weeks from today — with fines up to €15M or 3% global turnover. That deadline reshuffles priority: AC-58 compliance scaffolding (the regulatory layer) precedes substantive AC-55 build work, because every AI-message category in AC-55 except the pure transport spine touches Article 22 / 26(7) / 86 hooks and cannot ship cleanly without them.

---

## Section 2 — Architecture: 5 refined categories with cross-build flow

### Category A — Transport spine (hybrid Push + WebSocket + typed channel router + cascade)

| Aspect | Detail |
|---|---|
| **Origin** | Phase 3 industry-standard pattern; cross-build refinement |
| **APATRIS state** | Push BUILT (push_subscriptions + VAPID + push-sender.service.ts); polling-based message arrival on MessagingTab.tsx:31; no WebSocket; per-callsite channel routing (no central router) |
| **EEJ state** | WebSocket BUILT (lib/websocket.ts:50 lines, broadcast() + 4 convenience fns); typed NotificationChannel router BUILT (notification-engine.ts:270 lines, "email"|"sms"|"whatsapp"|"push"|"internal_log"); no push infrastructure |
| **Industry pattern** | Hybrid Push + WebSocket: push re-engages closed/backgrounded users → WebSocket for in-session real-time. Battery efficiency demands push for async; WebSocket for two-way interaction. (Curiosum, dev.to, IEEE sources from Phase 3) |
| **Refined architecture** | (1) Refine inbound EEJ WebSocket spine to APATRIS — add `lib/websocket.ts` + `/ws` endpoint + broadcast fns. (2) Refine inbound EEJ typed channel router — replace per-callsite WhatsApp/email/push calls with central router. (3) Wire message-arrival → push trigger (kill 5s polling). (4) Add cascade-fallback semantics (primary fails → fallback channel per Twilio pattern). (5) Worker preference center feeds channel selection. |
| **Phase B work units** | WU-A1 (small): add `lib/websocket.ts` to APATRIS modeled on EEJ; WU-A2 (medium): add typed `NotificationChannel` enum + central router service modeled on EEJ; WU-A3 (medium): wire MessagingTab to push-on-arrival (replace polling); WU-A4 (medium): add cascade-fallback semantics; WU-A5 (small): proper crypto replacing legacy XOR for messages (EEJ encryption.ts pattern) |
| **Flow-back to EEJ** | Outbound — APATRIS push stack (VAPID + push_subscriptions + service worker) refined to EEJ once stable; in-app `messages` + `message_threads` schema flows back to EEJ (currently WhatsApp-only with no audit trail) |

### Category B — AI gen + approval (3-tier UX + audit trail)

| Aspect | Detail |
|---|---|
| **Origin** | EEJ 3-type service + Phase 3 regulated-industry canon |
| **APATRIS state** | Scattered AI drafters across 46+ call sites (Day 30 AC-44 audit); no central approval queue; no per-message audit UI surface; AI Provider abstraction exists (services/ai/provider.ts) but not wired to comms |
| **EEJ state** | services/communication.ts (254 lines): 3 message types (worker_safe / internal_detailed / authority_formal), AI drafts all 3, human approves, deterministic fallback if AI fails. Service-layer pattern; no UI audit surface documented |
| **Industry pattern** | Audit trail "cannot live only in a database; it has to be structurally visible in the interface." Override paths first-class. Audit logs per-event (recommendation/action/approval/rejection/escalation/override). (Fuselab, Domino, Trussed sources from Phase 3) |
| **Refined architecture** | Refine inbound EEJ 3-type pattern + add what EEJ lacks: (a) per-message audit-UI surface (Fuselab requirement: structurally visible, not DB-only), (b) tier-tagged routing (Tier 5 worker / Tier 2-4 internal / external authority), (c) GDPR Art 22 human-intervention surface integrated (handled via Category D / AC-58 hooks). |
| **Phase B work units** | WU-B1 (medium): port + adapt EEJ communication.ts service to APATRIS with APATRIS tier model (T1-T5); WU-B2 (medium): build approval queue UI surface (T2/T3/T4 review queue per message); WU-B3 (small): per-message audit log row with WHO approved + WHEN + EDIT_DIFF; WU-B4 (small): override-path UI (first-class reject + reroute); WU-B5 (medium): integrate AC-58 Art 22 review record + Art 86 reasoning surface per message |
| **Flow-back to EEJ** | Outbound — the UI audit-surface refinement (Fuselab pattern) flows back to EEJ which has the service-layer pattern but not the structurally-visible UI |

### Category C — Preference center (per-user × per-channel × per-message-type)

| Aspect | Detail |
|---|---|
| **Origin** | Phase 3 industry convergence (OneSignal, Knock, Courier, MagicBell, SuprSend all align) |
| **APATRIS state** | Per-worker push subscription only (global enable/disable). No per-message-type × per-channel preferences. No quiet hours. No digest mode. AC-43 audit referenced a worker_comms_preferences table — not yet present in init-db.ts |
| **EEJ state** | Typed NotificationChannel enum exists but no per-user preference center documented |
| **Industry pattern** | Per-user × per-message-type × per-channel grid; quiet hours; digest mode; priority levels. Workforce platforms (Shyft) expose granular controls. (OneSignal, Knock, Courier, MagicBell, Shyft sources from Phase 3) |
| **Refined architecture** | Net-new for both sides. Build minimal v1: `worker_comms_preferences` table (worker_id × message_type × channel × enabled + quiet_hours_start/end + digest_mode). Refine v2 with per-tier-default templates. |
| **Phase B work units** | WU-C1 (medium): schema design + `worker_comms_preferences` table; WU-C2 (medium): preference-aware routing in central channel router (Category A WU-A2); WU-C3 (medium): worker UI in ProfileTab/Settings for preference editing (PL/EN bilingual per Tier-1 doctrine); WU-C4 (small): default preference templates per tier (T1 / T2-T4 / T5); WU-C5 (small): quiet-hours + digest scheduler integration |
| **Flow-back to EEJ** | Outbound — once APATRIS preference center proves out, refine inbound to EEJ (both sides currently lack it) |

### Category D — Regulatory scaffolding (handled by AC-58 — this category integrates the hooks)

| Aspect | Detail |
|---|---|
| **Origin** | Phase 3 EU AI Act + GDPR Art 22 + Kodeks pracy 2026 + Posted Workers Directive findings |
| **APATRIS state** | No GDPR Art 22 review surface; no AI Act Art 26(7) pre-deployment notification flow; no Art 86 reasoning surface; partial Posted Workers PIP notification (per Phase 1); AC-39 Wave 1 leave-request flow shipped Day 30 in newly-regulated zone per Kodeks pracy 2026 |
| **EEJ state** | EEJ has proper AES encryption (encryption.ts:109 lines) — security baseline stronger than APATRIS XOR. No Art 22 / 26(7) / 86 hooks documented |
| **Industry pattern** | Mandatory per EU AI Act for high-risk AI in employment context. SCHUFA judgment closes the "rubber-stamp human review" loophole. 2 August 2026 enforcement; €15M / 3% global turnover fines. (GDPR, EU AI Act, Posted Workers Directive sources from Phase 3) |
| **Refined architecture** | Owned by AC-58 separately. AC-55 Category D = integration points: (a) AC-55 messaging service calls AC-58 Art 22 review check before send for "significantly affecting" messages, (b) AC-55 first-AI-message-to-worker flow calls AC-58 Art 26(7) notification + acknowledgement record, (c) AC-55 per-message UI surfaces AC-58 Art 86 reasoning string. |
| **Phase B work units** | OWNED BY AC-58 — see AC-58 Phase A audit (separate doc, pending). Category D in AC-55 = thin integration shims that depend on AC-58 surface contracts being defined first. |
| **Flow-back to EEJ** | Outbound — EU AI Act applies to EEJ equally; AC-58 scaffolding flows back to EEJ. EEJ's encryption pattern flows inbound to APATRIS via AC-58 (security-critical). |

### Category E — Moderation (in-house Claude-based; defer third-party)

| Aspect | Detail |
|---|---|
| **Origin** | Phase 3 industry trend + APATRIS Claude-in-stack pragmatism |
| **APATRIS state** | Zero moderation. Claude Sonnet 4.6 already in stack with 50+ call sites |
| **EEJ state** | Zero moderation. No `flag|toxic|moderation|safety` grep matches |
| **Industry pattern** | Hybrid AI-human dominant: AI scans + risk-scores + flags; humans handle edge cases. By 2026, AI moderation is core feature of every major enterprise community platform; market >$5B. Third-party APIs (Spectrum Labs, Cometchat, Foiwe, Getmaxim) common but not required at small scale. (Bevy, GetStream, Mixpeek, Conectys sources from Phase 3) |
| **Refined architecture** | v1 in-house: call Claude with structured "classify worker message for harassment/escalation/concern" prompt; route flagged → T1/T2 review queue (reuse Category B approval queue). v2 deferred: third-party guardrail integration once volume justifies (>10K msgs/day). |
| **Phase B work units** | WU-E1 (small): moderation prompt design + Claude integration; WU-E2 (small): risk-score schema (`message_moderation_log` table); WU-E3 (small): flag → T1/T2 review-queue routing via Category B approval surface; WU-E4 (small): tests for prompt + classifier behavior |
| **Flow-back to EEJ** | Outbound — once stable, the moderation pattern flows back to EEJ which also lacks moderation |

---

## Section 3 — AC-58 compliance scaffolding sequencing

**Question:** Sequential (AC-58 first, AC-55 after) or parallel (both Phase B simultaneously)?

### Analysis

**AC-58 Phase B scope (rough estimate, pre-Phase-A):**
- Art 22 human-review record schema + UI ("request human review" + "contest")
- Art 26(7) worker pre-deployment notification template + delivery + acknowledgement record
- Art 86 per-message reasoning surface schema + UI string render
- Posted Workers Directive PIP notification automation hook
- Kodeks pracy 2026 leave-request audit trail upgrade (integrity + identifiability)
- High-risk AI classification audit doc (which APATRIS AI use cases trigger Annex III)
- Art 12 log retention (6+ months) verification across all AI services
- Encryption upgrade from XOR to proper AES (refine inbound EEJ encryption.ts)

Rough effort: **medium-to-large**, ~3-5 Phase B Waves.

**AC-55 categories that ARE compliance touchpoints:**
- Category B (AI gen + approval) — every Art 22 / 26(7) / 86 hook touches here
- Category C (Preference center) — Art 22 consent semantics + Posted Workers written-info preferences
- Category D (Regulatory scaffolding) — entirely AC-58 dependent by definition
- Category E (Moderation) — Art 12 log retention + Art 86 explainability for moderation decisions

**AC-55 category that is content-agnostic:**
- Category A (Transport spine) — Push + WebSocket + typed router + cascade are content-neutral; can ship before AC-58 surface contracts are defined

### Recommendation

**Three-phase sequencing:**

1. **PHASE I — AC-58 Phase A audit + Yulia session (1 work block, blocking).** Cannot define AC-58 Phase B surface contracts without Polish radca prawny input on Art 22 interpretation, Art 26(7) notification text, Kodeks pracy 2026 audit-trail specifics. Phase A audit + Yulia briefing produce AC-58 surface-contract spec.

2. **PHASE II — AC-58 + AC-55 Category A in parallel (multi-work-block).** AC-58 builds compliance hooks against the surface contracts from Phase I. AC-55 Category A (Transport spine, WU-A1-A5) builds content-neutral infrastructure simultaneously — different files, different work units, no cross-dependency. Both ship before substantive AI-message work.

3. **PHASE III — AC-55 Categories B/C/D/E integrate AC-58 hooks (sequential or fan-out).** Once AC-58 hooks exist and Category A transport spine is live, the remaining AC-55 categories build against both. Category D is the thinnest (integration shims only). Categories B + C + E ship in waves with AC-58 hooks consumed.

**Why not strict sequential (AC-58 → all AC-55):** wastes the content-neutral Category A work that doesn't depend on AC-58.

**Why not full parallel (everything at once):** Categories B/C/D/E need AC-58 surface contracts to land; building them without contracts means rework when contracts change.

**Recommended sequencing is conservative on the regulatory side (Yulia gates surface contracts) and parallel on the safe side (content-neutral transport spine ships alongside compliance scaffolding).**

---

## Section 4 — Phase B work unit map

### Category A — Transport spine
| ID | Description | Files / touch points | Dependencies | Effort | Reg checkpoint |
|---|---|---|---|---|---|
| WU-A1 | Add `lib/websocket.ts` modeled on EEJ pattern | `artifacts/api-server/src/lib/websocket.ts` (new); `index.ts` wireup | none | small | none |
| WU-A2 | Typed `NotificationChannel` enum + central router service | `artifacts/api-server/src/services/notification-router.service.ts` (new); refactor 10+ WhatsApp call sites + 10+ notification call sites | WU-A1 (broadcast hook integration) | medium | none |
| WU-A3 | Wire message-arrival → push trigger; replace 5s polling | `messaging.ts` POST handler; `push-sender.service.ts`; `MessagingTab.tsx:31` (remove polling) | WU-A1 + WU-A2 | medium | none |
| WU-A4 | Cascade-fallback semantics (primary → fallback chain) | `services/notification-router.service.ts` extension | WU-A2 | medium | none |
| WU-A5 | Proper crypto replacing XOR for messages | `lib/messageCrypto.ts` (new, model on EEJ encryption.ts); `messaging.ts` decrypt path | none | small | RODO at-rest ✓ |

### Category B — AI gen + approval
| ID | Description | Files / touch points | Dependencies | Effort | Reg checkpoint |
|---|---|---|---|---|---|
| WU-B1 | Port + adapt EEJ communication.ts to APATRIS tier model | `services/ai-communication.service.ts` (new); call AC-44 internal-ai + AC-43 worker-facing-ai registries | AC-44 + AC-43 Phase B; AC-58 surface contracts | medium | Art 22 ✓ |
| WU-B2 | Approval queue UI surface (T2-T4 review per message) | new dashboard route + queue component; per-message detail panel | WU-B1 | medium | Art 22 + Art 86 ✓ |
| WU-B3 | Per-message audit log row | `init-db.ts` new `message_approval_log` table; service write path | WU-B1 | small | Art 12 retention ✓ |
| WU-B4 | Override-path UI (first-class reject + reroute) | approval queue UI extension | WU-B2 | small | Art 22 ✓ |
| WU-B5 | Integrate AC-58 Art 22 review record + Art 86 reasoning per message | thin shim layer over WU-B1 | AC-58 Phase B WU-58-3 (Art 22) + WU-58-4 (Art 86) — see AC-58 doc when scoped | medium | Art 22 + Art 86 ✓ |

### Category C — Preference center
| ID | Description | Files / touch points | Dependencies | Effort | Reg checkpoint |
|---|---|---|---|---|---|
| WU-C1 | Schema design + `worker_comms_preferences` table | `init-db.ts` new table | none | medium | Posted Workers written-info ✓ |
| WU-C2 | Preference-aware routing in channel router | extend WU-A2 router service | WU-A2 + WU-C1 | medium | Art 22 consent ✓ |
| WU-C3 | Worker UI in ProfileTab/Settings (bilingual PL/EN) | `ProfileTab.tsx` extension; `pl.json` + `en.json` keys | WU-C1 | medium | RODO consent UX ✓ |
| WU-C4 | Default preference templates per tier (T1 / T2-T4 / T5) | seed data in `init-db.ts` | WU-C1 | small | none |
| WU-C5 | Quiet-hours + digest scheduler integration | `services/scheduler/notification-digest.cron.ts` (new) | WU-C1 + WU-A2 | small | none |

### Category D — Regulatory scaffolding integration (depends on AC-58)
| ID | Description | Files / touch points | Dependencies | Effort | Reg checkpoint |
|---|---|---|---|---|---|
| WU-D1 | Integration shim — AC-55 send path calls AC-58 Art 22 check | hook in WU-B1 service | AC-58 surface contracts | small | Art 22 ✓ |
| WU-D2 | Integration shim — first AI-message-to-worker triggers AC-58 Art 26(7) notification | hook in WU-B1 service | AC-58 Phase B notification template | small | Art 26(7) ✓ |
| WU-D3 | Integration shim — per-message UI renders AC-58 Art 86 reasoning string | hook in WU-B2 UI | AC-58 reasoning surface | small | Art 86 ✓ |

### Category E — Moderation
| ID | Description | Files / touch points | Dependencies | Effort | Reg checkpoint |
|---|---|---|---|---|---|
| WU-E1 | Moderation prompt design + Claude integration | `services/ai/moderation.service.ts` (new) | none | small | Art 86 (explain flag) ✓ |
| WU-E2 | Risk-score schema (`message_moderation_log` table) | `init-db.ts` new table | none | small | Art 12 retention ✓ |
| WU-E3 | Flag → T1/T2 review queue via Category B approval surface | hook in WU-B2 queue UI | WU-B2 + WU-E1 | small | Art 22 (review) ✓ |
| WU-E4 | Tests for prompt + classifier behavior | vitest test file | WU-E1 | small | none |

**Total Phase B work units: 22 (5+5+5+3+4).** Effort split: 16 small, 6 medium, 0 large.

---

## Section 5 — Cross-AC dependency map

| AC | Title | AC-55 relation | Blocked by | Blocks |
|---|---|---|---|---|
| AC-39 | Worker Leave tab improvements | None directly; AC-39 Wave 1 (shipped v304 Day 30) is in Kodeks pracy 2026 regulated zone — needs AC-58 hook for audit trail upgrade | AC-58 Phase A audit + Yulia | AC-58 leave-request audit trail WU |
| AC-40 | MessagingTab fix | Operationally complete via AC-56 Wave 1 v306; receiverId fix is foundation for AC-55 Category A (transport spine) | none | none |
| AC-43 | Worker-facing AI registry | AC-55 Category B WU-B1 calls AC-43 worker-facing-ai registry | AC-43 Phase A audit; Yulia consent text | AC-55 WU-B1 |
| AC-44 | Internal AI orchestration registry | AC-55 Category B WU-B1 calls AC-44 internal-ai registry; AC-55 Category A WU-A4 cascade fallback may reuse AC-44 patterns | AC-44 Phase A audit | AC-55 WU-B1 |
| AC-45 | Client-facing AI registry / Tier 3 approval | AC-55 Category B WU-B2 approval queue surfaces Tier 3 approval; Yulia rules required | AC-45 Phase A audit; Yulia Tier 3 approval rules | AC-55 WU-B2 |
| AC-46 | Worker issue/complaint engine | AC-55 Category B + Category E both surface in worker issue context; AC-57 Help tab likely consumes both | AC-46 Phase A audit | AC-55 WU-B + WU-E in Help-tab integration |
| AC-49 | ClientContact data processing | AC-55 Category C preference center may extend to ClientContact-level (B2B); Yulia consent | AC-49 Phase A audit; Yulia consent | AC-55 WU-C1 schema decision (worker-only vs worker+contact) |
| **AC-55** | **APATRIS Communication System** | **(this doc)** | **AC-58 Phase A + Yulia (for B/C/D/E); none for Category A** | **AC-57 Help tab build** |
| **AC-58** | **EU AI Act + GDPR Art 22 + Kodeks pracy 2026 compliance scaffolding** | **AC-55 Categories B/C/D/E all integrate AC-58 hooks** | **Yulia legal-input session** | **AC-55 Categories B/C/D/E + AC-39 Wave 2 + AC-43 + AC-44 + AC-45 + AC-46 + AC-49 — every AI-feature ship** |

**Critical-path read:**

```
Yulia legal-input session (9 items)
    ↓
AC-58 Phase A audit (defines surface contracts)
    ↓
[PHASE II — PARALLEL]
    ├─→ AC-58 Phase B (compliance hooks)
    └─→ AC-55 Category A (transport spine WU-A1-A5)
    ↓
[PHASE III — INTEGRATED]
    ├─→ AC-55 Category B (depends on AC-58 + AC-43/AC-44/AC-45 registries)
    ├─→ AC-55 Category C (preference center; depends on AC-58 consent semantics)
    ├─→ AC-55 Category D (thin shims; depends on AC-58 surface contracts)
    └─→ AC-55 Category E (moderation; depends on AC-58 Art 12 + Art 86)
    ↓
AC-57 Help tab build (integrates AC-55 + AC-46)
```

---

## Section 6 — Yulia legal-input briefing (9 items finalized)

Single batched session. Per item: 1-line context + decision needed.

| # | AC | Item | Context | Decision needed from Yulia |
|---|---|---|---|---|
| 1 | AC-50 | Penalty engine | Worker-affecting penalties; Polish labor-law boundaries | Which penalty rules are legally enforceable in Polish workforce context? Cite Kodeks pracy article + max amounts |
| 2 | AC-39 | Leave-request cutoffs (Kodeks pracy 2026 compliance) | AC-39 Wave 1 shipped Day 30; Kodeks pracy Jan 27 2026 amendments require integrity + identifiability + RODO for electronic form | Verify Wave 1 implementation meets *postać elektroniczna* standard; identify gaps for Wave 2 |
| 3 | AC-41 | No-show penalty | Worker no-show financial penalty (deducted from payroll) | Legally enforceable in Polish context? What disclosure + consent required? |
| 4 | AC-43 | Consent text for AI worker-facing messages | First contact AI-message to worker requires RODO + EU AI Act Art 26(7) consent | Draft consent text in PL (authoritative) + EN (bridge); specify exact wording per Yulia precedent |
| 5 | AC-43 | Sensitive messages — Tier 3 approval rules | Which AI-generated worker message categories require Tier 3 (legal head) approval vs Tier 2 (coordinator)? | Categorize sensitivity tiers with examples |
| 6 | AC-42 | Penalty rules per work category | Penalty rules differ by Umowa Zlecenie / O Pracę / B2B contract type | Which penalty types are valid per contract type? Cite legal basis |
| 7 | AC-49 | ClientContact data processing consent | B2B contact (client-side person) data processing under RODO | What consent + lawful basis for client-contact data? Different from worker consent? |
| 8 | AC-45 | Tier 3 client-facing approval rules | Client-facing AI message (B2B context) approval gating | When does Tier 3 (legal head) review trigger vs Tier 2 (coordinator) for client comms? |
| 9 | **AC-58** | **EU AI Act + GDPR Art 22 + Posted Workers Directive + Kodeks pracy 2026 compliance scaffolding** | **HARD DEADLINE 2 August 2026 — full high-risk AI obligations enforce. Fines up to €15M or 3% global turnover. APATRIS uses high-risk AI extensively in worker-facing flows.** | **(a) Which APATRIS AI use cases trigger Annex III high-risk classification? (b) Art 22 meaningful-human-review specifics (per-message vs per-template)? (c) Art 26(7) pre-deployment notification text (PL authoritative + EN bridge)? (d) Art 86 reasoning surface — required granularity? (e) Posted Workers PIP notification automation — what format does PIP accept? (f) Kodeks pracy 2026 leave-request integrity + identifiability — specific evidence required?** |

**Session structure recommendation:** open with item 9 (AC-58 — hard deadline + broadest scope), then items 2 + 4 + 5 (interconnected with AC-58), then items 1 + 3 + 6 (penalty cluster), then items 7 + 8 (B2B cluster). Single batched session; deliverable = decisions doc + draft consent texts.

---

## Section 7 — Anti-hallucination caveats + open questions

### Speculative claims in this synthesis (flagged)

- **"Approximately 11 weeks from today"** to 2 August 2026 — arithmetic from today (2026-05-17) only; assumes deadline holds (cross-checked via 2 Phase 3 sources, not primary Regulation 2024/1689 text).
- **"22 Phase B work units" + effort split (16 small / 6 medium)** — estimates pre-Phase-A. Real numbers shift after AC-58 Phase A audit + Yulia surface-contract decisions.
- **"AC-58 Phase B scope rough estimate, ~3-5 Phase B Waves"** — pre-Phase-A guess. Real scope depends on Yulia surface contracts + APATRIS Annex III audit results.
- **Cross-build flow-back directions** — recommended flow assumes EEJ welcomes APATRIS refinements (push + in-app threading + approval-UI surface). Manish operator-call required to confirm EEJ engineering capacity for inbound flow.
- **Category E moderation "in-house Claude v1, defer third-party"** — depends on Claude prompt accuracy at APATRIS-relevant content scale; if false-positive rate too high, third-party becomes Phase B Wave 2.
- **"AC-57 Help tab build downstream of AC-55"** — AC-57 may reframe entirely under AC-55 umbrella per AC-57 ledger row; this synthesis treats them as separate but coupled.
- **Silence-watcher drop is permanent decision unless Manish overrules.** This synthesis treats it as scope-out; can be re-captured as separate AC if Phase 3's "novel design + Art 22 risk" judgment is overridden.

### Open questions for Manish (architect calls in next prompt)

1. **AC-58 sequencing acceptance** — does Manish accept the 3-phase recommendation (Yulia → AC-58+CategoryA parallel → rest integrated)? Or alternative ordering?
2. **Phase B Wave 1 starting point** — Category A WU-A1 (WebSocket primitive) is the smallest unblocking unit; ship as first Phase B Wave 1 once AC-58 Phase A audit kicks off?
3. **Yulia session timing** — when does the batched 9-item session land? AC-58 Phase A audit cannot define surface contracts without it; everything downstream blocks.
4. **AC-57 Help tab reframe decision** — does AC-57 collapse under AC-55 (single umbrella) or stay parallel (separate AC with AC-55 dependency)?
5. **Cross-build flow-back priority** — do APATRIS-refined patterns ship to EEJ immediately (as separate EEJ work) or batch for later? Out-of-scope for AC-55 Phase B but worth deciding.
6. **Silence-watcher final verdict** — Manish-decision to permanently drop, or re-capture as separate AC (or "Phase 3 said no industry pattern + Art 22 risk" suffices as drop justification)?
7. **Encryption upgrade (WU-A5) urgency** — XOR → AES refinement: ship in AC-55 Category A Phase B Wave 1 (small unit), or escalate to AC-58 as security-critical sub-item?

### Open questions for Yulia (during legal-input session)

(Already enumerated in Section 6 per-item "Decision needed" column. Summary: Annex III classification audit, Art 22 review specifics, Art 26(7) consent text PL+EN, Art 86 reasoning granularity, PIP automation format, Kodeks pracy 2026 integrity-evidence requirements, plus 6 narrower items per AC.)

---

## Status

- **3-phase deep research closed** — Phase 1 + Phase 2 + Phase 3 docs + this synthesis = full architecture pack
- **AC-58 captured URGENT** (ledger commit `976e2f6`) — first URGENT in ledger; 2 Aug 2026 enforcement deadline
- **AC-55 reshaped** to 5 categories with cross-build flow + Phase B work unit map (ledger commit `976e2f6`)
- **AC-39 flagged** as in Kodeks pracy 2026 regulated zone (ledger commit `976e2f6`)
- **Yulia legal-input session briefing finalized** (9 items, session structure recommended)
- **Ready for Manish architect calls** on 7 open questions (Section 7)
- **Next concrete unit:** AC-58 Phase A audit (separate prompt after Manish decisions on open questions)
- **Hard Boundaries respected** — no code, no schema, no deploy in this commit; architecture decisions are recommendations, not commitments
