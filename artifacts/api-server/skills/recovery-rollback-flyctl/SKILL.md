---
name: recovery-rollback-flyctl
description: Use this skill when a Fly.io deployment needs to be rolled back to a prior known-good image — for example after a bad deploy, regression discovered post-boot, or operational incident. Contains tested flyctl commands with verbatim syntax. Trigger when phrase "rollback" or "revert deploy" appears or when a deploy needs to be reverted on apatris-api or apatris-api-staging.
---

# Recovery rollback via flyctl

## When to use

- A deploy was pushed and a regression was discovered (in boot-soak or post-deploy observation)
- Need to revert apatris-api or apatris-api-staging to a prior known-good image
- Recovery scenario A or B from RECOVERY_PROCEDURES.md (code-level recovery)
- Joint-go decision needed for prod rollback (Manish + chat-Claude must both agree)

## Critical syntax notes

The valid command is:

  flyctl deploy --app APP_NAME --image registry.fly.io/APP_NAME:deployment-IMAGE_TAG

The following is NOT a valid flyctl subcommand:

  flyctl image deploy ...

If the command starts with `flyctl image` you have the wrong syntax. The correct command is `flyctl deploy --image`.

## Step-by-step rollback procedure

Step 1 — List recent releases to identify the target image:

  flyctl releases --app APP_NAME | head -10

Output shows version, status, description, image tag, and timestamp. Find the last known-good version.

Step 2 — Capture the deployment image tag from the target release.

The image tag has format: `deployment-01KQXXXXXXXXXXXXXXXXXXXXXX`

Step 3 — For PRODUCTION rollback only — joint-go gate:

Confirm with Manish + chat-Claude before proceeding. Production rollback is never unilateral. State explicitly: "Proposing rollback of apatris-api to deployment-XXX. Confirm joint-go."

Step 4 — Execute the rollback:

  flyctl deploy --app APP_NAME --image registry.fly.io/APP_NAME:deployment-IMAGE_TAG

Step 5 — Boot-soak the rollback:

Wait 60 seconds. Then verify:

  flyctl status --app APP_NAME
  flyctl logs --app APP_NAME | tail -50

Confirm both machines started, no worker_threads errors, no "Cannot find module" errors, Sentry init log present, health check responding.

Step 6 — Update RECOVERY_PROCEDURES.md with date-tested entry if applicable.

## Examples from APATRIS work

**Item 2.3 staging rollback (verified 2026-05-05):**
- Reason: pino-sentry-transport worker_threads crash in staging boot
- Target: prior known-good staging image
- Outcome: 25-minute recovery timeline, full restoration to working baseline

**Day 18 staging boot-soak surfacing crash:**
- Boot-soak window caught worker_threads crash within minutes
- No prod impact because staging caught it
- Confirmed staging-as-firewall pattern works

## Anti-patterns

Do not run `flyctl image deploy` — this is NOT a valid subcommand. Use `flyctl deploy --image`.

Do not skip joint-go for prod rollback. Production never reverts unilaterally.

Do not skip boot-soak after rollback. Rollback can fail too. Always verify the reverted image actually boots clean.

Do not rollback without first identifying the target via `flyctl releases`. Never guess image tags.

Do not use Scenario D (rewrite history) without explicit joint-go and documented reason. RECOVERY_PROCEDURES.md flags this as NOT-RECOMMENDED.

## When NOT to use

- Code-level fix is faster than rollback (single-line bug fix may be quicker than full rollback)
- The bad deploy is from a third party (different repo) — different recovery path
- Database state changed — rollback of code alone won't fix data corruption (see RECOVERY_PROCEDURES.md Scenario C)

## Cross-reference

Full recovery context: artifacts/api-server/docs/RECOVERY_PROCEDURES.md
Appendix A: Item 2.3 case study with 25-min recovery timeline
Appendix B: secret source-of-truth (zero secret values exposed)

## Slug

recovery-rollback-flyctl
