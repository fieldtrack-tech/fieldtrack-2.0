#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TESTS_PASSED=0
TESTS_FAILED=0

pass() { echo "[PASS] $*"; TESTS_PASSED=$((TESTS_PASSED + 1)); }
fail() { echo "[FAIL] $*"; TESTS_FAILED=$((TESTS_FAILED + 1)); }

check_exists() {
  local p="$1"
  if [ -f "$p" ]; then pass "Exists: $p"; else fail "Missing: $p"; fi
}

check_not_exists() {
  local p="$1"
  if [ ! -e "$p" ]; then pass "Removed: $p"; else fail "Still present: $p"; fi
}

echo "FieldTrack API stabilization checks"
echo "=================================="

# Required scripts only
check_exists "$SCRIPT_DIR/deploy.sh"
check_exists "$SCRIPT_DIR/vps-readiness-check.sh"
check_exists "$SCRIPT_DIR/verify-stabilization.sh"

# Removed scripts
check_not_exists "$SCRIPT_DIR/load-env.sh"
check_not_exists "$SCRIPT_DIR/validate-env.sh"
check_not_exists "$SCRIPT_DIR/smoke-test.sh"
check_not_exists "$SCRIPT_DIR/deploy-bluegreen.sh"
check_not_exists "$SCRIPT_DIR/rollback.sh"
check_not_exists "$SCRIPT_DIR/monitoring-sync.sh"
check_not_exists "$SCRIPT_DIR/vps-setup.sh"
check_not_exists "$SCRIPT_DIR/analytics-backfill.ts"
check_not_exists "$SCRIPT_DIR/load-testing"

# Infra coupling guard (deployment/runtime paths only)
# Block repo-relative ./infra/ or ../infra/ in scripts and src. Canonical server
# layout is INFRA_ROOT=/opt/infra (see docs/infra-contract.md). Workflows are
# not scanned here — they contain guard strings that mention ./infra/ by design.
if grep -R -E "\.\./infra/|\./infra/" \
  "$REPO_ROOT/scripts" "$REPO_ROOT/src" \
  --exclude="verify-stabilization.sh" \
  --binary-files=without-match --exclude-dir=node_modules --exclude-dir=.git >/dev/null; then
  fail "Found local repo-relative infra coupling in scripts/ or src/"
else
  pass "No local repo-relative infra coupling in scripts/ or src/"
fi

# Deploy workflow guard
if grep -q "validate-env.sh\|load-env.sh\|smoke-test.sh\|monitoring-sync" "$REPO_ROOT/.github/workflows/deploy.yml"; then
  fail "deploy.yml still references removed or infra-specific helpers"
else
  pass "deploy.yml has no removed/infra-specific helper references"
fi

echo ""
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"

if [ "$TESTS_FAILED" -gt 0 ]; then
  exit 1
fi