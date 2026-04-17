# CONTEXT — Apatris Compliance Hub

> Session continuity doc. Read this first when resuming work.
> Last updated: 2026-04-17

## Project
- Apatris Compliance Hub — SaaS for Polish workforce/legal compliance
- Solo founder build, ~30 days
- Monorepo: apatris-dashboard (React 19, 114 pages), workforce-app (PWA), api-server (Express 5, 130+ routes)
- Stack: TypeScript, pnpm, Vite, Vitest, Fly.io

## Environments
- Prod: https://apatris-api.fly.dev (app: `apatris-api`)
- Staging: https://apatris-api-staging.fly.dev (app: `apatris-api-staging`)
- Health endpoint: `/api/healthz`
- VAPID key endpoint: `/api/push/vapid-key`

## Secrets configured (Apr 17, 2026)
- Prod: `SENTRY_AUTH_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Staging: same 4 secrets, but **separate** VAPID pair (do NOT share between envs)
- All saved in user's password manager

## Locked files — do NOT modify without explicit approval
- `services/zus.service.ts` (verified payroll math, ZUS 2026 rates)
- `services/legal-status.service.ts` (decision trace + trusted inputs chain)
- `lib/auth-middleware.ts` (JWT + OTP + RBAC)
- Document intake approval flow
- Dashboard navigation tree

## Recent work (Apr 17, 2026 — v287 prod, v4 staging)
- Stripe billing now fail-loud (503 if keys missing) instead of silent
- Sentry Express middleware wired correctly
- Frontend push notification subscribe flow added (workforce-app)
- 5 runtime bugs fixed: `legal-kb.ts`, document-intake-hardening, escalation-engine, legal-copilot bilingual, airtable Buffer/Blob
- Staging redeployed from stale Apr 13 v1 → current v4

## Known deferred items (not bugs, intentional)
- `saas-billing.ts` — intentionally Stripe-optional with local DB fallback
- 159 TS strict errors — route-level type drift, not runtime bugs
- WhatsApp escalation — `to` field empty (needs coordinator phone lookup, not in scope)
- Stripe SDK type drift on `current_period_start`/`current_period_end`
- Frontend push only subscribes logged-in users (anonymous PWA visitors skipped, intentional)
- Decision trace has structured JSON but no UI yet

## Next priorities (in order)
1. Dummy seed data for staging — so team testing isn't on empty screens
2. Decision trace UI — operators can debug legal calls
3. Fix critical TS errors (~50 of the 159)
4. Smoke tests for dashboard + workforce-app
5. Real Stripe go-live when ready for paying customers

## Slash commands
- `/ship` — full pipeline to PROD (build → test → push → fly deploy → health check)

## How to resume Claude session from today
```
claude --resume 37ce6fb4-16b1-46da-aeb7-0af28672d85b
```
