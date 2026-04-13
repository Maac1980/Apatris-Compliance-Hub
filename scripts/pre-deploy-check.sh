#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# Apatris Pre-Deploy Health Check
# Run before every `fly deploy` to catch issues before production.
# Usage: ./scripts/pre-deploy-check.sh
# ═══════════════════════════════════════════════════════════════════════════

set -e
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
PASS=0
FAIL=0
WARN=0

check() {
  if eval "$2" > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} $1"
    ((PASS++))
  else
    echo -e "  ${RED}✗${NC} $1"
    ((FAIL++))
  fi
}

warn() {
  echo -e "  ${YELLOW}⚠${NC} $1"
  ((WARN++))
}

echo ""
echo "═══ APATRIS PRE-DEPLOY CHECK ═══"
echo ""

# ── 1. TESTS ───────────────────────────────────────────────────
echo "▸ Unit Tests"
cd artifacts/api-server
if npx vitest run --reporter=dot 2>&1 | tail -1 | grep -q "passed"; then
  PASS_COUNT=$(npx vitest run --reporter=dot 2>&1 | grep -oP '\d+ passed' | grep -oP '\d+')
  echo -e "  ${GREEN}✓${NC} All tests passing ($PASS_COUNT)"
  ((PASS++))
else
  echo -e "  ${RED}✗${NC} Tests failing"
  ((FAIL++))
fi
cd ../..

# ── 2. BUILDS ──────────────────────────────────────────────────
echo "▸ Builds"
check "API server builds" "cd artifacts/api-server && npx tsx ./build.ts"
check "Dashboard builds" "pnpm --filter @workspace/apatris-dashboard run build"
check "Workforce app builds" "pnpm --filter @workspace/workforce-app run build"

# ── 3. DIST SANITY ─────────────────────────────────────────────
echo "▸ Dist Integrity"
check "API dist exists" "test -f artifacts/api-server/dist/index.cjs"
check "Dashboard dist exists" "test -f artifacts/apatris-dashboard/dist/public/index.html"
check "Workforce dist exists" "test -f artifacts/workforce-app/dist/public/index.html"

# ── 4. BUNDLE AUDIT ────────────────────────────────────────────
echo "▸ Bundle Audit (sensitive strings)"
SENSITIVE_FOUND=0

# Check for hardcoded secrets/tokens
if grep -r "sk-[a-zA-Z0-9]" artifacts/apatris-dashboard/dist/ 2>/dev/null | grep -v ".map" | head -1 > /dev/null 2>&1; then
  echo -e "  ${RED}✗${NC} Found API key pattern in dashboard dist"
  ((FAIL++))
  SENSITIVE_FOUND=1
fi

if grep -r "pplx-[a-zA-Z0-9]" artifacts/apatris-dashboard/dist/ 2>/dev/null | grep -v ".map" | head -1 > /dev/null 2>&1; then
  echo -e "  ${RED}✗${NC} Found Perplexity key in dashboard dist"
  ((FAIL++))
  SENSITIVE_FOUND=1
fi

# Check for PESEL patterns (11-digit number sequences that look like PESEL)
PESEL_COUNT=$(grep -roP '\b\d{11}\b' artifacts/apatris-dashboard/dist/public/assets/*.js 2>/dev/null | wc -l)
if [ "$PESEL_COUNT" -gt "5" ]; then
  warn "Found $PESEL_COUNT possible PESEL-like patterns in JS bundles"
fi

if [ "$SENSITIVE_FOUND" -eq "0" ]; then
  echo -e "  ${GREEN}✓${NC} No API keys or secrets in bundles"
  ((PASS++))
fi

# ── 5. GIT STATUS ──────────────────────────────────────────────
echo "▸ Git Status"
check "On main branch" "git branch --show-current | grep -q main"
UNCOMMITTED=$(git status --porcelain | wc -l | tr -d ' ')
if [ "$UNCOMMITTED" -gt "0" ]; then
  warn "$UNCOMMITTED uncommitted files"
else
  echo -e "  ${GREEN}✓${NC} Working tree clean"
  ((PASS++))
fi

# ── SUMMARY ────────────────────────────────────────────────────
echo ""
echo "═══ RESULTS ═══"
echo -e "  ${GREEN}Passed: $PASS${NC}"
echo -e "  ${RED}Failed: $FAIL${NC}"
echo -e "  ${YELLOW}Warnings: $WARN${NC}"
echo ""

if [ "$FAIL" -gt "0" ]; then
  echo -e "${RED}✗ PRE-DEPLOY CHECK FAILED — do not deploy${NC}"
  exit 1
else
  echo -e "${GREEN}✓ ALL CHECKS PASSED — safe to deploy${NC}"
  exit 0
fi
