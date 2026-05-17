# AC-55 Deep Research — Phase 2: EEJ Comms Architecture Audit

**Date:** Day 31, 2026-05-14
**Scope:** EEJ (Euro Edu Jobs) codebase comms architecture inventory
**Phase:** 2 of 3 (Phase 1 APATRIS done at commit `3bec12e`; Phase 3 web research pending Manish approval)
**Sibling repo:** `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/`
**Companion doc:** `AC-55_Phase_1_APATRIS_Comms_Audit.md`

---

## Doctrine note (Day 31 corrected)

This audit follows the **audit + refine + bidirectional flow** doctrine (CLAUDE.md `### Cross-build feature decisions`, commit `0b0369a`):

> Both APATRIS and EEJ are Manish's companies. Cross-pollination is valid in both directions. We do not copy. We audit, then refine — if EEJ has a concept APATRIS lacks, we build a better version. If APATRIS already has something stronger, EEJ inherits the refinement.

So this Phase 2 doc is **not** "what to port from EEJ." It is "what concepts exist in EEJ that APATRIS lacks (refine inbound), and what concepts EEJ lacks that APATRIS could feed back (refine outbound)."

**Business-model filter applied:** EEJ is a job/recruitment platform; APATRIS is workforce compliance. Concepts touching EEJ-only domains (candidate placement, job application matching, agency invoicing, recruitment workflows) are out of scope.

---

## Per-concept findings (10 Phase 1 concepts + 1 unplanned)

| # | Concept | EEJ has? | Evidence | APATRIS gap? | Verdict |
|---|---|---|---|---|---|
| 1 | In-app chat / message threads | **No dedicated tables** — uses WhatsApp as primary | `whatsapp_messages` table only; no `messages` or `message_threads` schema found | APATRIS has `messages` + `message_threads` (stronger) | APATRIS leads — feed back outbound |
| 1.5 | **WebSocket broadcast spine (UNPLANNED)** | **Yes — exemplary** | `lib/websocket.ts` (50 lines): `WebSocketServer` on `/ws` + `broadcast(event, data)` + convenience fns (`broadcastWorkerUpdate`, `broadcastComplianceAlert`, `broadcastApplicationUpdate`, `broadcastNewNotification`) | APATRIS has no real-time WebSocket infrastructure | **EEJ leads — refine inbound (top priority)** |
| 2 | Broadcast / audience-targeting | Partial — WebSocket broadcast above, no explicit per-audience refine | `websocket.ts` broadcast is single-channel; no role-scoped filtering | APATRIS has implicit broadcast via push (per-tier) but no real-time fan-out | Refine inbound (combine WebSocket + APATRIS role-scoping) |
| 3a | Push notifications (web push / VAPID) | **No** — zero matches for `service-worker`, `VAPID`, `push_subscription` in EEJ | grep `vapid|service-worker|push_subscription` → 0 results | APATRIS has VAPID + push_subscriptions table | APATRIS leads — feed back outbound |
| 3b | AI worker-facing message generation | **Yes — solid pattern** | `services/communication.ts` (254 lines): Phase 4 Safe Communication + Approval. 3 message types (`worker_safe` / `internal_detailed` / `authority_formal`), AI drafts all 3, **human approves**, deterministic fallback if AI fails | APATRIS has AI drafters scattered; no unified 3-type-with-approval pattern | **EEJ leads — refine inbound** |
| 4 | No-response-fallback / silence-watcher | **No** | grep `silence|no.response|fallback.watcher` → 0 matches | APATRIS also lacks | Neither has — Phase 3 web research target |
| 5 | Multi-channel routing | **Yes — typed system** | `services/notification-engine.ts` (270 lines): explicit `NotificationChannel = "email" \| "sms" \| "whatsapp" \| "push" \| "internal_log"` + `NotificationPriority` (low/medium/high/critical) + `NotificationPayload` interface | APATRIS routes per-callsite; no central enum/router | **EEJ leads — refine inbound** |
| 6 | SMS | Listed in enum, no dedicated impl file | `NotificationChannel` includes "sms"; no `services/sms.ts` | APATRIS has no SMS either; only Twilio WhatsApp | Both gap — Phase 3 target |
| 7 | Encryption | **Yes — proper crypto** | `lib/encryption.ts` (109 lines): uses `EEJ_ENCRYPTION_KEY` env var, real AES via Node `crypto` module | APATRIS uses legacy XOR placeholder | **EEJ leads — refine inbound (security-critical)** |
| 8 | Per-tenant comms | **Yes — explicit multi-tenant pattern** | `services/whatsapp-webhook.ts` (137 lines): phone-to-tenant matching across all tenants; orphan fallback to `"production"` tenant | APATRIS has tenants but comms routing is single-tenant default | Refine inbound (worth adopting if APATRIS goes multi-tenant comms) |
| 9 | AI auto-flag detection (toxicity / safety) | **No** | grep `flag|toxic|moderation|safety.check` in comms paths → 0 matches | APATRIS also lacks | Neither has — Phase 3 target |
| 10 | Audit log for comms | **Yes** | `routes/audit.ts` exists; covers comms events | APATRIS has audit_logs table (parity) | Parity — no refinement needed |

### Bonus EEJ-only assets discovered

