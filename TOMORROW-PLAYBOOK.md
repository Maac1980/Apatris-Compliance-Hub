# Tomorrow's Execution Playbook (Apr 18, 2026)
## Goal: Fix PESEL/IBAN/passport plaintext PII (CRITICAL)

---

### Read this before you start

- **Execute ONE prompt at a time.** Each prompt ends with `⛔ STOP.` Do not chain them. Wait for Claude's report, read it, then move on.
- **Approve permission prompts.** Claude Code will ask before running `fly`, `git push`, deploy commands, etc. Read each one; if it matches the prompt you pasted, approve.
- **If you get tired, defer.** Any prompt after #7 can wait a day without breaking anything. Prompts 1-6 are setup and safe to leave mid-flight.
- **If any prompt's output confuses you**, paste the output back and type: *"Explain this in plain English. Should I continue or stop?"*
- **Rollback if in doubt.** For non-reversible steps (Prompts 10, 15), the rollback path is inlined at the end of the prompt. For everything else: revert the last commit and redeploy.
- **Order of original audit's 3 false positives** (for context): typecheck "block" = non-blocking type drift; payroll N+1 = not an N+1; billing webhook "leak" = legitimate pattern. Only plaintext PII is a real CRITICAL — that's what today fixes.

---

## Decisions Log — confirmed Apr 18, 2026 (answers to Prompt 1)

> These override any conflicting text below.

1. **Two encryption-related env vars:** `APATRIS_ENCRYPTION_KEY` (AES-256-GCM) + `APATRIS_LOOKUP_KEY` (HMAC-SHA256 for hash columns). Deliberately separate so rotating one doesn't force rebuilding the other.
2. **Scope reduced — encrypt 3 fields, NOT 4:**
   - ✅ `workers.pesel`
   - ✅ `workers.iban`
   - ✅ `workers.passport_number`
   - ❌ `workers.nip` — **skipped this migration.** Rationale: all workers are on Umowa o Pracę / Zlecenie, no sole-trader / B2B contractors. NIP column is mostly empty and carries no PII in this workforce composition. Revisit in follow-up migration if B2B workers are added.
