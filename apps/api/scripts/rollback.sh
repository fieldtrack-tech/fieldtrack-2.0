#!/usr/bin/env bash
set -euo pipefail
set -x
trap 'echo "❌ Failed at line $LINENO"' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load and validate environment.
# Sets: DEPLOY_ROOT, ENV_FILE, API_HOSTNAME.
# Exports all variables from apps/api/.env into this process.
# Temporarily disable trace so .env values are not echoed to logs.
{ set +x; source "$SCRIPT_DIR/load-env.sh"; set -x; }

DEPLOY_HISTORY="$DEPLOY_ROOT/apps/api/.deploy_history"

AUTO_MODE=false

if [[ "${1:-}" == "--auto" ]]; then
  AUTO_MODE=true
fi

echo "========================================="
echo "FieldTrack Rollback System"
echo "========================================="

# Check if deployment history exists and validate checksum
if [ ! -f "$DEPLOY_HISTORY" ]; then
    echo "ERROR: No deployment history found."
    echo "File not found: $DEPLOY_HISTORY"
    exit 1
fi

# Validate deployment history file integrity
if [ ! -s "$DEPLOY_HISTORY" ]; then
    echo "ERROR: Deployment history file is empty or corrupted."
    exit 1
fi

mapfile -t HISTORY < "$DEPLOY_HISTORY"

if [ ${#HISTORY[@]} -lt 2 ]; then
    echo "ERROR: Need at least two deployments to rollback."
    exit 1
fi

CURRENT_SHA="${HISTORY[0]}"
PREVIOUS_SHA="${HISTORY[1]}"

echo "Current deployment : $CURRENT_SHA"
echo "Rollback target    : $PREVIOUS_SHA"
echo ""

# Validate that the rollback image exists in the registry
echo "Validating rollback image exists..."
if ! docker manifest inspect "ghcr.io/fieldtrack-tech/fieldtrack-backend:$PREVIOUS_SHA" >/dev/null 2>&1; then
    echo "ERROR: Rollback image not found in registry."
    echo "Image: ghcr.io/fieldtrack-tech/fieldtrack-backend:$PREVIOUS_SHA"
    echo "Cannot proceed with rollback to non-existent image."
    exit 1
fi
echo "✓ Rollback image verified in registry."
echo ""

if [ "$AUTO_MODE" = false ]; then
  echo "⚠️  WARNING: This will replace the current deployment."
  read -p "Continue with rollback? (yes/no): " -r

  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
      echo "Rollback cancelled."
      exit 0
  fi
else
  echo "Auto rollback mode enabled (CI)."
fi

echo ""
echo "Starting rollback to: $PREVIOUS_SHA"
echo ""

"$SCRIPT_DIR/deploy-bluegreen.sh" "$PREVIOUS_SHA"

echo ""
echo "========================================="
echo "Rollback completed successfully"
echo "Production now running: $PREVIOUS_SHA"
echo "========================================="
