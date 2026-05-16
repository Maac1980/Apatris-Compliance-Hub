# AC-49 Phase A Audit — Client Contact Role + RBAC Extension

**Date:** 2026-05-16 (Day 30)
**Verdict:** YELLOW (existing JWT + requireRole foundation covers most vision roles; Client Contact needs new auth flow; Manager/Office Staff mapping needs Manish/Yulia clarification; drift discoveries grow AC-52 evidence)
**HEAD at audit:** `10e6dba`
**Scope:** Read-only audit of existing auth-middleware + 7-role taxonomy + client portal infrastructure + Manager/Office Staff vision-mapping ambiguity. Mirrors prior Phase A pattern.

---

## Current state summary

**Auth infrastructure is solid.** `lib/auth-middleware.ts` provides `requireAuth` (JWT Bearer + cookie fallback) + `requireRole(...allowedRoles)` factory. Standard JWT pattern with email + name + role + assignedSite + tenantId + tenantSlug payload. Used consistently across ~100+ routes.

**7 roles already exist** per auth-middleware.ts:53-60:
- Admin — dashboard admins (Manish, Akshay)
- Executive — T1 mobile app
- LegalHead — T2 mobile app
- TechOps — T3 mobile app
- Coordinator — T4 mobile app + site coordinators (**duplicate name**)
- Professional — T5 mobile app

**Client portal infrastructure ALREADY EXISTS — but token-based, not role-based.** Two client portal tables:
- `client_portal_tokens` (line 555) — token + site_name scoped, used for read-only client links
- `client_portal_links` (line 2564) — token + worker_ids[] array scoped
- `clients` (line 2294) — main client company records

Both portal tables are **anonymous shared-link access**, NOT proper authenticated accounts. Vision Module 1 "client-company contact" feature requires real role-based authenticated users — net-new auth flow.

**No invite/magic-link infrastructure exists.** Zero matches for `invite`/`magic_link`/`invitation` — would need to be built for Client Contact onboarding.

AC-49 is therefore **role mapping clarification + Client Contact auth flow + token-portal-to-account migration** — substantial but builds on existing JWT pattern. Most architecture composes existing primitives; one new auth path required.

---

## Vision role mapping table

| Vision role | Current role(s) | Mapping | Gap? |
|---|---|---|---|
| **Worker** | Professional (T5) | ✓ direct | none |
| **Coordinator** | Coordinator (T4 + site coordinator — duplicate name) | ✓ direct (with naming drift — AC-52 evidence) | naming consistency only |
| **Manager** | TechOps (T3)? Executive (T1)? | UNCLEAR | **needs Manish/Yulia clarification** |
| **Office Staff** | LegalHead (T2)? TechOps (T3)? | UNCLEAR | **needs Manish/Yulia clarification** |
| **Owner / Admin** | Admin (dashboard) + Executive (T1) | NEAR-MAP (two names for same role — drift) | naming consistency + AC-52 evidence |
| **Client Contact** | NONE | **NEW BUILD** | full new role + auth flow |

**Open questions for Manish/Yulia (Phase B WU-A1):**
- Does "Manager" map to existing TechOps (T3), or is it a distinct role in vision intent?
- Does "Office Staff" split into "Legal Office Staff" (LegalHead) and "Tech Ops Staff" (TechOps), or is it one role?
- Should "Admin" and "Executive" consolidate into "Owner/Admin", deprecating the duplicate?

**4 mapping outcomes are possible:**

| Option | Manager role | Office Staff role | Admin/Executive |
|---|---|---|---|
| A — minimal change | TechOps | LegalHead | consolidate to Admin |
| B — explicit Manager | NEW "Manager" role | LegalHead + TechOps split | consolidate to Admin |
| C — split Office Staff | TechOps | NEW "OfficeStaff" + LegalHead retained | Admin only |
| D — full reshape | NEW Manager + NEW OfficeStaff + NEW ClientContact | LegalHead retained | consolidate to OwnerAdmin |

