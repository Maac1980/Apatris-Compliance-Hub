# AC-45 Phase A Audit — Client-Company AI Architecture

**Date:** 2026-05-16 (Day 30)
**Verdict:** YELLOW (4 Tier-1 reusable stacks make this composition-heavy; sanitization layer + 6 templates + per-client policy + approval workflow are the new work; all architecture gated on AC-49 Phase B shipping ClientContact role)
**HEAD at audit:** `f3a56df`
**Scope:** Read-only audit of webhook infrastructure + approval-gate patterns + per-client policy storage + sensitive-data sanitization design + Option C registry pattern (third validation). Closes the AI architecture trilogy (AC-44 internal + AC-43 worker-facing + AC-45 client-facing). Mirrors prior Phase A pattern.

---

## Current state summary

**Architecture validation:** AC-45 follows the same **Option C registry pattern** validated in AC-44 (internal AI) and AC-43 (worker-facing AI) — separate registry instance, shared infrastructure (provider + rate limiter + scheduler). This is the **third validation** of the same architecture across three AI surfaces. Pattern is solid.

**Four rich Tier-1 reusable stacks exist:**

1. **Webhooks infrastructure** — `webhooks` table (line 2109: tenant_id + name + url + events JSONB + secret + status + last_triggered) + `webhook_logs` (line 2125: webhook_id + event + payload JSONB + response_status + delivered_at) + 3 routes at `/developer/webhooks` (developer.ts:47-90 with HMAC-SHA256 signature + delivery test endpoint). AC-45 webhook delivery uses this directly.

2. **Approval workflow pattern** — `legal-approval.service.ts` (line 51) provides reusable `is_approved + approved_by + approved_at` pattern used by 4 tables (legal_documents, rejection_analyses, authority pack, others). AC-45 Tier 3 sensitive-message approval uses this exact pattern.

3. **Option C registry pattern** — established in AC-44 Phase A + validated in AC-43 Phase A. AC-45 instantiates `clientFacingRegistry` mirroring `internalRegistry` and `workerFacingRegistry` — shared register/dispatch core, separate instance.

4. **AC-49 ClientContact role** — just shipped Phase A audit (commit `f3a56df`): role + visibility_scope JSONB + requireClientScope middleware + per-client scoping pattern. AC-45 routes use `requireRole("ClientContact") + requireClientScope` for client-facing endpoints; admin routes for config use `requireRole("Admin", "Executive")`.

**Net-new work:**
- 6 message-type handlers (templated, NOT free-form AI generation)
- Per-client policy storage (JSONB on clients table)
- Sensitive-data sanitization layer (enforced by TypeScript types)
- Admin client-comms-config UX
- ClientContact portal notifications surface

AC-45 is **net-new client-facing module but composition-heavy** — all four template stacks reduce design risk substantially. All architecture work is gated on AC-49 Phase B shipping ClientContact role; ClientContact role is the unblock leverage point.

---

## Per-feature inventory (against vision Module 3 client-facing features)

| Vision feature | Built | Partial | New build | Event source AC | Notes |
|---|---|---|---|---|---|
| Worker absent notice | — | — | template + handler | AC-41 `no_show.confirmed` | Tier 1 auto OR Tier 2 templated per per-client policy |
| Worker running late | — | — | template + handler | AC-41 `late.confirmed` | Tier 1 auto |
| Replacement search status | — | — | template + handler | AC-41 `replacement.search_started` | Tier 1 auto |
| Replacement confirmed | — | — | template + handler | AC-41 `replacement.assigned` | Tier 1 auto |
| ETA update | — | — | template + handler | AC-41 worker response (+ AC-43 worker-facing reply tracking) | Tier 1 auto |
| Staffing risk alert | — | — | template + handler | AC-47 `coverage.gap_detected` | Tier 1 auto OR Tier 2 templated |

**All 6 are net-new but template-based** (NOT free-form AI generation — safety enforcement at message-rendering layer).

---

## Tier breakdown

