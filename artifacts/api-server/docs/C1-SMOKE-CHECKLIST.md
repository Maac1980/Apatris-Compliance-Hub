# Sub-phase C1 — Staging Smoke Checklist

**Target:** staging v25 (the first deploy containing C1 — document storage + download endpoint).
**Scope:** verify the 6 scenarios originally planned as automated route tests.
Route-level testing infrastructure doesn't exist in this codebase (deliberate
pattern), so these are executed manually. Introducing `supertest` as a repo-wide
convention is a separate sub-phase — logged, not blocking.

**Principle reminder:** lawyers' case memory is a weak limb; Apatris strengthens
it by remembering the source file. C1 is the first brick in that wall.

---

## Preflight (before running any scenarios)

- [ ] Staging is on v25 (or later). `fly releases --app apatris-api-staging | head -3`
- [ ] Staging `/api/healthz` returns 200
- [ ] Grab a valid bearer token from your staging browser session (devtools → Application → Cookies → `apatris_jwt`)
- [ ] Have `/tmp/mithilesh.pdf` (or any valid PDF) available locally

Export for curl convenience:
```bash
export STAGING_JWT="<paste-from-cookie>"
export STAGING_URL="https://apatris-api-staging.fly.dev"
```

---

## 1. HAPPY PATH — upload, extract, verify storage + response shape — **BLOCKER**

**Why this matters:** if this fails, the whole sub-phase is broken. Upload path is the primary write path.

```bash
curl -s -F "file=@/tmp/mithilesh.pdf" \
  -H "Authorization: Bearer $STAGING_JWT" \
  "$STAGING_URL/api/v1/document-intelligence/extract" | jq '{
    intake_id, file_key, file_storage_error,
    overall_confidence, document_type,
    classification
  }'
```

Expected response shape:
```json
{
  "intake_id": "<uuid>",
  "file_key": "<tenant-id>/document-intake/<timestamp>_<hash>_<filename>",
  "overall_confidence": 0.9,           // approximate
  "document_type": "WORK_PERMIT",
  "classification": "WORK_PERMIT"
}
```

- [ ] Response HTTP status 200
- [ ] `file_key` is a non-null string containing `"document-intake/"`
- [ ] `file_storage_error` is **absent** from the JSON (not `null` — conditional spread omits it)
- [ ] Response also includes: `extracted_fields`, `missing_fields`, `typeSpecific`, `typeScopedConfidence`, `keyContent`
- [ ] Save the returned `intake_id` for scenarios 3–6

---

## 2. STORAGE FAILURE (FAIL-OPEN) — **OPTIONAL, DO NOT RUN ON STAGING**

Simulating this requires breaking staging's S3 credentials, which affects every
other upload during the test window. Not recommended.

**Alternative verification (passive):** watch Fly logs for `[docintel-storage] Persist failed` over the next 7 days. If S3 has a hiccup in the wild, the log entry surfaces the fail-open path working correctly:

```bash
fly logs --app apatris-api-staging | grep "docintel-storage"
```

- [ ] Noted that storage-fail path is passively observed via logs, not actively simulated

If an actual storage failure occurs during the 7-day window, confirm:
- [ ] Intake row was still created (lawyer did not lose extraction)
- [ ] `file_storage_error` was populated with a structured label (`s3_error:503` / `storage_blocked` / `network_error` / `unknown:...`)
- [ ] Log entry contains the real `intake_id` (not `pending-insert` or similar sentinel)

---

## 3. DOWNLOAD HAPPY PATH — file retrieval with proper headers — **BLOCKER**

Using the `intake_id` from scenario 1:

```bash
curl -sv -o /tmp/downloaded.pdf \
  -H "Authorization: Bearer $STAGING_JWT" \
  "$STAGING_URL/api/v1/document-intelligence/<intake_id>/file" 2>&1 | \
  grep -E "^< (HTTP|Content-Type|Content-Disposition)"
```

Expected curl output (the `<` lines are response headers):
```
< HTTP/2 200
< content-type: application/pdf
< content-disposition: inline; filename="..."; filename*=UTF-8''...
```

- [ ] HTTP 200
- [ ] `Content-Type: application/pdf` (matches stored `mime_type`)
- [ ] `Content-Disposition` contains **both** `filename="..."` AND `filename*=UTF-8''...` (RFC 5987)
- [ ] `/tmp/downloaded.pdf` exists and is byte-identical to the original upload
  ```bash
  md5 /tmp/mithilesh.pdf /tmp/downloaded.pdf   # → should match
  ```