3. **Rollback safety confirmed.** Neon PITR retention upgraded 6h → 14 days. Named snapshot `pre-pii-encryption-2026-04-18` exists.
4. **Fail-loud on missing key.** If either `APATRIS_ENCRYPTION_KEY` or `APATRIS_LOOKUP_KEY` is missing at boot, the app refuses to start. No JWT-derived fallback (rejected EEJ's pattern for solo-operator context — silent split-brain data corruption would be invisible).

**Implications for downstream prompts:**
- Hash columns (Prompt 6): `pesel_hash`, `iban_hash`, `passport_hash` — 3 columns, unchanged from plan (`nip_hash` was never planned).
- Write-path wrap (Prompt 7): skip `workers.nip` — don't wrap it with `encrypt()`, don't touch NIP duplicate check logic, leave `nip` column plaintext.
- Read-path wrap (Prompt 8): `nip` is NOT decrypted because it's NOT encrypted — skip any `decrypt(row.nip)` wrapping.
- Backfill (Prompts 11 + 16): drop `nip` from the SELECT and the verification-count SQL. Migrate 3 fields only.
- Encryption library (Prompt 5): fail-loud resolver for both keys; NO JWT fallback branch.

---

## Prompt 0 — Wake-up check (5 min)

**Paste this:**

> Good morning. Before we start today's work, do these things in order and give me a 5-line summary:
>
> 1. Read `/Users/manishshetty/Desktop/Apatris-Compliance-Hub/CONTEXT.md` — especially the "Tomorrow's plan (Apr 18, 2026)" section at the bottom
> 2. Read `/Users/manishshetty/Desktop/Apatris-Compliance-Hub/PII-ENCRYPTION-PLAN.md` — skim all 13 sections, read §1, §11, §12 fully
> 3. Read `/Users/manishshetty/Desktop/Apatris-Compliance-Hub/TOMORROW-PLAYBOOK.md` (this file) — just the "Read this before you start" block and Prompts 1-2
> 4. Confirm prod is still healthy: `curl -s https://apatris-api.fly.dev/api/healthz` and `fly releases --app apatris-api | head -3` — expect v288, status ok
> 5. Confirm staging is still healthy: `curl -s https://apatris-api-staging.fly.dev/api/healthz` and `fly releases --app apatris-api-staging | head -3` — expect v4, status ok
>
> Then give me a 5-line summary in plain English:
> - Where we are (prod version, staging version, health)
> - What's been decided (4 blockers from last night)
> - What we're doing today (PII encryption migration)
> - Estimated time (10.5h focused, 2 days)
> - First step after this prompt (Prompt 1: answer 4 blocker questions)

**Time:** 5 min
**Success looks like:** A tight 5-line summary, both environments healthy (v288 / v4 / 200 OK on both health checks).
**If it fails:**
- If prod is NOT healthy (not 200, or no recent release): stop. Paste the error. Do not proceed with PII work today — something regressed overnight.
- If staging is NOT healthy: same, but lower urgency. Ask Claude to diagnose staging only before deciding whether to skip to Prompt 7 (prod-first path) or pause entirely.
- If files missing: you're in the wrong directory or the git clone is broken. `cd /Users/manishshetty/Desktop/Apatris-Compliance-Hub && git status`.

⛔ **STOP. Read the summary. Do not paste Prompt 1 yet.**

---

## Prompt 1 — Answer 4 blocker questions (15 min, with coffee)

**Paste this:**

> Today we're migrating PESEL/IBAN/passport/NIP to AES-256-GCM encryption. There are 4 decisions I need to make before any code gets written. For each one, you've recommended an answer — I'm going to confirm or override.
>
> Show me each question with:
> - The question in plain English (no crypto jargon)
> - Your recommended answer + one-sentence why
> - The alternative + one-sentence why it's worse
> - Space for me to say "yes, go with your recommendation" or "no, do the alternative"
>
> The 4 questions are:
> 1. Do we create a SECOND env var `APATRIS_LOOKUP_KEY` (separate from the main encryption key) so we can still search for workers by PESEL?
> 2. Do we encrypt `workers.nip` (sole-trader worker tax ID) but LEAVE `clients.nip`, `crm_companies.nip`, and hardcoded Apatris company NIPs as plaintext?
> 3. Do we confirm Neon point-in-time recovery is at least 7 days of retention, as a rollback safety net?
> 4. If the encryption key is missing on prod, do we CRASH loudly on startup (safer), or fall back to deriving a key from JWT_SECRET like EEJ does (tolerant)?

**Time:** 15 min
**Success looks like:** All 4 questions answered. Your answers are recorded — Claude's next action should reference them. You should feel you understood each question before answering.
**If it fails:**
- If you don't understand a question after Claude's explanation: say *"Explain this like I'm not a software engineer. Give me a real-world analogy."* Keep asking until clear.
- Do NOT accept Claude's recommendation just because it's the default. Your business risk tolerance matters more than the "textbook" answer.

⛔ **STOP. Write down your 4 answers somewhere. Do not paste Prompt 2 yet.**

---

## Prompt 2 — Pre-flight checks (10 min)

**Paste this:**

> Last chance before code changes. Do these pre-flight checks and give me a go/no-go verdict:
>
> 1. **Neon retention:** Check what PITR (point-in-time recovery) window the Apatris Neon project has. Need ≥7 days. Check via the Neon dashboard (I'll log in if needed) or the Neon API if you have credentials. If <7 days, tell me exactly how to upgrade the plan before we proceed.
> 2. **Staging reachable:** Run `curl -s -o /dev/null -w "%{http_code}" https://apatris-api-staging.fly.dev/api/healthz`. Must be 200.
> 3. **No unexpected working-tree changes:** Run `git status --short` from repo root. Expected: clean, OR the same 4 items we left untracked yesterday (`.mcp.json` modified, `.claude/skills/superpowers/` untracked, dist deletion, `TOMORROW-PLAYBOOK.md` untracked). Nothing else.
> 4. **File touch list:** From `PII-ENCRYPTION-PLAN.md` §1 "Files that read or write these fields," list every file that this migration will modify. Do NOT modify anything yet. Just list.
> 5. **Flag concerns:** Read the plan's §11 (architectural decisions) and §12 (open questions) one more time. Anything feel risky in the morning light? Raise it now.
>
> Then give me a GO or NO-GO verdict in one line. If NO-GO, tell me exactly what's blocking and what to do.

**Time:** 10 min
**Success looks like:** GO verdict. Neon ≥7 days. Staging responding. Clean working tree. File-touch list is reasonable (~30-40 files, mostly in `artifacts/api-server/src/routes/` and `src/services/` and `src/lib/`).
**If it fails:**
- Neon <7 days: stop. Upgrade Neon plan first (takes ~10 min, costs ~$5-20/mo depending on tier). Do not skip this — it's your ONLY rollback after backfill.
- Staging down: paste the error. Fix staging before touching prod. Today's prod path requires staging verification.
- Unexpected working-tree changes: paste `git status` output. Ask Claude what's safe to keep / stash / ignore.
- File-touch list >60 files: scope creep detected. Stop and ask *"why is this bigger than the plan said?"*

⛔ **STOP. Do not paste Prompt 3 until you see GO.**

---

## Prompt 3 — Generate encryption keys (15-20 min)

> ⚠️ **This is the most sensitive step of today's work.** Fail-loud behavior is locked in — losing any of these keys means data written with that key becomes permanently unreadable. Three separate copies are required before Prompt 4. Take the time; do not skip the round-trip verification.

**Paste this:**

> Walk me through generating 4 encryption keys with full verification at each step. This is the most sensitive step of today's work — losing any of these keys means permanent data loss on the environment where the key was used.
>
> ### Pre-flight environment check
>
> Before running any command, confirm explicitly with me:
>
> 1. I am on my **local laptop**, not SSHed into a remote server, not in Replit / Codespaces / GitHub.dev / any cloud IDE.
> 2. My terminal is a plain local shell (Terminal.app or iTerm on macOS; no tmux pane shared elsewhere).
> 3. No screen-sharing / screen-recording / remote-viewing software is active (Zoom screen share off, QuickTime not recording, Meet / Teams closed).
> 4. No shoulder-surfer is visible. The screen is not reflected in a window or mirror.
>
> If any of these is false, STOP and tell me exactly what to fix. Do not proceed until I re-confirm all four.
>
> ### Generate each key, in this order
>
> Use whichever command works on my machine — both produce equivalent 64-character hex strings:
>
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> # or if node is not installed:
> openssl rand -hex 32
> ```
>
> The 4 keys to generate, in exactly this order:
>
> 1. `APATRIS_ENCRYPTION_KEY — STAGING`
> 2. `APATRIS_LOOKUP_KEY — STAGING`
> 3. `APATRIS_ENCRYPTION_KEY — PROD`
> 4. `APATRIS_LOOKUP_KEY — PROD`
>
> For each key (do all three steps A–C before moving to the next key):
>
> **Step A — Save to primary password manager (Copy 1):**
> - Open 1Password / iCloud Keychain / Bitwarden / whichever I use
> - Create a NEW entry with label format: `apatris-{encryption|lookup}-key-{staging|prod}-20260418`
>   - Key 1 label: `apatris-encryption-key-staging-20260418`
>   - Key 2 label: `apatris-lookup-key-staging-20260418`
>   - Key 3 label: `apatris-encryption-key-prod-20260418`
>   - Key 4 label: `apatris-lookup-key-prod-20260418`
> - Paste the 64-char hex value into the password field
> - Save
>
> **Step B — Round-trip verify (CRITICAL):**
> - From the password manager, retrieve the entry I just saved
> - Paste the retrieved value into a plain text editor — TextEdit, Notes, VS Code — **NOT a terminal** (terminals log to history)
> - Visually confirm three things:
>   - Character-for-character match with the original terminal output
>   - Length is exactly 64 characters (if unsure, paste into a character-counter — an accidental trailing space makes it 65)
>   - All characters are `0-9` or `a-f` (no uppercase, no `g-z`, no punctuation, no whitespace anywhere)
> - If any of those three fails, re-save and re-verify. Do NOT move on until the verify is clean.
>
> **Step C — Save to Copies 2 and 3:**
> - **Copy 2:** Save to a SECOND location — a different password manager on a different device (e.g., primary on Mac's 1Password, secondary on iPhone's iCloud Keychain). Must not be the same physical machine as Copy 1.
> - **Copy 3:** Print the key on paper. Fold the paper. Put it in a sealed envelope labeled e.g. `apatris-encryption-key-staging-20260418 — open ONLY for disaster recovery`. Store in a physical safe at home or office.
>
> ### After all 4 keys are saved in 3 locations each
>
> Ask me this verbatim:
>
> > *"Confirm explicitly: I have generated 4 keys. Each key exists in 3 separate locations (primary password manager + secondary device/PM + printed paper in a physical safe). All 4 keys have been round-trip-verified character-for-character. Do you confirm? (Reply exactly 'yes' to proceed.)"*
>
> If my reply is anything other than exactly `yes`, STOP and ask what is missing. Do not advance.
>
> ### Terminal hygiene (after I confirm yes)
>
> 1. Run `history -c` in the terminal to clear my shell history (optional but recommended — catches any `node -e` or `openssl` invocations that would otherwise persist in `~/.zsh_history` or `~/.bash_history`)
> 2. **Close the terminal window completely** — `Cmd+Q` the app, not just close-tab or minimize. Scrollback persists inside a minimized window.
> 3. Double-check that I have NOT saved any of these keys to: email, Slack, Discord, SMS, GitHub issues, `.env` files, `secrets.json`, Dropbox, iCloud Drive, Google Drive, OneDrive, any auto-synced folder, or any file tracked by git.
>
> Do NOT set any key on Fly yet — that is Prompt 4's job. Right now the keys exist only in my 3 personal storage locations. No server has touched them. Regenerating any key is still free at this stage; it becomes costly the moment Prompt 4 runs.

**Time:** 15-20 min (longer than it looks — the round-trip verify per key is the part people skip, and the part that later bites them).
**Success looks like:**
- 4 distinct 64-character hex strings (all lowercase, all `[0-9a-f]`)
- Each key saved in 3 separate locations (primary PM + secondary device/PM + sealed printed paper)
- Each key round-trip-verified character-for-character from the primary PM entry
- Terminal history cleared, terminal window closed completely
- Your verbal `yes` recorded

**If it fails:**
- Fewer than 4 keys generated: re-run the command for the missing one. Each key must be fresh and independently random — never reuse one as another.
- Round-trip mismatch (saved ≠ original): re-save and re-verify. Common causes: truncated paste (63 chars not 64), trailing whitespace added by the PM, wrong entry label so you retrieved a different key, or autocorrect mangling the hex. Fix before moving on.
- You accidentally saw a key in a screen share or caught a shoulder-surfer mid-generation: regenerate that specific key, save the new one, discard the old. At this stage regenerating is free — the old value never touched Fly.
- Password manager won't sync between devices: Copy 2 must live on a device that is physically NOT the same machine as Copy 1. Two 1Password vaults on the same Mac do not count. If no second device, Copy 2 can be a USB-encrypted file on a USB stick stored separately (weaker than a second device but acceptable).
- No printer or safe available: at minimum, Copy 3 can be a third password manager on a third device. Printed paper + physical safe is the gold standard because it survives digital-only disasters (ransomware, cloud account lockout, device theft). Accept a lesser Copy 3 only if the gold-standard option is truly unavailable today.

⛔ **STOP. Confirm all 4 keys exist in 3 locations each, all round-trip-verified, and your `yes` is on record. Do not paste Prompt 4 yet.**

---

## Prompt 4 — Set staging secrets (10 min)

> ⚠️ **Option 1 workflow continues from Prompt 3.** You run the commands yourself in a fresh Mac Terminal. Claude never sees the hex values. No hex ever appears in chat, in shell history, or on the command line. You report status only.

**Paste this:**

> Walk me through setting the two staging secrets on Fly, without any hex value touching Claude's transcript, my shell history, or any persistent file beyond Fly's own secret store. Report back with status only — I will not paste keys anywhere.
>
> ### Your steps (run in a fresh Mac Terminal — not the one Claude is running in)
>
> 1. Open a fresh Terminal window. Confirm you're on local Mac, not SSH or cloud IDE.
>
> 2. Retrieve both staging values from iPhone Apple Passwords:
>    - `apatris-encryption-key-staging-20260418` (Notes: "Encryption key (AES-256-GCM)")
>    - `apatris-lookup-key-staging-20260418` (Notes: "Lookup key (HMAC-SHA256)")
>
> 3. Create the temp file with an editor (keeps hex OUT of shell history — the editor itself never writes contents to `~/.zsh_history`):
>    ```bash
>    umask 077  # ensures file created with 0600 perms (only you can read)
>    nano /tmp/apatris-staging-secrets
>    ```
>    In nano, type these two lines (replace each `<64-char-hex-from-iPhone>` with the actual hex value):
>    ```
>    APATRIS_ENCRYPTION_KEY=<64-char-hex-from-iPhone>
>    APATRIS_LOOKUP_KEY=<64-char-hex-from-iPhone>
>    ```
>    Save with `Ctrl+O` then `Enter`. Exit with `Ctrl+X`.
>
>    Verify file permissions:
>    ```bash
>    ls -l /tmp/apatris-staging-secrets
>    ```
>    Should show `-rw-------` (owner read/write only). If it shows anything else, something went wrong with `umask` — re-create the file.
>
> 4. Import to Fly — staging only, with `--stage` to defer machine restart until Prompt 9's code deploy:
>    ```bash
>    fly secrets import --app apatris-api-staging --stage < /tmp/apatris-staging-secrets
>    ```
>    Expected output: confirmation that secrets were imported and staged. Machines do NOT restart yet (good — v4 staging code doesn't know about these vars yet; fail-loud logic arrives in Prompt 9).
>
> 5. Securely overwrite-and-delete the temp file:
>    ```bash
>    rm -P /tmp/apatris-staging-secrets  # macOS: overwrites 3 passes before unlink
>    ```
>    On Linux use `shred -u /tmp/apatris-staging-secrets` instead.
>
> 6. Verify **staging** has both secrets staged:
>    ```bash
>    fly secrets list --app apatris-api-staging
>    ```
>    Both `APATRIS_ENCRYPTION_KEY` and `APATRIS_LOOKUP_KEY` should appear with recent/staged status. Values are always shown hidden (normal).
>
> 7. Verify **prod is clean** (critical typo defense — single character off in app name and you'd have hit prod):
>    ```bash
>    fly secrets list --app apatris-api | grep -i APATRIS_
>    ```
>    Expected: **empty output** (grep exits code 1 / no matches). If either `APATRIS_ENCRYPTION_KEY` or `APATRIS_LOOKUP_KEY` appears on prod, **STOP IMMEDIATELY**. A typo hit prod. Unset right away:
>    ```bash
>    fly secrets unset APATRIS_ENCRYPTION_KEY APATRIS_LOOKUP_KEY --app apatris-api
>    ```
>    Then report the incident to me before continuing.
>
> 8. Clear in-memory shell history (belt and braces):
>    ```bash
>    history -c
>    ```
>
> 9. Close the Terminal window completely with `Cmd+Q`.
>
> ### Report back with exactly:
>
> > "Staging secrets staged. Prod verified clean. Temp file shredded. Shell history cleared. Terminal closed."
>
> Do NOT paste any hex value anywhere. Do NOT deploy anything — Prompt 9 handles the deploy.

**Time:** 10 min
**Success looks like:**
- `fly secrets list --app apatris-api-staging` shows both `APATRIS_ENCRYPTION_KEY` and `APATRIS_LOOKUP_KEY` (hidden values, staged status)
- `fly secrets list --app apatris-api | grep -i APATRIS_` returns empty (prod untouched)
- `/tmp/apatris-staging-secrets` securely deleted
- Shell history cleared
- Terminal window closed with Cmd+Q

**If it fails:**
- `fly secrets import` rejects the file: formatting issue. Each line must be exactly `KEY=value`, no leading spaces, no trailing whitespace, value is 64 hex chars. Open the file again (`nano /tmp/apatris-staging-secrets`), fix, re-import, re-shred.
- `rm -P` not found: you're on Linux — use `shred -u`. Or on an older macOS without `-P`: use `srm -sz` (Homebrew `secure-delete`), or worst case `rm` + `diskutil secureErase freespace 1 /` (overkill unless high-threat model).
- Prod NOT clean in step 7: typo hit the wrong app. Immediately `fly secrets unset ... --app apatris-api`, re-verify with grep, retry from step 3 targeting staging explicitly.
- `fly secrets list` shows permissions error or wrong account: `fly auth whoami` to confirm. You should see `manishshetty79@gmail.com`.
- You accidentally typed the hex directly on command line (step 3 nano doesn't do this — but if you used a different method): run `history -c && > ~/.zsh_history` to clear the history file too, not just in-memory.

⛔ **STOP. Confirm staging still reachable: `curl -s https://apatris-api-staging.fly.dev/api/healthz` → 200. Do not paste Prompt 5 yet.**

---

## Prompt 5 — Build encryption library + tests (1.5-2 hours)

**Paste this:**

> Time to write code. Create `artifacts/api-server/src/lib/encryption.ts` following the plan's §3. Port from EEJ `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/artifacts/api-server/src/lib/encryption.ts` but make these changes:
>
> - Env var: `APATRIS_ENCRYPTION_KEY` (not EEJ_...)
> - Add a new `lookupHash(plain)` function using HMAC-SHA256 with `APATRIS_LOOKUP_KEY` as the key
> - Add `maskForRole(value, role)` per the plan's §3 role table (T1/T2 plaintext, T3/T4 masked, T5 own-record plaintext / others masked, unknown = `***`)
> - For the `APATRIS_ENCRYPTION_KEY` resolver: my blocker-4 answer was [YES fail-loud / NO use EEJ fallback — pick the one I said in Prompt 1]. Apply that.
>
> Then write `artifacts/api-server/src/encryption.test.ts` with every test case listed in the plan's §7 (encrypt/decrypt round-trip, empty string, Polish UTF-8, legacy plaintext passthrough, null, garbage ciphertext, role masking for each tier, lookupHash determinism, different-key-different-hash).
>
> Run: `cd artifacts/api-server && npx vitest run encryption.test.ts`
>
> Report:
> - How many tests written
> - How many pass / fail
> - Paste any failures verbatim
>
> Do NOT touch any other file. Do NOT modify `workers-db.ts` or any route yet. Just the library + its tests.

**Time:** 1.5-2 hours (mostly Claude writing code; ~15 min for you to review + approve)
**Success looks like:** `lib/encryption.ts` + `encryption.test.ts` exist; all tests pass (probably 15-20 tests); no other files modified.
**If it fails:**
- Test count <10: Claude skipped cases. Paste the §7 list and say *"missed some — please add these: [list]."*
- Any test failing: paste the failure verbatim and ask *"what does this error mean? fix it."*
- Unit tests pass but Claude also touched other files: ask *"revert all files except `lib/encryption.ts` and `encryption.test.ts`. I want this prompt to be surgical."*

⛔ **STOP. Confirm tests pass. Commit the new files locally: `git add artifacts/api-server/src/lib/encryption.ts artifacts/api-server/src/encryption.test.ts && git commit -m "feat: encryption library + tests"`. Do not push. Do not paste Prompt 6 yet.**

---

## Prompt 6 — Add hash columns to schema (30 min)

**Paste this:**

> Now modify `artifacts/api-server/src/lib/init-db.ts` to add 3 new nullable TEXT columns via idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`:
>
> - `workers.pesel_hash TEXT`
> - `workers.iban_hash TEXT`
> - `workers.passport_hash TEXT`
>
> Follow the existing pattern in init-db.ts (look for `ADD COLUMN IF NOT EXISTS` examples). Add one `CREATE INDEX IF NOT EXISTS` on each new hash column (these will be used for duplicate-lookup queries).
>
> Do NOT run the schema change yet — that happens when we deploy in Prompt 9. Just edit the file and show me the diff. Do NOT push or deploy.
>
> Then commit locally: `git commit -m "feat: add pesel_hash/iban_hash/passport_hash columns"`.

**Time:** 30 min
**Success looks like:** init-db.ts has 3 new `ALTER TABLE` blocks + 3 indexes, all using `IF NOT EXISTS`. One local commit. No deploy.
**If it fails:**
- Claude added `DROP COLUMN` or `ALTER COLUMN` anywhere: STOP. Revert immediately. Non-idempotent DDL is dangerous. `git reset --hard HEAD~1`.
- Claude ran a live migration: check `fly secrets list` + `fly logs` to see if staging rolled. If it did and the columns appear healthy, continue. If anything errored, paste the error.

⛔ **STOP. Verify the diff is small (3 ALTER + 3 CREATE INDEX, maybe ~20 lines). Do not paste Prompt 7 yet.**

---

## Prompt 7 — Wrap write paths (1.5-2 hours)

**Paste this:**

> Now wrap every write site with `encrypt()` and `lookupHash()`. Follow PII-ENCRYPTION-PLAN.md §4 target list exactly.
>
> Before editing anything: list all the files + line numbers you're about to change in a table. Wait for my "yes, proceed" before touching code.
>
> Then apply the changes. Focus especially on:
> - `artifacts/api-server/src/lib/workers-db.ts` — the CRUD choke point. `createWorker()` and `updateWorker()`. Also the duplicate-check queries (change `WHERE pesel = $1` to `WHERE pesel_hash = $1`).
> - The ~5 direct-SQL sites that bypass workers-db (`routes/contracts.ts`, `routes/trc-service.ts`, `routes/worker-email.ts`, `routes/self-service.ts`, `services/document-intake.service.ts`).
> - Seed files: `lib/seed-test-scenarios.ts`, `lib/seed-comprehensive.ts`, and the hardcoded seed block in `lib/init-db.ts:610-674`.
>
> After edits, run `cd artifacts/api-server && npx vitest run` — all 304+ unit tests must still pass.
>
> Commit locally: `git commit -m "feat: encrypt PII on all write paths + migrate duplicate-check to hash columns"`.
>
> Do NOT push. Do NOT deploy.

**Time:** 1.5-2 hours
**Success looks like:** Pre-change file list matches §4 (~7-8 files). After edits, all 304 tests still pass. One local commit. No deploy.
**If it fails:**
- Pre-change list is way bigger or smaller than §4: ask *"why does this diverge from the plan? reconcile."*
- Tests fail after edits: paste the failure. Common cause: the duplicate-check query wasn't migrated to use `pesel_hash`. Claude should fix, not you.
- Any test broke that was passing before: ask *"what test is failing and why? fix without skipping the test."* Do NOT accept test skips.

⛔ **STOP. Run `git log --oneline -5` — should see 3 local commits (encryption lib, hash columns, write paths). Do not paste Prompt 8 yet.**

---

## Prompt 8 — Wrap read paths + role masking (1.5-2 hours)

**Paste this:**

> Same pattern as Prompt 7 but for read sites. Follow PII-ENCRYPTION-PLAN.md §5.
>
> Before editing: list every file + line number you'll change. Wait for my "yes, proceed."
>
> Apply changes:
> - Central: `workers-db.ts` `fetchAllWorkers()` and `fetchWorkerById()` — decrypt pesel/iban/passport/nip before returning. Accept an optional `role` parameter for masking.
> - Routes that query directly (fraud.ts GROUP BY → use hash column, zus.ts/compliance-enforcement.ts/payroll.ts CSV+PDF → decrypt at render time, document-intake.service.ts worker-matching → WHERE pesel_hash).
> - Audit log sanitizer: add the regex check in `lib/audit-log.ts` per plan §5.
>
> Then run full test suite: `cd artifacts/api-server && npx vitest run`. All pass.
>
> Commit locally: `git commit -m "feat: decrypt + role-mask PII on all read paths + audit sanitizer"`.
>
> Do NOT push. Do NOT deploy.

**Time:** 1.5-2 hours
**Success looks like:** ~15-20 files changed. All tests pass. 4 local commits total now.
**If it fails:**
- Test fails because `GROUP BY pesel_hash` returns different clusters than `GROUP BY pesel` on legacy plaintext data: that's actually expected during the transition. Confirm with Claude that the test uses only encrypted seed data, not a mixed-state fixture.
- Role masking test fails: re-check Prompt 1's answer on T5-sees-own-record behavior. Claude might have implemented the opposite.

⛔ **STOP. All 4 local commits staged. Do not paste Prompt 9 yet.**

---

## Prompt 9 — Deploy to staging (15 min)

**Paste this:**

> Push the 4 local commits to GitHub main and deploy to staging.
>
> 1. `git push origin main` — from repo root
> 2. `fly deploy --remote-only --config fly.staging.toml -a apatris-api-staging`
> 3. Wait for deploy to finish (both machines rolling to healthy)
> 4. Verify: `curl -s https://apatris-api-staging.fly.dev/api/healthz` → 200
> 5. Confirm new schema: via Neon console or a test SELECT, confirm `workers.pesel_hash`, `workers.iban_hash`, `workers.passport_hash` columns exist
> 6. Confirm new writes encrypt: create a test worker via the staging dashboard with a known PESEL (e.g., `12345678901`). Then query `SELECT pesel, pesel_hash FROM workers WHERE id = <new>` via Neon console. Expected: `pesel` starts with `enc:v1:`, `pesel_hash` is a 64-char hex string.
>
> Report: deploy version (should be v5 or higher), health check response, test-worker encryption status (confirmed yes/no).

**Time:** 15 min
**Success looks like:** Staging v5+, health 200, new writes encrypt, hash column populated, legacy plaintext rows untouched.
**If it fails:**
- Deploy errors: paste. Most common: env var issue (Prompt 4 didn't set secrets correctly). Re-run `fly secrets list --app apatris-api-staging`.
- Machines unhealthy: `fly logs --app apatris-api-staging` — look for startup errors. If `APATRIS_ENCRYPTION_KEY required` appears, Prompt 4 failed silently. Re-do it.
- Test worker creates but pesel stored plaintext: one of Prompt 7's write sites was missed. Ask Claude *"which write site is still unwrapped? find it."*
- **Rollback:** if deploy is broken, `fly releases rollback --app apatris-api-staging` and fix the code before re-deploying. No data lost yet.

⛔ **STOP. Staging is now running new code. Do not paste Prompt 10 yet.**

---

## Prompt 10 — Take Neon snapshot of staging (5 min)

**Paste this:**

> Take a named Neon snapshot of the staging database. This is our rollback anchor before backfill writes to every row.
>
> Via Neon dashboard: Projects → apatris-staging → Branches → main → "Create branch from point-in-time" OR "Create snapshot." Name it: `pre-pii-backfill-staging-2026-04-18`.
>
> Or via Neon API / CLI if available. Confirm snapshot exists by listing snapshots.
>
> Report: snapshot name, timestamp, recovery point.

**Time:** 5 min
**Success looks like:** Named snapshot exists. Timestamp is recent (<5 min).
**If it fails:**
- Neon dashboard doesn't have a "create snapshot" button: your plan may not support manual named snapshots. PITR (point-in-time recovery) still works — record the current timestamp in ISO-8601 format as your rollback point. Example: `2026-04-18T09:15:32Z`.
- Can't find the staging project: `neonctl projects list` or check the Neon dashboard for project named `apatris` or similar.

⛔ **STOP. Snapshot confirmed. Do not paste Prompt 11 yet.**

---

## Prompt 11 — Run backfill on staging (variable, likely 5-15 min)

**Paste this:**

> Run the PII backfill script on staging. This encrypts every existing plaintext pesel/iban/passport/nip row on staging — **non-reversible without the snapshot from Prompt 10**.
>
> First, check the script exists: `ls artifacts/api-server/scripts/backfill-pii.ts`. If it doesn't exist, Claude needs to write it now following the pattern in `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/artifacts/api-server/src/lib/pii-backfill.ts` but adapted for Apatris (4 fields: pesel, iban, passport_number, nip — and also populate the `*_hash` columns).
>
> To run against staging:
>
> ```bash
> cd artifacts/api-server
> DATABASE_URL=<staging-neon-connection-string> npx tsx scripts/backfill-pii.ts
> ```
>
> (Get the staging Neon connection string from `fly secrets list --app apatris-api-staging` — no, secrets are hidden. Get it from the Neon dashboard or your password manager.)
>
> After it finishes, run this verification query via Neon console:
>
> ```sql
> SELECT
>   COUNT(*) FILTER (WHERE pesel IS NOT NULL AND pesel NOT LIKE 'enc:v1:%') AS unencrypted_pesel,
>   COUNT(*) FILTER (WHERE iban IS NOT NULL AND iban NOT LIKE 'enc:v1:%') AS unencrypted_iban,
>   COUNT(*) FILTER (WHERE passport_number IS NOT NULL AND passport_number NOT LIKE 'enc:v1:%') AS unencrypted_passport,
>   COUNT(*) FILTER (WHERE nip IS NOT NULL AND nip NOT LIKE 'enc:v1:%') AS unencrypted_nip
> FROM workers;
> ```
>
> All 4 counts must be 0.
>
> Report: backfill output (scanned / encrypted / skipped / errors), then the 4 verification counts.

**Time:** 5-15 min (depends on row count; staging has ~5-50 rows so it'll be seconds)
**Success looks like:** Backfill reports `errors: 0`. All 4 unencrypted counts = 0.
**If it fails:**
- Script crashes mid-run: STOP. Some rows are encrypted, some aren't. Re-run — it's idempotent (skips already-encrypted rows). If the underlying error recurs, paste it and ask *"diagnose and fix."*
- `errors > 0` in output: paste the script's error log. Usually means one row has malformed data (null where not expected). Fix row manually in Neon console, re-run script.
- Verification counts >0: script missed some fields. Paste the count + the SQL; ask *"which field, which table? fix the script."*
- **Rollback:** if staging is hosed, restore from the Prompt 10 snapshot via Neon dashboard → "Restore from branch/snapshot." You lose any staging data created since the snapshot (typically 0 since staging is idle).

⛔ **STOP. Staging is now fully encrypted. Do not paste Prompt 12 yet.**

---

## Prompt 12 — Smoke test staging (30 min)

**Paste this:**

> Run a concrete smoke test on staging. Each check below has a specific action and expected result:
>
> 1. **Health:** `curl -s https://apatris-api-staging.fly.dev/api/healthz` → 200 + `{"status":"ok",...}`
> 2. **Read existing worker (role=T1):** Log into staging dashboard as a T1 user. Open any worker profile. PESEL must display in plain text (e.g. `12345678901`). Screenshot if unsure.
> 3. **Read as T3:** Log out, log in as T3 (Tech Ops). Open the same worker. PESEL must display as `***-****-8901` (last 4 visible only).
> 4. **Create a new worker:** Via dashboard, create a new worker with PESEL `98765432101`, IBAN `PL00000000000000000000001234`. Confirm the UI shows success.
> 5. **Verify encryption in DB:** Via Neon console: `SELECT pesel, pesel_hash, iban FROM workers WHERE name = '<new worker name>'`. Both `pesel` and `iban` should start with `enc:v1:`. `pesel_hash` should be 64 hex chars.
> 6. **Duplicate detection:** Try to create another worker with the same PESEL `98765432101`. Expect 409 Conflict (duplicate detected via hash column).
> 7. **Fraud detection:** Go to `/fraud/duplicates` on staging dashboard (or hit `/api/fraud/duplicates`). Must return a result showing the duplicate cluster. Cluster count = previously-detected duplicate groups (expected same count as before encryption).
> 8. **Payroll CSV export:** Export the current month's payroll CSV. Open the file. PESEL and IBAN columns must contain plaintext (not `enc:v1:...`). This verifies the decrypt-at-render path.
> 9. **Contract PDF:** Generate a contract for any worker. Download the PDF. Open it. Worker's PESEL must appear as plaintext in the contract.
> 10. **Delete the test worker from step 4.**
>
> Report: check-by-check pass/fail. Any failure = stop and diagnose before Prompt 13.

**Time:** 30 min
**Success looks like:** All 10 checks pass. Role masking works. Writes encrypt. Reads decrypt. Exports decrypt. Duplicates detected.
**If it fails:**
- Any single check fails: STOP. This is the gate before prod. Paste the failing check + any error; fix before proceeding.
- Role masking shows wrong value for T3: likely Prompt 8 bug. Ask Claude to re-check `maskForRole()` + its call sites.
- Fraud duplicates returns 0 clusters when there should be some: `GROUP BY pesel_hash` isn't working. Check that backfill populated `pesel_hash` for every row.
- Export shows `enc:v1:...` in CSV/PDF: decrypt-at-render path missing. Show Claude which export file, ask it to wrap with `decrypt()`.

⛔ **STOP. Staging is fully verified. You have earned a break. Prod work below starts a non-reversible chain.**

---

## Prompt 13 — Set prod secrets (5 min)

**Paste this:**

> Set the PROD keys on Fly. Use `APATRIS_ENCRYPTION_KEY — PROD` and `APATRIS_LOOKUP_KEY — PROD` from my password manager. **Do not reuse staging values.**
>
> Command:
>
> ```
> fly secrets set --app apatris-api \
>   APATRIS_ENCRYPTION_KEY=<prod-encryption-key> \
>   APATRIS_LOOKUP_KEY=<prod-lookup-key>
> ```
>
> After: `fly secrets list --app apatris-api` — both names appear, recent timestamps, both machines rolling to healthy.
>
> Verify prod health stayed up during the rolling restart: `curl -s https://apatris-api.fly.dev/api/healthz` → 200.

**Time:** 5 min
**Success looks like:** Prod secrets set. `fly secrets list` shows both. `curl` returns 200. No downtime.
**If it fails:**
- Prod machine crashes on startup: a secret is malformed. Unset immediately: `fly secrets unset APATRIS_ENCRYPTION_KEY APATRIS_LOOKUP_KEY --app apatris-api`. Prod returns to previous working state. Re-generate and re-set.
- You pasted the staging value by mistake: immediately unset, reset with the correct prod value. No data harm yet because code isn't deployed.

⛔ **STOP. Prod has the keys but is still running v288 (old code). Do not paste Prompt 14 yet.**

---

## Prompt 14 — Take Neon snapshot of prod (5 min)

**Paste this:**

> Take a named Neon snapshot of the **prod** database. This is the rollback anchor for Prompt 16's backfill.
>
> Via Neon dashboard → prod project → Create snapshot. Name: `pre-pii-backfill-prod-2026-04-18`. Or record the ISO-8601 timestamp if manual snapshots aren't supported on your plan.
>
> Do NOT proceed to any other step until the snapshot is confirmed and the timestamp is written down in your password manager notes.

**Time:** 5 min
**Success looks like:** Named snapshot exists on prod project. Recovery point recorded.
**If it fails:**
- No manual snapshot support: confirm PITR is ≥7 days, record `date -u +%Y-%m-%dT%H:%M:%SZ` as your rollback point, verify you can restore in a separate Neon branch before proceeding.

⛔ **STOP. Rollback anchor secured. Do not paste Prompt 15 yet.**

---

## Prompt 15 — Deploy prod (Phase 1: code only, no backfill) (15 min)

**Paste this:**

> Deploy the encryption code to prod. This is Phase 1 — reversible. Legacy plaintext rows are still readable; new writes encrypt.
>
> 1. `fly deploy --remote-only -a apatris-api`
> 2. Wait for both machines to roll healthy
> 3. Verify: `curl -s https://apatris-api.fly.dev/api/healthz` → 200
> 4. Verify new writes encrypt: create a test worker via prod dashboard with PESEL `11111111119` (a fake-but-valid-format number). Query `SELECT pesel, pesel_hash FROM workers WHERE name = '<test>'` via Neon prod console. Both must be encrypted/hashed.
> 5. Delete the test worker immediately after verification.
> 6. Report: prod release version (expect v289), health check response, test worker encryption confirmed, test worker deleted.

**Time:** 15 min
**Success looks like:** Prod v289, 200 OK, test worker wrote encrypted + was deleted.
**If it fails:**
- Deploy errors: paste. Most common at this stage: prod secret was set wrong in Prompt 13 (check `fly logs --app apatris-api` for `APATRIS_ENCRYPTION_KEY required` startup errors).
- Machines won't roll healthy: `fly releases rollback --app apatris-api` reverts to v288. No data damage. Diagnose, fix, redeploy.
- Test worker writes plaintext: Prompt 7 missed a write site on the worker-creation flow. Do NOT proceed to backfill. Fix locally, redeploy, retest.
- **Rollback:** `fly releases rollback --app apatris-api` — instantly reverts to v288 running old code. Legacy plaintext rows are untouched. No data lost.

⛔ **STOP. Prod is on new code. Legacy data is still plaintext. Do not paste Prompt 16 yet. If it's late, this is a safe overnight stopping point — resume tomorrow.**

---

## Prompt 16 — Run backfill on prod (OFF-PEAK ONLY, 15-30 min)

**Paste this:**

> Run the PII backfill on prod. **Pre-requirements:**
> - It is off-peak hours (02:00-05:00 Warsaw time, or weekend)
> - Prompt 14 snapshot is confirmed
> - Prompt 15 verified new writes encrypt
> - You are alert and have at least 1 hour free
>
> If any of the above is false: stop. Defer to tomorrow.
>
> Run:
>
> ```bash
> cd artifacts/api-server
> DATABASE_URL=<prod-neon-connection-string> npx tsx scripts/backfill-pii.ts
> ```
>
> Monitor output live. Expected: scanned ~200, encrypted ~200, errors 0.
>
> Then run the same verification query from Prompt 11 against prod. All 4 unencrypted counts must be 0.
>
> Report: backfill output, verification counts, total time taken.

**Time:** 15-30 min (depends on prod row count; ~200 workers = ~1 min)
**Success looks like:** `errors: 0`, all 4 verification counts = 0 on prod.
**If it fails:**
- Script crashes mid-run: rows in mixed state. Idempotent — re-run. If crash recurs, paste error and ask *"diagnose and fix."* Do NOT rollback unless encryption is clearly broken.
- Errors >0: paste log. One row has bad data. Fix in Neon console, re-run.
- Verification counts >0: some fields missed by script. Identify which, update script, re-run.
- **Rollback (last-resort):** Neon dashboard → restore from `pre-pii-backfill-prod-2026-04-18` snapshot → all encrypted data gone, plaintext restored. You lose any new worker records written between Prompt 14 and now. Avoid unless data integrity is clearly compromised.

⛔ **STOP. Prod is fully encrypted. Do not paste Prompt 17 yet.**

---

## Prompt 17 — Smoke test prod (30 min)

**Paste this:**

> Repeat the 10 smoke-test checks from Prompt 12, but against prod URLs:
>
> - Dashboard: https://apatris-api.fly.dev (or your prod dashboard URL)
> - Health: https://apatris-api.fly.dev/api/healthz
>
> Use a known real worker (NOT a test account — we want to verify decryption works on actual production data). Pick a worker whose PESEL you can visually confirm from your records.
>
> Report: check-by-check pass/fail.

**Time:** 30 min
**Success looks like:** All 10 checks pass on prod. PII appears plaintext to T1/T2. Masked for T3+. Exports work.
**If it fails:**
- Any check fails: STOP. Prod is partially broken. Paste the failing check. Options:
  - (a) Fix forward (redeploy with fix)
  - (b) Rollback to v288 code + restore Prompt 14 snapshot (loses data, last resort)
  - Almost always: (a). Claude should fix the specific bug; redeploy is ~5 min.

⛔ **STOP. Prod migration complete if all 10 pass.**

---

## Prompt 18 — Update CONTEXT.md + CLAUDE.md, commit (15 min)

**Paste this:**

> Migration done. Document it.
>
> 1. In `CONTEXT.md` — update the "Recent work" section to add Apr 18 entry summarizing what shipped (PESEL/IBAN/passport/NIP encryption, hash columns for duplicate detection, role masking, backfill completed).
> 2. In `CONTEXT.md` — remove the "Tomorrow's plan (Apr 18, 2026)" section (it's done).
> 3. In `CLAUDE.md` — remove the "CRITICAL: PESEL/IBAN plaintext" debt entry if it's listed there.
> 4. In `PII-ENCRYPTION-PLAN.md` — check all boxes in the "Definition of Done" section (§13).
>
> Stage ONLY these 3 docs: `git add CONTEXT.md CLAUDE.md PII-ENCRYPTION-PLAN.md` (exclude `.mcp.json`, `.claude/skills/`, etc.).
>
> Commit: `git commit -m "docs: PII encryption rollout complete — PESEL/IBAN/passport/NIP now AES-256-GCM at rest"`.
>
> Push: `git push origin main`.
>
> Do NOT deploy. Do NOT run /ship. The code is already live; this is docs-only.

**Time:** 15 min
**Success looks like:** One docs commit pushed. No deploy.
**If it fails:**
- Accidentally staged source files: `git reset HEAD <file>` to unstage. Only the 3 docs should be in the commit.
- CLAUDE.md doesn't have the debt entry: skip that sub-step. Just the other 2 files.

⛔ **STOP. You're done. Today's work is complete.**

---

## If anything goes wrong

### General rollback quick reference
- **Phase 1 code deploy broken** (Prompts 9 or 15): `fly releases rollback --app <app>` — instant, zero data loss
- **Backfill broken mid-run** (Prompts 11 or 16): script is idempotent; just re-run after fixing
- **Post-backfill data corruption**: restore from Prompt 10 or 14 named snapshot via Neon — loses any data written since snapshot. This is the nuclear option; only use if data integrity is clearly lost.
- **Full plan rollback details:** `PII-ENCRYPTION-PLAN.md` §9

### Where to look when things break
- **Sentry dashboard:** https://apatris-sp-zoo.sentry.io (errors, stack traces, performance)
- **Fly logs:** `fly logs --app apatris-api` (prod) or `--app apatris-api-staging` (staging)
- **Neon console:** SQL-level inspection, snapshot/restore, PITR
- **GitHub actions:** https://github.com/Maac1980/Apatris-Compliance-Hub/actions (CI state)

### Emergency contacts
- **Me (sole operator):** that's you
- **Claude:** paste the error + context, ask *"diagnose in plain English"*

---

## Skip rules for non-engineer operator

- **If a prompt asks me to debug code:** paste the error back to Claude. Ask *"what is this, in plain English? How do I fix it? Show me the one-line command to paste."* Do not read source code yourself.
- **If anything feels uncertain:** STOP. Ask *"explain this step like I'm a businessman, not an engineer. What's the real-world risk if I get this wrong?"*
- **If you get tired:** every prompt labeled ⛔ is a safe stopping point. Prompts 1-15 can be resumed the next day with zero data risk. Prompts 16+ should finish within the same day once started, but only if you're alert.
- **If staging works but prod feels scary:** defer prod by a day. Staging being clean overnight = proof the code works. Prod work can happen when you're fresh.
- **If someone (client, team member) reports prod is down today:** abort the migration immediately. Health first, PII second. Run: `fly releases rollback --app apatris-api`. Resume later.

---

**Final note:** This is a big day. The plan is solid. You've thought about it more carefully than most startups ever do. Take it one prompt at a time. ⛔
