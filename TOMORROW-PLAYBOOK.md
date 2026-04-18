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

> ⚠️ **Library only.** No write-path changes, no read-path changes, no workers-db.ts, no routes. Those come in Prompts 6-8. This prompt must stay surgical.

**Paste this:**

> Build the encryption library per PII-ENCRYPTION-PLAN.md §3. Port from EEJ's proven pattern at `/Users/manishshetty/Desktop/EURO-EDU-JOBS-app/artifacts/api-server/src/lib/encryption.ts`.
>
> Create exactly two new files:
> - `artifacts/api-server/src/lib/encryption.ts`
> - `artifacts/api-server/src/encryption.test.ts`
>
> ### Library spec
>
> **Ciphertext format:** `enc:v1:<iv-base64>:<tag-base64>:<ciphertext-base64>` (bit-for-bit compatible with EEJ).
>
> **Two required env vars, both fail-loud if missing in non-test envs:**
> - `APATRIS_ENCRYPTION_KEY` — 64 hex chars (32 bytes), AES-256-GCM key
> - `APATRIS_LOOKUP_KEY` — 64 hex chars (32 bytes), HMAC-SHA256 key
>
> **Key-resolver behavior (critical — do not deviate):**
> - If `process.env.NODE_ENV === 'test'` AND the env var is missing → use deterministic test values: `'00'.repeat(32)` for encryption key, `'11'.repeat(32)` for lookup key. This carveout MUST be guarded by the `NODE_ENV === 'test'` check and never triggerable in dev, staging, or prod.
> - If `NODE_ENV !== 'test'` AND either env var is missing → throw on module init with exact message: `"[encryption] APATRIS_ENCRYPTION_KEY is required"` (or `APATRIS_LOOKUP_KEY`). **NO JWT-derived fallback. NO silent warning. App refuses to start.** (Blocker-4 decision, locked 2026-04-18.)
> - Validate each provided key is exactly 64 lowercase hex chars; throw otherwise.
>
> **Functions to export:**
> ```ts
> export function encrypt(plain: string): string
> export function decrypt(stored: string | null | undefined): string | null
> export function isEncrypted(s: unknown): boolean
> export function encryptIfPresent(value: unknown): string | undefined
> export function lookupHash(plain: string): string  // hex, 64 chars
> export function maskForRole(value: string | null, role: Tier): string | null
> ```
>
> **Behaviors:**
> - `encrypt`: empty-string passthrough, already-encrypted passthrough (detected via `enc:v1:` prefix), else AES-256-GCM with 12-byte random IV.
> - `decrypt`: null → null. No `enc:v1:` prefix → return input unchanged (**LEGACY PLAINTEXT PASSTHROUGH** — required for backward compat during the backfill window). Malformed ciphertext → null + `console.error`.
> - `lookupHash`: HMAC-SHA256 over trimmed plaintext with `APATRIS_LOOKUP_KEY`. Returns 64-char hex. Deterministic.
> - `maskForRole(value, role)`:
>   - `T1`, `T2` → `decrypt(value)` (plaintext)
>   - `T3`, `T4`, `T5` → `***-****-<last4>` of decrypted value
>   - Unknown role → `***`
>   - Null input → null
>   - **T5 is MASKED here by default.** The Compliance Card plaintext exception (`?purpose=compliance_card` + own-record check + audit log) is handled at the route level in Prompt 8, NOT inside this function.
>
> ### Tests spec — minimum 18 tests in `encryption.test.ts`
>
> **encrypt / decrypt:**
> 1. round-trip simple ASCII (`"12345678901"`)
> 2. round-trip Polish UTF-8 (`"Łódź ąćęłńóśźż"`)
> 3. round-trip 64-char hex string (proves it works on any string)
> 4. `encrypt("")` → `""`
> 5. `encrypt(encrypt(x))` → same as `encrypt(x)` (no double-encrypt)
> 6. `decrypt(null)` → `null`
> 7. `decrypt("12345678901")` → `"12345678901"` (legacy passthrough)
> 8. `decrypt("enc:v1:garbage")` → `null` (malformed, logs error)
>
> **lookupHash:**
> 9. determinism: same input → same output (run 3x, assert equal)
> 10. different inputs → different outputs
> 11. whitespace trim: `lookupHash("  x  ") === lookupHash("x")`
> 12. output length is exactly 64 hex chars
>
> **maskForRole:**
> 13. T1 on encrypted value → plaintext
> 14. T3 on encrypted value → `***-****-<last4>`
> 15. T5 on encrypted value → `***-****-<last4>` (DEFAULT; Compliance Card exception is route-level)
> 16. unknown role → `***`
> 17. null input → null
> 18. legacy plaintext input: T1 returns as-is; T3 returns `***-****-<last4>` of the plaintext
>
> ### Run tests
>
> ```bash
> cd artifacts/api-server && npx vitest run src/encryption.test.ts
> ```
>
> Report:
> - Total test count (expect ≥18)
> - Pass / fail counts
> - Full stack trace for any failure
>
> ### Hard boundaries
>
> - Do NOT modify `workers-db.ts`, `audit-log.ts`, `init-db.ts`, any route file, any service file.
> - Do NOT add `pesel_hash` / `iban_hash` / `passport_hash` columns — that's Prompt 6.
> - Do NOT wrap any write site — that's Prompt 7.
> - Do NOT wrap any read site — that's Prompt 8.
> - If you find yourself editing anything other than the 2 new files, STOP and revert.

**Time:** 1.5-2 hours (~90 min code + ~15 min review + ~15 min debug buffer)

**Success looks like:**
- Exactly 2 new files: `artifacts/api-server/src/lib/encryption.ts` + `artifacts/api-server/src/encryption.test.ts`
- ≥18 tests written, all pass
- `git status` shows only those 2 files (plus the usual 3 leave-alone items: `.mcp.json`, dist deletion, `.claude/skills/superpowers/`)
- `npx vitest run src/encryption.test.ts` exit code 0

