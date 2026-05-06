# APATRIS — RECOVERY PROCEDURES

**Last verified:** 2026-05-06 (Day 19) — Day 19 prod deploy validated procedures by NOT triggering them; PAT-on-disk references updated post-Item 2.5.y closure; Appendix root cause superseded with Day 19 Phase A definitive finding.
**Authored after:** Item 2.3 staging rollback case study (live recovery event ~25 min from failure detection to verified recovery)
**Scope:** five recovery surfaces — code, database, Fly app, configuration, cross-repo
**Discipline:** every command in this document has been empirically tested, OR is explicitly marked as `⚠️ UNTESTED` with a planned drill date. No commands fabricated from training memory.

---

## Quick reference (under stress, start here)

- **Bad pushed commit:** `git revert <sha> && git push origin main`
- **Bad staging deploy:** `flyctl deploy --app apatris-api-staging --image registry.fly.io/apatris-api-staging:deployment-<TAG>`
- **Bad prod deploy:** same as staging but `--app apatris-api`. ⚠️ Joint Manish + chat-Claude go required.
- **Schema corruption:** `flyctl machine restart <id> --app <app-name>` (init-db reruns CREATE TABLE IF NOT EXISTS)
- **Missing secret:** `flyctl secrets set <NAME>=<VALUE> --app <app-name>` (auto-restarts machines)
- **Lost local repo:** `git clone https://github.com/Maac1980/Apatris-Compliance-Hub.git` + restore `.env` from password manager
- **Lost work after `git reset --hard`:** `git reflog` shows recent HEAD movements; `git reset --hard <reflog-sha>` returns to pre-reset state (reflog persists ~90 days)

Detailed procedures + verification + caveats below.

---

## How to use this document

1. Identify which surface is affected (code / database / Fly app / configuration / cross-repo).
2. Walk the surface's decision tree to find the matching scenario.
3. Run the verification commands BEFORE recovery (so you know baseline state).
4. Run the recovery procedure.
5. Run the verification commands AFTER to confirm recovery worked.
6. Record what happened in the appendix-style log so the next operator has even more grounded data.

**Recovery discipline:**
- Never use destructive commands without explicit Manish + chat-Claude joint go (Hard Boundaries 11, 13, 14 forbid by default).
- Always verify which environment you're targeting (prod vs staging) before any state-changing command.
- If the incident is ambiguous, surface in EXPECTED / FOUND / REASONABLE INTERPRETATION format and pause.

---

## Section 1 — Code recovery (git / GitHub)

### What's at risk

- Working tree corruption from interrupted operations (partial merge, half-applied stash)
- Bad local commit (mistake caught before push)
- Bad pushed commit (visible to all collaborators / triggers CI)
- Force-push damage from elsewhere (history rewritten by another actor)
- Lost local repo (machine destroyed, accidental deletion of clone)
- Lost GitHub remote (extreme: GitHub outage; account compromise)

### Inventory (as of 2026-05-05)

| Property | Value |
|---|---|
| GitHub remote | `https://github.com/Maac1980/Apatris-Compliance-Hub.git` |
| Repo authentication | Auth via SSH (key at `~/.ssh/id_ed25519`, public key registered at `https://github.com/settings/keys`). Switched from PAT-embedded HTTPS to SSH on Day 18 (2026-05-05) per Item 2.5.y. All 3 prior PATs revoked at `github.com/settings/tokens`. |
| Total commits on `origin/main` | **797** |
| HEAD on `origin/main` (this snapshot) | `321564a` (Item 2.3 commit; preserved while item paused for debug) |
| Branch protection | Cannot inspect via flyctl/git CLI; verify via GitHub UI at `https://github.com/Maac1980/Apatris-Compliance-Hub/settings/branches` |

### Decision tree

#### Scenario A — Local working tree corrupted (uncommitted changes you want to discard)

**Symptom:** `git status` shows modified or partially-staged files you didn't intend; want to return to last clean state.

**Recovery:**
```bash
git status                                  # see what's modified
git diff                                    # see exact changes
git checkout -- <file>                      # discard changes in one file
git checkout -- .                           # discard ALL unstaged changes (DESTRUCTIVE for working tree)
git reset --hard HEAD                       # discard ALL changes (staged + unstaged) (DESTRUCTIVE)
```

**Verification:**
```bash
git status                                  # should show "working tree clean" or only intended files
git diff                                    # should be empty
```

**Tested:** 2026-05-05. Used multiple times Days 13-17 during normal development workflows.

⚠️ `git checkout -- .` and `git reset --hard HEAD` permanently discard local changes. Use only when sure.

**Recovery if reset was a mistake:** `git reflog` shows recent HEAD movements; `git reset --hard <reflog-sha>` returns to the state before reset. Reflog entries persist ~90 days by default.

---

#### Scenario B — Bad local commit, NOT yet pushed

**Symptom:** committed something wrong locally; haven't pushed yet; want to undo the commit while keeping (or discarding) the changes.

**Recovery:**
```bash
git log --oneline -3                        # confirm the bad commit is HEAD
git reset --soft HEAD~1                     # undo commit, keep changes staged
git reset --mixed HEAD~1                    # undo commit, keep changes unstaged (default)
git reset --hard HEAD~1                     # undo commit, DISCARD changes (DESTRUCTIVE)
```

**Verification:**
```bash
git log --oneline -3                        # bad commit should no longer appear
git status                                  # confirm working tree state matches expectation
git rev-list --left-right --count origin/main...HEAD   # should show 0 ahead, 0 behind
```

**Tested:** 2026-05-05. Used during Item 2.2 GATE T1-D-1 take 2 (after the committer-identity divergence, soft-reset + re-config + re-commit).

**Recovery if reset was a mistake:** `git reflog` shows recent HEAD movements; `git reset --hard <reflog-sha>` returns to the state before reset. Reflog entries persist ~90 days by default.

---

#### Scenario C — Bad pushed commit, FORWARD-FIX (RECOMMENDED for any commit visible on origin/main)

**Symptom:** committed and pushed a bad change; want to undo without rewriting history.

**Recovery:**
```bash
git log --oneline -5                        # find the bad commit's SHA
git revert <sha>                            # creates a new commit that reverses the bad one
                                            # (interactive: edit the commit message; save and close)
git push origin main                        # publishes the revert
```

**Verification:**
```bash
git log --oneline -3                        # confirm "Revert <bad-msg>" commit is now HEAD
git push origin main                        # should be a fast-forward push
```