Recommend **Option A (minimal change)** as default unless Manish has strong reason to add net-new role names. Option A: Worker / Coordinator / TechOps (Manager) / LegalHead (Office Staff legal) / Admin / ClientContact (new) = 6 distinct roles using existing names + 1 net-new for Client Contact.

---

## Client Contact role specification

### Data scope

- **Per-tenant:** ClientContact belongs to ONE tenant (one APATRIS deployment). Same person representing two tenants' clients = two separate accounts.
- **Per-client-company:** ClientContact is scoped to ONE client_id (their employer-client of APATRIS). Cross-client isolation MANDATORY — Client A's ClientContact cannot see Client B's workers.
- **Visibility surface (default):** workers assigned to their client's sites OR specific worker_ids list (matches `client_portal_links.worker_ids[]` pattern).

### Can see (allowlist)

- Workers assigned to their client (presence/availability only, not internal status fields)
- Compliance status summary per worker (GREEN/YELLOW/RED color only — not detailed document expiry timeline)
- Absence/late/replacement notifications (when ENABLED per AC-45 + per-contract)
- Site coverage view (which workers are on which sites today)
- Their own consumed/contracted hours summary (operational data — what they're paying for)

### Cannot see (denylist)

- Other clients' workers
- Internal AI alerts (AC-44 surface — operator-only)
- Worker financial data (payroll, advances, reliability points scoring detail)
- Legal cases / GDPR data / personal documents (passport, PESEL, IBAN)
- Worker reliability points scoring (operational-internal)
- Other clients' compliance status
- Internal operator messaging (AC-40 + AC-46 surfaces)

### Login flow

**Recommended approach** (Option C from RBAC schema section below):
1. Owner/Admin invites ClientContact via dashboard form (email + name + which client_id they represent + visibility scope override if any)
2. System creates `client_contacts` row with role='ClientContact' + tenant_id + client_id + invite_token + expires_at
3. Email sent to ClientContact with magic link (`/client-portal/login?token=invite_token`)
4. Client opens link, enters phone OR email for verification (mirror mobile PIN pattern: speakeasy TOTP OTP)
5. On verification, system issues JWT with role='ClientContact' + tenant_id + client_id
6. Subsequent requests use JWT (15-min + 30-day refresh pattern from existing /auth/refresh)

**Per-tenant scope:** ClientContact account exists in one tenant only. Cross-tenant scenarios require separate accounts.

---

## RBAC schema/middleware changes

### Schema decision

Three options considered for storing client contact users:

| Option | Storage | Auth path |
|---|---|---|
| A — Extend admins table | Add `client_id UUID NULLABLE` column to admins; role = 'ClientContact' | Same /auth/login |
| B — Separate auth path | New `client_contacts` table + new /client-auth/* routes + separate JWT key | Forked /client-auth/* |
| C (RECOMMENDED) — Separate table, shared auth | New `client_contacts` table mirroring admins shape + client_id NOT NULL + same /auth/login flow | Single /auth/login with role detection |

**Why Option C:**
- Same JWT signing key (no separate key management)
- Same login + refresh + logout flow (no fork)
- Separate table = clear "is this a client user?" answer at row level
- client_id NOT NULL = client scoping enforced at schema level
- Audit trail clearer (client_contacts.actions vs admins.actions)
- Easier to apply different password policies (e.g., ClientContacts require stronger passwords / shorter session timeout)

**Proposed schema:**

```
CREATE TABLE IF NOT EXISTS client_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT,
  invite_token TEXT UNIQUE,
  invite_expires_at TIMESTAMPTZ,
  invite_accepted_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  visibility_scope JSONB DEFAULT '{}',  -- per-contact overrides (specific worker_ids, site allowlist, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT,
  UNIQUE(tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_client_contacts_tenant ON client_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_client ON client_contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contacts_invite ON client_contacts(invite_token) WHERE invite_token IS NOT NULL;
```

### Middleware additions

**Add to auth-middleware.ts:**

```
// New role added to allowlist documentation
// - "ClientContact" — client-side contact users (per-client scope)

// New middleware: client scoping
export function requireClientScope(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) { res.status(401).json({ error: "Authentication required." }); return; }
  if (req.user.role !== "ClientContact") return next();  // Internal roles bypass scoping
  if (!(req.user as any).clientId) {
    res.status(403).json({ error: "Client scope missing on user token." });
    return;
  }
  // Attach clientId for downstream handlers to use in WHERE clauses
  (req as any).clientId = (req.user as any).clientId;
  next();
}
```

**JWT payload extension** (add `clientId?: string` to user payload type at auth-middleware.ts:9-17):

```
declare global {
  namespace Express {
    interface Request {
      user?: {
        email: string;
        name: string;
        role: string;
        assignedSite?: string;
        tenantId?: string;
        tenantSlug?: string;
        clientId?: string;   // NEW — present only when role = "ClientContact"
      };
    }
  }
}
```

### Per-route guards for client_contact

ClientContact-facing routes pattern:
```
router.get("/client-portal/workers", requireAuth, requireRole("ClientContact"), requireClientScope, async (req, res) => {
  const clientId = (req as any).clientId;
  const workers = await query(
    "SELECT id, full_name, assigned_site, compliance_status FROM workers WHERE tenant_id = $1 AND id = ANY(SELECT worker_id FROM client_worker_links WHERE client_id = $2)",
    [req.tenantId, clientId]
  );
  res.json({ workers });
});
```

A new `client_worker_links` table (or reuse `client_portal_links.worker_ids[]` shape — but consolidate per AC-52) maps which workers a client can see.

---

## Auth flow design

### Invite flow

```
Owner/Admin dashboard
  → POST /admin/client-contacts
     body: { tenant_id, client_id, full_name, email, phone? }
  → Server: generates invite_token + expires_at (7 days), stores client_contacts row,
            sends invite email via lib/mailer.ts
  → Email contains magic-link: https://apatris-api.fly.dev/client-portal/onboard?token=<invite_token>
  
ClientContact receives email
  → Clicks link → /client-portal/onboard?token=<invite_token>
  → Frontend page: "Welcome <name>. Verify your phone/email to access <client_name>'s portal."
  → User enters phone OR email for OTP verification (mirror mobile-login pattern)
  → POST /client-portal/verify-otp { token, otp_code, password (optional set) }
  → Server: validates token + OTP, sets invite_accepted_at, optionally stores password_hash
  → Issues JWT { role: "ClientContact", tenantId, clientId, name, email } + refresh token

Subsequent login
  → POST /auth/login (existing) — detects email matches client_contacts row → issues ClientContact JWT
  OR  
  → POST /client-portal/login { email, password } — separate route for clarity
  
Token refresh
  → POST /auth/refresh (existing) — works identically; client_contacts use same refresh table
```

### Authentication method options

| Method | Pro | Con | Recommendation |
|---|---|---|---|
| Password | Familiar | Password reset support needed | Default |
| Magic-link recurring | No password to manage | Email dependency every login | Optional for ClientContacts who prefer |
| SSO (per-client) | Enterprise-grade | Substantive integration per client | Defer — out of v1 scope |

**Recommend: password default + magic-link optional.** Magic-link infrastructure built for invite flow can be reused for recurring magic-link login by clients who prefer.

---

## Cross-AC impact map

| AC | Type | Effect |
|---|---|---|
| **AC-45** (client-company AI) | gated entirely on AC-49 | AC-45 routes need `requireRole("ClientContact")` + `requireClientScope`; AC-45 cannot ship without AC-49 |
| **AC-43** (worker-facing AI) | parallel — different audience | AC-43 is worker-channel; AC-45 is client-channel; both use notification_log; AC-49 doesn't gate AC-43 |
| **AC-51** (system-wide role-gating) | informs taxonomy | AC-51 Phase A should run AFTER AC-49 Phase B so role set is stable; AC-51 audits all routes against the final 6-role + ClientContact taxonomy |
| **AC-48** (Manager dashboard) | role clarification | ManagerHome.tsx audience clarification depends on Manager/Office Staff mapping (Option A vs B/C/D); AC-48 Phase A should confirm which role audience |
| **AC-44** (internal AI orchestration) | denied to ClientContact | Confirms ClientContact does NOT see internal_ai_alerts (admin-only) |
| **AC-31** (worker profile) | denied to ClientContact for sensitive fields | ClientContact sees worker presence + compliance summary only, NOT documents/payroll/legal |
| **AC-39** (leave tab) | partial — depends on policy | ClientContact MAY see "worker on leave" summary if vision intends; defer to per-contract clarification |
| **AC-52** (drift consolidation) | adds evidence | Client portal table drift (client_portal_tokens vs client_portal_links) + Admin/Executive role duplication + Coordinator name reuse all add to AC-52 evidence |

---

## Phase B effort scope (work units, not hours)

### UNGATED architecture work (7 WU — ship first)

- **WU-A1** — Role mapping decision: Manish + Yulia confirm vision-to-tier mapping (Option A/B/C/D from table above). Decision documented before any role-name changes.
- **WU-A2** — Schema: `client_contacts` table (mirror admins shape + client_id NOT NULL + invite_token + visibility_scope JSONB) + `client_worker_links` table (or consolidate with client_portal_links per AC-52).
- **WU-A3** — Auth-middleware extension: add `clientId?: string` to user payload type + new `requireClientScope` middleware + document "ClientContact" role in allowlist.
- **WU-A4** — Invite flow: `POST /admin/client-contacts` (Admin invites) + `POST /client-portal/verify-otp` (accept invite) + magic-link email template via lib/mailer.ts.
- **WU-A5** — Login flow integration: extend `/auth/login` to detect client_contacts rows + issue ClientContact JWT with clientId payload. OR dedicated `/client-portal/login` (cleaner, recommended).
- **WU-A6** — Admin invite UX: dashboard form for Owner/Admin to invite ClientContact (Manish-facing). Form: select client_id from clients table + email + name + optional visibility_scope JSONB overrides.
- **WU-A7** — Client portal page: read-only dashboard for ClientContact (workers assigned to them + compliance summary + their consumed hours summary). Scoped via `requireClientScope`. Initially small — can extend with AC-45 notifications later.

### COORDINATION (1 WU)

- **WU-B1** — AC-51 Phase A coordination: when AC-51 sweep runs, role taxonomy is final (AC-49 Phase B complete). AC-51 audits all routes against the 6-role + ClientContact set.

### OPERATOR-INFORMED (1 WU)

- **WU-C1** — Per-client visibility defaults: which alerts/data go to which client by default (Yulia + Manish input + per-contract clarification). Informs WU-A6 form defaults.

**Total: 7 ungated + 1 coordination + 1 operator-informed = ~9 work units.**

Smaller than AC-43 (20), AC-44 (13), AC-41/AC-42/AC-46/AC-40 (11-15), but with high downstream unblock leverage: **AC-45 entire Phase B consumes AC-49 role + invite flow** — AC-45 cannot ship without AC-49.

---

## Verdict reasoning: YELLOW

**Why not GREEN:** Client Contact requires new auth flow (invite + magic-link or password). 2 client_portal tables exist + drift to consolidate. Manager/Office Staff vision mapping ambiguity needs operator clarification.

**Why not RED:** JWT + requireRole foundation exists and is solid (used 100+ times). Admins table pattern directly reusable for client_contacts schema. Mobile-login OTP pattern reusable for verify-otp. Mailer infrastructure exists for invite emails. Single JWT signing key + single refresh flow (Option C) keeps complexity contained.

YELLOW captures: substantive new build (auth flow + role + portal page) but most components compose existing primitives.

---

## Phase B gating rule

- **WU-A1 (role mapping)** — gated on **Manish + Yulia clarification conversation** (Option A/B/C/D choice). 5-min decision; not legal-gated, just operational clarity.
- **WU-A2 through WU-A7 (schema + middleware + auth flow + UX + portal page)** — UNGATED. Ship Day 31+ as 6 atomic work units after WU-A1.
- **WU-B1 (AC-51 coordination)** — sequenced AFTER AC-49 Phase B complete; AC-51 Phase A should not start before AC-49 ships.
- **WU-C1 (operator-informed visibility defaults)** — Manish + Yulia input + per-client contract clarification.

**Cross-AC unblock effect:** **AC-49 Phase B unblocks AC-45 entirely.** AC-45 (client-company AI) cannot ship without ClientContact role to authorize sends. High leverage despite small total scope.

---

## Phase B sequencing rule

1. **WU-A1 first** — Manish + Yulia 5-min decision on role mapping option. Decision documented in commit message.
2. **WU-A2 next** — `client_contacts` schema. `CREATE TABLE IF NOT EXISTS` discipline.
3. **WU-A3 then** — auth-middleware extension. Vitest tests over requireClientScope behavior.
4. **WU-A4 then** — invite flow. Test invite-create → email-send → token-verify → JWT-issue end-to-end.
5. **WU-A5 then** — login flow integration. Verify ClientContact JWT carries clientId.
6. **WU-A6 then** — admin invite UX. Role-gated (Admin/Executive only — avoid AC-51 evidence).
7. **WU-A7 then** — client portal page. Scoped via requireClientScope.
8. **WU-C1** — operator-informed visibility defaults applied.
9. **WU-B1** — AC-51 Phase A kickoff (post-AC-49).

One commit per WU. Smoke-validate after each. Vitest tests mandatory for auth-middleware additions (requireClientScope behavior, JWT clientId payload).

---

## Phase B first-action checklist (per work unit)

1. Re-read `lib/auth-middleware.ts` (81 lines) + `routes/auth.ts` route signatures + `admins` table schema (init-db.ts:105) + `clients` schema (line 2294) + `client_portal_tokens` (line 555) + `client_portal_links` (line 2564) before any work.
2. For WU-A1: 5-min Manish + Yulia conversation. Document decision in audit doc closure + commit message. Don't proceed until clear.
3. For WU-A2 schema: `CREATE TABLE IF NOT EXISTS client_contacts`. All columns `ADD COLUMN IF NOT EXISTS`. Index on (tenant_id, email) UNIQUE.
4. For WU-A3 middleware: extend Request type + add requireClientScope. Vitest tests: ClientContact + clientId present → next(); ClientContact + clientId missing → 403; internal roles → bypass scoping.
5. For WU-A4 invite: reuse lib/mailer.ts (verified during AC-43 audit); email template authored PL-first per CLAUDE.md MASTER_PLAN #16; OTP pattern mirrors /auth/mobile-login.
6. For WU-A5 login: decision needed: extend /auth/login (auto-detect) or new /client-portal/login (cleaner). Recommend latter for explicitness.
7. For WU-A6 admin invite UX: dashboard form + clients dropdown + email + name + optional visibility_scope JSONB editor.
8. For WU-A7 portal page: minimal v1 (worker list + compliance summary + consumed hours). Extend in AC-45 Phase B with notifications surface.
9. For i18n: invite email + portal page strings in BOTH `en.json` and `pl.json` per CLAUDE.md Bilingual Architecture.
10. Per-route requireRole + requireClientScope discipline from day 1 (avoid creating new AC-51 evidence).

---

## Anti-hallucination caveats

- **7 existing roles** — verified by reading auth-middleware.ts:53-60 verbatim. Coordinator duplicate name is in the comment, not just my interpretation.
- **TWO client portal tables** — verified by grep + reading line 555 + line 2564 schemas. Drift is real; adds to AC-52 evidence.
- **No invite/magic-link infrastructure** — verified by grep returning zero for invite/magic_link/invitation patterns.
- **JWT pattern usage** — auth-middleware.ts implements one canonical pattern; not deep-counted across all 131 route files but consistent pattern observed across 4-5 spot-checks (matching.ts, legal-alerts.ts, self-service.ts, gps.ts).
- **Client-portal-tokens routes** — grep returned zero direct route matches; means either routes use these tokens via indirect imports (likely — need WU first-action verification) OR infrastructure is unused (also possible).
- **Manager/Office Staff mapping ambiguity** — this audit's central operator-input gap; not invented. Vision lists 6 roles; current has 7 names; some clearly map (Worker=Professional, Coordinator=Coordinator) others need clarification.
- **Option C recommendation (separate table, shared auth)** is design choice from this audit; not validated against AC-45 Phase A (which doesn't exist yet). When AC-45 Phase A lands, confirm Option C still works for AC-45 needs.
- **Per-tenant scoping** assumes ClientContact is single-tenant — if vision intends cross-tenant ClientContacts (one person reps multiple clients across tenants), Phase B WU-A2 schema needs adjustment.
- **Mobile OTP pattern reuse** — speakeasy TOTP mentioned per CLAUDE.md; verify implementation reads identical pattern at Phase B WU-A4.
- **`client_worker_links` table** named in WU-A2 as either new OR consolidating with `client_portal_links.worker_ids[]` — defer to AC-52 drift consolidation decision OR ship as new table inside WU-A2 with note to revisit at AC-52.

---

## AC-52 evidence additions (Day 30 drift discoveries)

This audit adds 4 NEW drift instances to AC-52's evidence base:

1. **Two client portal tables** — `client_portal_tokens` (line 555) + `client_portal_links` (line 2564). Different shapes, same purpose.
2. **Admin vs Executive role duplication** — both documented as elevated dashboard/T1 roles; consolidation candidate.
3. **Coordinator name used twice** — site coordinator AND T4 mobile app per auth-middleware.ts comment. Naming-only drift.
4. **TechOps + LegalHead unclear mapping** to vision Office Staff — semantic drift (vision-vs-implementation taxonomy mismatch).

AC-52 Phase A scope grows accordingly. Recommend updating AC-52 ledger row description to reference these 4 new instances when capturing.

---

## Cross-AC notes (consolidation)

- **AC-49 Phase B unblocks AC-45 entirely** — high leverage despite small scope (9 WU).
- **AC-49 informs AC-51 role taxonomy** — sequence AC-51 Phase A after AC-49 Phase B ships so role set is stable.
- **AC-49 informs AC-48 Manager dashboard audience clarification** — WU-A1 role mapping decision affects which role ManagerHome.tsx serves.
- **AC-52 evidence grows** with 4 new drift instances from this audit; consider expanding AC-52 ledger row description.
- **AC-51 discipline applies from Day 1** — every new route in WU-A4/A5/A6/A7 must `requireRole` correctly to avoid creating new AC-51 evidence.
- **Yulia legal-input batching opportunity could include** consent text for ClientContact invite (data-processing agreement disclosure) — adds to growing 6-item batch (AC-50 + AC-39 + AC-41 + AC-43 + AC-42 + this) = 7 items.

---

## Status

- **Phase A:** complete (this document).
- **Phase B Architecture (7 WU):** **UNGATED** after WU-A1 5-min Manish/Yulia decision. Ship Day 31+ as atomic per-WU commits.
- **Phase B Coordination (1 WU):** AC-51 Phase A sequenced after AC-49 ships.
- **Phase B Operator-informed (1 WU):** per-client visibility defaults (Manish + Yulia + per-contract).
- **Recommended Day 31+ posture:** AC-49 is the highest-leverage SMALL workstream (9 WU unblocks AC-45 entirely). Sequence early after AC-35 interviews so role taxonomy is stable before AC-51 sweep or AC-45 Phase B begins. WU-A1 is a 5-min conversation Manish can have anytime.
- **Drift discoveries:** 4 new AC-52 evidence instances (client portal tables + Admin/Executive + Coordinator name + TechOps/LegalHead semantic).
- **Template stacks:** lib/auth-middleware.ts (81 lines) + routes/auth.ts mobile-login pattern + admins table + lib/mailer.ts + speakeasy TOTP — re-read before WU-A2 starts.

When Phase B starts, mark this document section "Phase A: complete (closed by Phase B kickoff <date>)".