**If it fails:**
- Vitest can't boot / `"APATRIS_ENCRYPTION_KEY required"` on test run → NODE_ENV==='test' carveout isn't wired. Ask Claude: *"the test-env carveout isn't working — fix the key resolver to use fixed test keys when NODE_ENV === 'test'."*
- Test count <18 → Claude skipped cases. Paste the 18-item list and ask: *"add the missed cases: [list]."*
- Any test fails → paste the full stack trace. Claude diagnoses and fixes. You don't read the code yourself.
- `git status` shows extra files touched → *"revert everything except `lib/encryption.ts` and `encryption.test.ts`. This prompt is surgical."*
- Polish UTF-8 round-trip fails → likely Buffer encoding bug. Ask Claude to verify `"utf8"` (not `"ascii"`).

⛔ **STOP. Confirm vitest shows 0 failures. Commit the new files locally only:**
```bash
cd /Users/manishshetty/Desktop/Apatris-Compliance-Hub
git add artifacts/api-server/src/lib/encryption.ts artifacts/api-server/src/encryption.test.ts
git commit -m "feat: encryption library (AES-256-GCM + HMAC-SHA256) + unit tests"
```
**Do NOT push yet. Do NOT paste Prompt 6.**

---

## Prompt 6 — Edit schema code for hash columns (30 min)

> ⚠️ **Code-only change.** Schema does NOT apply to any database in this prompt. Apatris applies schema via `init-db.ts` on app boot — the new columns take effect when Prompt 9 deploys to staging and Prompt 15 deploys to prod. This prompt only edits the code file.

**Paste this:**

