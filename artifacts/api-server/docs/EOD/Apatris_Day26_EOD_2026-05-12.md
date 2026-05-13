# Apatris Day 26 EOD - Tuesday May 12, 2026

**Build:** APATRIS Compliance Hub
**HEAD at close:** 5f08a66
**Production:** Fly v302 (deployed Day 25; Job 12 dry-run firing harmlessly daily ~04:00 UTC)
**Session:** Manish + chat-Claude + Apatris Claude + Holmes (cross-build via EEJ routing)

---

## Health Check (Layer 1) - third application of eod-health-check skill

| Zone | Verdict | Notes |
|------|---------|-------|
| 1 Sentry | clean | Job 12 dry-run cycle ~04:00Z May 12 fired clean (31 workers, 1 legitimate alert, 0 errors); no schema-assumption events; staging zombie remains suspended |
| 2 Prod | clean | v302 deployed May 11 09:08Z, both Fly machines healthy, /health 200. NEW commits stacked on main since v302 (6 commits) but **6 deploy attempts to v303 all failed** — production untouched throughout |
| 3 Scheduler | clean | Job 12 dry-run cycle 04:00:08Z May 12 produced: 31 workers scanned both machines, 1 alert WOULD HAVE BEEN created (Rajesh Kumar Singh work permit 1d expiry, EXPIRY_WARNING HIGH), 0 errors, ~23.5sec; Phase B.2 review verdict 🟢 GREEN flag-flip ready (executed Day 26 commit 2) |
| 4 Database | clean | init-db ran clean both machines on v302; AC-21 backfill stable; admins table with 2 emails populated |
| 5 Background jobs | clean | zero schema-assumption errors in entire visible buffer |
| 6 Anomalies | 1 caught + escalated | Day 26 build-pipeline reliability arc: 5 deploy attempts surfacing 6 recursive HB12 layers of build-pipeline drift; pause-and-regroup escalation to Day 27 |

**Layer 1 ritual (third application) learnings:**
- Cross-environment cron observability matures: dry-run mode + machine-by-machine cycle confirmation works
- Build-pipeline reliability is a layer of operational hygiene the ritual didn't previously surface; AC-33 hygiene workstream captures it
- "Production unaffected throughout" is the right framing when feature work pauses at the deploy layer; v302 dry-run continues serving the core function
- 6-layer recursive HB12 catches confirm the discipline is load-bearing across discipline layers (chat-Claude AC drift / save-prompt Find-Replace drift / build infrastructure enumeration / version-strictness gap)

---

## What was built today

**7 commits on origin/main + 5 failed deploy attempts + 3 Phase A audits + 1 Phase B.2 review + 1 Phase B.2 closure + 1 Day 26 EOD commit:**

1. `8986187` (Day 26 commit 1) — AC-29 + AC-30/31/32 captured in Migration Ledger
   - AC-29 Day 25 dead-code-audit-before-wiring discipline (capture gap closed)
   - AC-30 dual-machine cron coordination (Phase B.2 review side-finding)
   - AC-31 Command Center person-detail interconnections (Phase A audit)
   - AC-32 Document-driven auto-profile orchestration wrapper (Phase A.6 audit)
   - 28 → 32 total ACs
   - Apatris Claude GATE caught chat-Claude drift: count assumed 29 when actual was 28

2. `de62035` (Day 26 commit 2) — AC-15 Phase B.2 closure: Job 12 dryRun=false flag flip at src/index.ts:110
   - Single-line Edit
   - Pre-commit verified: Phase B.2 review Day 26 04:00Z showed 31 workers / 1 alert / 0 errors / 23sec

3. `4b2c497` (Day 26 commit 3) — switch artifacts/api-server/Dockerfile to --frozen-lockfile
   - Phase A.10 diagnosis: --no-frozen-lockfile + minimumReleaseAge 1440 + registry metadata flakiness
   - Recommended Option E single-line fix
   - **WRONG Dockerfile fixed** — Fly uses workspace-root /Dockerfile (fly.toml empty [build])

4. `a279c75` (Day 26 commit 5) — switch workspace-root /Dockerfile to --frozen-lockfile
   - Audit-first scope-error catch: Phase A.10 enumerated artifacts/api-server/Dockerfile* but missed root /Dockerfile + Dockerfile.dashboard
   - Recursive HB12 lesson layer 4: build infrastructure enumeration must be exhaustive

