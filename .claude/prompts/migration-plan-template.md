# Migration Plan Template
# Use for: encryption rollouts, schema migrations, tenancy changes, auth rewrites, ID system changes
# Skip for: small refactors, single-file fixes, bug fixes
# Last refined: 2026-04-17 (caught hash-column searchability issue in PII encryption planning)

---

Read-only planning mode. Do NOT write any code, do NOT modify any files except creating ONE plan document.

**Task:** Create a complete [X] migration plan at: `<absolute path>`

**Reference:** `<file(s) where a working version exists>`. Read it. Use the same proven pattern.

**Scope inventory (do this first, show your work):**
1. List every field/table/column affected. Distinguish "primary" from "aliases" from "ghost references" (types only, no DB column).
2. List every file that reads or writes these fields (exhaustive, file:line).
3. Flag any **query patterns** in the current code that are incompatible with the proposed solution (e.g., `WHERE x = ?`, `GROUP BY x`, `DISTINCT x`, full-text search on x). These are the load-bearing architectural decisions, not the migration itself.

**Plan sections:**
1. Scope (fields in / fields explicitly out — justify each exclusion)
2. Key/secret management (env var, generation command, storage, rotation, loss-recovery)
3. Code changes (new files, function signatures, backward-compat rules)
4. Write path (exhaustive target list from inventory, verification query)
5. Read path (exhaustive target list, role/tenant masking, audit-log sanitization)
6. Data migration phases (code-first deploy, backfill, verification, per-phase rollback)
7. Testing (unit, role-based, integration, legacy compat, CI gate)
8. Deploy order (staging first, prod second, different secrets per env, snapshot before irreversible steps)
9. Rollback plan (per phase, **including which phases are non-reversible and why**)
10. Estimated time (**be honest — include the architectural work you flagged, not just the happy path**)
11. **Architectural decisions beyond this outline** — anything you had to decide that the outline didn't anticipate. Explain each with a sentence on why the default approach doesn't work.
12. Open questions requiring my input before coding starts
13. Definition of done (checkbox list)

**Hard constraints:**
- Every write site must be listed — missing one means unencrypted/unmigrated data leaks in post-cutover.
- Before any irreversible step (backfill, DROP, key rotation), require an explicit snapshot step.
- Flag any place the reference implementation doesn't solve a problem that the target codebase has.
- Every architectural decision you make on my behalf must appear in §11 with: the decision, the rejected alternative, why your choice is better, and what I should confirm before coding.

**Save. Confirm save. Stop.**