| Asset | Lines | Notes |
|---|---|---|
| `services/whatsapp-drafter.ts` | 130 | Trigger enum: `application_received` / `permit_update` / `payment_reminder` / `expiry_nudge` / `manual` / `inbound_reply` / `system`. APATRIS-relevant triggers: permit_update, expiry_nudge |
| `services/whatsapp-drafter.test.ts` | 190 | EEJ has **tested** WhatsApp drafter; APATRIS has no comms test coverage |
| `services/whatsapp-webhook.ts` | 137 | Twilio inbound webhook with `X-Twilio-Signature` auth + idempotency via partial unique index |

---

## Headline synthesis

**EEJ leads on 4 concepts worth refining inbound to APATRIS:**

1. **WebSocket broadcast spine** (`lib/websocket.ts`, 50 lines) — Most surprising find. Phase 1 didn't predict this. Solves real-time + broadcast in one primitive. Right architecture for live compliance alerts, GPS check-in fan-out, payroll commit notifications.

2. **3-type AI message with approval gate** (`services/communication.ts`, 254 lines) — Solid pattern: worker_safe / internal_detailed / authority_formal, AI drafts all three, human approves before send, deterministic fallback if AI fails. APATRIS has scattered AI drafters; this consolidates the pattern with a built-in safety gate.

3. **Typed NotificationChannel/Priority/Payload system** (`services/notification-engine.ts`, 270 lines) — Central enum with SMS in scope. APATRIS routes per-callsite; this would replace 50+ scattered notification call sites with one router.

4. **Proper encryption** (`lib/encryption.ts`, 109 lines) — Real AES crypto via Node `crypto`. APATRIS XOR placeholder is a latent security issue.

**APATRIS leads on 2 concepts worth feeding back outbound to EEJ:**

1. **In-app message threads** — APATRIS has `messages` + `message_threads` tables; EEJ relies entirely on WhatsApp. Internal threading is stronger for compliance audit trail.

2. **Web push infrastructure** — APATRIS has VAPID + `push_subscriptions` table + service worker; EEJ has zero. Inbound EEJ refinement of WebSocket + outbound APATRIS refinement of push = complementary architecture both sides should have.

**Neither side has (Phase 3 web research targets):**

- No-response-fallback / silence-watcher pattern
- AI auto-flag toxicity/safety detection
- Dedicated SMS implementation (both have it in plans, neither built)

---

## Surprising findings vs Phase 1 predictions

Phase 1 (APATRIS audit) predicted EEJ would have stronger **WhatsApp infrastructure** (correct) and **AI message generation** (correct).

Phase 1 did **not** predict:

- **WebSocket spine** — EEJ solves real-time differently than APATRIS (APATRIS = polling + push; EEJ = WebSocket + WhatsApp). This is an architectural divergence, not a feature gap.
- **EEJ's approval gate built into AI generation** — Phase 1 expected scattered drafters on both sides; EEJ has consolidated 3-type + human-approval at the service layer.
- **EEJ has no push infrastructure at all** — Phase 1 assumed EEJ would have at least basic web push. They went WebSocket + WhatsApp instead. So APATRIS's push stack is unique-strong, not duplicate.

---

## Anti-hallucination caveats

- Investigation used `grep` + `glob` across EEJ tree; line counts via `wc -l`. No EEJ code was modified or executed.
- "Zero matches" verdicts (concepts 3a, 4, 9) reflect what `grep` found in obvious paths — there may be edge-case implementations I missed. Confidence: high but not absolute.
- Concept 2 (broadcast/audience-targeting): EEJ's `broadcast()` is single-channel; I did not exhaustively check if convenience functions like `broadcastComplianceAlert` filter by role internally. Worth re-inspecting before Phase B build.
- EEJ test coverage claim (190-line drafter test) is line count only — I did not read test contents to verify what it actually covers.
- Out-of-scope filter applied my judgment about EEJ-only business domains — Manish should sanity-check that I didn't accidentally skip a generic pattern hiding in a recruitment-named file.

---

## Phase 3 web research input — what to specifically target

Given the APATRIS + EEJ baseline, Phase 3 web research should investigate:

1. **WebSocket vs Push tradeoffs at workforce scale** — How do Beekeeper, Workvivo, Slack-for-workforce handle real-time messaging? Combined WebSocket + Push, or one or the other? When does each win?

2. **AI message approval workflows in regulated industries** — EEJ has 3-type-with-approval. Industry standard? Common pitfalls? What approval gates do healthcare / legal / financial-services comms platforms use?

3. **Polish/EU regulatory specifics for worker-facing comms** — GDPR-compliant message retention, RODO consent for AI-drafted comms to workers, EU Posted Workers Directive notification requirements. Both EEJ and APATRIS may have gaps here.

4. **Silence-watcher / no-response-fallback patterns** — Neither codebase has this. What do industry tools (PagerDuty, Opsgenie, healthcare on-call systems) do for "message sent, no acknowledgement in N hours, escalate"?

5. **AI auto-flag / moderation for workforce comms** — Neither side has it. What do consumer-grade tools (WhatsApp Business, Twilio's content moderation) offer that workforce apps could adopt?

6. **Multi-channel router patterns in production** — EEJ has typed `NotificationChannel`; how do mature platforms handle channel preference per-user, fallback chains, channel-specific rate limits?

---

## Status

- **Phase 2 complete** — APATRIS + EEJ baselines now in hand
- **Awaiting Manish approval for Phase 3** — web competitive research scoped above
- **After Phase 3:** synthesis into architecture recommendations + AC reframing + Phase B buildable plan for AC-55's 5 capability streams