5. `5f08a66` (Day 26 commit 6) — align esbuild override 0.27.3 → 0.27.4 in pnpm-workspace.yaml
   - Phase A.11 diagnosis: single-line drift YAML vs lockfile; lockfile authoritative since May 6 (Day 19 regeneration)
   - Recursive HB12 lesson layer 5: lockfile sync must check ALL pnpm strictness layers (not just package.json range satisfaction)

6. Day 26 commit 7 (this commit) — AC-33 build-pipeline determinism + Day 26 EOD doc

**5 deploy attempts (all failed; production unaffected throughout):**

| Attempt | Fix landed | Error class | Layer surfaced |
|---|---|---|---|
| 1 | (none) | `ERR_PNPM_MISSING_TIME` `@vitest/utils` | registry metadata + minimumReleaseAge strict-mode |
| 2 retry | (none) | `ERR_PNPM_MISSING_TIME` `@smithy/uuid` | confirmed shifting failure → registry-side cause |
| 3 | api-server Dockerfile fix only | `ERR_PNPM_MISSING_TIME` `@smithy/signature-v4` | wrong Dockerfile fixed (root still --no-frozen-lockfile) |
| 4 | root Dockerfile fix | `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` | overrides drift YAML vs lockfile |
| 5 | YAML esbuild alignment | `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` (same class) | pnpm v10 local vs pnpm v11 Fly strictness gap |

Each fix correctly diagnosed a real layer; cumulative arc revealed AC-33 as substantive hygiene workstream.

**3 Phase A audits run + 2 deferred:**

Run today:
- Phase A.10: pnpm pipeline diagnosis (Dockerfile + .npmrc + workspace + lockfile state)
- Phase A.11: pnpm-workspace.yaml overrides history vs lockfile-recorded overrides
- Phase B.2 review: Job 12 dry-run cycle output review

Run Day 25 + carried into Day 26 context:
- Phase A Command Center person-detail interconnections (AC-31)
- Phase A.6 Auto-profile orchestration wrapper (AC-32)

Deferred to Day 27+:
- Phase A.7 language-toggle audit (not surfaced today; deferred indefinitely as not blocking)
- Phase A.8 Command Center per-entity inventory (path to AC-31 Phase B drafting)
- Phase A.9 competitor surface audit (not surfaced today; deferred to operator-bandwidth window)
- Phase A.12 build-pipeline determinism + cross-environment pnpm strictness (AC-33 substantive workstream)

---

## Key realizations

**1. Audit-first discipline catches its own drift.**

Day 26 commit 1: chat-Claude assumed AC-29 had been committed Day 25 (referenced "29 total" in save-prompt). Apatris Claude GATE verification mechanism (V3 grep against file) caught the drift before edit — actual count was 28. AC-29 was a Day 25 self-review candidate that never landed. Drift acknowledged + AC-29 captured properly + commit message documents the recursive lesson. **The discipline applies to its own drafting.**

**2. Build-pipeline drift was always there; --frozen-lockfile is the lens that exposed it.**

Day 25 v302 succeeded because --no-frozen-lockfile BYPASSES overrides validation. The esbuild 0.27.3 vs 0.27.4 drift has existed since Day 19 (May 6 lockfile regeneration) without ever surfacing. Today's Dockerfile fix added strict-mode validation — that's what made the latent drift visible. Multiple deeper layers (pnpm version strictness, lockfile format gaps) lie below it. Each fix correctly diagnoses one layer + surfaces the next.

**3. Six recursive HB12 layers today.**

- chat-Claude AC count drift (assumed 29 when actual 28) — caught by Apatris Claude GATE V3 verification
- Save-prompt Find-Replace drift (Phase B.2 closure save-prompt's Find didn't match actual comment block) — caught by Apatris Claude pre-edit read
- Dual-machine cron coordination latent race (AC-30 captured before live-mode exposed it)
- Wrong-Dockerfile fixed (Phase A.10 enumerated artifacts/api-server/Dockerfile* not workspace root) — caught by deploy attempt 3 failing identically to attempts 1-2
- YAML vs lockfile overrides drift (Phase A.11 diagnosed via Step 2/3 comparison) — caught by deploy attempt 4 error class shift
- Cross-pnpm-version strictness gap (local v10 vs Fly v11 different overrides validation) — caught by deploy attempt 5 same-error-class-despite-YAML-fix

