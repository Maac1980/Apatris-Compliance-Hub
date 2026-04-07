#!/bin/bash
# Apatris E2E Smoke Test — run after every deploy
# Usage: ./scripts/smoke-test.sh [BASE_URL]

BASE="${1:-https://apatris-api.fly.dev}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expected_code="${3:-200}"

  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$url")
  if [ "$code" = "$expected_code" ]; then
    echo "  ✓ $name ($code)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name — expected $expected_code, got $code"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "═══ Apatris Smoke Test ═══"
echo "Target: $BASE"
echo "Time:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

echo "── Health ──"
check "API Health" "$BASE/api/healthz"

echo ""
echo "── Public Pages ──"
check "Dashboard (HTML)" "$BASE/"
check "Login page" "$BASE/login" 200
check "Pricing page" "$BASE/pricing" 200

echo ""
echo "── Auth-Protected APIs (expect 401) ──"
check "Workers API" "$BASE/api/workers" 401
check "Payroll API" "$BASE/api/payroll/current" 401
check "Immigration API" "$BASE/api/immigration" 401
check "Hours API" "$BASE/api/hours" 401
check "Documents API" "$BASE/api/documents" 401

echo ""
echo "── Legal System APIs (expect 401) ──"
check "Legal Queue" "$BASE/api/v1/legal/queue" 401
check "Legal Alerts" "$BASE/api/v1/legal/alerts" 401
check "Legal Cases" "$BASE/api/v1/legal/cases" 401
check "Authority Packs" "$BASE/api/v1/legal/authority-pack/generate" 401
check "Legal Documents" "$BASE/api/v1/legal/documents/suggest/test" 401
check "Legal Copilot" "$BASE/api/v1/legal/copilot/ask" 404
check "PIP Report" "$BASE/api/v1/legal/pip-report/generate" 401
check "Legal Approval Status" "$BASE/api/v1/legal/approve/status?entityType=authority_pack&entityId=test" 401
check "Rejections" "$BASE/api/v1/legal/rejections/analyze" 401
check "Legal Research" "$BASE/api/v1/legal/research/articles" 401

echo ""
echo "── Self-Service APIs (expect 401) ──"
check "Self-Service Profile" "$BASE/api/self-service/profile" 401
check "Self-Service Legal" "$BASE/api/self-service/legal-status" 401

echo ""
echo "── Static Assets ──"
check "Dashboard CSS" "$BASE/assets/" 200

echo ""
echo "═══════════════════════════"
echo "  Passed: $PASS"
echo "  Failed: $FAIL"
echo "  Total:  $((PASS + FAIL))"
echo "═══════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "⚠ SOME CHECKS FAILED"
  exit 1
else
  echo "✓ ALL CHECKS PASSED"
  exit 0
fi