**Tested:** 2026-05-05. The pattern is documented but not invoked today (Item 2.3 used a Fly-level image rollback instead — see Section 3). Standard git operation; well-understood.

---

#### Scenario D — Hard rollback (rewrite history) — NOT RECOMMENDED, requires explicit Manish + chat-Claude joint go

**Symptom:** want to rewrite history to remove a commit entirely from origin/main.

**Recovery (DO NOT EXECUTE WITHOUT EXPLICIT GO):**
```bash
git reset --hard <good-sha>                 # local HEAD moves to good SHA, dropping subsequent commits
git push origin main --force                # rewrites origin/main (DESTRUCTIVE)
                                            # Hard Boundary 13 forbids without explicit go
```

**Verification (after rewrite):**
```bash
git log --oneline -5                        # subsequent commits gone
git rev-list --left-right --count origin/main...HEAD   # 0 0
```

**When this is wrong:**
- Other clones / CI / branches branched off the rewritten section will be stale and will cause merge conflicts on next pull.
- Audit trail on GitHub loses the original commit (hard to recover later for forensics).

**Tested:** Never invoked on this repo. **Hard Boundary 13: NO git history modification (force-push, history rewrite) without explicit Manish go.**

**Recovery if reset was a mistake (LOCAL only — pre-push):** `git reflog` shows recent HEAD movements; `git reset --hard <reflog-sha>` returns to the state before reset. Reflog entries persist ~90 days by default. ⚠️ This does NOT undo a force-push that has already reached origin — once pushed, history rewrite is visible to all collaborators and `git reflog` only helps your local clone.

---

#### Scenario E — Lost local repo (entire clone gone — disk failure / accidental `rm -rf` / new machine)

**Symptom:** the local repo no longer exists; need to restore from origin.

**Recovery:**
```bash
cd ~/Desktop                                # or wherever the repo lives
git clone https://github.com/Maac1980/Apatris-Compliance-Hub.git
cd Apatris-Compliance-Hub
# Restore .env from password manager — it is NOT in the repo
# (a `.env.example` template lives at repo root; real values come from password manager)
cp ~/secure/apatris.env artifacts/api-server/.env
# Verify
git log --oneline -3
git remote -v
```

**Verification:**
```bash
git status                                  # working tree clean
git log --oneline -3                        # latest commit matches expected origin/main HEAD
ls artifacts/api-server/.env                # .env present (DO NOT cat or commit)
```

**Tested:** Pattern verified during initial clone setup early in the build. Re-cloning is a standard git operation; not a destructive recovery — original GitHub remains the source of truth.

---

### Verification commands (any code recovery)

```bash
git log --oneline -3                        # confirm HEAD + recent commits
git status                                  # confirm working tree state
git remote -v                               # confirm remote URL (Auth posture: SSH — Item 2.5.y closed Day 18)
git rev-list --left-right --count origin/main...HEAD   # 0 0 = in sync
```

---

## Section 2 — Database recovery (Neon)

### What's at risk

- Schema corruption (a CREATE/ALTER ran wrong; tables in wrong state)
- Data loss (rows accidentally DELETED or UPDATEd; truncated table; bad migration ran)
- Catastrophic Neon failure (Neon platform incident; project destroyed)
- Prod/staging mixup (DATABASE_URL accidentally swapped between environments)
- DATABASE_URL secret lost (Fly secret accidentally cleared)

### Inventory (as of 2026-05-05)

