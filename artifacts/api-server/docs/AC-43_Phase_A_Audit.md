# AC-43 Phase A Audit — Worker-Facing AI Architecture

**Date:** 2026-05-16 (Day 30)
**Verdict:** YELLOW shading toward RED (largest scope in vision program — 20 work units across 4 gate categories; rich existing channel + consent + i18n infrastructure prevents full RED)
**HEAD at audit:** `170b038`
**Scope:** Read-only audit of GDPR consent + 4 notification channels + i18n + timezone + worker-facing AI design discipline. Critical architecture decision: registry-share-vs-separate vs AC-44. Mirrors AC-31 / AC-38 / AC-47 / AC-39 / AC-40 / AC-46 / AC-41 / AC-44 Phase A pattern.

---

## Current state summary

**Channel infrastructure is well-developed (3 of 4 channels wired).** Push (push_subscriptions table + push.ts routes + VAPID), Email (lib/mailer.ts + Brevo SMTP), WhatsApp (lib/whatsapp.ts + Twilio) all functional. SMS likely shares Twilio SDK but no dedicated `lib/sms.ts` exists. `notification_log` table (line 867) provides multi-channel audit trail used by existing notification flows.

**GDPR consent has DRIFT — two consent tables exist** (similar to AI-provider drift discovered in AC-44 audit). `consent_records` (line 321) is generic; `gdpr_consent_records` (line 2602) is richer (consent_language + signed_at + retention_until + status enum). Neither carries `proactive_comms`-specific consent types.

**i18n exists for UI only.** `workforce-app/src/locales/pl.json` + `en.json` + `src/lib/i18n.ts` cover UI strings. Backend prompt language routing is NOT yet built — all 46 AI call sites use English/Polish-mixed system prompts targeting operators, not workers.

**Timezone handling is virtually absent.** Single hardcoded `Europe/Warsaw` in google.ts:194-195 (Google Calendar). No `tz` column on workers table. No timezone library imported. Multi-country posted-worker scenarios (Polish worker on German site) are completely unhandled.

**No worker-facing AI prompts exist today.** All existing prompts target operators ("Polish labor compliance expert", "workforce management assistant"). Worker-facing AI is genuinely new design discipline.

AC-43 is therefore **the largest single AC** in the vision program — 20 work units across 4 gate categories. Rich existing infrastructure prevents RED; net-new design discipline + per-channel consent flow + timezone handling makes it YELLOW-shading-toward-RED.

---

## Per-feature inventory (against vision Module 3 worker-facing features)

