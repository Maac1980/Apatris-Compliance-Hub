# Tech Debt Baselines

## TypeScript strict-mode errors — baseline as of 2026-04-24

**Baseline count:** 159 errors
**Commit when recorded:** 8fa917e
**Prod release:** v295 (C1 — Document Storage)
**Date:** 2026-04-24

**Context:** Pre-existing TypeScript strict-mode errors unrelated to
any active sub-phase. esbuild tolerates these at build time;
`pnpm typecheck` reports them without blocking deploy.

**Trend over time:**
- 527 errors on 2026-04-17 (pre-encryption work)
- 179 errors after Day 5 AI streaming work
- 159 errors as of C1 ship (2026-04-24)

**Current error-holding files (not exhaustive):**
- src/services/data-copilot.service.ts
- src/services/decision-explanation.service.ts
- src/services/document-intake.service.ts
- src/services/intelligence-router.service.ts
- src/services/mos-package.service.ts
- src/services/smart-document.service.ts
- src/services/weekly-digest.service.ts

**Baseline rule going forward:**
Any PR that increases the count above 159 must:
1. Flag the delta in the commit description
2. Justify why the regression is acceptable (or resolve before merge)

Any PR that decreases the count may update this number.

**How to check:**
```
cd artifacts/api-server && npx tsc --noEmit 2>&1 | grep -c "error TS"
```

**Future cleanup sub-phase:** drive 159 → 0, grouped by service file.