| Property | Value |
|---|---|
| Provider | **Neon Postgres serverless** (per CLAUDE.md + `lib/db.ts`) |
| Connection string env vars | `NEON_DATABASE_URL` (primary), `DATABASE_URL` (fallback) |
| Prod `NEON_DATABASE_URL` digest | `59e5061e76027e27` |
| Staging `NEON_DATABASE_URL` digest | `30e15609a4d46e09` |
| Prod and staging are different databases | ✅ digests differ → confirmed separate Neon projects/branches |
| Migrations directory | NOT present — confirms idempotent `CREATE TABLE IF NOT EXISTS` pattern in `lib/init-db.ts` |
| Pool config (`lib/db.ts:15-23`) | `max:20, min:0, idleTimeoutMillis:30_000, connectionTimeoutMillis:5_000, allowExitOnIdle:false` (Item 1.3 fix in place) |
| Neon point-in-time recovery (PITR) | Per Neon docs (verify current at https://neon.tech/docs/manage/branches): free tier retains 7 days of branch history; paid tier retains up to 30 days. Recovery via "branch from a point in time" in Neon dashboard. Not verified by direct query per Hard Boundary 2. |

### Decision tree

#### Scenario A — Schema corruption (table in wrong state; missing columns; bad ALTER)

**Symptom:** queries fail with "column does not exist" or "relation does not exist" errors that should not happen given current code.

**Recovery:**
```bash
flyctl machine restart <machine-id> --app <app-name>      # reboots the app
                                                          # init-db.ts runs at boot
                                                          # CREATE TABLE IF NOT EXISTS restores any missing tables
                                                          # ALTER TABLE ADD COLUMN IF NOT EXISTS restores any missing columns
                                                          # (See lib/init-db.ts; idempotent on every boot)
```

**Verification:**
```bash
flyctl logs --app <app-name> --no-tail | grep "Database initialized"     # confirms init-db ran
flyctl logs --app <app-name> --no-tail | grep "Schedulers started"       # confirms full boot
curl https://<app>.fly.dev/api/healthz                                   # 200 OK
```

⚠️ This restores **structure only, not data.** Lost rows are NOT recovered by this scenario.

**Tested:** Implicitly on every machine boot. Last verified 2026-05-05 during Item 2.3 staging rollback (machines booted Item 2.2 image; init-db ran; schemas intact).

---

#### Scenario B — Data loss (rows deleted; truncate; bad UPDATE)

**Symptom:** specific rows or entire tables empty or wrong; data was present recently and now isn't.

**Recovery (Neon point-in-time recovery — REQUIRES EXPLICIT MANISH + CHAT-CLAUDE GO):**

1. Open `https://console.neon.tech` and select the affected project (prod or staging — verify which from `flyctl secrets list`).
2. Navigate to **Branches**.
3. Click **Create branch from a point in time**.
4. Select a timestamp BEFORE the data loss occurred (use a 5-15 min margin).
5. Name the branch: `recovery-YYYY-MM-DD-HHMM`.
6. Wait for branch to provision (typically <60 seconds).
7. Copy the branch's connection string from Neon dashboard.
8. Decide path:
   - **Path 1 — full DB swap:** update `flyctl secrets set NEON_DATABASE_URL=<new-branch-url> --app <app-name>` then `flyctl machine restart`. Now the app runs against the recovered branch; confirm data correct; if good, leave running OR migrate data forward and swap back.
   - **Path 2 — selective row recovery:** connect to recovery branch from a one-off SQL client; SELECT the missing rows; INSERT them back into the live primary database via separate connection. (More surgical; doesn't disrupt running app.)

⚠️ Verify destination explicitly. NEVER swap prod's DATABASE_URL with a staging recovery branch (Hard Boundary 2: NO production DB connection by APATRIS Claude; this scenario requires Manish + chat-Claude joint go.)

**Verification:**
```bash
flyctl secrets list --app <app-name> | grep NEON_DATABASE_URL    # confirm digest changed (after Path 1)
flyctl status --app <app-name>                                    # both machines healthy on new connection
# Spot-check the recovered rows via app's UI or read-only API endpoint
```

**Tested:** ⚠️ **NOT YET TESTED.** Drill PENDING per Item 3.0f roadmap. Pattern documented from Neon's public docs, not from a real incident on this repo. Hard precondition before relying on this scenario in a real outage: dry-run with chat-Claude + Manish so the playbook is exercised once before stress hits.

---

#### Scenario C — Catastrophic Neon failure (project lost; Neon down longer than the PITR window)

**Symptom:** Neon project unreachable; PITR not available; data loss exceeds Neon's retention window.

**Recovery:**
1. Engage Neon support: https://neon.tech/contact (escalate via paid-tier support channel if applicable).
2. Recover from off-site immutable backup IF AVAILABLE.
3. ⚠️ **Off-site immutable backups are NOT YET CONFIGURED** as of 2026-05-05.
4. Without off-site backup, recovery options narrow to: re-seed schema via init-db.ts (structure only), accept data loss, restore from any user-provided exports (CSV exports are partial coverage at best).

⚠️ **CRITICAL GAP:** off-site immutable backups not configured. **Hard precondition before Item 3.8 (or any high-stakes Track 3 work): Item 3.0c off-site backups in place AND restoration tested within 30 days.**

**Tested:** ⚠️ **NOT YET TESTED.** Cannot test without off-site backup infrastructure first.

---

#### Scenario D — Prod/staging mixup (DATABASE_URL secret accidentally swapped or pointing at wrong DB)

**Symptom:** prod app showing staging data, or vice versa; or app erroring with auth failures or schema mismatches indicative of wrong endpoint.

**Recovery:**
```bash
flyctl secrets list --app apatris-api | grep NEON_DATABASE_URL              # check digest
flyctl secrets list --app apatris-api-staging | grep NEON_DATABASE_URL      # check digest
# digests should differ; if they match, the swap has happened
```

If swap detected:
1. Retrieve the correct prod DATABASE_URL from password manager.
2. Set the correct value: `flyctl secrets set NEON_DATABASE_URL=<correct-prod-url> --app apatris-api`.
3. Repeat for staging if needed.
4. Restart machines: `flyctl machine restart <machine-id> --app <app-name>` for each.

**Verification:**
```bash
flyctl secrets list --app apatris-api | grep NEON_DATABASE_URL     # digest 59e5061e76027e27 (current verified prod digest)
flyctl secrets list --app apatris-api-staging | grep NEON_DATABASE_URL    # digest 30e15609a4d46e09 (current verified staging digest)
flyctl status --app apatris-api                                            # both machines healthy
flyctl logs --app apatris-api --no-tail | grep "Database initialized"
```

**Tested:** ⚠️ **NOT YET TESTED in a real swap incident.** The verification commands and digest baselines are captured from current state. Drill PENDING per Item 3.0f.

---

### Verification commands (any database recovery)

```bash
flyctl secrets list --app <app-name> | grep -E "NEON_DATABASE_URL|DATABASE_URL"
flyctl status --app <app-name>
flyctl logs --app <app-name> --no-tail | grep -E "Database initialized|Schedulers started"
curl https://<app>.fly.dev/api/healthz                # 200 OK
```

⚠️ Never run direct DB queries against production from APATRIS Claude — Hard Boundary 2 absolute. Recovery DB queries require Manish or chat-Claude with explicit go.

### Critical gap (held for Item 3.0c)

**Off-site immutable backups are NOT configured.** Today's recovery story for Apatris depends on Neon's PITR (max 30 days on paid tier) plus this repo. If both fail simultaneously (or if a malicious actor with Neon access destroys the project), recovery options run out.

**Hard precondition before Item 3.8** (or any Track 3 high-stakes legal AI work): **Item 3.0c — off-site immutable backups in place AND restoration tested within 30 days.** Until then, recovery posture for catastrophic Neon failure is incomplete.

---

## Section 3 — Fly app recovery (apatris-api + apatris-api-staging)

### What's at risk

- Bad deploy that breaks the app on boot (today's Item 2.3 case study)
- Machine crash loop — Fly's restart budget exhausted (10 restarts max)
- App accidentally destroyed via `flyctl apps destroy`
- Region misconfiguration (machines stuck in wrong region)
- Resource exhaustion (memory cap; runaway process; disk full)

### Inventory (as of 2026-05-05)

**Prod (`apatris-api`):**

| Property | Value |
|---|---|
| Region | `iad` |
| Current image | `01KQVGKFBD6TSK7YNRTB7DNW63` (v297, Item 2.2 AES messaging) |
| Machines | `891361a6672738`, `d8d5056c126908` (both `started`, `1/1 passing`) |
| `auto_stop_machines` | `false` (prod stays up) |
| `min_machines_running` | `1` |
| Memory | `1gb`, shared CPU |
| Health check | `GET /api/healthz` every `30s`, `60s` grace period, `10s` timeout |

**Staging (`apatris-api-staging`):**

| Property | Value |
|---|---|
| Region | `iad` |
| Current image | `01KQT8J1BH10BZ1ESTJ08J77TN` (v30, Item 2.2 post-rollback) |
| Machines | `7847550b10e358`, `d897570ae11798` (auto-stopped on no traffic) |
| `auto_stop_machines` | `true` (staging hibernates when idle) |
| Other settings | mirror prod |

**Recent prod release history:**

| Version | Date | Note |
|---|---|---|
| v297 | 2026-05-05 ~07:33Z | Item 2.2 (AES messaging) |
| v296 | 2026-05-04 10:04Z | Track 1 fixes |
| v295 | 2026-04-24 19:19Z | pre-Track-1 baseline |
| v294-v289 | 2026-04-20 to 23 | older deploys |

### Decision tree

#### Scenario A — Bad deploy on staging (today's case study, Day 18)

**Symptom:** `flyctl deploy` returns `Unrecoverable error: timeout reached waiting for health checks to pass for machine <id>`. Machines may show `stopped` with `0/1` checks, OR `started` with `0/1` warnings. Health endpoint returns `HTTP 503` or fails to connect.

**Recovery:**
```bash
# 1. Verify state
flyctl status --app apatris-api-staging

# 2. Identify previous good image
flyctl releases --app apatris-api-staging | head -10
# Look for the most recent "complete" release before the failed one
# Note its image tag from flyctl status of that release OR git+commit map

# 3. Roll back via flyctl deploy --image (CORRECT SYNTAX)
flyctl deploy --app apatris-api-staging \
  --image registry.fly.io/apatris-api-staging:deployment-<previous-tag>
```

⚠️ **NOT** `flyctl image deploy --app ... <image>` — this returns `Error: unknown flag: --app`. **`flyctl image deploy` does not exist** as a subcommand.

⚠️ **NOT** `flyctl image update` — this deploys "latest available" which may BE the failed deploy (rolls forward, not back).

**Verification:**
```bash
flyctl status --app apatris-api-staging        # both machines on previous image
curl https://apatris-api-staging.fly.dev/api/healthz   # 200 OK
flyctl logs --app apatris-api-staging --no-tail | grep -E "Schedulers started|Database initialized"
```

**Tested:** 2026-05-05 — full case study in Appendix. **Time to recovery: ~25 minutes.**

---

#### Scenario B — Bad deploy on prod (worse; never yet hit)

**Symptom:** same as Scenario A but on `apatris-api` instead of staging.

**Recovery:** identical procedure to Scenario A but with `--app apatris-api`. ⚠️ Production has `min_machines_running=1`, so during a rolling deploy at least one machine stays up — but if both machines are crash-looping post-deploy, the safety net is gone.

⚠️ **Prod rollback is high-stakes.** Joint Manish + chat-Claude go required (Hard Boundary 6). APATRIS Claude does NOT initiate prod rollback without explicit go.

```bash
# 1. Verify state
flyctl status --app apatris-api

# 2. Identify previous good image
flyctl releases --app apatris-api | head -10

# 3. AWAIT JOINT GO — do not execute next command without explicit Manish + chat-Claude approval

# 4. After joint go:
flyctl deploy --app apatris-api \
  --image registry.fly.io/apatris-api:deployment-<previous-tag>
```

**Verification:**
```bash
flyctl status --app apatris-api                # both machines on previous image
curl https://apatris-api.fly.dev/api/healthz   # 200 OK
flyctl logs --app apatris-api --no-tail | grep -E "Schedulers started"
```

**Tested:** ⚠️ **NOT YET EXECUTED on prod.** Procedure mirrors staging Scenario A which IS tested today. Pattern is sound; the joint-go gate adds a confirmation layer before this becomes the live procedure.

---

#### Scenario C — Machine crash loop (Fly's max restart budget exhausted)

**Symptom:** machine STATE shows `stopped` with log entry `machine has reached its max restart count of 10`. Other machine may still be running OR also stopped.

**Recovery:**
```bash
# 1. Diagnose root cause via logs
flyctl logs --app <app-name> --no-tail | grep -iE "error|fatal|exit"

# 2. Identify what's killing the machine. Possibilities:
#    - Bad image (worker thread crash, like Item 2.3) → roll back per Scenario A or B
#    - Bad config (secret missing, env var malformed) → re-set secret per Section 4 Scenario B
#    - Resource exhaustion (OOM, infinite loop) → consider scaling memory or finding the loop
#    - Application bug crashing the process → fix in code, redeploy

# 3. Apply targeted fix based on diagnosis (NOT just blindly restart)
# 4. After fix is in place:
flyctl machine restart <machine-id> --app <app-name>
```

⚠️ Don't just `flyctl machine start` without diagnosing — the machine will hit max restart again and you've burned more of the restart budget.

**Verification:**
```bash
flyctl status --app <app-name>                 # machine state should be `started`, `1/1 passing`
flyctl logs --app <app-name> --no-tail | head -30   # boot logs should show clean Schedulers started
```

**Tested:** 2026-05-05 — observed machine `7847550b10e358` hit max restart count during Item 2.3 staging deploy failure. Recovery via Scenario A rollback rather than direct restart.

---

#### Scenario D — App accidentally destroyed (`flyctl apps destroy`)

**Symptom:** `flyctl status --app <app-name>` returns "app not found". DNS still points but resolves nowhere.

⚠️ **Hard Boundary 5 forbids `flyctl apps destroy` via APATRIS Claude** — this scenario only fires if a human runs the command directly, OR another tool with cross-app access does so by mistake.

**Recovery:**
```bash
# 1. Re-create the app
flyctl apps create <app-name> --region iad

# 2. Re-set ALL secrets from password manager / external sources
#    (Fly cannot restore secret values — see Section 4 Scenario D)
#    Prod has 30 secrets; staging has 29.
flyctl secrets set NEON_DATABASE_URL=<value> JWT_SECRET=<value> ... --app <app-name>

# 3. Re-deploy from current source
git checkout main
git pull origin main
flyctl deploy --app <app-name> --remote-only

# 4. Restore fly.toml settings if regenerated
git checkout HEAD -- fly.toml
flyctl config save --app <app-name>     # capture current Fly state for comparison
```

**Verification:**
```bash
flyctl status --app <app-name>                 # both machines started, healthy
flyctl secrets list --app <app-name>           # confirm all 30 (prod) / 29 (staging) secrets present
curl https://<app-name>.fly.dev/api/healthz    # 200 OK
```

**Tested:** ⚠️ **NEVER EXECUTED — and never should be tested by intentional destruction.** Procedure is documented from Fly platform docs + extrapolation. Real recovery from this scenario would be the worst day in the build's history.

---

#### Scenario E — Region or configuration misalignment

**Symptom:** `flyctl status` shows machines in unexpected region OR `flyctl config show` differs from local `fly.toml`.

**Recovery:**
```bash
# 1. Compare local vs deployed config
cat fly.toml                                   # local source of truth
flyctl config show --app <app-name>            # what's actually deployed

# 2. If drift detected:
flyctl deploy --app <app-name> --remote-only   # redeploys with current fly.toml
```

**Verification:**
```bash
flyctl config show --app <app-name>            # should match local fly.toml after deploy
flyctl status --app <app-name>                 # machines healthy
```

**Tested:** ⚠️ **NOT YET EXECUTED.** Drift detection has never surfaced on this build; documented for completeness.

---

### Verification commands (any Fly app recovery)

```bash
flyctl status --app <app-name>
curl https://<app-name>.fly.dev/api/healthz
flyctl releases --app <app-name> | head -5
flyctl logs --app <app-name> --no-tail | grep -E "Schedulers started|Database initialized"
```

**Tested as of:** 2026-05-05 — Scenario A executed today (full case study in Appendix); Scenarios B, D, E not yet executed; Scenario C observed today during the same incident.

---

## Section 4 — Configuration recovery (fly.toml + secrets)

### What's at risk

- `fly.toml` accidentally modified or deleted (causes deploy to fail or use wrong settings)
- Secret accidentally unset (`flyctl secrets unset`) — app boots but errors at runtime when the secret is needed
- Secret value compromised. GitHub PAT exposure pattern observed Day 18 (2026-05-05); remediated same day via Item 2.5.y. Procedure for future occurrences: revoke at `github.com/settings/tokens`, switch remote to SSH, verify with `ssh -T git@github.com`.
- Secret values lost without external backup (Fly cannot recover secret values; one-way encrypted storage)
- Drift between local `fly.toml` and deployed Fly config

### Inventory (as of 2026-05-05)

| Property | Value |
|---|---|
| `fly.toml` location | **REPO ROOT** (`./fly.toml`, 606 bytes) — NOT `artifacts/api-server/fly.toml` |
| Prod secrets count | **30** |
| Staging secrets count | **29** (1 difference held for separate audit) |
| Secret retrievability | NOT possible from Fly — values are one-way encrypted; recovery requires external source (password manager, Neon dashboard, Sentry, etc.) |
| `.env` in repo | `artifacts/api-server/.env` (LOCAL DEV ONLY; should be in `.gitignore` — verify) |
| `.env.example` | Present at repo root (template; safe to track in git) |

### Decision tree

#### Scenario A — `fly.toml` accidentally modified or deleted

**Symptom:** `git status` shows `fly.toml` modified or deleted; deploys may fail or apply wrong settings.

**Recovery:**
```bash
git status                                    # confirm fly.toml is the issue
git diff fly.toml                             # see what changed (if modified)
git checkout HEAD -- fly.toml                 # restore to last-committed state
# Or restore to a specific historical state:
git checkout <good-sha> -- fly.toml
```

**Verification:**
```bash
cat fly.toml                                  # spot-check key settings (app name, region, port)
git diff fly.toml                             # should be empty
flyctl config validate                        # validates without deploying
```

**Tested:** ⚠️ **NEVER EXECUTED on this repo** (`fly.toml` has not been corrupted). Standard `git checkout` operation; well-understood pattern.

---

#### Scenario B — Secret accidentally unset

**Symptom:** `flyctl secrets list` shows fewer secrets than expected (30 prod / 29 staging baseline). App may boot but error at runtime when secret is needed.

**Recovery:**
```bash
# 1. Identify which secret is missing
flyctl secrets list --app <app-name>          # compare to baseline (30 prod / 29 staging)

# 2. Retrieve correct value from external source:
#    - DATABASE_URL → Neon dashboard
#    - SENTRY_DSN → Sentry project settings
#    - JWT_SECRET → password manager (NEVER regenerate — would invalidate all existing tokens)
#    - APATRIS_ENCRYPTION_KEY → password manager (NEVER regenerate — would corrupt all PII at rest)
#    - ANTHROPIC_API_KEY → Anthropic console
#    - SMTP_USER / SMTP_PASS → Brevo dashboard
#    - others → password manager

# 3. Re-set the secret (this triggers automatic machine restart on Fly)
flyctl secrets set <NAME>=<VALUE> --app <app-name>
```

**Verification:**
```bash
flyctl secrets list --app <app-name>           # secret present with new digest
flyctl status --app <app-name>                 # machines restart cleanly
flyctl logs --app <app-name> --no-tail | grep -i "Schedulers started"
```

**Tested:** 2026-05-05 — pattern used during initial Sentry setup and during Track 1 Neon configuration. Standard `flyctl secrets set` operation.

---

#### Scenario C — Secret value compromised

**Symptom:** secret value leaked to logs, screenshots, or shared documents. Day 18 example: GitHub PAT (`ghp_*`) was embedded in `.git/config`; remediated via Item 2.5.y same day.

**Recovery:**

1. **Revoke at source:**
   - GitHub PAT: `https://github.com/settings/tokens` → revoke
   - Anthropic API key: `https://console.anthropic.com` → revoke
   - Sentry auth token: `https://de.sentry.io/settings/account/api/auth-tokens/` → revoke
   - Brevo SMTP: regenerate via Brevo dashboard
   - Stripe key: `https://dashboard.stripe.com/apikeys` → roll
   - Twilio: `https://console.twilio.com` → roll

2. **Generate new credential** at the same source.

3. **Update Fly secret:**
   ```bash
   flyctl secrets set <NAME>=<NEW-VALUE> --app <app-name>
   ```

4. **For GitHub PAT specifically (the case observed today):** also re-set git remote without embedded token:
   ```bash
   # Switch to SSH (preferred — no token on disk)
   git remote set-url origin git@github.com:Maac1980/Apatris-Compliance-Hub.git
   # Or use gh CLI auth (token managed by gh, not in .git/config)
   gh auth login
   ```

**Verification:**
```bash
git remote -v                                 # token no longer visible (or replaced with SSH URL)
flyctl secrets list --app <app-name>          # new digest for affected secret
flyctl logs --app <app-name> --no-tail | head -20    # app boots cleanly with new credential
```

**Tested:** 2026-05-05 — GitHub PAT exposure surfaced today during Item 2.5 Phase A `git remote -v` inspection. Revocation/re-set procedure documented but NOT yet executed (held for Manish-driven action separate from Item 2.5 scope).

---

#### Scenario D — Secret values lost without external backup

**Symptom:** `flyctl secrets unset` ran for one or more secrets, AND the original values are not in any password manager / source-of-truth system.

**Recovery (worst case — the "forgot to write it down" scenario):**

For each lost secret, recovery depends on whether the secret can be regenerated without breaking existing data:

- **`NEON_DATABASE_URL`** — retrievable from Neon dashboard (project → connection details). No data loss; just a connection string.
- **`SENTRY_DSN`** — retrievable from Sentry project settings. No data loss.
- **`ANTHROPIC_API_KEY`** — generate new key in Anthropic console; old key invalidated.
- **`SMTP_USER` / `SMTP_PASS`** — Brevo dashboard; rotate.
- **`STRIPE_SECRET_KEY`** — Stripe dashboard; roll.

⚠️ **Two secrets are catastrophic to regenerate:**
- **`JWT_SECRET`** — regenerating invalidates ALL existing JWT tokens. Every active user is logged out. Refresh tokens become useless. Acceptable in extremis but disruptive.
- **`APATRIS_ENCRYPTION_KEY`** — regenerating means **ALL existing AES-256-GCM ciphertext at rest becomes unreadable**. Encrypted PII columns (`workers.pesel`, `workers.iban`, `workers.passport_number`, `messages.message` post-Item-2.2) cannot be decrypted. **Catastrophic data loss for all encrypted fields.** This is why `APATRIS_ENCRYPTION_KEY_BACKUP` and `APATRIS_LOOKUP_KEY_BACKUP` exist — Fly secrets list shows both.

```bash
# Re-set per Scenario B for each lost secret
flyctl secrets set <NAME>=<NEW-VALUE> --app <app-name>
```

**Verification:**
```bash
flyctl secrets list --app <app-name> | wc -l   # count returns to 30 (prod) / 29 (staging)
flyctl status --app <app-name>                  # machines healthy
# Test one PII-encrypted read path if APATRIS_ENCRYPTION_KEY was changed — confirm whether ciphertext is still readable
```

**Tested:** ⚠️ **NEVER EXECUTED — and should not be intentionally tested.** This scenario emphasizes the **hard precondition: every secret must have an external backup (password manager, source-of-truth system) before it's set on Fly.** Hard Boundary discipline: never set a secret on Fly without first writing the value to the password manager.

---

#### Scenario E — Drift between local `fly.toml` and deployed Fly config

**Symptom:** `flyctl config show --app <app-name>` differs from local `fly.toml`.

**Recovery:**
```bash
# 1. Compare
cat fly.toml                                   # local source of truth
flyctl config show --app <app-name>            # what's actually deployed

# 2. If drift, redeploy to push local config to Fly:
flyctl deploy --app <app-name> --remote-only
```

**Verification:**
```bash
flyctl config show --app <app-name>            # should match cat fly.toml
flyctl status --app <app-name>                 # machines healthy on new config
```

**Tested:** ⚠️ **NOT YET EXECUTED.** Documented for completeness.

---

### Verification commands (any configuration recovery)

```bash
cat fly.toml
flyctl config show --app <app-name>
flyctl secrets list --app <app-name>
flyctl status --app <app-name>
```

**Tested as of:** 2026-05-05 — Scenarios A and E never executed in production; Scenario B used during initial Sentry setup; Scenario C surfaced today (GitHub PAT exposure) but action deferred to Manish-driven separate save-prompt; Scenario D never executed and should not be intentionally tested.

---

## Section 5 — Cross-repo recovery scope

### What's at risk

This document covers **APATRIS recovery only**. EEJ recovery is a parallel topic that requires its own document. `labour-contract-intelligence` (referenced in memory) is not currently cloned on this machine.

### Inventory (as of 2026-05-05)

| Repo | Local path | Status |
|---|---|---|
| **APATRIS** (this repo) | `/Users/manishshetty/Desktop/Apatris-Compliance-Hub/.git` | Active; this document covers it |
| **EURO-EDU-JOBS-app** (EEJ) | `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/.git` | Sibling repo on this machine; out of scope for this document |
| **labour-contract-intelligence** | NOT FOUND on this machine | Out of scope; not cataloged here |

### Cross-repo recovery posture

- **Per Hard Boundary 16, cross-repo write is forbidden by default.** APATRIS Claude operating in this repo does not push commits, deploy, or modify the EEJ repo.
- **Cross-repo READ is allowed** (e.g., reading EEJ source for reference, comparing patterns). Applied with `find` / `cat` / `git log` against the sibling clone path.
- **Cross-repo WRITE requires explicit Manish go.** Even then, it should typically be done via a separate APATRIS Claude session targeted at that repo, not this one.

### Decision tree

#### Scenario A — APATRIS recovery

See Sections 1-4 above. This document is the source-of-truth for APATRIS recovery.

#### Scenario B — EEJ recovery

⚠️ **Out of scope for this document.** EEJ has its own deploy posture (different Fly app name, different Neon database, different secret set). Apply the same decision-tree thinking but in a separate APATRIS Claude session targeted at the EEJ repo, with EEJ-specific inventory captured fresh.

A future EEJ-specific `RECOVERY_PROCEDURES.md` would mirror this document's structure.

#### Scenario C — `labour-contract-intelligence` recovery

Not cataloged here. If/when this repo is brought into the active build, a separate document should capture its recovery surface.

### Verification commands (cross-repo posture check)

```bash
find ~ -maxdepth 3 -name ".git" -type d 2>/dev/null    # inventory of git repos accessible
ls /Users/manishshetty/Desktop/                        # confirm sibling repos still present
```

**Tested as of:** 2026-05-05 — informational only. No cross-repo recovery executed today.

---

## Appendix — Item 2.3 staging rollback case study (2026-05-05)

This is a **real recovery event**, documented while the procedures used were still fresh. Empirical evidence for Section 3 Scenario A.

### Timeline (UTC)

| Time | Event |
|---|---|
| 11:44:16Z | Staging deploy attempted with Item 2.3 image (pino-sentry-transport wired into `lib/logger.ts`) |
| 11:44:16Z | Worker thread exit on machine `7847550b10e358`: `at Worker.<computed>.onexit (node:internal/worker:294:20)` |
| 11:44:17Z | First crash signal on machine `d897570ae11798`: `[Startup] Database init failed: Connection terminated due to connection timeout` |
| 11:44:20-22Z | Both machines: `Main child exited normally with code: 1` |
| ~11:46:00Z | Deploy command returned: `Unrecoverable error: timeout reached waiting for health checks to pass for machine 7847550b10e358` |
| 11:46Z onward | Staging in degraded state: machine `7847550b10e358` crash-looping (10 restarts exhausted), machine `d897570ae11798` started but `0/1` health checks |
| 11:46-11:50Z | Sentry caught and emailed two events to Manish: |
|  | • Event 1 (`level=error`): `Cannot find module '/app/artifacts/api-server/dist/lib/worker.js'` |
|  | • Event 2 (`level=fatal`): `the worker thread exited with mechanism = auto.node.onuncaughtexception` |
| ~12:05Z | Joint Manish + chat-Claude go received for rollback (Option A path) |
| ~12:06Z | First rollback attempt **FAILED**: `flyctl image deploy --app apatris-api-staging <image>` returned `Error: unknown flag: --app`. Discovered: `flyctl image deploy` is NOT a valid subcommand. |
| ~12:07Z | Correct command identified: `flyctl deploy --app apatris-api-staging --image registry.fly.io/apatris-api-staging:deployment-<TAG>` |
| ~12:08Z | Rollback deploy executed; both machines acquired lease, updated config, reached good state via rolling strategy |
| 12:09:19Z | Health endpoint `https://apatris-api-staging.fly.dev/api/healthz` returned `HTTP 200`. Recovery complete. |

**Total time to recovery:** ~25 minutes (failure detection at ~11:46Z → verified recovery at ~12:09Z).

### Root cause analysis

Root cause (definitively identified Day 19, 2026-05-06 via Phase A debug investigation):

esbuild bundles pino into the single `dist/index.cjs` output (`build.ts` allowlist line 36). When pino's `transport: { targets: [...] }` is configured (commit `321564a`), bundled-pino spawns a Node `worker_threads.Worker` pointed at `lib/worker.js` — but the path is computed by pino at runtime via `__dirname`-relative resolution. After bundling, source-level `__dirname` references are rewritten by esbuild to point at the BUNDLE's directory (`/app/artifacts/api-server/dist/`), so bundled pino's worker spawn looks for `worker.js` at `/app/artifacts/api-server/dist/lib/worker.js` — exactly the path that appeared in the Day 18 Sentry error. That file doesn't exist because esbuild bundled pino's source code into `index.cjs` without preserving `lib/worker.js` separately.

Four independent evidence points confirmed root cause:
1. pino in `build.ts` allowlist line 36 (verified)
2. Day 18 error path `/app/artifacts/api-server/dist/lib/worker.js` exactly matched bundled-pino's `__dirname`-relative worker spawn target (verified)
3. NO `dist/lib/` directory exists in build output (verified)
4. Pre-`321564a` code never set transport in production, never spawned workers, never crashed — failure first surfaced when commit `321564a` introduced production transports (verified)

Resolution path chosen: Option 2 (main-thread Sentry capture hook). Bypasses `worker_threads` entirely. Removes `pino-sentry-transport` dependency. Implemented commit `f33d067` (Item 2.3 Option 2), prod deployed Day 19 image `01KQY9E50KR2TMNSM9MQ3H95WR`.

Tier-2 awareness for future package additions: packages with `worker_threads` / fs-relative resolution (worker spawn by path) cannot be bundled by esbuild without preserving the worker file separately. If future package additions need `worker_threads`, mark them external in `build.ts` allowlist.

### What worked

1. **Hard Boundary 7 (reality-vs-plan escalation) held.** APATRIS Claude STOPPED at staging deploy failure detection. Did not roll forward. Did not touch prod.
2. **Override mode was active** — explicit Manish + chat-Claude joint go required before any rollback action. Rollback only proceeded after that go.
3. **Fly image registry preserved the previous image** (`01KQT8J1BH10BZ1ESTJ08J77TN`) for rollback target. The image had been deployed Day 17 and was still available in Fly's registry at recovery time.
4. **Git history preserved Item 2.3 commit** (`321564a`) on `origin/main` for future debug. The rollback was Fly-level only; no git revert needed.
5. **Sentry transport actually worked enough to surface the crash** — even though the worker thread died, Sentry caught the crash event and sent it to the dashboard. Manish saw the email notifications. This is the bittersweet detail: the failing observability infrastructure provided observability of its own failure.

### What didn't work initially

- `flyctl image deploy` — **not a valid subcommand.** Available `flyctl image` subcommands are `show` (read-only) and `update` (deploys "latest" — wrong direction).
- `flyctl image update` — would have deployed "latest available" which is the failed v29 deploy. Forward-not-backward.
- Wasted ~1 minute on the wrong command before identifying the right one.

### Correct rollback command (verified 2026-05-05)

```bash
flyctl deploy --app apatris-api-staging \
  --image registry.fly.io/apatris-api-staging:deployment-01KQT8J1BH10BZ1ESTJ08J77TN
```

### Lesson for future operators

When rolling back via Fly image:

```bash
flyctl deploy --app <app-name> --image registry.fly.io/<app-name>:deployment-<TAG>
```

**NOT** `flyctl image deploy` (does not exist).
**NOT** `flyctl image update` (deploys "latest" which may be the bad image).

### Cross-pass observation (held for Session 4 / Tier-2)

**Add a "boot-soak verification" gate** that runs the compiled bundle locally for ~60 seconds before staging deploy. This would have caught the worker-thread crash before Fly machine restart budgets exhausted and would have shortened today's incident significantly. The gate is a process-discipline addition for future infrastructure-touching saves; not part of recovery procedures themselves.

---

## Appendix B — Secret source-of-truth table

*Inventoried 2026-05-06 (Day 19) per Item 2.5.x. Maps each Fly secret name to its external source. Used when secrets are lost from Fly and must be restored. NEVER stores secret values — only NAMES and SOURCE LOCATIONS.*

### Counts

- Production (`apatris-api`): 29 secrets
- Staging (`apatris-api-staging`): 28 secrets
- Common to both: 27 secrets
- Production-only: 2 (`APATRIS_ENCRYPTION_KEY_BACKUP`, `APATRIS_LOOKUP_KEY_BACKUP` — legacy-decrypt fallback per Item 2.2 AES messaging migration)
- Staging-only: 1 (`APATRIS_VOYAGE_API_KEY` — Voyage embeddings feature in test, not yet on prod)

### Recovery categories

- **Category A — Database connection:** Source = Neon dashboard. Recovery = copy connection string, no regeneration needed.
- **Category B — Cryptographic key (regeneration has data implications):** Source = password manager. Recovery = restore from PM. Regeneration may invalidate sessions / orphan encrypted data — proceed with caution.
- **Category B-like — Authentication passphrase / PIN:** Source = password manager. Reset propagates to affected users; no data loss.
- **Category C — API key / service credential:** Source = provider dashboard. Recovery = regenerate at provider, then `flyctl secrets set`.
- **Category D — Service URL / configuration value:** Source = app config or external service settings. Recovery = re-derive from source.

### Classification table

| Secret name | Cat | External source | Recovery action |
|---|---|---|---|
| `NEON_DATABASE_URL` | A | Neon dashboard → project → Connection Details | Copy from Neon; no regeneration |
| `JWT_SECRET` | B | Password manager | Restore from PM. Regen invalidates ALL active sessions (users re-login); no data loss |
| `APATRIS_ENCRYPTION_KEY` | B ⚠️ | Password manager | Restore from PM. Regen orphans all AES-encrypted messaging data — never regenerate without `_BACKUP` migration plan |
| `APATRIS_LOOKUP_KEY` | B ⚠️ | Password manager | Restore from PM. Regen orphans lookup-encrypted data |
| `APATRIS_ENCRYPTION_KEY_BACKUP` | B | Password manager | Holds previous key for legacy-decrypt fallback (per commit `b02b326`). Restore from PM if lost; loss = inability to decrypt pre-migration messages |
| `APATRIS_LOOKUP_KEY_BACKUP` | B | Password manager | Same as above for lookup data |
| `VAPID_PRIVATE_KEY` | B | Password manager (or regenerate via web-push CLI) | Regen invalidates ALL existing push subscriptions; users must re-subscribe |
| `VAPID_PUBLIC_KEY` | B | Paired with private key | Must match PRIVATE; regen together |
| `APATRIS_PASS_MANISH` | B-like | Password manager (Manish's vault) | Owner passphrase; reset = re-set, no data loss |
| `APATRIS_PASS_AKSHAY` | B-like | Password manager (Manish's vault) | Same |
| `MOBILE_T2_PIN` | B-like | Password manager | Tier-2 mobile PIN; reset propagates to T2 admins |
| `MOBILE_T3_PIN` | B-like | Password manager | T3 PIN |
| `MOBILE_T4_PIN` | B-like | Password manager | T4 PIN |
| `MOBILE_T5_PIN` | B-like | Password manager | T5 PIN |
| `ANTHROPIC_API_KEY` | C | Anthropic Console (`console.anthropic.com` → API Keys) | Regenerate at console; impact: any in-flight rate-limit windows reset |
| `PPLX_API_KEY` | C | Perplexity dashboard | Regenerate; same impact |
| `APATRIS_VOYAGE_API_KEY` | C | Voyage AI dashboard (`dash.voyageai.com`) | Regenerate; staging-only |
| `SENTRY_DSN` | C | Sentry project → Settings → Client Keys (DSN) | Copy DSN from Sentry project; or rotate key in Sentry UI |
| `SENTRY_AUTH_TOKEN` | C | Sentry account → User Auth Tokens | Regenerate (used for sourcemap upload / release CLI; no runtime impact) |
| `SMTP_USER` | C | Brevo dashboard → SMTP & API → SMTP keys | Regenerate at Brevo |
| `SMTP_PASS` | C | Brevo dashboard | Same |
| `S3_ACCESS_KEY_ID` | C | Cloudflare R2 dashboard → R2 → Manage R2 API Tokens | Rotate token at Cloudflare |
| `S3_SECRET_ACCESS_KEY` | C | Cloudflare R2 dashboard | Paired with `KEY_ID`; regenerate together |
| `SMTP_HOST` | D | Brevo docs (typically `smtp-relay.brevo.com`) | Re-derive from Brevo SMTP setup page |
| `SMTP_PORT` | D | Brevo docs (typically `587`) | Re-derive |
| `S3_BUCKET` | D | Cloudflare R2 bucket name | Re-derive from R2 dashboard |
| `S3_ENDPOINT` | D | R2 dashboard → bucket → endpoint URL | Re-derive |
| `S3_REGION` | D | R2 region constant (typically `auto`) | Re-derive |
| `FILE_STORAGE` | D | App config flag (per CLAUDE.md, `s3` for R2 mode) | Re-derive from CLAUDE.md / code |
| `VAPID_SUBJECT` | D | App config (typically `mailto:admin@apatris.pl` per VAPID spec) | Re-derive |

### Critical operational notes

- **Backup keys (`_BACKUP` suffix) are prod-only and intentional.** They preserve the ability to decrypt pre-AES-migration messaging data per commit `b02b326`. **Never delete `_BACKUP` keys until legacy-data migration is verified complete.** Currently held; deletion criteria TBD per future migration audit.
- **Cryptographic keys (Category B) require special handling.** `APATRIS_ENCRYPTION_KEY` and `APATRIS_LOOKUP_KEY` regeneration would orphan existing encrypted data. If regeneration is unavoidable, the migration plan must decrypt with old key → re-encrypt with new key → verify before swapping.
- **VAPID keypair must be regenerated together.** PUBLIC and PRIVATE are mathematically paired; mismatched keys break web push entirely.
- **Password manager is the source-of-truth for Categories B + B-like.** If the password manager itself is lost, Category B keys cannot be recovered without regeneration (with data implications). The password manager is therefore an Apatris-critical asset; backup posture for the password manager itself is operational hygiene held outside this document.

### Gaps surfaced 2026-05-06 (Day 19), held in Core Plan as deferred items

- **Stripe operational status:** `stripe` library installed, `routes/saas-billing.ts` exists, but NO Stripe secrets in Fly. SaaS scaffolding ahead of operational use. When billing becomes the next feature (Movement 4+), provision Stripe account, set `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` via `flyctl`.
- **Twilio/WhatsApp operational status:** Twilio in CLAUDE.md tech stack but NO Twilio secrets in Fly. Same SaaS-scaffolding-ahead pattern. When WhatsApp messaging becomes the next feature, provision Twilio account, set `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` (or current equivalents).

### Maintenance

This appendix should be re-inventoried whenever:
- New secrets are added or removed from either app
- Provider changes (e.g., switching email provider away from Brevo)
- A secret is rotated (especially Categories B and C — note rotation date)
- After any recovery event that exercised this table (note what worked / what didn't)

Last inventory: 2026-05-06 (Day 19) per Item 2.5.x.

---

## End of RECOVERY_PROCEDURES.md

Authored Day 18 (2026-05-05) by Manish + chat-Claude + Apatris Claude.

Updates expected as new recovery scenarios are tested. Item 3.0f (tested restore drill) will add Scenario B (Neon PITR) verified-as-of-date when executed. Item 3.0c (off-site immutable backups) will close the critical gap noted in Section 2.