> Modify `artifacts/api-server/src/lib/init-db.ts` to add 3 new nullable TEXT columns + 3 indexes for hash-column lookups. Match the existing `DO $$ BEGIN ... END $$` pattern used for idempotent column additions elsewhere in that file.
>
> ### Pre-flight C — verify `passport_number` exists in current workers schema
>
> Before editing, grep `artifacts/api-server/src/lib/init-db.ts` for `passport_number`. Confirm the column is defined somewhere: either in the `CREATE TABLE IF NOT EXISTS workers (...)` block near lines 40-70, or added via a later `ALTER TABLE workers ADD COLUMN passport_number` block.
>
> If `passport_number` is NOT present in `init-db.ts`, STOP and report. Ask the user to decide:
> - (a) add `passport_number TEXT` as a prerequisite ALTER in the same migration, then add `passport_hash`
> - (b) skip `passport_hash` this migration, reducing scope to 2 fields (pesel, iban)
> - (c) something else
>
> ### Pre-flight E — schema drift check against staging Neon
>
> Via Neon web console (or `psql` if `STAGING_DATABASE_URL` is set in shell env), run this read-only query — no writes, just verification:
>
> ```sql
> SELECT column_name, data_type
>   FROM information_schema.columns
>  WHERE table_name='workers'
>    AND column_name IN ('pesel','iban','passport_number');
> ```
>
> Expected result: 3 rows, all with `data_type = 'text'`.
>
> If any column is missing, or `data_type` is `character varying` / `varchar` instead of `text`, STOP and report. Type mismatch means init-db.ts has drifted from what's live on staging; reconcile the drift before adding hash columns.
>
> ### Edit
>
> Once both pre-flights pass, add this block to `artifacts/api-server/src/lib/init-db.ts`. Place it **after** the workers `CREATE TABLE` and **after** any existing worker-column ALTER blocks (search for existing `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='workers'` — insert right after the last such block):
>
> ```ts
> await execute(`
>   DO $$ BEGIN
>     IF NOT EXISTS (SELECT 1 FROM information_schema.columns
>                    WHERE table_name='workers' AND column_name='pesel_hash') THEN
>       ALTER TABLE workers ADD COLUMN pesel_hash TEXT;
>       CREATE INDEX IF NOT EXISTS idx_workers_pesel_hash ON workers(pesel_hash);
>     END IF;
>   END $$;
> `);
>
> await execute(`
>   DO $$ BEGIN
>     IF NOT EXISTS (SELECT 1 FROM information_schema.columns
>                    WHERE table_name='workers' AND column_name='iban_hash') THEN
>       ALTER TABLE workers ADD COLUMN iban_hash TEXT;
>       CREATE INDEX IF NOT EXISTS idx_workers_iban_hash ON workers(iban_hash);
>     END IF;
>   END $$;
> `);
>
> await execute(`
>   DO $$ BEGIN
>     IF NOT EXISTS (SELECT 1 FROM information_schema.columns
>                    WHERE table_name='workers' AND column_name='passport_hash') THEN
>       ALTER TABLE workers ADD COLUMN passport_hash TEXT;
>       CREATE INDEX IF NOT EXISTS idx_workers_passport_hash ON workers(passport_hash);
>     END IF;
>   END $$;
> `);
> ```
>
> Each `DO $$` block is idempotent — safe to run multiple times and safe to race with a concurrent machine boot (Fly's 2-machine cold start). No transaction wrap (matches existing init-db.ts pattern).
>
> ### Checks (per execution-loop discipline)
>
> 1. **BUILD:** `cd artifacts/api-server && npx tsx ./build.ts` — must be clean
> 2. **TEST:** `cd artifacts/api-server && npx vitest run` — expect 330 pass (same as after Prompt 5; this is schema-code-only, no logic change)
> 3. **Diff:** `git diff artifacts/api-server/src/lib/init-db.ts` — should show ~21 new lines (3 `DO $$` blocks × ~7 lines each), ZERO other changes
> 4. **Files touched:** `git status --short` — only `init-db.ts` as `M`, plus the usual 3 leave-alone items
>
> Report:
> - Pre-flight C result: passport_number column present? (yes/no, cite file:line where found)
> - Pre-flight E result: 3 Neon columns confirmed as `text`? (yes/no, paste query result rows)
> - Diff size (lines added)
> - Build status
> - Test counts before → after
> - `git status --short` output
>
> ### Hard boundaries
>
> - Do NOT modify any file other than `artifacts/api-server/src/lib/init-db.ts`
> - Do NOT use `DROP COLUMN`, `ALTER COLUMN`, `TRUNCATE`, or any destructive DDL anywhere
> - Do NOT run the migration against any live database — no `pnpm db push`, no `psql` writes, no Neon console SQL beyond the read-only pre-flight query
> - Do NOT deploy — schema application is Prompt 9's job
> - If either pre-flight fails, STOP and ask before proceeding
>
> Then commit locally (no push): `git commit -m "feat: add pesel_hash/iban_hash/passport_hash columns + indexes to workers schema"`

**Time:** 30 min (~5 min pre-flights + ~5 min edit + ~10 min build/test + ~10 min review)

**Success looks like:**
- Pre-flight C: `passport_number` confirmed present in init-db.ts
- Pre-flight E: all 3 target columns on staging Neon confirmed as `text`
- `init-db.ts` has 3 new `DO $$ BEGIN ... END $$` blocks, ~21 lines added
- `npx tsx ./build.ts` clean
- `npx vitest run` shows 330 passing
- `git status` shows only `init-db.ts` modified + usual 3 leave-alone items
- 1 local commit, not pushed

**If it fails:**
- Pre-flight C: `passport_number` not in init-db.ts → STOP. Ask user: (a) prerequisite add, (b) skip passport_hash, (c) custom plan.
- Pre-flight E: Neon column missing or wrong type → STOP. Staging drifted from code — reconcile before continuing.
- Build fails: paste error. Usually a heredoc/backtick syntax issue — Claude fixes.
- Test fails: almost certainly unrelated (this prompt is schema-code only). Paste failure.
- `git status` shows extra files → *"revert everything except init-db.ts. This prompt is surgical."*
- Claude used `DROP` / `ALTER COLUMN` / `TRUNCATE` → STOP. `git reset --hard HEAD~1`, retry from Pre-flight C.
- Claude ran the migration against any live DB → check `fly logs --app apatris-api-staging` + Neon console. If columns exist and look healthy, the migration is idempotent so continue — but flag the deviation. If errors, diagnose before continuing.

⛔ **STOP. Do not push. Do not paste Prompt 7.**

---

## Prompt 7 — Wrap all write paths (1.5-2 hours)

> ⚠️ **Writes only.** No read-path changes, no role masking, no audit-log sanitizer. Those come in Prompt 8.
>
> **Scope (Blocker 2 locked 2026-04-18):** wrap writes of `workers.pesel`, `workers.iban`, `workers.passport_number`, plus denormalized copies (`power_of_attorney.pesel`, `trc_cases.passport_number`, `poa_registry.worker_passport_number`). Populate companion `_hash` columns on workers.
>
> **NOT in scope:** `workers.nip`, `clients.nip`, `crm_companies.nip`, hardcoded Apatris company NIPs. All stay plaintext.
>
> **Two-phase execution:** Step 1 (enumeration) must complete and be APPROVED before Step 2 (apply wraps) begins.

**Paste this:**

> ### Step 1 — Exhaustive write-site enumeration (BEFORE editing)
>
> Run these greps from repo root. Capture all results:
>
> ```bash
> # Raw SQL writes to relevant tables
> grep -rn "INSERT INTO workers\|UPDATE workers SET\|UPDATE workers " artifacts/api-server/src/ --include=*.ts
> grep -rn "INSERT INTO power_of_attorney\|UPDATE power_of_attorney" artifacts/api-server/src/ --include=*.ts
> grep -rn "INSERT INTO trc_cases\|UPDATE trc_cases" artifacts/api-server/src/ --include=*.ts
> grep -rn "INSERT INTO poa_registry\|UPDATE poa_registry" artifacts/api-server/src/ --include=*.ts
>
> # Field-level assignments (object-literal writes + individual field sets)
> grep -rn "\.pesel\b\|\.iban\b\|\.passport_number\b\|passportNumber" artifacts/api-server/src/ --include=*.ts | grep -v test
>
> # Drizzle ORM — narrow
> grep -rn "\.insert(workers\|\.update(workers" artifacts/api-server/src/ --include=*.ts
>
> # Drizzle ORM — broad (EXTENSION 1: catches syntax variations)
> grep -rn "\.insert\|\.update" artifacts/api-server/src/ --include=*.ts | grep -iE "workers|power_of_attorney|trc_cases|poa_registry"
>
> # CSV / bulk imports
> grep -rln "csv\|bulk.*import\|workers.*import" artifacts/api-server/src/routes/ --include=*.ts
>
> # Document intake / OCR flows (EXTENSION 2)
> grep -rn "document.intake\|documentIntake\|extractedPesel\|extractedPassport" artifacts/api-server/src/ --include=*.ts
> ```
>
> Compile the enumeration table:
>
> | Category | File | Line | Field | Op (INSERT/UPDATE/Drizzle) | Via workers-db? | Wrap action |
> |---|---|---|---|---|---|---|
>
> Categories:
> - `Service (workers-db.ts)` — main choke point
> - `Route (direct SQL)` — routes bypassing workers-db
> - `Route (document intake)` — OCR/AI extraction flows
> - `Service (document intake)` — services processing extracted PII
> - `Seed/bootstrap` — seed files + init-db hardcoded inserts
> - `Other` — anything that doesn't fit above
>
> ### Additional Step 1 checks
>
> **EXTENSION 3 — Self-service PII editing:** Read `artifacts/api-server/src/routes/self-service.ts` explicitly. Answer each:
> - Does it allow PATCH/PUT on `pesel`? (yes/no — cite line)
> - Does it allow edit on `iban`? (already known from inventory — re-verify)
> - Does it allow edit on `passport_number`? (yes/no — cite line)
>
> Document each answer in the enumeration table. For fields NOT allowed in self-service, add an explicit "N/A — not editable via self-service" row with reason.
>
> **EXTENSION 4 — TRC auto-update cascade:** Read `artifacts/api-server/src/routes/trc-service.ts`. Determine:
> - When a new TRC is issued, does the endpoint ALSO update `workers.passport_number` (not just INSERT INTO trc_cases)?
> - If yes, that cascade path needs wrapping too.
>
> Document the finding as a distinct row in the enumeration table.
>
> ### Present the enumeration table and STOP
>
> Do NOT start Step 2 until user explicitly approves the enumeration. If table surfaces rows not anticipated in PII-ENCRYPTION-PLAN.md §4, user may want to investigate before proceeding.
>
> ### Step 2 — Apply wraps (ONLY after user approval of Step 1 table)
>
> For each write site:
> - Replace plaintext writes of `pesel`/`iban`/`passport_number` with **`encryptIfPresent(value)`** (NOT bare `encrypt()`). Handles null, empty, and already-encrypted input safely.
> - In the SAME write, populate the companion `_hash` column via `lookupHash(value)` — only when value is non-null/non-empty.
> - For duplicate-check queries currently using `WHERE pesel = $1` (or iban/passport): migrate to `WHERE pesel_hash = lookupHash($candidate)`.
> - **Preserve validation order:** if workers-db has a format check (11-digit PESEL, checksum), run on plaintext BEFORE encrypting.
> - **Skip `nip` entirely.** Do not wrap, hash, or touch duplicate-NIP check logic.
>
> ### Step 3 — Unit + integration tests (new file `artifacts/api-server/src/write-paths-encryption.test.ts`)
>
> Minimum 11 tests:
> 1. `createWorker` writes encrypted pesel + populated pesel_hash
> 2. `createWorker` writes encrypted iban + populated iban_hash
> 3. `createWorker` writes encrypted passport_number + populated passport_hash
> 4. `createWorker` leaves `nip` plaintext (scope enforcement)
> 5. `updateWorker` re-encrypts on update, re-computes hash
> 6. `createWorker` with null pesel → writes null (both pesel and pesel_hash null)
> 7. `createWorker` with already-encrypted pesel → passes through (no double-encrypt)
> 8. Duplicate-PESEL check on create → second call fails via hash lookup
> 9. Duplicate-PESEL check on update → conflict detected via hash lookup
> 10. **Integration:** write → read roundtrip — `decrypt(stored.pesel) === original`, `pesel_hash` is 64 hex chars
> 11. **EXTENSION 5:** `updateWorker({someOtherField: "x"})` with NO pesel/iban/passport keys in input → existing encrypted values AND their `_hash` columns remain UNCHANGED. Prevents accidental null-out from undefined-vs-null confusion in partial updates.
>
> ### Step 4 — Build + test gates
>
> 1. `cd artifacts/api-server && npx tsx ./build.ts` — clean
> 2. `npx vitest run` — all 330 prior tests pass + 11 new = **≥341** total
> 3. `git status` — shows modified write-site files + new test file; no read-path or masking code touched
>
> ### Step 5 — Report
>
> - Enumeration table from Step 1 (repeat here as final record)
> - Files changed with line counts
> - Each write site + wrapping applied
> - New tests (11 numbered titles)
> - Build status
> - Test counts before → after
> - `git status` output
>
> ### Hard boundaries
>
> - Wrap ONLY pesel, iban, passport_number. NOT nip.
> - No read-path wrapping — Prompt 8.
> - No role masking — Prompt 8.
> - No audit-log sanitizer — Prompt 8.
> - No per-write audit entries (existing CREATE/UPDATE events are sufficient — confirmed 2026-04-18).
> - No legacy-data touch — backfill is Prompt 10.
> - No deploy. No push.
>
> Commit locally: `git commit -m "feat: wrap all write paths for pesel/iban/passport_number with encryptIfPresent + lookupHash"`

**Time:** 1.5-2 hours (~30m enum + approval wait + ~45m edits + ~30m tests + ~15m commit/verify)

**Success looks like:**
- Enumeration table approved before edits begin
- 10-15 files modified
- 330 prior tests still pass + 11 new = ≥341
- 1 local commit, not pushed

**If it fails:**
- Enumeration bigger than PII-ENCRYPTION-PLAN §4: accept, update the plan — don't skip sites.
- Enumeration smaller: expand grep, likely missed a site.
- Prior test fails after edits: paste full trace. Common cause: duplicate-check WHERE clause still uses plaintext.
- `nip` accidentally wrapped: revert that change only. NIP is out of scope.
- CSV/bulk import path found outside §4: flag and wait for user decision before wrapping.
- Test #11 fails (partial update nulls encrypted field): check the update helper — undefined should skip the column, not set it to null. Fix by explicitly excluding undefined-valued fields from the UPDATE SET clause.
- Validation order wrong (format check on encrypted value): fix by validating plaintext BEFORE encrypting.

⛔ **STOP. Do not push. Do not paste Prompt 8.**

---

## Prompt 8 — Wrap all read paths + role masking + Compliance Card exception + audit sanitizer (2-3 hours)

> ⚠️ **Reads + masking + audit only.** No write-path changes (Prompt 7 territory). No backfill (Prompt 10). No deploy (Prompt 9).
>
> **Scope (Blocker 2 enforced):** decrypt + mask `pesel`, `iban`, `passport_number` only. `workers.nip` stays plaintext at rest — no decrypt() calls needed.
>
> **Locked decisions (Apr 18 PM):**
> - **PC-1:** Create `/workers/me` endpoint in this prompt with Compliance Card exception baked in
> - **PC-3:** Conservative audit sanitizer — PESEL + IBAN patterns only, skip passport (false-positive risk)
> - **AI prompt PII:** Deferred per §11.4 — do NOT touch `services/legal-intelligence.service.ts`
>
> **Two-phase execution:** Phase 1 (enumeration + supplementary checks) MUST be approved before Phase 2 (apply).

**Paste this:**

> ### Phase 1 — Exhaustive read-site enumeration (30-45 min)
>
> Run from repo root:
>
> ```bash
> # Direct PII column reads in SELECT queries
> grep -rn "SELECT.*\(pesel\|iban\|passport_number\)" artifacts/api-server/src/ --include=*.ts
>
> # Field-level reads after fetch
> grep -rn "\.pesel\b\|\.iban\b\|\.passport_number\b\|passportNumber" artifacts/api-server/src/ --include=*.ts | grep -v "test\.ts" | grep -v "lib/encryption"
>
> # GROUP BY / DISTINCT on PII (must migrate to hash column)
> grep -rn "GROUP BY.*\(pesel\|iban\|passport_number\)\|DISTINCT.*\(pesel\|iban\|passport_number\)" artifacts/api-server/src/ --include=*.ts
>
> # WHERE PII = $ on read paths (already migrated in workers-db; check for stragglers)
> grep -rn "WHERE.*\(pesel\|iban\|passport_number\)\s*=" artifacts/api-server/src/ --include=*.ts | grep -v "workers-db.ts\|_hash"
>
> # JOIN queries projecting PII
> grep -rn "JOIN.*workers\|FROM workers.*JOIN" artifacts/api-server/src/ --include=*.ts | head -30
>
> # Render paths (CSV / PDF / XML / email)
> grep -rln "PDFKit\|jsPDF\|new PDFDocument\|<PESEL>\|sendMail\|nodemailer" artifacts/api-server/src/ --include=*.ts
>
> # Audit log call sites (sanitizer applied centrally)
> grep -rn "appendAuditLog\b" artifacts/api-server/src/ --include=*.ts | head -30
>
> # ── Addition 1: Routes returning worker data via res.json (explicit role-middleware audit) ──
> grep -rn "res\.json.*worker\|res\.json.*\.pesel\|res\.json.*\.iban\|res\.json.*\.passport" artifacts/api-server/src/routes/ --include=*.ts
> grep -rn "fetchWorkerById\|fetchAllWorkers" artifacts/api-server/src/routes/ --include=*.ts
> ```
>
> Compile enumeration table:
>
> | Category | File | Line | What it reads | Render type | Role middleware (Y/N + which) | Wrap action |
> |---|---|---|---|---|---|---|
>
> Categories:
> - `Service (workers-db.ts)` — central decrypt choke point
> - `Route (HTTP JSON)` — needs `maskForRole(value, req.user.role)`
> - `Route (export render: CSV/PDF/XML/email)` — admin-only paths, decrypt at render
> - `Service (worker matching)` — hash-column lookup or decrypt-and-compare
> - `Service (AI prompt builder)` — DEFERRED per §11.4 (document, do NOT change)
> - `Audit log` — central sanitizer in `lib/audit-log.ts`, no per-site changes
>
> **Addition 1 — Per-route JSON projection enumeration:**
> For every "Route (HTTP JSON)" row, document explicitly: file:line of `res.json(...)`, which PII fields appear in projection, currently has role middleware (Y/N + which: `requireRole("Admin", "Executive")` / `requireAuth` only / etc.), what role gates the route today.
>
> **Addition 2 — Step D export-route role-gating audit:**
> For each export render site (zus.ts, compliance-enforcement.ts, payroll.ts, contracts.ts, contract-gen.ts, public-verify.ts, mos-package.service.ts, legal-status.service.ts, case-doc-generator.service.ts, authority-response.service.ts, rejection-intelligence.service.ts, data-copilot.service.ts), verify the route has explicit role middleware BEFORE assuming export = admin-only. Any route missing role gating → flag as separate concern (NOT a Prompt 8 fix; surface as follow-up).
>
> #### Phase 1 supplementary checks
>
> **PC-1 — `/workers/me` endpoint resolution:**
> ```bash
> grep -rn "router\.\(get\|post\).*[\"']/workers/me\|router\.\(get\|post\).*[\"']/me" artifacts/api-server/src/routes/ --include=*.ts
> ```
> **Locked: option (a)** — create `/workers/me` in this prompt with Compliance Card exception. Verify endpoint truly doesn't exist.
>
> **PC-2 — Hash-migration sites flagged from Prompt 7:**
> - `services/document-intake.service.ts:359-368` — in-memory `worker.pesel === extracted.pesel` (post-Prompt 7, `worker.pesel` is ciphertext — needs `decrypt(worker.pesel) === extracted.pesel`)
> - `services/document-intake.service.ts:509-515` — same pattern for contradictions
> - `services/smart-document.service.ts:163-166` — verify SQL `WHERE` pattern; if so, swap to `WHERE pesel_hash = $1` with `lookupHash(plaintext)`
>
> Verify each, document in enumeration table.
>
> **PC-3 — Audit log sanitizer regex (LOCKED: conservative):**
> - PESEL: `\b\d{11}\b`
> - IBAN PL: `\bPL\s?\d{2,4}(\s?\d{4}){5,6}\b`
> - **NO passport pattern** (skipped per locked decision PC-3 — false-positive risk)
>
> Accepted trade-off: conservative regex over-redacts some legitimate 11-digit numbers (invoice numbers, case numbers). Acceptable in audit-log notes context. Test #15c documents this explicitly.
>
> #### Present enumeration table + Addition 1 audit + Addition 2 audit + PC-1/PC-2/PC-3 findings, then STOP
>
> Wait for user approval before Phase 2.
>
> ### Phase 2 — Apply changes (ONLY after approval)
>
> **Step A — Central decrypt in `workers-db.ts`:**
> Modify `fetchAllWorkers()` and `fetchWorkerById()`. Decrypt `pesel`, `iban`, `passport_number` before returning. Do NOT decrypt `nip` (Blocker 2). Legacy plaintext passes through via `decrypt()`'s passthrough (verified Prompt 5).
>
> **Step B — Role masking at HTTP boundary:**
> For every route enumerated in Addition 1, apply `maskForRole(value, req.user.role)` to pesel/iban/passport_number before `res.json(...)`. Pattern:
> ```ts
> import { maskForRole, type Tier } from "../lib/encryption.js";
> // ...
> res.json({
>   ...worker,
>   pesel: maskForRole(worker.pesel, req.user.role as Tier),
>   iban: maskForRole(worker.iban, req.user.role as Tier),
>   passport_number: maskForRole(worker.passport_number, req.user.role as Tier),
> });
> ```
>
> **Step C — Compliance Card plaintext exception (`/workers/me`):**
> Create `GET /workers/me` endpoint. Behavior:
> 1. `requireAuth` middleware
> 2. Resolve worker by `req.user.email` from JWT
> 3. Check `req.query.purpose === "compliance_card"` (hardcoded enum match)
> 4. Verify resolved `worker_id` matches authenticated `user_id` (own-record check)
> 5. If all 3 pass → return PII as plaintext (use `decrypt()`, NOT `maskForRole()`)
> 6. Append immutable audit entry via `appendAuditLog`:
>    - `event: "plaintext_pii_viewed"`
>    - `actor: req.user.email`
>    - `worker_id: <resolved>`
>    - `note: "purpose=compliance_card"`
>    - timestamp + IP captured by audit-log helper
> 7. **(Addition 5):** If `req.query.purpose` is non-null but NOT exactly `"compliance_card"`, emit `console.warn("[workers/me] unexpected purpose value:", purposeValue, "request:", req.method, req.path)`. Then fall back to masked response. Do NOT throw.
> 8. If `req.query.purpose` missing/falsy: silent fall back to masked response (no warning, no audit — default code path)
>
> **Step D — Export render paths (admin-only, decrypt at render):**
> Per Addition 2 audit. For each export site, call `decrypt(value)` before stringifying into CSV/PDF/XML/email body:
> - `routes/zus.ts:79, 172` — ZUS XML
> - `routes/compliance-enforcement.ts:55, 70, 120, 196-220` — PIP inspection PDF
> - `routes/payroll.ts:283, 363` — payroll CSV
> - `routes/contracts.ts:264, 335`, `routes/contract-gen.ts:37, 61` — contract PDF
> - `routes/public-verify.ts:53, 83` — already masks last-4; just decrypt before mask
> - `services/mos-package.service.ts:75-76, 119-120, 147` — MOS package
> - `services/legal-status.service.ts:633, 648, 669` — legal status snapshot
> - `services/case-doc-generator.service.ts:136, 189, 190, 248, 249` — case docs
> - `services/authority-response.service.ts:153, 154, 283, 284` — authority response
> - `services/rejection-intelligence.service.ts:541` — rejection analysis
> - `services/data-copilot.service.ts:129` — data copilot
> - **NOT** `services/legal-intelligence.service.ts` — DEFERRED per §11.4
>
> **Step E — Hash-column migrations + decrypt-and-compare:**
> - `services/document-intake.service.ts:359-368` → `decrypt(w.pesel) === identity.pesel`
> - `services/document-intake.service.ts:509-515` → same pattern
> - `services/smart-document.service.ts:163-166` → SQL hash swap or decrypt-and-compare per Phase 1 finding
> - `routes/fraud.ts:33` → `GROUP BY pesel_hash`
> - `routes/fraud.ts:47` → `GROUP BY iban_hash`
>
> **Step F — Audit sanitizer in `lib/audit-log.ts`:**
> Wrap `appendAuditLog()` to scrub `note` field BEFORE persisting. Apply PC-3 patterns (PESEL + IBAN only, NO passport).
>
> **Step G — Tests** (new file `artifacts/api-server/src/read-paths-encryption.test.ts`):
> Minimum 18 tests:
> 1. `fetchWorkerById` decrypts pesel before returning
> 2. `fetchWorkerById` passes legacy plaintext through unchanged
> 3. `fetchAllWorkers` decrypts all rows
> 4. `fetchWorkerById` does NOT decrypt nip (Blocker 2)
> 5. T1 user → maskForRole returns plaintext pesel
> 6. T2 user → plaintext
> 7. T3 user → `***-****-<last4>`
> 8. T4 user → masked
> 9. T5 user → masked DEFAULT (no flag)
> 10. T5 user with `?purpose=compliance_card` on own record → plaintext
> 11. T5 user with `?purpose=compliance_card` on someone else's record → masked (own-record check)
> 12. T5 user with `?purpose=invalid_value` → masked + `console.warn` called (Addition 5)
> 13. Compliance Card plaintext access writes audit entry: event=`plaintext_pii_viewed`, actor, worker_id, purpose
> 14. fraud.ts duplicate detection uses `GROUP BY pesel_hash`, returns same cluster count as before
> 15. Audit sanitizer (4 sub-tests per Addition 3):
>    - 15a: PESEL pattern in note → redacted to `[encrypted]`
>    - 15b: IBAN pattern in note → redacted to `[encrypted]`
>    - 15c: Random 11-digit invoice number `12345678901` → ALSO redacted (over-redaction acceptable)
>    - 15d: Plain text without PII patterns → unchanged
> 16. **Integration:** T5 user fetches `/workers/:id` → response has masked pesel
> 17. **Integration:** T5 user fetches `/workers/me?purpose=compliance_card` with own JWT → plaintext pesel + audit log entry created
> 18. **Integration:** T5 user fetches `/workers/me?purpose=compliance_card` with someone else's worker_id (attempted) → masked pesel (own-record check enforced) + NO audit log entry
>
> **Step H — Build + test gates:**
> 1. `npx tsx ./build.ts` — clean
> 2. `npx tsc --noEmit` — 159 baseline (zero new errors)
> 3. `npx vitest run` — **358 prior + 18 new = 376 passing minimum**, zero regressions
>
> #### Hard boundaries
> - Decrypt + mask ONLY pesel, iban, passport_number. NOT nip.
> - No write-path changes (Prompt 7 territory).
> - No backfill (Prompt 10).
> - No deploy (Prompt 9).
> - Masking at HTTP boundary only — DB returns ciphertext, service decrypts, route layer masks per role
> - Compliance Card plaintext gated by ALL 3 conditions: flag + own-record + audit
> - AI prompt PII deferred per §11.4 — do NOT modify `legal-intelligence.service.ts`
> - Sanitizer is conservative (PESEL + IBAN only); over-redaction acceptable (Test 15c documents this)
>
> Commit locally: `git commit -m "feat: wrap all read paths with decrypt + role masking + Compliance Card exception + /workers/me + audit sanitizer + 18 tests"`

**Time:** Phase 1 ~30-45 min; Phase 2 ~2-2.5 hours

**Success looks like:**
- Phase 1 enumeration approved + Add1/Add2/PC-1/PC-2/PC-3 audits done
- ~20 files modified + 1 new test file (+ 1 new endpoint or modified route)
- 358 prior + 18 new = 376 tests pass, zero regressions
- 1 local commit, not pushed

**If it fails:**
- Enumeration bigger than PII-ENCRYPTION-PLAN §5: accept, update plan
- Role masking test fails: T5 default vs Compliance Card exception confusion — re-read plan §5
- `/workers/me` endpoint creation expands beyond plan: reduce scope; defer parts to follow-up
- Audit sanitizer over-redacts unexpected text: that's expected; Test 15c documents the trade-off
- AI prompt builders read PII for Claude — DEFERRED per §11.4. Do not change.

⛔ **STOP. Do not push. Do not paste Prompt 9.**

---

## Prompt 9 — Deploy to staging + verify (Phase 1: pre-flight, Phase 2: deploy + verify) (45-60 min)

> ⚠️ **Staging only.** DO NOT touch `apatris-api` (prod). DO NOT modify source. DO NOT run backfill (Prompt 11).
> **Deploys current `origin/main` (commit `1220603`).**
> **Two-phase execution.** Phase 1 (pre-flight) MUST be approved before Phase 2 (deploy + verify).
>
> **Locked decisions (Apr 18 PM):**
> - **Decision 1:** Skip live T5 Compliance Card login test in Step 8 — rely on Test 17 (structural). Document skip with rationale.
> - **Decision 2:** Test PII values determined by PF-7 validation strictness check.
> - **Decision 3:** PF-3 (prod-clean) is the source of truth — neither operator nor Claude remembers if prod was touched.

**Paste this:**

> ### Phase 1 — Pre-flight checks (15-20 min)
>
> **PF-1: Staging Fly secrets — encryption keys present**
> ```bash
> fly secrets list --app apatris-api-staging | grep -E 'APATRIS_(ENCRYPTION|LOOKUP)_KEY'
> ```
> Expected: 2 lines, both `Staged` (will be applied during Phase 2 Step 1 deploy). If both are already `Deployed`, that means a deploy happened since yesterday — investigate before proceeding.
> Missing → Prompt 4 didn't run. STOP.
>
> **PF-2: Staging `NEON_DATABASE_URL` digest matches staging branch (NOT prod)**
> ```bash
> fly secrets list --app apatris-api-staging | grep NEON_DATABASE_URL
> ```
> Expected digest: **`30e15609a4d46e09`** (staging branch `br-dry-dust-ag6a0c2s`).
> If digest is `59e5061e76027e27` → that's PROD! STOP.
>
> **PF-3: Prod Fly app has NO encryption secrets (defense-in-depth, source of truth per Decision 3)**
> ```bash
> fly secrets list --app apatris-api | grep -E 'APATRIS_(ENCRYPTION|LOOKUP)_KEY'
> ```
> Expected: **empty output**. If keys appear on prod → leak. STOP and report.
>
> **PF-4: Dockerfile builds from source**
> ```bash
> grep -E "tsx build|esbuild|RUN.*build" Dockerfile
> ```
> Expected: a `RUN` step that builds the bundle from source. Stale committed `dist/index.cjs` is intentionally ignored.
>
> **PF-5: init-db.ts hash columns are race-safe**
> ```bash
> grep -B 1 -A 6 "column_name='pesel_hash'" artifacts/api-server/src/lib/init-db.ts
> ```
> Expected: each ALTER TABLE ADD COLUMN wrapped in `DO $$ BEGIN IF NOT EXISTS (...) THEN ... END IF; END $$`.
>
> **PF-6: Local main matches origin/main (deploying what was reviewed)**
> ```bash
> git rev-parse HEAD origin/main
> ```
> Expected: both = `1220603f9bb47a8c8674d3c09aa22bb2490673ae`.
>
> **PF-7: PESEL/IBAN validation strictness (per Decision 2 — determines test PII values for Step 6)**
> ```bash
> grep -nE "pesel.*length|pesel.*\\\\d|pesel.*regex|validatePesel|peselChecksum|peselValid" artifacts/api-server/src/lib/workers-db.ts artifacts/api-server/src/lib/validate.ts artifacts/api-server/src/lib/*.ts
> grep -nE "iban.*length|iban.*regex|validateIban|ibanChecksum|ibanValid|^.*PL\\\\d" artifacts/api-server/src/lib/workers-db.ts artifacts/api-server/src/lib/validate.ts
> ```
> Report findings:
> - **Loose (length-only or no validation):** use Claude defaults — PESEL `99999999991`, IBAN `PL00000000000000000000000001`, Passport `ENC9991`
> - **Strict (checksum logic present):** use checksum-valid alternatives — PESEL `44051401359`, IBAN `PL61109010140000071219812874`, Passport `EZ1234567`
>
> Propose final test values to user for approval before Phase 2.
>
> **PF-8: fly.staging.toml + Dockerfile compatible with `--remote-only` (per Adjustment 2)**
> ```bash
> cat fly.staging.toml
> grep -E "WORKDIR|COPY|RUN|FROM" Dockerfile | head -20
> ```
> Expected: Dockerfile is self-contained (no host-mounted volumes, no relative paths outside the build context). `fly.staging.toml` has no `[build] dockerfile = "..."` overrides that assume local context.
> Verify previous deploys used `--remote-only` consistently:
> ```bash
> fly releases --app apatris-api-staging | head -10
> ```
> Look at recent build patterns. If past deploys were local-only, switching to `--remote-only` may surface differences. Report.
>
> #### Present Phase 1 results table + PF-7 test values proposal, then STOP
>
> Wait for user approval before Phase 2 deploy.
>
> ### Phase 2 — Deploy + verify (25-40 min)
>
> **Step 1: Deploy**
> ```bash
> fly deploy --remote-only --config fly.staging.toml -a apatris-api-staging
> ```
> Watch for: build succeeded, machines updating, "in a good state", DNS verified.
>
> **Step 2: Machine status**
> ```bash
> fly status --app apatris-api-staging
> ```
> Expected: 2 machines `started`. Crashed/unhealthy → `fly logs --no-tail` to investigate.
>
> **Step 3: Health check**
> ```bash
> curl -s -w "\nHTTP: %{http_code}\n" https://apatris-api-staging.fly.dev/api/healthz
> ```
> Expected: `{"status":"ok",...}` + HTTP 200. 500 → fail-loud key error → check logs → rollback.
>
> **Step 4: Boot logs sanity**
> ```bash
> fly logs --app apatris-api-staging --no-tail | tail -60
> ```
> Look for: ✅ no `APATRIS_ENCRYPTION_KEY is required`, ✅ no `DO $$` errors, ✅ "listening on port 8080". Some `decrypt failed` warnings on legacy plaintext are tolerable (passthrough).
>
> **Step 5: Schema migration verified on staging Neon**
> Via Neon console (staging branch `br-dry-dust-ag6a0c2s`):
> ```sql
> SELECT column_name FROM information_schema.columns
>  WHERE table_name='workers' AND column_name LIKE '%_hash'
>  ORDER BY column_name;
> ```
> Expected: 3 rows — `iban_hash`, `passport_hash`, `pesel_hash`.
>
> **Step 6: Controlled write test — encryption active**
> Use the test PII values determined in PF-7. Create test worker via dashboard:
> - Name: `Test Encrypt 20260418`
> - PESEL: `<from PF-7>`
> - IBAN: `<from PF-7>`
> - Passport: `<from PF-7>`
>
> Verify in Neon staging:
> ```sql
> SELECT id, full_name, pesel, pesel_hash, iban, iban_hash, passport_number, passport_hash
>  FROM workers WHERE full_name = 'Test Encrypt 20260418';
> ```
> Expected: pesel/iban/passport_number ALL start with `enc:v1:`; all 3 hash columns are 64-char hex.
>
> **Step 7: Controlled read test — decryption + masking active**
> Re-fetch via dashboard as admin (T1/T2): PESEL displayed in plaintext.
> As T3+ user (or via API with non-admin session): PESEL displayed as `***-****-<last4>`.
>
> **Step 8: Compliance Card endpoint — SKIP per Decision 1**
> Document in final report: *"T5 test account password lost; structural test from Prompt 8 (Test 17, Test 18 / #11b) covers code path; live re-verification deferred to post-deploy follow-up."*
>
> Optional alternative if curl + manually-crafted JWT is feasible (Adjustment 4): test the endpoint with a generated JWT and inspect response + audit log entry. If non-trivial, accept skip.
>
> **Step 9: Sanity — legacy plaintext rows still readable**
> Pick an existing worker (one of the 31 cloned from prod) via dashboard. Detail view should render without errors (decrypt passthrough).
>
> **Step 10: Cleanup test worker**
> Delete the worker from Step 6 via dashboard. Confirm gone.
>
> **Step 11: Prod is UNCHANGED (defense-in-depth)**
> ```bash
> fly releases --app apatris-api | head -3
> ```
> Expected: prod release version unchanged (still v288). If advanced → operator error → investigate.
>
> ### Rollback plan
> ```bash
> fly releases rollback --app apatris-api-staging
> ```
> Reverts staging to previous release. Safe — no data touched.
>
> ### Hard boundaries
> - Staging only. NEVER `--app apatris-api`.
> - No source modifications during this prompt.
> - No backfill (Prompt 11).
> - Test worker MUST be deleted after Step 6.
> - Rollback rather than retry on unexplained failures.
>
> ### Final report
> - Deploy version (expected v5+ on staging)
> - All 11 verification steps with pass/fail
> - Prod version (must be unchanged)
> - Step 8 documented skip with rationale

**Time:** Phase 1 ~15-20 min; Phase 2 ~25-40 min

**Success:** Phase 1 all 8 pass + deploy completes + all 10 active verifications green (Step 8 documented skip) + prod unchanged + test worker deleted.

**If it fails:** rollback first, diagnose second. Specific failure modes documented per step.

⛔ **STOP. Do not push. Do not paste Prompt 10.**

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
