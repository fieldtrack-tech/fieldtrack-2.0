#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${FT_API_BASE_URL:-https://api.fieldtrack.meowsician.tech}"

EMP_EMAIL="${FT_EMP_EMAIL:-}"
EMP_PASSWORD="${FT_EMP_PASSWORD:-}"
ADMIN_EMAIL="${FT_ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${FT_ADMIN_PASSWORD:-}"

SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_ANON="${SUPABASE_ANON_KEY:-}"

PASS=0
FAIL=0

log_pass() {
  echo "✓ $1"
  PASS=$((PASS+1))
}

log_fail() {
  echo "✗ $1"
  FAIL=$((FAIL+1))
}

request() {
  METHOD=$1
  URL=$2
  TOKEN=${3:-}

  if [ -n "$TOKEN" ]; then
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -H "Authorization: Bearer $TOKEN" \
      -X "$METHOD" "$BASE_URL$URL")
  else
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      -X "$METHOD" "$BASE_URL$URL")
  fi

  echo "$STATUS"
}

echo "================================"
echo "FieldTrack API Smoke Test"
echo "================================"

echo "Waiting for API..."

for i in {1..30}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
  if [ "$STATUS" = "200" ]; then
    echo "API healthy"
    break
  fi
  sleep 2
done

echo ""

# ------------------------------------------------
# Health check
# ------------------------------------------------

STATUS=$(request GET "/health")

if [ "$STATUS" = "200" ]; then
  log_pass "GET /health"
else
  log_fail "GET /health ($STATUS)"
fi

# ------------------------------------------------
# Auth guard tests
# ------------------------------------------------

echo ""
echo "Auth guards"

STATUS=$(request POST "/attendance/check-in")
[[ "$STATUS" == "401" ]] && log_pass "POST /attendance/check-in protected" || log_fail "POST /attendance/check-in ($STATUS)"

STATUS=$(request POST "/attendance/check-out")
[[ "$STATUS" == "401" ]] && log_pass "POST /attendance/check-out protected" || log_fail "POST /attendance/check-out ($STATUS)"

STATUS=$(request GET "/attendance/my-sessions")
[[ "$STATUS" == "401" ]] && log_pass "GET /attendance/my-sessions protected" || log_fail "GET /attendance/my-sessions ($STATUS)"

STATUS=$(request GET "/attendance/org-sessions")
[[ "$STATUS" == "401" ]] && log_pass "GET /attendance/org-sessions protected" || log_fail "GET /attendance/org-sessions ($STATUS)"

STATUS=$(request POST "/expenses")
[[ "$STATUS" == "401" ]] && log_pass "POST /expenses protected" || log_fail "POST /expenses ($STATUS)"

STATUS=$(request GET "/expenses/my")
[[ "$STATUS" == "401" ]] && log_pass "GET /expenses/my protected" || log_fail "GET /expenses/my ($STATUS)"

STATUS=$(request GET "/admin/expenses")
[[ "$STATUS" == "401" ]] && log_pass "GET /admin/expenses protected" || log_fail "GET /admin/expenses ($STATUS)"

# ------------------------------------------------
# Get employee token
# ------------------------------------------------

echo ""
echo "Authenticating employee..."

EMP_TOKEN=$(curl -s \
  -H "apikey: $SUPABASE_ANON" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMP_EMAIL\",\"password\":\"$EMP_PASSWORD\"}" \
  "$SUPABASE_URL/auth/v1/token?grant_type=password" | jq -r .access_token)

if [ "$EMP_TOKEN" = "null" ]; then
  echo "Failed to obtain employee token"
  exit 1
fi

# ------------------------------------------------
# Employee tests
# ------------------------------------------------

STATUS=$(request GET "/attendance/my-sessions" "$EMP_TOKEN")

if [ "$STATUS" = "200" ]; then
  log_pass "Employee access /attendance/my-sessions"
else
  log_fail "Employee access failed ($STATUS)"
fi

# ------------------------------------------------
# Get admin token
# ------------------------------------------------

echo ""
echo "Authenticating admin..."

ADMIN_TOKEN=$(curl -s \
  -H "apikey: $SUPABASE_ANON" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  "$SUPABASE_URL/auth/v1/token?grant_type=password" | jq -r .access_token)

if [ "$ADMIN_TOKEN" = "null" ]; then
  echo "Failed to obtain admin token"
  exit 1
fi

STATUS=$(request GET "/admin/org-summary" "$ADMIN_TOKEN")

if [ "$STATUS" = "200" ]; then
  log_pass "Admin access /admin/org-summary"
else
  log_fail "Admin access failed ($STATUS)"
fi

# ------------------------------------------------
# Summary
# ------------------------------------------------

echo ""
echo "==============================="
echo "Passed: $PASS"
echo "Failed: $FAIL"
echo "==============================="

cat <<EOF > smoke-report.json
{
  "passed": $PASS,
  "failed": $FAIL
}
EOF

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