The pattern: each fix correctly addressed the surfaced layer + surfaced a deeper layer + discipline applied recursively. After 6 layers in single day, diminishing returns + Option H (pause to Day 27) is the right call.

**4. Accessory metaphor crystallized for visible-feature work.**

Phase A audits A.5 (Command Center) + A.6 (Auto-profile) revealed: primitives all built (OCR + matchWorkerMultiSignal + 27+ FK'd tables + scanBulkDocument + Claude Vision + document_intake workflow), but scattered across services + not surfaced in operator-facing UI. Target work isn't "build more" — it's "find + connect + make visible." The metaphor: features are like accessories already in the closet; the work is composing the outfit + putting it where operators can see it.

**5. Three audit depths exist beyond code-side.**

- Internal: what's built in code (audit-first Hard Boundary 12 covers this)
- Visibility: what's accessible to operators in UI / API surface
- External: competitor/market awareness — what does the build need to do that competitors do or don't

Day 26 surfaced gap awareness at all 3 depths. AC-31 + AC-32 are visibility-depth findings. External-depth audit (competitor surface) deferred indefinitely.

**6. Diminishing returns + pause-and-regroup is the discipline at the meta layer.**

6 commits + 5 failed deploys + 1 day = effort vs outcome diverging. Each commit individually correct + atomic + closes a real gap. But cumulatively, the build-pipeline-debugging consumed most of the day's bandwidth. Original AC-15 Phase B.2 was 1-line flag flip. Tomorrow morning re-opens with clean Phase A.12 spec for AC-33 + fresh perspective. Pause is the right discipline at this layer.

---

## State for Day 27 inheritance

**Production (unaffected):**
- HEAD on Fly = v302 (Day 25 09:08Z deploy, image deployment-01KRB4JQTNA9PGEVG9SXRWPZQY)
- Job 12 dry-run live; fires daily ~04:00 UTC; harmless (writes nothing, logs would-be alerts)
- Next cycle ~04:00 UTC May 13 ~05:00 Poland: will fire dry-run again on v302 (because v303 didn't deploy yet)
- Day 26 commits stacked on origin/main (5f08a66) await clean Phase A.12 + Phase B for AC-33

**Movement 3 status:**
- AC-15 chain status: code complete (de62035) + diagnosed + tested locally, awaiting v303 deploy
- 33 total ACs in Migration Ledger (was 28 at Day 26 open)
- AC-33 build-pipeline determinism: NEW workstream surfaced today; substantive hygiene before any further v303 deploy attempt

**Day 27 first action priority order:**
1. ~04:00 UTC: Job 12 dry-run cycle fires on v302 (verify clean output as Day 26-style validation)
2. Layer 1 health check ritual: Day 27 morning sweep across 6 zones
3. Phase A.12 for AC-33 build-pipeline determinism: enumerate all 5 pnpm strictness layers, verify pnpm version pinning option, decide lockfile regeneration vs version-pin path
4. Once AC-33 Phase B lands + v303 deploys: Job 12 live mode active; first alert Rajesh Kumar Singh expiry warning written to legal_alerts

**Pending Phase 2 deferred (no Day 27 work):**
- AC-22 procedural (Akshay Sentry provisioning)
- AC-23 Layer 1 alternate-authority designation (after AC-22)
- AC-24 contract-gen audit
- AC-25/26/27 hygiene items (Job 12 row-count logging + fetchAdmins import + unconditional cycle-complete logging)
- AC-28 staging deploy strategy
- AC-30 dual-machine cron coordination
- AC-31 Command Center person-detail interconnections (visible-feature work)
- AC-32 Document-driven auto-profile orchestration (visible-feature work)

**Pending memory updates:**
- 6-recursion HB12 pattern across Day 26 worth canonical capture if it persists into Day 27
- Pause-and-regroup discipline at the meta layer (Option H) worth canonical capture

---

## Personal context

3-hour focused work session this Tuesday evening. Build-pipeline arc was 100% of the session; visible-feature work + Operator Transition Plan + counsel work remain deferred. Discipline stayed intact through 6 layers of recursive HB12 — that's the durable signal even when feature delivery paused.

Day 26 closes with the build-pipeline hygiene workstream surfaced + canonical. Production continues serving. Tomorrow opens fresh.

Rest is part of the build.
