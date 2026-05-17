# AC-55 Phase 1 — APATRIS Communication Infrastructure Audit

**Date:** 2026-05-17 (Day 31)
**Scope:** Phase 1 of 3-phase AC-55 deep research. APATRIS codebase only. No EEJ access in this phase. No web research.
**APATRIS HEAD at audit:** `46bd4af`
**Phase position:** **PHASE 1 / 3** — Phase 2 (EEJ audit) + Phase 3 (competitive web research) gated on Manish approval.

---

## Per-surface inventory (8 surfaces)

| # | Surface | Status | File:line evidence | Cross-AC owner | Vision-spec gap |
|---|---|---|---|---|---|
| 1 | **Messaging** (worker ↔ coordinator/admin) | BUILT + OPERATIONAL (post Day 31 ships) | 5 routes: messaging.ts:37, 56, 100, 124, 134. Schemas: init-db.ts:1632 `messages` + 1651 `message_threads`. Encryption: XOR (`legacyXorDecrypt` per AC-40 audit). Polling: 5s per MessagingTab.tsx:31. Reachable across 5 tiers post AC-56 Wave 1. | AC-40 + AC-56 + AC-55 | Vision: AI assistant inside chat (absent); voice notes (absent); categorized issue reporting (absent); push-driven delivery (absent — only polling) |
| 2 | **Notifications** (system → user) | BUILT + OPERATIONAL | `notification_log` table at init-db.ts:867 (denormalized: worker_id TEXT not UUID; channel TEXT + recipient + message_preview + status). 3 route files: notifications.ts (3 endpoints lines 14/21/28) + legal-notifications.ts (2 endpoints lines 13/29) + posted-notifications.ts (5+ endpoints). | AC-44 + AC-55 | Vision: AI-generated notification content (rule-based today); per-channel routing logic (channel field exists but no routing service); cross-tier read state separation (none) |
| 3 | **Push** (web/mobile push) | BUILT BUT VAPID-DEPENDENT | `push_subscriptions` table at init-db.ts:540 (worker_name + endpoint + p256dh + auth keys + user_agent). 2 routes: push.ts:9 `/push/vapid-key` + 18 `/push/subscribe`. `services/push-sender.service.ts` (uses fetch, no web-push dependency, falls back gracefully if VAPID not configured). Service worker registration: workforce-app/src/main.tsx. | AC-43 + AC-55 | Vision: push triggered by message arrival (absent — MessagingTab uses 5s polling, not push); push triggered by AI auto-flag events (absent); per-worker push preferences (absent — global subscribe only) |
| 4 | **Email** (transactional + alerts) | BUILT + OPERATIONAL | `lib/mailer.ts` (nodemailer + Brevo SMTP at smtp-relay.brevo.com per CLAUDE.md). `isMailConfigured()` guard. `AlertEmailPayload` interface defined. Used by 10+ route files: trc-service / certified-signatures / workers / invoices / reports / case-doc-generator / payroll / face-auth / scheduler. | AC-44 (operator-facing) | Vision: AI-composed email content (absent — templates likely hardcoded); broadcast email to audience (absent — point-to-point only); auto-trigger-on-pattern (absent) |
| 5 | **SMS** (transactional + alerts) | ABSENT | No `lib/sms.ts` or `services/sms*` file exists. Twilio SDK is present (via WhatsApp dep). No `sendSMS\|sms\b` matches in lib/. | none (gap) | Vision: SMS as fallback channel (capability absent though dep available) |
| 6 | **WhatsApp** (current primary fallback) | BUILT + OPERATIONAL (HEAVY USE) | `lib/whatsapp.ts` with Twilio integration. `isWhatsAppConfigured()` requires TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_NUMBER. `sendWhatsAppAlert` function signature: `{to, workerName, workerI, permitType, daysRemaining, tenantId}`. Called from 10+ route files: immigration / fines / posted-notifications / certified-signatures / safety / deployments / voice / matching / contract-gen + others. | AC-44 + AC-55 | Vision INVERTS current state: WhatsApp should become FALLBACK only, in-app chat (Surface 1) becomes PRIMARY. Today's pattern is opposite. |
| 7 | **AI message generation** | PARTIAL (operator-facing rich; worker-facing absent) | Two ai-provider files (AC-52 drift confirmed): `services/ai-provider.ts` + `services/ai/provider.ts`. Newer structured pattern under `services/ai/` (provider.ts + use-cases.ts + types.ts + index.ts). Generic message composers (`generateMessage\|composeMessage\|aiMessage\|automatedMessage`) — **zero matches in routes**. Operator-facing AI: 46+ files per Day 30 AC-44 audit. Worker-facing AI: AC-43 Phase A audit shows entirely net-new. | AC-43 + AC-44 + AC-55 + AC-52 | Vision: AI auto-flag-and-email (absent); AI fallback when humans don't respond (absent); AI worker-facing message generation (absent — only operator-facing exists today) |
| 8 | **Role gating + audit log for comms** | PARTIAL (audit_logs exists; comms-action logging not verified; RBAC inconsistent) | No `lib/audit.ts` file. `audit_logs` table at init-db.ts:843 (denormalized: worker_id TEXT). Messaging routes (messaging.ts:37+56+100+124+134) use `requireAuth` only — **no requireRole** (AC-51 captures this pattern). Notification routes use `requireAuth` + selective `requireRole` (notifications.ts:34 example). | AC-51 (system-wide gap) + AC-43 (GDPR side) + AC-49 (RBAC) + AC-55 | Vision: full audit trail for every send (partial — notification_log captures via push-sender but messaging.ts doesn't write to audit_logs); RBAC per-tier per-channel-per-recipient (inconsistent across comms routes today) |

---

## Cross-surface integration map (how surfaces talk today)

| Integration | Current state | Vision delta |
|---|---|---|
| **Messaging → Push** | NOT WIRED. Worker receives messages via 5-second polling on MessagingTab.tsx:31. Push subscription exists for system events but message arrival doesn't trigger push. | Vision: messages trigger push → worker gets real-time notification without battery cost of polling. |
| **Notification → Push** | PARTIAL. `services/push-sender.service.ts` writes to `notification_log` table with status='pending'. Push delivery itself depends on VAPID configuration. | Vision: unified notification spine; every notification routes to user's preferred channel (push/SMS/WhatsApp/email per worker_comms_preferences from AC-43 audit). |
| **Escalation Engine → Multi-channel** | PARTIAL. `services/escalation-engine.service.ts:51` imports `sendWhatsAppAlert` for SLA-breach escalation. Single-channel (WhatsApp) for now; pattern exists for multi-channel expansion. | Vision: escalation routes per-event-type to per-worker-preferred-channel. AC-44 internal AI orchestration owns this. |
| **AI Provider → Outbound Channels** | NOT WIRED. AI provider abstraction exists (services/ai/provider.ts) but no service composes AI-generated messages + routes to channel. The 46+ AI call sites are operator-query-driven (Claude generates analysis on operator request), not system-initiated outbound. | Vision: AI generates message content (per template) + routes to channel based on per-worker preferences. AC-44 + AC-43 framework owns this. |
| **MessagingTab UI → Notification badges** | NOT WIRED. MessagingTab uses 5s polling for new messages. notifications.ts unread-count endpoint exists but BottomNav doesn't surface unread badge for "messages" tab. (BottomNav alert badge logic exists for "alerts" + "queue" tabs only per BottomNav.tsx:204-208.) | Vision: unified unread count across all comms surfaces with badge on Messages tab. |
| **Audit log → Comms history** | NOT WIRED. `audit_logs` table doesn't capture per-message-send events. `notification_log` captures per-notification events (separate primitive). GDPR-side audit (`gdpr_log`) is separate again. | Vision: single canonical comms-event log spanning messages + notifications + sends, queryable per-worker for compliance + dispute resolution. |

---

## Critical gaps surfaced (10 items)

1. **No in-app chat tied to push** — MessagingTab uses 5s polling; push infra exists but isn't wired to message arrival. Battery cost + latency for workers.
2. **No broadcast one-to-many infrastructure** — every message is point-to-point in messaging.ts; no audience-targeting capability (per-site, per-role, per-tier, per-language).
3. **No AI auto-flag-and-email** — escalation-engine has SLA-breach detection but not "issue detected in messaging pattern" auto-flag.
4. **No AI fallback when humans don't respond** — no service watches thread silence and takes automated outreach action.
5. **WhatsApp is currently PRIMARY (10+ call sites), not fallback** — vision inverts this. Migration requires either retrofitting call sites OR adding messaging-first wrapper that falls back to WhatsApp.
6. **No worker-facing AI message generator** — only operator-facing AI exists today (Claude analysis on operator query). Worker-facing AI is AC-43 Phase A scope.
7. **SMS infrastructure ABSENT** despite Twilio SDK already a dep (via WhatsApp integration). Net-new but minimal effort.
8. **MessagingTab encryption is legacy XOR** (`legacyXorDecrypt` per AC-40 audit) — security flag stands, not crypto-grade.
9. **AC-52 drift unresolved** — two ai-provider files affect message generation consistency.
10. **Comms route RBAC inconsistent** — AC-51 captures the pattern; messaging.ts has no `requireRole`, notifications.ts has selective `requireRole`, push.ts requires `requireAuth` only.

---

## Anti-hallucination caveats

- **Status declarations** based on grep evidence + file:line citations. Did NOT runtime-test any flow (no live curl-and-observe; no VAPID-key check; no Twilio config check; no actual message send test).
- **"BUILT + OPERATIONAL"** means code exists + recently used per cross-references. Does not mean "all error paths handled" or "operates at scale."
- **"PARTIAL"** means primitives exist but full vision capability is not assembled.
- **"ABSENT"** means grep returned no matches for the surface — could be misnamed in code (low probability given the broad grep terms used).
- **MessagingTab encryption "legacy XOR"** — verified via prior AC-40 audit reading messaging.ts:30 `legacyXorDecrypt`. Not re-verified in this audit (referenced from prior commit).
- **Vision-spec gap statements** sourced from Worker App Vision Master Prompt (commit `e0e0990`) — Module 3 communication layer + Module 4 issue engine + Worker App tabs (Help tab). Some gaps overlap multiple modules; documented under each surface where most relevant.
- **AI worker-facing absence** — sourced from AC-43 Phase A audit (commit `1887044`) finding "all existing AI sites target operators." Not directly re-grepped here.
- **"10+ WhatsApp call sites"** verified via grep returning route file list (immigration / fines / posted-notifications / certified-signatures / safety / deployments / voice / matching / contract-gen — 9 distinct files cited; "10+" rounded up; exact count could be 9-12).
- **Cross-surface integration claims** based on file inspection (escalation-engine.service.ts:51 import of sendWhatsAppAlert; MessagingTab.tsx:31 5s refetchInterval; push-sender.service.ts writes to notification_log) — single-line verifications, not full handler tracings.

---

## Phase 2 input — what EEJ audit should specifically look for

Phase 2 (next prompt after Manish approval) audits EEJ codebase. Specific concepts to examine in EEJ for potential APATRIS-better adaptation:

1. **In-app chat ↔ push integration pattern.** Does EEJ have message-arrival-triggers-push? What service mediates the wiring?
2. **Broadcast/audience-targeting service.** Does EEJ have one-to-many message composition with per-audience refine/translate (per Vision capability b)?
3. **AI message generation for worker-facing context.** EEJ AISummary pattern was identified in Day 30 APATRIS-vs-EEJ audit — does EEJ also generate worker-facing outbound message content? What prompt + safety pattern?
4. **No-response-fallback pattern.** Does EEJ have a service that detects "worker hasn't responded after N hours" and takes automated action?
5. **Multi-channel routing service.** Does EEJ have a generic "send via worker's preferred channel" abstraction? What's the channel-preference data model?
6. **Twilio/SMS integration if any.** Does EEJ use SMS as a distinct channel from WhatsApp?
7. **Message-thread encryption approach.** Does EEJ use proper crypto (vs APATRIS's legacy XOR)?
8. **Per-tenant comms architecture.** Does EEJ have per-client comms preferences (relevant for AC-45 + AC-55 client-company-AI capability)?
9. **AI auto-flag detection patterns.** Does EEJ have services that watch message content + auto-tag/escalate?
10. **Comms audit-log unification.** Does EEJ have a single canonical comms-event log vs APATRIS's scattered approach (audit_logs + notification_log + gdpr_log separate)?

Each Phase 2 finding feeds the "better not copy" cross-build decision per CLAUDE.md doctrine: examine EEJ concept → audit APATRIS context → design APATRIS-better → propose as AC reframe or new AC.

---

## Status

- **Phase 1:** complete (this document).
- **Phase 2 (EEJ audit):** **awaiting Manish approval** before next prompt. Do NOT start Phase 2 in current cycle.
- **Phase 3 (web competitive research):** gated on Phase 2 completion + Manish approval.
- **Final synthesis:** chat-Claude composes architecture recommendations + AC reframing decisions + Phase B buildable plan AFTER all 3 phases land.

**Key Phase 1 finding for chat-Claude review:** APATRIS has rich primitive infrastructure across all 8 comms surfaces (most surfaces BUILT + OPERATIONAL or BUILT + PARTIAL) BUT no integration spine ties them together into a coherent system. The architecture work for AC-55 is **integration + orchestration**, not greenfield. The "build APATRIS-way" decision per the better-not-copy doctrine starts here: integrate existing primitives + add the few genuinely-net-new pieces (broadcast, AI auto-flag, AI fallback, worker-facing AI generator).