**Tier 1 — built, directly reusable (4 stacks):**
- webhooks table + webhook_logs + HMAC delivery + test endpoint (developer.ts:47-90)
- legal-approval.service.ts approval pattern (is_approved + approved_by + approved_at)
- AC-44/AC-43 Option C registry pattern (clientFacingRegistry instance)
- AC-49 ClientContact role + visibility_scope + requireClientScope middleware (just shipped Phase A)

**Tier 2 — built, needs adaptation:** None.

**Tier 3 — schema/route exists, frontend missing:** Webhook delivery infrastructure exists but no client-facing UX for in-portal message display.

**Tier 4 — net-new (substantial):**
- `client_facing_ai_events` types (or extend AC-44 InternalAIEvent with audience field)
- `client_ai_alerts` table (or extend `internal_ai_alerts` with audience column — AC-52 candidate consolidation decision)
- 6 message-type handlers (templated, no free-form AI)
- Per-client policy storage (JSONB on clients table)
- Sensitive-data sanitization layer (typed enforcement)
- ClientContact portal notifications surface
- Admin client-comms-config UX

---

## Architecture decision: Option C registry validation (third confirmation)

The Option C pattern validated:

```
services/internal-ai/registry.ts          → internalRegistry (AC-44)
services/worker-facing-ai/registry.ts     → workerFacingRegistry (AC-43)
services/client-facing-ai/registry.ts     → clientFacingRegistry (AC-45, NEW)

All three import same register/dispatch core (or shared services/_lib/event-registry.ts)
All three use same getProvider() / ai-rate-limiter.ts / scheduler infrastructure
Each has separate handler tree under services/{internal,worker-facing,client-facing}-ai/handlers/
```

**Why Option C consistently wins across all three audiences:**

| Concern | Single shared registry | Separate instances per Option C |
|---|---|---|
| Audit clarity | Mixed audit trail | Per-instance audit trail per audience |
| Safety profile | Worker-facing rules contaminate internal | Each audience has its own safety framework |
| Routing accidents | An internal alert could route to a worker channel | Registry instance = explicit audience |
| Testability | Cross-cutting concerns muddled | Independent test trees per audience |
| Handler discovery | One large handler set | Smaller per-audience handler sets |

**Implementation note:** if the three registries grow similar code, extract shared `register/dispatch` core into `services/_lib/event-registry.ts` consumed by all three. Defer this refactor to AC-44 Phase B WU-A2 + AC-43 Phase B WU-A6 + AC-45 Phase B WU-A3 alignment review. If duplication < 50 lines, inline is fine.

**ClientFacingAIEvent type** (new):

```
export interface ClientFacingAIEvent {
  type: string;                  // e.g., 'worker_absent', 'replacement_confirmed'
  tenantId: string;
  clientId: string;              // CLIENT scoping — every client-facing event MUST have clientId
  payload: Record<string, unknown>;
  triggeredAt: Date;
  sourceAC: string;
  sensitivity: 'tier1_auto' | 'tier2_templated' | 'tier3_approval_required';
}
```

The `clientId` field is mandatory — every client-facing event MUST be addressed to a specific client. The `sensitivity` field drives approval workflow routing.

---

## Message types catalog (6 message types)

| Message type | Trigger event | Approval gate | Required worker context | Recipient scope | Channel default |
|---|---|---|---|---|---|
| `worker_absent` | AC-41 `no_show.confirmed` | per-client policy (Tier 1 default, Tier 3 if client requires) | sanitized worker_name + site + shift_time | ClientContacts of that client + site | webhook OR email |
| `worker_late` | AC-41 `late.confirmed` | Tier 1 auto | sanitized worker_name + site + ETA + reason_category (NOT free-text) | ClientContacts of that client + site | webhook OR email |
| `replacement_search` | AC-41 `replacement.search_started` | Tier 1 auto | site + status | ClientContacts of that client + site | webhook OR email |
| `replacement_confirmed` | AC-41 `replacement.assigned` | Tier 1 auto | sanitized replacement_worker_name + site + arrival_time | ClientContacts of that client + site | webhook OR email |
| `eta_update` | AC-41 + AC-43 worker response | Tier 1 auto | sanitized worker_name + updated ETA | ClientContacts of that client + site | webhook OR email |
| `staffing_risk` | AC-47 `coverage.gap_detected` | per-client policy (Tier 1 default, Tier 2 templated if sensitive) | site + gap_severity + projected_resolution | ClientContacts of that client | email digest preferred |