| Vision feature | Built | Partial | New build | Data trigger | Notes |
|---|---|---|---|---|---|
| Shift reminders | — | — | new AI prompt + channel routing + timezone resolution | shifts.shift_start_at | gated on timezone design |
| Missing check-in alerts | — | partial | new handler triggered by AC-41 | AC-41 `no_show.detected` event | cross AC-41 |
| Lateness reminders | — | — | new handler triggered by AC-41 | AC-41 grace period elapsed | cross AC-41 |
| Document expiry reminders | partial | Job 12 + complianceAI.ts has scheduled scan | refactor as worker-facing (currently operator-alert) | workers.{trc_expiry, passport_expiry, ...} | small refactor |
| Leave approve/reject messages | — | — | new handler triggered by AC-39 | leave_requests status PATCH | cross AC-39 |
| Payroll clarification prompts | — | — | new (AI explains payslip in worker's language) | payroll commit / payroll_snapshots | medium handler |
| Upload missing proof reminders | — | — | new handler | document_workflows.status change | small handler |
| Attendance points updates | — | — | new handler triggered by AC-42 | AC-42 points change event | cross AC-42 |
| Multilingual guidance (worker's language) | — | partial | language selector (i18n UI exists) + backend prompt language routing | worker.preferred_language (new column) | substantive |

---

## Tier breakdown

**Tier 1 — built, reusable infrastructure (5 stacks):**
- Push (push.ts routes + push_subscriptions table + VAPID key endpoint)
- Email (lib/mailer.ts + nodemailer + Brevo SMTP)
- WhatsApp (lib/whatsapp.ts + Twilio integration + isWhatsAppConfigured() guard)
- notification_log (multi-channel audit trail, already used by existing flows)
- i18n UI (workforce-app/src/locales/{pl,en}.json + lib/i18n.ts)

**Tier 2 — built, needs adaptation:**
- Document expiry reminders (Job 12 / complianceAI.ts wraps as worker-facing handler)

**Tier 3 — schema/route exists, frontend missing:** None.

**Tier 4 — net-new (substantial):**
- GDPR consent consolidation + per-channel proactive_comms consent types
- worker_comms_preferences table (channels + quiet hours + frequency caps + timezone + language)
- Worker-facing AI design discipline framework (as code)
- Worker comms-routing service
- Separate registry instance per Option C (mirrors AC-44 pattern, separate from internal-AI registry)
- Timezone resolution helper
- Worker consent UI in workforce-app
- 7 new event handlers (shift/lateness/check-in/leave/points/case/sensitive)
- Admin worker-comms-config routes
- SMS lib (small wrapper around existing Twilio if used)

---

## GDPR consent infrastructure assessment

### Two consent tables exist — DRIFT

| Table | Schema | Use |
|---|---|---|
| `consent_records` (line 321) | tenant_id + worker_id + consent_type TEXT + granted BOOL + granted_at + revoked_at + version | Generic consent (legacy) |
| `gdpr_consent_records` (line 2602) | + consent_language TEXT + consent_text TEXT + signed_at TIMESTAMPTZ + retention_until DATE + status enum | Richer GDPR-compliant (newer) |

**Decision: `gdpr_consent_records` canonical** (richer schema, consent_language for audit-trail, retention_until for auto-expiry, status enum for clean state). `consent_records` deprecated; migration path is WU-A1.

### Gaps for proactive communications

Neither table carries `proactive_comms`-specific consent today. The `consent_type` column is free TEXT — existing values are likely GDPR-data-processing-related, not communication-channel-specific.

**Recommended consent_types** (per-channel granularity for revocability):
- `proactive_comms` (umbrella consent — must be granted for ANY proactive message)
- `proactive_comms_push` (per-channel granular consent)
- `proactive_comms_sms`
- `proactive_comms_whatsapp`
- `proactive_comms_email`

Per-channel granularity matters because EU regulations differ (e-Privacy Directive treats SMS/WhatsApp/email differently than push), and workers may opt out of one channel without revoking all comms.

### Recommended worker_comms_preferences table

New table (NOT replacing consent — preferences are operational config, consent is legal record):

```
CREATE TABLE IF NOT EXISTS worker_comms_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE UNIQUE,
  preferred_language TEXT DEFAULT 'pl',
  preferred_channels JSONB DEFAULT '["push", "whatsapp"]',
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '07:00',
  frequency_cap_daily INTEGER DEFAULT 5,
  timezone TEXT DEFAULT 'Europe/Warsaw',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

UNIQUE(worker_id) — one preferences row per worker. Cross-references `workers` table (no FK migration on existing data).

---

## Channel decision space

| Channel | Infra exists? | Cost model (PL market) | Opt-out behavior | Use-case fit |
|---|---|---|---|---|
| **Push** (Web Push API) | YES (push.ts + push_subscriptions + VAPID) | FREE (browser-native) | User unsubscribes via browser; endpoint expires automatically | High-frequency operational reminders, in-app context, default for app-installed workers |
| **WhatsApp** | YES (lib/whatsapp.ts + Twilio) | ~€0.005/message | Block contact (no STOP keyword regulation in PL) | Operational messages with rich formatting; high read-through; cheap; fallback for non-app workers |
| **SMS** | partial (Twilio SDK present; no lib/sms.ts wrapper) | ~€0.05/message (Polish market) | STOP keyword unsubscribes (regulated under e-Privacy Directive) | Critical alerts to workers without app/WhatsApp; widely-readable; expensive |
| **Email** | YES (lib/mailer.ts + Brevo SMTP) | FREE-ish (Brevo plan limits) | Unsubscribe link (regulated under GDPR/e-Privacy) | Long-form (payslips, document attachments, legal notices, weekly summary) |

### Recommended channel default cascade

1. **Default: Push** — free, in-app context, immediate. Workers with app installed get push first.
2. **Fallback: WhatsApp** — if no push subscription within 5 min, or push delivery failed, send via WhatsApp. Cheap + high read-through.
3. **Critical-only: SMS** — reserve for shift-imminent alerts when worker hasn't acknowledged via push/WhatsApp. Cost-sensitive.
4. **Long-form: Email** — payslip explanations, document attachments, weekly summary, legal notices. Never for time-sensitive reminders.

### SMS lib question

`grep` found Twilio SDK already integrated for WhatsApp (lib/whatsapp.ts). SMS likely usable via same SDK without new lib. WU might just add a `sendSMS()` function alongside `sendWhatsAppAlert()` in existing lib/whatsapp.ts (rename to lib/twilio.ts for clarity) — minimal new code.

---

## Worker-facing AI design discipline framework

The new design discipline (codified as `services/worker-facing-ai/framework.ts`):

### 1. Ambiguity tolerance

Workers may not know system context. AI prompts must:
- Always identify what triggered the message (*"Your shift at Site X starts in 30 minutes"* — not just *"Reminder"*)
- Provide explicit next action (*"Tap to confirm: Coming / Late / Absent"* — not just *"Please respond"*)
- Never assume worker knows acronyms (TRC / BHP / PESEL / RODO spelled out at first use, or use plain-language equivalents)

### 2. Language defaulting

Source priority:
1. `worker_comms_preferences.preferred_language` (worker explicit preference)
2. `workers.preferred_language` (legacy — if exists at AC-43 Phase B start)
3. Tenant default language
4. Fallback: `pl` (per CLAUDE.md MASTER_PLAN principle #16, Polish authoritative)

All prompts authored PL-first per Polish-authoritative principle. Backend prompt registry: `{en: "...", pl: "..."}` per message type. Polish diacritics preserved (ł, ą, ę, ż, ó, ś, ć, ń, ź).

### 3. Tone

- **Operator AI** (existing): analytical / legal / detailed / multi-paragraph allowed
- **Worker AI** (new): operational / clear / short / max 2 sentences for reminders / 1 actionable verb per message
- Style guide enforced by per-message-type prompt templates, not free-form Claude calls

### 4. Fallback when AI fails

Worker still gets the message via templated text (i18n keys + interpolation). Same pattern as `services/ai/use-cases.ts` — rule-based first, AI enhancement when available. AI NEVER replaces templated text; it only enriches it (e.g., personalized closing line, contextual nuance).

### 5. Approval gates (3-tier classification)

| Tier | Examples | Approval |
|---|---|---|
| **Tier 1 (auto)** | Shift reminders, document expiry, check-in confirmations, leave-decision notifications | Auto-send |
| **Tier 2 (templated, no AI generation)** | Payroll info, leave approvals, official notifications | Auto-send but templated only (audit-critical accuracy) |
| **Tier 3 (admin approval before send)** | Penalty notifications, disciplinary case-status changes, legal demands | Manual admin review — **gated on AC-50** legal-input |

### 6. Sensitive message classification

- Legal/disciplinary → AC-50 legal review gate (Tier 3)
- Operational/reminder → Tier 1 auto-send
- Personal data exposure (PESEL, salary detail) → never AI-generate (templated only with structured field interpolation)

---

## Registry-share-vs-separate decision vs AC-44 (the critical architecture decision)

Three options considered:

### Option A — Share AC-44 registry with `worker_facing: boolean` flag on events

Pro: single dispatch path. Con: mixes safety profiles (worker-facing has stricter framework); handler registration crowded with safety tier mixing; cross-cutting concerns (audit trail mixing internal alerts with worker messages).

### Option B — Fully separate AC-43 registry from scratch

Pro: clean separation. Con: duplicates registry/dispatch code in two services; two patterns to learn; harder to maintain.

### Option C (RECOMMENDED) — Shared infrastructure, separate instances

Use the same `register/dispatch` API designed in AC-44, but instantiate TWO independent registry instances:

```
services/internal-ai/registry.ts  → exports internalRegistry (AC-44)
services/worker-facing-ai/registry.ts → exports workerFacingRegistry (AC-43)
                                       imports same register/dispatch core
```

**Why Option C:**
- Same code, two instances → no duplication
- Clear safety-profile separation (workerFacingRegistry handlers respect framework.ts; internalRegistry handlers don't need to)
- Independent audit trail (`internal_ai_alerts` table for AC-44; `worker_comms_log` extension of notification_log for AC-43)
- Clear "did this event fire to worker or operator?" answer at registry-instance level
- AC-44 doesn't accidentally route an internal alert to a worker channel
- Validates AC-44 audit's recommendation (AC-44 audit explicitly flagged AC-43 should re-validate the registry pattern — Option C confirms compatibility)

**Implementation detail:** if both registries grow similar code, extract shared `register/dispatch` core into `services/_lib/event-registry.ts` (private prefix) consumed by both. Defer this refactor decision to Phase B WU-A6 — if duplication < 50 lines, inline is fine.

### Cross-validation with AC-44

AC-44 audit noted: *"When AC-43 Phase A lands, verify whether AC-43 shares the registry or maintains separate orchestration."* AC-43 confirms: separate registry instances, shared infrastructure. AC-44 doesn't change. AC-43 WU-A6 instantiates its own registry using AC-44's pattern.

---

## Timezone handling proposal

### Current state

- Single hardcoded `Europe/Warsaw` in google.ts:194-195 (Google Calendar event creation)
- No `tz` column on workers table
- No timezone library imported (no moment-timezone, no date-fns-tz)
- TIMESTAMPTZ used throughout DB (good — UTC storage)
- Multi-country scenarios (Polish worker, German site) completely unhandled

### Proposed timezone source priority

Worker timezone resolution:
1. `worker_comms_preferences.timezone` (worker explicit preference)
2. Site default — `workers.assigned_site` → `site_geofences` country → ISO country-tz map (e.g., `PL → Europe/Warsaw`, `DE → Europe/Berlin`, `IE → Europe/Dublin`)
3. Tenant default
4. Fallback: `Europe/Warsaw`

### Display logic

- **Storage:** UTC (existing TIMESTAMPTZ convention)
- **Conversion:** `Intl.DateTimeFormat` (standard library, no new deps) — `new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', timeStyle: 'short' })`
- **Helper:** `lib/timezone.ts` with `resolveWorkerTimezone(workerId, tenantId)` + `formatTimeInTimezone(utcTimestamp, tz, locale)`

### Cross-country posted-worker case

Berlin site + Polish worker:
- Send message at: Berlin shift_start − 30 minutes, in Berlin timezone (the site)
- Display content: *"Twoja zmiana zaczyna się o 8:00 czasu berlińskiego (10:00 polskiego)"* — show both timezones for clarity
- Worker reads in Polish (their language) with Berlin-time primary + Polish-time parenthetical

### Implementation effort

`lib/timezone.ts` is small (~50 lines). The ISO country-tz map is well-known data (10-20 entries for EU). Worker timezone preference UI lives in workforce-app worker profile (WU-B2). No new npm dependency needed.

---

## Cross-AC overlap map

| AC | Type | Relationship | Phase B effect |
|---|---|---|---|
| **AC-44** | parallel | shared infrastructure (provider + rate limiter + scheduler); separate registry per Option C | WU-A6 mirrors AC-44 registry; WU-D1 verifies coordination |
| **AC-41** | event source | shift reminders + lateness reminders + missing check-in alerts | 3 handlers gated on AC-41 Phase B WU-A3 events stream |
| **AC-42** | event source | points-change messages | 1 handler gated on AC-42 Phase B |
| **AC-46** | event source | case status updates trigger worker notifications | 1 handler gated on AC-46 Phase B Wave 1 |
| **AC-50** | gate | sensitive penalty messages — Tier 3 admin approval | gates WU-B9 (sensitive penalty flow) |
| **AC-51** | discipline | admin worker-comms-config routes role-gated correctly | applied at WU-A8 |
| **AC-39** | event source | leave approve/reject messages | 1 handler gated on AC-39 (small) |
| **AC-31** | worker context | every worker-facing message needs worker.id + name + language preference | uses workers table + worker_comms_preferences |
| **AC-47** | data | attendance facts may inform some message templates (weekly summary, etc.) | enriches payroll/digest content when AC-47 ships |

**AC-43 has the broadest cross-AC surface yet** — every operational AC potentially fires a worker-facing message at some point. AC-43 is the central worker-touch-point for the vision program.

---

## Phase B effort scope (work units, not hours)

### UNGATED architecture work (8 WU — ship first)

- **WU-A1** — GDPR consolidation: declare `gdpr_consent_records` canonical; deprecate `consent_records` (or migration script); document decision.
- **WU-A2** — `worker_comms_preferences` table (per-worker preferred_language + preferred_channels JSONB + quiet_hours + frequency_cap + timezone).
- **WU-A3** — Add `proactive_comms` + per-channel consent_types (`proactive_comms_push`, etc.) to gdpr_consent_records consent_type enum/values.
- **WU-A4** — Worker-facing AI design discipline framework as code: `services/worker-facing-ai/framework.ts` with Tier 1/2/3 classification, language routing, templated fallback enforcement, sensitive message classifier.
- **WU-A5** — Worker comms-routing service: `services/worker-comms.service.ts` — accepts message + worker, checks preferences + consent + quiet hours + frequency cap, routes to correct channel, logs to notification_log.
- **WU-A6** — Registry pattern (Option C): `services/worker-facing-ai/registry.ts` mirroring AC-44 pattern as separate instance.
- **WU-A7** — Timezone resolution helper: `lib/timezone.ts` with `resolveWorkerTimezone()` + `formatTimeInTimezone()` + ISO country-tz map.
- **WU-A8** — Admin routes: GET/POST/PATCH `/admin/worker-comms-config/:workerId` (admin overrides + opt-out tracking) + role-gated.

### GATED on worker consent UX flow (2 WU)

- **WU-B1** — Worker consent UI in workforce-app for `proactive_comms` (per-channel toggles + accept/revoke with audit trail to `gdpr_consent_records`).
- **WU-B2** — Quiet hours + frequency cap UI + language preference + timezone preference in worker profile.

### GATED on event sources (5 WU)

- **WU-B3** — Shift reminder handler (gated AC-41 + timezone helper from WU-A7).
- **WU-B4** — Lateness reminder handler (gated AC-41).
- **WU-B5** — Missing check-in handler (gated AC-41).
- **WU-B6** — Attendance points update handler (gated AC-42).
- **WU-B7** — Leave approve/reject handler (gated AC-39 PATCH /leave/:id hook).
- **WU-B8** — Case status update handler (gated AC-46 Wave 1).

### GATED on AC-50 legal (1 WU)

- **WU-B9** — Tier 3 sensitive penalty message flow with admin approval gate.

### OPERATOR-INFORMED (2 WU)

- **WU-C1** — Default channel priority for tenant (informed by AC-35).
- **WU-C2** — Default frequency caps / quiet hours per tenant (informed by AC-35).

### Coordination (1 WU)

- **WU-D1** — Verify Option C registry-share decision against AC-44 Phase B implementation (when AC-44 WU-A2 ships).

**Total: 8 ungated + 2 consent-UX + 6 event-source-gated + 1 legal-gated + 2 operator-informed + 1 coordinated = 20 work units.**

**This is the largest single AC scope in the vision program** (vs AC-44 at 13, AC-41 at 11, AC-46 at 11, AC-40 at 11, AC-39 at 8-10 individual items, AC-47 at fewer). AC-43 is XL per Scoping audit — confirmed XL by this Phase A.

---

## Verdict reasoning: YELLOW shading toward RED

**Why not GREEN:** 20 work units across 4 gate categories. Net-new design discipline (entire framework as code). GDPR re-consent flow with workers required. Worker-facing AI prompts don't exist anywhere — entire prompt library to author.

**Why not full RED:** 5 Tier-1 reusable stacks reduce design risk substantially. 3 of 4 channels wired. notification_log audit trail exists. i18n UI base exists. gdpr_consent_records is rich enough to extend. Standard library `Intl.DateTimeFormat` covers timezone display. AC-44 registry pattern is template-reusable (Option C).

YELLOW-shading-toward-RED captures: substantial composition + design + 1 worker consent flow + cross-AC dependency dense. Not invention from zero, but largest individual workstream.

---

## Phase B gating rule

- **WU-A1 through WU-A8 (8 ungated architecture WU)** — UNGATED. Ship Day 31+. Foundation: consent consolidation + preferences table + framework as code + routing service + registry + timezone helper + admin routes.
- **WU-B1, WU-B2 (consent UX)** — gated on workforce-app UX design + Yulia legal review of consent text (Polish authoritative per CLAUDE.md principle #16).
- **WU-B3, WU-B4, WU-B5** — gated on **AC-41 Phase B WU-A3** (no-show events stream).
- **WU-B6** — gated on **AC-42 Phase B** (points events).
- **WU-B7** — gated on **AC-39 Phase B** (PATCH /leave/:id status hook).
- **WU-B8** — gated on **AC-46 Phase B Wave 1** (case_status workflow).
- **WU-B9 (Tier 3 sensitive penalty)** — gated on **AC-50** Yulia legal-input.
- **WU-C1, WU-C2** — informed by **AC-35** operator interviews.
- **WU-D1** — coordinated with **AC-44 Phase B WU-A2** (registry-share validation).

**Cross-AC unblock effect:** AC-43 architecture (8 WU) ungated; ships independently. Doesn't unblock other ACs but is consumed by AC-40 (Help tab AI assistant via WU-11 — AC-40 audit gated WU-11 on AC-43 framework).

---

## Phase B sequencing rule

1. **WU-A1 first** — GDPR consolidation. Decision documented before any consent-type addition. Atomic commit.
2. **WU-A3 next** — proactive_comms consent_types added.
3. **WU-A2 then** — worker_comms_preferences schema. `CREATE TABLE IF NOT EXISTS` discipline.
4. **WU-A7 then** — timezone helper. Self-contained library, easy to test.
5. **WU-A4 then** — framework as code. Vitest tests over Tier 1/2/3 classification + language routing.
6. **WU-A5 then** — comms-routing service. Consumes WU-A2 preferences + WU-A4 framework.
7. **WU-A6 then** — registry instance. Mirrors AC-44 pattern (or imports shared core when WU-D1 lands).
8. **WU-A8 then** — admin routes. Role-gated from day 1 (avoid AC-51).
9. **WU-B1, WU-B2** — consent UX + preferences UX (parallel track).
10. **WU-B3 through WU-B9** — as each gate clears.
11. **WU-C1, WU-C2** — operator priority from AC-35 interviews.
12. **WU-D1** — verify Option C coordination when AC-44 Phase B WU-A2 ships.

One commit per work unit. Smoke-validate after each. Vitest tests mandatory for framework (Tier classification) + routing service (preference checks + quiet hours).

---

## Phase B first-action checklist (per work unit)

1. Re-read `gdpr_consent_records` schema (init-db.ts:2602) + `consent_records` schema (line 321) + `push.ts` + `lib/whatsapp.ts` + `lib/mailer.ts` + `notification_log` schema (line 867) + `services/ai/use-cases.ts` before any work.
2. For WU-A1 GDPR consolidation: confirm with Yulia + Manish whether `consent_records` has live production data — if yes, migration script required; if no, drop table.
3. For WU-A3 consent_types: Polish consent text authored PL-first; Yulia reviews legal phrasing before any worker-facing consent UX ships.
4. For WU-A4 framework: implement Tier 1/2/3 classification as enum + classifier function; Vitest snapshot tests over example message types.
5. For WU-A5 comms-routing: respect existing `ai-rate-limiter.ts` per-tenant limits; gate frequency cap at routing layer.
6. For WU-A6 registry: import AC-44 pattern types (when AC-44 WU-A2 ships); if AC-44 hasn't shipped yet, define types locally + back-fill.
7. For WU-A7 timezone: use `Intl.DateTimeFormat` only — no new npm deps. ISO country-tz map as constant in module.
8. For WU-A8 routes: `requireRole(...)` on all admin routes from day 1.
9. For i18n: ALL worker-facing prompts authored PL-first; add to BOTH `pl.json` and `en.json`; proper Polish diacritics; follow V3 convention search pattern per CLAUDE.md Bilingual Architecture.
10. For consent UX (WU-B1, WU-B2): Yulia reviews consent text + opt-out clarity before any worker sees the screen.

---

## Anti-hallucination caveats

- **TWO consent tables** verified by direct grep on init-db.ts. Drift is real (similar to AI-provider drift in AC-44 audit).
- **3 of 4 channels wired** — verified: push.ts routes exist + push_subscriptions table; mailer.ts uses nodemailer + Brevo SMTP; whatsapp.ts uses Twilio. SMS infrastructure inferred from Twilio SDK presence; no dedicated lib/sms.ts confirmed.
- **Timezone handling near-absent** — single match for `Europe/Warsaw` in google.ts; one ENV-default site config in init-db.ts (Polish-specific). No worker.tz column, no general timezone library.
- **"Worker-facing AI prompts don't exist"** — verified by reading 2 existing system prompts in services/ai/{provider,use-cases}.ts. Both target operators ("Polish labor compliance expert", "workforce management assistant"). 46 AI call sites enumerated in AC-44 audit; sampling confirms operator-targeting pattern.
- **Option C registry recommendation** is design choice from this audit; validated against AC-44 audit (commit `170b038`) cross-AC note. Confirmed coordination point as WU-D1.
- **20 work units** is structured count; some WU could be split or merged during Phase B kickoff. Real per-WU effort confirmed at per-commit start.
- **Polish Labour Code reference for Tier 3 sensitive messages** carries through from AC-50 + AC-39 audits — Yulia confirms which message types require pre-send approval.
- **Consent text legality** must be Yulia-reviewed before any consent UX ships (regulatory risk).
- **ISO country-tz map** is well-known data; not invented. Map can be inline (10-20 EU entries) or use small npm package like `country-tz` if dep is acceptable.

---

## Cross-AC notes (consolidation)

- **AC-43 has broadest cross-AC surface** — 9 ACs touch.
- **AC-43 architecture (8 WU) ungated** ships independently.
- **AC-43 framework is consumed by AC-40 WU-11** (multilingual AI assistant) — AC-40 was gated on AC-43 framework existing.
- **AC-43 + AC-44 registry coordination** at WU-D1 — Option C confirmed.
- **AC-51 discipline applies from WU-A8** (admin worker-comms-config routes role-gated correctly from day 1).
- **Yulia legal-input batching opportunity** — AC-50 (penalty) + AC-39 item 8 (leave cutoffs) + AC-41 WU-B2 (no-show penalty) + AC-43 consent text + AC-43 WU-B9 (sensitive penalty messages) — 5 items in one legal conversation.
- **AC-52 candidate spawned: ai-provider consolidation** (already flagged in AC-44 audit) — AC-43 piggybacks similar consent-table consolidation; consider AC-52 as "drift consolidation across all paired/duplicated infrastructure" combined scope.

---

## Status

- **Phase A:** complete (this document).
- **Phase B Architecture (8 WU):** **UNGATED.** Ship Day 31+. Foundation: consent + preferences + framework + routing + registry + timezone + admin.
- **Phase B Gated (10 WU):** 2 consent UX (Yulia legal review) + 5 event source (AC-41 / AC-42 / AC-46 / AC-39) + 1 legal (AC-50) + 2 operator (AC-35).
- **Coordination WU (1):** AC-44 Phase B WU-A2 alignment.
- **Recommended Day 31+ posture:** AC-43 is the largest single workstream. Architecture WU is ungated but substantial — 8 commits + Vitest tests. Could ship over 3-4 sessions interleaved with smaller ACs. Operator-informed timing (WU-C1, WU-C2) waits for AC-35 interviews. Consent UX (WU-B1, WU-B2) waits for Yulia legal review of consent text.
- **Drift discoveries:** TWO consent tables (similar to AI-provider drift in AC-44). Consider AC-52 expanded scope: "drift consolidation across paired/duplicated infrastructure" (consent_records + ai-provider).
- **Template stacks:** gdpr_consent_records + push.ts + lib/mailer.ts + lib/whatsapp.ts + notification_log + services/ai/use-cases.ts + AC-44 registry pattern + Intl.DateTimeFormat — re-read before WU-A1 starts.

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