- [ ] Browser test: paste the URL (with cookie in browser) into a new tab — PDF renders inline, doesn't force-download

---

## 4. DOWNLOAD 404 — `file_key` is null — **BLOCKER**

Target a **pre-C1 intake row** (any intake created before staging v25 won't have `file_key`). Find one:

```bash
# Via Fly SSH + psql:
fly ssh console --app apatris-api-staging --machine <machine-id> -C \
  "sh -c 'echo \"SELECT id FROM document_intake WHERE file_key IS NULL LIMIT 1\" | psql \$NEON_DATABASE_URL -t'"
```

Then:
```bash
curl -s -H "Authorization: Bearer $STAGING_JWT" \
  "$STAGING_URL/api/v1/document-intelligence/<pre-c1-intake-id>/file" | jq
```

- [ ] HTTP 404
- [ ] Response body: `{"error": "Original file not available for this intake"}`
- [ ] Verify in Fly logs that **no `getFile` call fired** (the handler short-circuits before storage lookup when `file_key` is null)

---

## 5. DOWNLOAD 404 — S3 object deleted (storage gone) — **NICE-TO-HAVE**

Requires direct S3/R2 access to delete an object behind a valid intake row. Risky
on staging if the S3 bucket is shared with prod. Skip unless you have an
isolated staging bucket.

Conceptual steps (if isolated bucket available):
1. Note the `file_key` from scenario 1's happy-path upload
2. Manually delete it: `aws s3 rm s3://$S3_BUCKET/<file_key>` (or R2 equivalent)
3. Curl the download endpoint with the same `intake_id`

- [ ] HTTP 404
- [ ] Response body: `{"error": "File deleted from storage"}`

---

## 6. DOWNLOAD 404 — cross-tenant isolation — **BLOCKER**

This is the security-critical test. An intake belonging to tenant A must never
leak to tenant B's user, even if B knows A's `intake_id`.

Setup (if you have 2 tenant accounts on staging):
1. As tenant A user: upload a PDF, note the `intake_id`
2. Log out, log in as tenant B user, grab new `apatris_jwt`
3. Attempt download with A's `intake_id`:

```bash
curl -s -H "Authorization: Bearer $STAGING_JWT_TENANT_B" \
  "$STAGING_URL/api/v1/document-intelligence/<tenant-a-intake-id>/file" | jq
```

Expected:
- [ ] HTTP 404 (**not 403** — intentional info-hiding per spec)
- [ ] Response body: `{"error": "Intake record not found"}`
- [ ] The wording is deliberately the same as "truly-not-found" so tenant B cannot distinguish "not mine" from "doesn't exist"

If only one tenant account exists on staging, simulate via psql: temporarily UPDATE `tenant_id` on an intake row to a random UUID, retry curl with your existing JWT:

```bash
# Dangerous — remember to revert after test!
UPDATE document_intake SET tenant_id = '00000000-0000-0000-0000-000000000000'
  WHERE id = '<intake-id>';
# … curl …
# Revert:
UPDATE document_intake SET tenant_id = '<original-tenant-id>'
  WHERE id = '<intake-id>';
```

---

## Prod promotion gate

Before promoting staging v25 → prod v295:

- [ ] Scenario 1 (happy path) passed
- [ ] Scenario 3 (download happy) passed with byte-identical md5
- [ ] Scenario 4 (file_key null) passed
- [ ] Scenario 6 (cross-tenant) passed
- [ ] No unexpected errors in `fly logs --app apatris-api-staging` during the test session
- [ ] `fly releases --app apatris-api` still shows v294 (prod untouched through smoke)
- [ ] Scenario 2 & 5 documented as "nice-to-have, skipped" — acceptable

Scenarios 1, 3, 4, 6 are **the four blockers**. If any fail, rollback staging to v24 and diagnose before shipping prod.

---

## Principle reminder

These scenarios aren't testing code paths — they're verifying that a lawyer
who uploads a PDF today can retrieve that same PDF 6 months from now, even after
browser caches clear, even if the worker wasn't matched at intake time, even
across tenant boundaries. That's case memory strengthening. Every checkbox here
is a place where the lawyer's memory would otherwise have been the single point
of failure.