**Templated, not free-form.** Each message type has a PL-first + EN i18n template with structured field interpolation. AI is NOT used to generate message content — only structured event data goes into pre-written templates. This is the safety enforcement: client can never receive AI-hallucinated text about their workers.

---

## Per-client policy configuration design

### Storage decision

Two options:
- **Option A:** Extend `clients` table with `comms_policy JSONB DEFAULT '{}'` column — simple, denormalized
- **Option B:** New `client_comms_policy` table — queryable, joinable

**Recommendation: Option A** (single JSONB column on clients table). Reasoning:
- Per-client policy is small (one row's worth of config per client)
- JSONB allows fine-grained per-message-type overrides without schema migration
- No joins needed for typical reads (always read alongside client row)
- Simpler than new table for small config

### Schema

```
ALTER TABLE clients ADD COLUMN IF NOT EXISTS comms_policy JSONB DEFAULT '{}';
```

### JSONB shape

```json
{
  "enabled_messages": ["worker_absent", "worker_late", "replacement_search", "replacement_confirmed", "eta_update", "staffing_risk"],
  "channels": {
    "default": "email",
    "worker_absent": "webhook",
    "staffing_risk": "email"
  },
  "approval_threshold": {
    "default": "tier1_auto",
    "worker_absent": "tier3_approval_required"
  },
  "webhook_id": "uuid-of-webhook-subscription",
  "email_recipients": ["client@tekra.pl", "ops@tekra.pl"],
  "frequency_caps": {
    "staffing_risk": { "max_per_day": 2 }
  }
}
```

Per-message-type fine grain inside JSONB. Cheaper than new table for v1. Migrate to dedicated table only if scope grows beyond simple config.

---

## Sensitive-data sanitization layer (the safety-critical design)

Per AC-49 visibility_scope, ClientContact cannot see worker financial data / legal cases / GDPR data / personal documents / reliability points scoring / disciplinary records / medical reason / personal phone.

**AC-45 enforces this via TypeScript types** in `services/client-message-sanitizer.ts`:

```
export interface SanitizedWorker {
  id: string;                    // Worker UUID (opaque, no PII)
  display_name: string;          // EITHER worker.full_name OR "Worker #1234" if anonymization-required
  assigned_site: string | null;  // Site they work at (client knows this anyway)
  basic_compliance_color: 'GREEN' | 'YELLOW' | 'RED' | 'EXPIRED';  // Color only, no specifics
  // NO pesel, iban, passport_number, medical_status, disciplinary_history,
  // payroll_data, reliability_score, phone, email, dob, gdpr_data
}

export function sanitizeWorkerForClient(worker: Worker, options: SanitizationOptions): SanitizedWorker {
  return {
    id: worker.id,
    display_name: options.anonymize ? `Worker #${worker.id.slice(-4)}` : worker.full_name,
    assigned_site: worker.assigned_site,
    basic_compliance_color: worker.compliance_status_color,
  };
}
```

**Enforcement mechanism:** Template render functions accept ONLY `SanitizedWorker` (not `Worker`). TypeScript types prevent leaking fields at compile time. Every template render goes through sanitizer.

**Example template** (`templates/worker-absent.ts`):

```
export function renderWorkerAbsent(
  worker: SanitizedWorker,   // ← TYPED: cannot contain PESEL/IBAN/etc.
  shift: { start: Date; site: string },
  language: 'pl' | 'en'
): { subject: string; body: string } {
  if (language === 'pl') {
    return {
      subject: `Pracownik nieobecny - ${shift.site}`,
      body: `Informujemy, że ${worker.display_name} nie stawił się na zmianę o ${formatTime(shift.start, 'pl')}. Poszukujemy zastępcy.`
    };
  }
  return {
    subject: `Worker absent - ${shift.site}`,
    body: `${worker.display_name} did not arrive for shift at ${formatTime(shift.start, 'en')}. Replacement search initiated.`
  };
}
```

No medical reason, no disciplinary note, no personal phone — by design, by typing.

---

## Approval/safety gates (reuse legal-approval pattern)

Three tiers (mirror AC-43 framework):

| Tier | Examples | Approval flow |
|---|---|---|
| **Tier 1 (auto-send)** | worker_absent, worker_late, replacement_search, replacement_confirmed, eta_update | Render template → sanitize → send via channel → log to webhook_logs/notification_log |
| **Tier 2 (templated, no AI)** | staffing_risk (sensitive operationally) | Template-only render (no AI rephrasing layer); audit-critical accuracy; auto-send |
| **Tier 3 (admin approval)** | Any message where per-client policy requires review BEFORE send; or messages containing edge-case content flagged by sanitizer | Pre-send queue → admin reviews via dashboard → approves via `legal-approval.service.ts` pattern (is_approved + approved_by + approved_at) → send |

**Per-client policy can override** Tier 1 → Tier 3 if a client requires all messages reviewed by APATRIS before send. This is the "controlled" notification mode from vision Module 3.

**Audit log requirement:** every outgoing message logged in `webhook_logs` (delivery) + `notification_log` (audit trail with sanitized content preview) for compliance + dispute resolution.

---

## Cross-AC overlap map

| AC | Type | Relationship | Phase B effect |
|---|---|---|---|
| **AC-41** | event source | 4 message types triggered by AC-41 events (absent, late, replacement_search, replacement_confirmed, eta_update) | 4 handlers gated on AC-41 Phase B WU-A3 event stream |
| **AC-47** | event source | staffing-risk alert triggered by AC-47 coverage gap | 1 handler gated on AC-47 Phase B |
| **AC-44** | parallel registry pattern | shared provider + rate limiter, separate registry instance per Option C | infrastructure share validated |
| **AC-43** | parallel registry pattern + Tier 3 approval pattern reuse | shared safety framework concepts (Tier 1/2/3 classification mirror) | architecture pattern share |
| **AC-49** | **DIRECT DEPENDENCY** | ClientContact role + visibility_scope + requireClientScope determines who receives | All architecture gated on AC-49 Phase B WU-A2 client_contacts schema |
| **AC-50** | gate | penalty/disciplinary content boundary — never leak to client | sanitization layer enforces; Tier 3 admin approval for edge cases |
| **AC-51** | discipline | admin client-comms-config routes role-gated correctly | applied at WU-A10 |
| **AC-31** | worker context | every message needs sanitized worker reference | uses SanitizedWorker type |
| **AC-46** | optional event source | case events optionally surface to client per per-client policy | DEFERRED — out of v1 scope |
| **AC-52** | drift | `client_ai_alerts` table OR extend `internal_ai_alerts` with `audience` column decision adds to AC-52 evidence | decision at WU-A2 |

---

## Phase B effort scope (work units, not hours)

### UNGATED ARCHITECTURE work (10 WU — ALL gated on AC-49 Phase B WU-A2 client_contacts schema, otherwise UNGATED)

- **WU-A1** — `ClientFacingAIEvent` types (mirror AC-44 InternalAIEvent + add `clientId` + `sensitivity` fields). Vitest tests over type contract.
- **WU-A2** — Storage decision: `client_ai_alerts` table OR extend `internal_ai_alerts` with `audience` column. AC-52 consolidation candidate — decide at WU-A2 kickoff.
- **WU-A3** — `clientFacingRegistry` instance (mirrors AC-44 register/dispatch). Import from shared core when extracted; defer extraction to alignment review.
- **WU-A4** — `services/client-message-sanitizer.ts` — `SanitizedWorker` interface + sanitization functions + TypeScript enforcement (templates accept only SanitizedWorker). Vitest tests over sanitization correctness (no PII leak).
- **WU-A5** — 6 message-type handlers + 6 PL+EN templates (worker_absent, worker_late, replacement_search, replacement_confirmed, eta_update, staffing_risk). One file per handler under `services/client-facing-ai/handlers/`. Each handler: register event type → consume sanitized worker → render PL+EN template → send via channel → log.
- **WU-A6** — Per-client policy storage: `ALTER TABLE clients ADD COLUMN IF NOT EXISTS comms_policy JSONB DEFAULT '{}'`. Migration + default policy seed.
- **WU-A7** — Webhook integration: deliver client-AI events via existing `webhooks` infrastructure (developer.ts pattern). Reuse HMAC-SHA256 signature + webhook_logs audit trail.
- **WU-A8** — ClientContact portal notifications surface: in-portal display for messages where `channel='portal_only'`. Extends AC-49 client portal page from WU-A7 with notifications list.
- **WU-A9** — Admin client-comms-config UX: dashboard form for per-client policy editing (channels + enable/disable per message type + approval threshold + email recipients + webhook subscription).
- **WU-A10** — Routes: GET/PATCH `/admin/clients/:id/comms-policy` (role-gated Admin/Executive) + GET `/client-portal/notifications` (role-gated ClientContact + requireClientScope) + GET `/admin/client-ai-alerts/pending-approval` (Tier 3 admin queue).

### GATED on AC-50 / Yulia legal (2 WU)

- **WU-B1** — Approval workflow for Tier 3 messages (reuse legal-approval.service.ts pattern). Specific Tier 3 trigger rules — what content triggers admin review — needs Yulia input.
- **WU-B2** — Per-client contract clarification (which specific clients have AC-45 enabled, what data they're contractually entitled to receive). Business decision per client, NOT technical-architecture.

### OPERATOR-INFORMED (2 WU)

- **WU-C1** — Default approval thresholds per message type (Manish + Yulia + legal-input batch).
- **WU-C2** — Default channel preference (email vs webhook) — per-client likely differs; informed by per-client contract clarification.

**Total: 10 architecture + 2 legal-gated + 2 operator-informed = ~14 work units.**

**Cross-AC unblock effect:** AC-49 Phase B unblocks AC-45 entirely. After AC-49 ships, AC-45 architecture can proceed in parallel with AC-41 + AC-47 + AC-43 Phase B work.

---

## Verdict reasoning: YELLOW

**Why not GREEN:** 6 net-new message templates + per-client policy storage + sanitization layer + ClientContact portal notifications + admin config UX is substantive scope (~14 work units).

**Why not RED:** 4 Tier-1 reusable stacks substantially reduce design risk. webhooks + signed delivery + webhook_logs all proven. legal-approval pattern proven across 4 tables. Option C registry pattern validated three times (this is the third). AC-49 ClientContact role + visibility_scope just shipped Phase A. Architecture is composition.

YELLOW captures: substantive new client-facing module BUT all design patterns proven; composition-heavy not invention.

---

## Phase B gating rule

- **ALL ARCHITECTURE WU (WU-A1 through WU-A10)** — gated on **AC-49 Phase B WU-A2** (client_contacts schema must exist). Once AC-49 ships, AC-45 architecture proceeds.
- **WU-A5 message handlers** — depending on event source:
  - 4 handlers (absent, late, replacement_search, replacement_confirmed, eta_update) gated on AC-41 Phase B WU-A3
  - 1 handler (staffing_risk) gated on AC-47 Phase B
  - Handlers can be coded and registered before events exist — they'll just not fire
- **WU-B1 (Tier 3 approval rules)** — gated on **AC-50** Yulia legal-input.
- **WU-B2 (per-client enablement)** — gated on **per-client contract clarification** (business decision, not technical).
- **WU-C1/C2** — operator-informed.

**Cross-AC unblock effect:** AC-45 is downstream consumer (gated on AC-49 + AC-41 + AC-47); doesn't unblock other ACs directly. ClientContact-via-AC-49 is the leverage point.

---

## Phase B sequencing rule

After AC-49 Phase B WU-A2 ships:

1. **WU-A1 first** — types definition. Atomic commit.
2. **WU-A2 next** — storage decision: extend `internal_ai_alerts` with `audience` column OR new `client_ai_alerts` table. Document decision in commit; flag AC-52 evidence either way.
3. **WU-A3 then** — clientFacingRegistry instance. Aligned with AC-44 Phase B WU-A2 registry pattern.
4. **WU-A4 then** — sanitizer service + TypeScript types. Vitest tests mandatory (no PII leak).
5. **WU-A5 then** — 6 handlers + 6 templates. Atomic commit per handler-type (6 commits) for granular smoke-validate. PL-first templates, EN bridge per CLAUDE.md MASTER_PLAN #16.
6. **WU-A6 then** — per-client policy storage migration.
7. **WU-A7 then** — webhook integration. Reuse HMAC pattern from developer.ts.
8. **WU-A8 then** — ClientContact portal notifications surface (extends AC-49 WU-A7).
9. **WU-A9 then** — admin config UX.
10. **WU-A10 then** — routes. Role-gated from day 1 (avoid AC-51 evidence).
11. **WU-B1** — when AC-50 legal-input clears.
12. **WU-B2** — when per-client contract clarification done (per client, can be gradual rollout).
13. **WU-C1/C2** — operator-informed after AC-35 + Yulia batch.

One commit per WU. Smoke-validate after each. Vitest tests mandatory for sanitizer (no PII leak) + registry dispatch + handler template rendering.

---

## Phase B first-action checklist (per work unit)

1. Re-read `webhooks` schema (init-db.ts:2109) + `webhook_logs` (line 2125) + `routes/developer.ts:47-90` (webhook handlers + HMAC) + `legal-approval.service.ts` + AC-49 audit doc (commit `f3a56df`) before any work.
2. For WU-A1 types: mirror AC-44 InternalAIEvent shape; ADD clientId + sensitivity fields. Defer to AC-44 Phase B types if available, otherwise define locally and align later.
3. For WU-A2 storage: decide schema with AC-52 lens — extending existing table = less drift; new table = clearer audience boundary. Recommend extending `internal_ai_alerts` with `audience TEXT CHECK IN ('internal','worker','client')` to minimize AC-52 drift.
4. For WU-A4 sanitizer: TypeScript types ENFORCE the contract; tests verify no PII fields leak through. Critical safety boundary — Vitest assertions over every SanitizedWorker shape variation.
5. For WU-A5 templates: PL-first per CLAUDE.md MASTER_PLAN #16; proper Polish diacritics (ł, ą, ę, ż, ó, ś, ć, ń, ź); add to BOTH `pl.json` + `en.json`; V3 convention search before authoring new strings.
6. For WU-A6 policy: ALTER + default seed for existing clients. Document default policy (Tier 1 auto for non-sensitive, all messages disabled until explicit per-client opt-in).
7. For WU-A7 webhook: reuse HMAC-SHA256 signature pattern from developer.ts:79. Audit via webhook_logs.
8. For WU-A8 portal: extends AC-49 client portal page; queries `client_ai_alerts` (or internal_ai_alerts WHERE audience='client') scoped to req.user.clientId.
9. For WU-A9 admin UX: form for per-client policy editing; Manish + Akshay primary users.
10. For WU-A10 routes: `requireRole(...)` on all routes from day 1. Client-facing routes use `requireRole("ClientContact") + requireClientScope`; admin routes use `requireRole("Admin", "Executive")`.

---

## Anti-hallucination caveats

- **webhooks infrastructure** — verified by reading init-db.ts:2109-2134 (webhooks + webhook_logs schemas) + routes/developer.ts:45-90 (handlers + HMAC + delivery test). Pattern is real and proven.
- **legal-approval pattern** — verified by reading services/legal-approval.service.ts line 51 (`UPDATE ... SET is_approved = TRUE, approved_by = $1, approved_at = NOW()`) + cross-referenced 4 tables using same pattern via grep.
- **AC-49 ClientContact role + visibility_scope** — sourced from AC-49 Phase A audit (commit `f3a56df`). The role/middleware/schema are SPEC, not yet implemented (AC-49 Phase B pending). AC-45 architecture DEPENDS on AC-49 Phase B shipping.
- **Option C registry pattern** — validated in AC-44 audit (commit `170b038`) + AC-43 audit (commit `1887044`); this is the THIRD validation. Cross-AC consistency confirmed.
- **6 message types** — sourced from save-prompt vision Module 3 enumeration. Not directly verified against original vision document text. WU-A5 first action confirms canonical list.
- **JSONB shape for comms_policy** — design proposal from this audit; not yet validated against per-client contract reality (some clients may have policy needs not captured in this shape). WU-A6 + WU-B2 first action may refine.
- **Sanitization PII enforcement via TypeScript** — relies on TypeScript strict mode + `unknown`-where-appropriate; runtime sanitization function is the actual safety boundary. WU-A4 first action ensures runtime guard not just compile-time.
- **Tier 3 admin approval flow** — reuses legal-approval pattern; assumes the same `is_approved + approved_by + approved_at` columns work for client_ai_alerts. WU-B1 first action verifies.
- **"All 6 are template-based, NOT AI-generated"** — design decision in this audit. If product later wants AI rephrasing for fluency, that's a Tier 2 → Tier 1 promotion AFTER worker-facing AI design discipline (AC-43 framework) is mature. Defer.

---

## AC-52 evidence — storage consolidation decision

This audit raises a NEW AC-52 evidence instance:
- **`internal_ai_alerts` vs potential `client_ai_alerts`** — should be ONE table with `audience` column, not two parallel tables (preventing future drift).

Recommend WU-A2 chooses extension-with-audience-column path. Document the decision; flag AC-52 ledger row update opportunity in commit message.

---

## Cross-AC notes (consolidation)

- **AC-49 Phase B unblocks AC-45 entirely** — high-leverage dependency.
- **AC-45 completes AI architecture trilogy** (AC-44 internal + AC-43 worker-facing + AC-45 client-facing) — same Option C pattern validated 3 times.
- **Sensitive-data sanitization is the safety-critical layer** — TypeScript types + runtime sanitization + Tier 3 admin approval as defense-in-depth.
- **Webhook + legal-approval + AC-49 ClientContact stacks make this composition-heavy** — substantive scope but proven patterns reduce risk.
- **Storage consolidation opportunity** (`audience` column on internal_ai_alerts) prevents future AC-52 drift; recommend extension over new table.
- **Per-client policy is contract-driven** — WU-B2 is business decision (which clients pay for AC-45 features); not architecture-gated.
- **AC-51 discipline applies from WU-A10** — admin client-comms-config routes role-gated correctly from day 1.
- **AC-50/Yulia batching opportunity for Tier 3 approval rules** continues — 7 items now: AC-50 + AC-39 item 8 + AC-41 WU-B2 + AC-43 consent text + AC-43 WU-B9 + AC-42 WU-B1 + AC-49 ClientContact consent text + AC-45 WU-B1 = 8 items.

---

## Status

- **Phase A:** complete (this document).
- **Phase B Architecture (10 WU):** UNGATED ARCHITECTURALLY but **gated on AC-49 Phase B WU-A2** shipping `client_contacts` schema.
- **Phase B Gated (2 WU):** AC-50 Yulia legal-input (Tier 3 rules); per-client contract clarification (business, per-client).
- **Phase B Operator-informed (2 WU):** AC-35 + Yulia batch defaults.
- **Recommended Day 31+ posture:** AC-45 is gated on AC-49 first. AC-49 (9 WU) is the unblock. Once AC-49 ships, AC-45 architecture (10 WU) proceeds in parallel with AC-41 + AC-47 + AC-43 Phase B work. AC-45 is composition-heavy; ship as atomic per-WU commits with smoke-validate.
- **AI architecture trilogy closure:** Option C registry pattern validated 3 times (AC-44 + AC-43 + AC-45). Pattern is solid. Consider Phase B alignment review: when AC-44 + AC-43 + AC-45 Phase B all approaching, decide whether to extract shared register/dispatch core to `services/_lib/event-registry.ts`.
- **Storage consolidation** (`audience` column) prevents future drift; recommend choosing extension over new table at WU-A2.
- **Template stacks:** webhooks + webhook_logs + HMAC delivery + legal-approval.service.ts + Option C registry pattern + AC-49 ClientContact role + AC-49 visibility_scope + AC-49 requireClientScope middleware — re-read before WU-A1 starts.

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
