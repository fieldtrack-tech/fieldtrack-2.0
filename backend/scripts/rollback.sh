#!/usr/bin/env bash
set -euo pipefail

DEPLOY_HISTORY="/home/ashish/FieldTrack-2.0/backend/.deploy_history"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================="
echo "FieldTrack Rollback System"
echo "========================================="

# Check if deployment history exists
if [ ! -f "$DEPLOY_HISTORY" ]; then
    echo "ERROR: No deployment history found."
    echo "File not found: $DEPLOY_HISTORY"
    echo ""
    echo "This means no successful deployment has been recorded yet."
    echo "Cannot rollback without a previous deployment."
    exit 1
fi

# Read deployment history
mapfile -t HISTORY < "$DEPLOY_HISTORY"

if [ ${#HISTORY[@]} -lt 2 ]; then
    echo "ERROR: Insufficient deployment history."
    echo "Current deployment: ${HISTORY[0]:-none}"
    echo ""
    echo "Need at least 2 deployments to rollback."
    echo "Cannot rollback - this is the first or only deployment."
    exit 1
fi

# Current (line 1) and previous (line 2)
CURRENT_SHA="${HISTORY[0]}"
PREVIOUS_SHA="${HISTORY[1]}"

echo "Current deployment : $CURRENT_SHA"
echo "Previous deployment: $PREVIOUS_SHA"
echo ""

# Show additional history if available
if [ ${#HISTORY[@]} -gt 2 ]; then
    echo "Deployment history:"
    for i in "${!HISTORY[@]}"; do
        if [ $i -eq 0 ]; then
            echo "  $((i+1)). ${HISTORY[$i]} (current)"
        elif [ $i -eq 1 ]; then
            echo "  $((i+1)). ${HISTORY[$i]} ← rollback target"
        else
            echo "  $((i+1)). ${HISTORY[$i]}"
        fi
    done
    echo ""
fi
echo "⚠️  WARNING: This will redeploy the previous version."
echo "Current production will be replaced with: $PREVIOUS_SHA"
echo ""
read -p "Continue with rollback? (yes/no): " -r
echo

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Rollback cancelled."
    exit 0
fi

echo ""
echo "Starting rollback to image: $PREVIOUS_SHA"
echo "========================================="
echo ""

# Execute the blue-green deployment script with the previous SHA
"$SCRIPT_DIR/deploy-bluegreen.sh" "$PREVIOUS_SHA"

echo ""
echo "========================================="
echo "Rollback completed successfully."
echo "Production is now running: $PREVIOUS_SHA"
echo "========================================="
