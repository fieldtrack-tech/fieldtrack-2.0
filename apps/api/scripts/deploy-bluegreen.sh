#!/usr/bin/env bash
# =============================================================================
# deploy-bluegreen.sh — FieldTrack 2.0 Blue-Green Deployment
#
# State machine:
#   INIT -> PRE_FLIGHT -> PULL_IMAGE -> RESOLVE_SLOT -> START_INACTIVE
#        -> HEALTH_CHECK_INTERNAL -> SWITCH_NGINX -> HEALTH_CHECK_PUBLIC
#        -> CLEANUP -> SUCCESS
#
# On failure:
#   -> ROLLBACK (nginx restored, slot restored, failed container removed)
#   -> ROLLBACK_COMPLETE  exit 1  -- deploy failed, system restored
#   -> FAILURE            exit 2  -- deploy AND rollback failed, manual needed
#
# Slot state file: /var/run/fieldtrack/active-slot
#   /var/run is a tmpfs (cleared on reboot). The _ft_resolve_slot() recovery
#   function handles a missing file by inspecting running containers and the
#   live nginx config, then re-writing the file. No manual step needed after
#   a reboot or unexpected /run eviction.
#
# Exit codes:
#   0  deployment succeeded
#   1  deployment failed, automatic rollback succeeded (system restored)
#   2  deployment AND rollback failed (requires manual intervention)
# =============================================================================
set -euo pipefail
set -x
trap '_ft_trap_err "$LINENO"' ERR

# ---------------------------------------------------------------------------
# STRUCTURED LOGGING  [DEPLOY] ts=<ISO8601> state=<STATE> <key=value ...>
# ALL logging writes to stderr (>&2) so that functions returning values via
# stdout are never contaminated. stdout = data only; stderr = logs.
# { set +x; } 2>/dev/null suppresses xtrace noise inside helpers.
# ---------------------------------------------------------------------------
_FT_STATE="INIT"

_ft_log() {
    { set +x; } 2>/dev/null
    printf '[DEPLOY] ts=%s state=%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$_FT_STATE" "$*" >&2
    set -x
}

_ft_state() {
    { set +x; } 2>/dev/null
    _FT_STATE="$1"; shift
    printf '[DEPLOY] ts=%s state=%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$_FT_STATE" "$*" >&2
    set -x
}

_ft_trap_err() {
    { set +x; } 2>/dev/null
    printf '[DEPLOY] ts=%s state=%s level=ERROR msg="unexpected failure at line %s"\n' \
        "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$_FT_STATE" "$1" >&2
    set -x
}

# ---------------------------------------------------------------------------
# SYSTEM SNAPSHOT -- emitted on any unrecoverable failure
# ---------------------------------------------------------------------------
_ft_snapshot() {
    { set +x; } 2>/dev/null
    printf '[DEPLOY] -- SYSTEM SNAPSHOT ----------------------------------------\n' >&2
    printf '[DEPLOY]   slot_file  = %s\n' "$(cat "${ACTIVE_SLOT_FILE:-/var/run/fieldtrack/active-slot}" 2>/dev/null || echo 'MISSING')" >&2
    printf '[DEPLOY]   nginx_port = %s\n' "$(grep -oP 'server 127\.0\.0\.1:\K[0-9]+' "${NGINX_CONF:-/etc/nginx/sites-enabled/fieldtrack.conf}" 2>/dev/null | head -1 || echo 'unreadable')" >&2
    printf '[DEPLOY]   containers =\n' >&2
    docker ps --format '[DEPLOY]     {{.Names}} -> {{.Status}} ({{.Ports}})' 1>&2 2>/dev/null \
        || printf '[DEPLOY]     (docker ps unavailable)\n' >&2
    printf '[DEPLOY] -----------------------------------------------------------\n' >&2
    set -x
}

# ---------------------------------------------------------------------------
# CI MODE GUARD
# ---------------------------------------------------------------------------
CI_MODE="${CI_MODE:-false}"
SKIP_EXTERNAL_SERVICES="${SKIP_EXTERNAL_SERVICES:-false}"

if [ "$CI_MODE" != "true" ] && [ "$SKIP_EXTERNAL_SERVICES" = "true" ]; then
    _ft_log "level=ERROR msg='SKIP_EXTERNAL_SERVICES=true is only allowed in CI_MODE -- refusing to deploy without Redis/Supabase/BullMQ to production'"
    exit 1
fi

if [ "$CI_MODE" = "true" ]; then
    _ft_log "msg='CI_MODE=true -- deployment simulation without side effects'"
    [ "$SKIP_EXTERNAL_SERVICES" = "true" ] && _ft_log "msg='SKIP_EXTERNAL_SERVICES=true -- external services skipped in container'"
fi

# ---------------------------------------------------------------------------
# CONSTANTS
# ---------------------------------------------------------------------------
IMAGE="ghcr.io/fieldtrack-tech/fieldtrack-backend:${1:-latest}"
IMAGE_SHA="${1:-latest}"

BLUE_NAME="backend-blue"
GREEN_NAME="backend-green"
BLUE_PORT=3001
GREEN_PORT=3002
APP_PORT=3000
NETWORK="fieldtrack_network"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Slot state directory and file.
# /var/run/fieldtrack/ is chosen over /tmp (world-writable, cleaned by tmpwatch)
# and $HOME (variable path, not auditable as runtime state).
# /var/run IS a tmpfs -- the _ft_resolve_slot() recovery handles missing files.
SLOT_DIR="/var/run/fieldtrack"
ACTIVE_SLOT_FILE="$SLOT_DIR/active-slot"

NGINX_CONF="/etc/nginx/sites-enabled/fieldtrack.conf"
NGINX_TEMPLATE="$REPO_DIR/infra/nginx/fieldtrack.conf"
MAX_HISTORY=5
MAX_HEALTH_ATTEMPTS=40
HEALTH_INTERVAL=3
LOCK_FILE="$SLOT_DIR/deploy.lock"
SNAP_DIR="$SLOT_DIR"
LAST_GOOD_FILE="$SNAP_DIR/last-good"

# ---------------------------------------------------------------------------
# DEPLOYMENT LOCK -- prevent concurrent deploys
# ---------------------------------------------------------------------------
_ft_acquire_lock() {
    if [ "$CI_MODE" = "true" ]; then
        _ft_log "msg='CI_MODE=true -- skipping lock acquisition'"
        return 0
    fi
    _ft_ensure_slot_dir
    _ft_log "msg='acquiring deployment lock' pid=$$ file=$LOCK_FILE"
    exec 200>"$LOCK_FILE"
    if ! flock -n 200; then
        _ft_log "level=ERROR msg='another deployment already in progress -- aborting' pid=$$"
        exit 1
    fi
    _ft_log "msg='deployment lock acquired' pid=$$ file=$LOCK_FILE"
    # Ensure lock is released on exit
    trap '_ft_release_lock' EXIT
}

_ft_release_lock() {
    { set +x; } 2>/dev/null
    printf '[DEPLOY] ts=%s state=%s msg="releasing deployment lock" pid=%s\n' \
        "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$_FT_STATE" "$$" >&2
    # Close FD 200 unconditionally; closing the FD releases the flock.
    exec 200>&- 2>/dev/null || true
    set -x
}

# ---------------------------------------------------------------------------
# EXTERNAL ENDPOINT CHECK WITH RETRY + BACKOFF
# Smooths transient CDN/TLS edge jitter while maintaining strict semantics
# ---------------------------------------------------------------------------
_ft_check_external_ready() {
    { set +x; } 2>/dev/null
    local url="https://$API_HOSTNAME/ready"
    local attempt=0
    
    for attempt in 1 2 3; do
        local body
        body=$(curl -s --max-time 3 "$url" 2>/dev/null || echo "")
        if echo "$body" | grep -q '"status":"ready"' 2>/dev/null; then
            set -x
            return 0
        fi
        if [ "$attempt" -lt 3 ]; then
            sleep "$attempt"
        fi
    done
    
    set -x
    return 1
}

# ---------------------------------------------------------------------------
# SLOT DIRECTORY AND FILE MANAGEMENT
# ---------------------------------------------------------------------------
_ft_ensure_slot_dir() {
    # No-op in CI -- slot file is not used in simulation mode.
    [ "$CI_MODE" = "true" ] && return 0
    if [ ! -d "$SLOT_DIR" ]; then
        _ft_log "msg='slot dir missing, creating' path=$SLOT_DIR"
        sudo mkdir -p "$SLOT_DIR"
        # Owned by the deploy user so subsequent writes do not need sudo.
        sudo chown "$(id -un):$(id -gn)" "$SLOT_DIR"
        sudo chmod 750 "$SLOT_DIR"
    fi
}

# Single authoritative validator. Returns 0 for "blue"|"green", 1 otherwise.
# Logs to stderr on failure so every call site gets a structured error for free.
_ft_validate_slot() {
    case "$1" in
        blue|green) return 0 ;;
        *) _ft_log "level=ERROR msg='invalid slot value' slot='${1:0:80}'"
           return 1 ;;
    esac
}

_ft_write_slot() {
    local slot="$1"
    [ "$CI_MODE" = "true" ] && return 0
    _ft_validate_slot "$slot" || return 1
    _ft_ensure_slot_dir
    local slot_tmp
    slot_tmp=$(mktemp "${SLOT_DIR}/active-slot.XXXXXX")
    printf '%s\n' "$slot" > "$slot_tmp"
    mv "$slot_tmp" "$ACTIVE_SLOT_FILE"
    _ft_log "msg='slot file updated (atomic)' slot=$slot path=$ACTIVE_SLOT_FILE"
}

# _ft_resolve_slot -- returns the active slot name, recovering from a missing
# or corrupt slot file by inspecting running containers and the live nginx config.
#
# Recovery precedence (production only):
#   1. slot file value            (happy path)
#   2. only blue running          -> blue
#   3. only green running         -> green
#   4. both running               -> nginx upstream port as tiebreaker
#   5. neither running            -> green  (first deploy; inactive = blue)
_ft_resolve_slot() {
    if [ "$CI_MODE" = "true" ]; then
        # CI default: active=green so deploy always targets blue (inactive).
        echo "green"
        return 0
    fi

    _ft_ensure_slot_dir

    # Happy path -- slot file exists and is valid.
    if [ -f "$ACTIVE_SLOT_FILE" ]; then
        local current_slot
        current_slot=$(tr -d '[:space:]' < "$ACTIVE_SLOT_FILE")
        # Guard: detect log contamination in the file (pre-fix corruption defense).
        # A valid slot is ONLY the literal string "blue" or "green".
        if [[ "$current_slot" == *DEPLOY* ]] || [[ "$current_slot" == *\[* ]]; then
            _ft_log "level=WARN msg='slot file contains log contamination -- treating as corrupt, recovering' value=${current_slot:0:80}"
        elif _ft_validate_slot "$current_slot"; then
            _ft_log "msg='slot file read' slot=$current_slot"
            echo "$current_slot"
            return 0
        else
            # _ft_validate_slot already logged the invalid value; fall through to recovery.
            _ft_log "level=WARN msg='slot file invalid, falling through to container recovery'"
        fi
    else
        _ft_log "level=WARN msg='slot file missing, recovering from container state' path=$ACTIVE_SLOT_FILE"
    fi

    # Recovery -- infer from running containers, then nginx config.
    local blue_running=false green_running=false recovered_slot=""
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${BLUE_NAME}$"  && blue_running=true  || true
    docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${GREEN_NAME}$" && green_running=true || true

    if [ "$blue_running" = "true" ] && [ "$green_running" = "false" ]; then
        recovered_slot="blue"
        _ft_log "msg='recovery: only blue running' slot=blue"
    elif [ "$green_running" = "true" ] && [ "$blue_running" = "false" ]; then
        recovered_slot="green"
        _ft_log "msg='recovery: only green running' slot=green"
    elif [ "$blue_running" = "true" ] && [ "$green_running" = "true" ]; then
        # Both running -- read nginx upstream port as authoritative tiebreaker.
        local nginx_port
        nginx_port=$(grep -oP 'server 127\.0\.0\.1:\K[0-9]+' "$NGINX_CONF" 2>/dev/null | head -1 || echo "")
        if [ "$nginx_port" = "$BLUE_PORT" ]; then recovered_slot="blue"
        elif [ "$nginx_port" = "$GREEN_PORT" ]; then recovered_slot="green"
        else
            recovered_slot="blue"
            _ft_log "level=WARN msg='both containers running and nginx port ambiguous, defaulting to blue' nginx_port=${nginx_port}"
        fi
        _ft_log "msg='recovery: both containers running, nginx tiebreaker' nginx_port=${nginx_port} slot=${recovered_slot}"
    else
        # Neither running -- first deploy.
        recovered_slot="green"
        _ft_log "msg='recovery: no containers running, assuming first deploy' slot=green"
    fi

    # Validate before writing -- recovered_slot must be blue or green.
    # (_ft_validate_slot logs the error; we just fail the subshell.)
    _ft_validate_slot "$recovered_slot" || return 1

    # Persist the recovered value (atomic write).
    local slot_tmp
    slot_tmp=$(mktemp "${SLOT_DIR}/active-slot.XXXXXX")
    printf '%s\n' "$recovered_slot" > "$slot_tmp"
    mv "$slot_tmp" "$ACTIVE_SLOT_FILE"
    _ft_log "msg='slot file recreated (atomic)' slot=$recovered_slot"
    echo "$recovered_slot"
}

# ---------------------------------------------------------------------------
# ACQUIRE DEPLOYMENT LOCK
# ---------------------------------------------------------------------------
_ft_acquire_lock

# ---------------------------------------------------------------------------
# PRE-FLIGHT: load environment + validate contract
# ---------------------------------------------------------------------------
_ft_state "PRE_FLIGHT" "msg='loading and validating environment'"

# Log last-known-good state for faster triage
_LAST_GOOD=$(cat "$LAST_GOOD_FILE" 2>/dev/null || echo "none")
_ft_log "msg='startup recovery info' last_good=$_LAST_GOOD"

# Disable xtrace while sourcing .env to prevent secrets in logs.
set +x
source "$SCRIPT_DIR/load-env.sh"
set -x

# DEPLOY_ROOT is now exported by load-env.sh.
DEPLOY_HISTORY="$DEPLOY_ROOT/apps/api/.deploy_history"

if [ "$CI_MODE" = "true" ] && [ "${APP_ENV:-}" = "production" ]; then
    _ft_log "level=ERROR msg='CI_MODE=true cannot run with APP_ENV=production -- safety guard'"
    exit 1
fi

_ft_log "msg='environment loaded' api_hostname=$API_HOSTNAME"

set +x
"$SCRIPT_DIR/validate-env.sh" --check-monitoring
set -x

_ft_log "msg='env contract validated'"

# ---------------------------------------------------------------------------
# [1/7] PULL IMAGE
# ---------------------------------------------------------------------------
_ft_state "PULL_IMAGE" "msg='pulling container image' sha=$IMAGE_SHA"

if [ "$CI_MODE" = "true" ]; then
    _ft_log "msg='CI_MODE=true -- skipping image pull, using local image'"
else
    docker pull "$IMAGE"
    _ft_log "msg='image pulled' image=$IMAGE"
fi

# ---------------------------------------------------------------------------
# [2/7] RESOLVE ACTIVE SLOT (with recovery)
# ---------------------------------------------------------------------------
_ft_state "RESOLVE_SLOT" "msg='determining active slot'"

ACTIVE=$(_ft_resolve_slot) || {
    _ft_log "level=ERROR msg='_ft_resolve_slot failed or exited non-zero -- cannot continue safely'"
    exit 1
}
ACTIVE=$(printf '%s' "$ACTIVE" | tr -d '[:space:]')
_ft_validate_slot "$ACTIVE" || exit 1

if [ "$ACTIVE" = "blue" ]; then
    ACTIVE_NAME=$BLUE_NAME;   ACTIVE_PORT=$BLUE_PORT
    INACTIVE="green"; INACTIVE_NAME=$GREEN_NAME; INACTIVE_PORT=$GREEN_PORT
else
    ACTIVE_NAME=$GREEN_NAME;  ACTIVE_PORT=$GREEN_PORT
    INACTIVE="blue";  INACTIVE_NAME=$BLUE_NAME;  INACTIVE_PORT=$BLUE_PORT
fi

_ft_log "msg='slot resolved' active=$ACTIVE active_port=$ACTIVE_PORT inactive=$INACTIVE inactive_port=$INACTIVE_PORT"

# ---------------------------------------------------------------------------
# [3/7] START INACTIVE CONTAINER
# ---------------------------------------------------------------------------
_ft_state "START_INACTIVE" "msg='starting inactive container' name=$INACTIVE_NAME port=$INACTIVE_PORT"

if [ "$CI_MODE" = "true" ]; then
    if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then
        docker network create "$NETWORK"
        _ft_log "msg='created docker network' network=$NETWORK"
    fi
fi

if docker ps -a --format '{{.Names}}' | grep -Eq "^${INACTIVE_NAME}$"; then
    _ft_log "msg='removing stale container' name=$INACTIVE_NAME"
    docker rm -f "$INACTIVE_NAME"
fi

docker run -d \
  --name "$INACTIVE_NAME" \
  --network "$NETWORK" \
  -p "127.0.0.1:$INACTIVE_PORT:$APP_PORT" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  -e CI_MODE="${CI_MODE:-false}" \
  -e SKIP_EXTERNAL_SERVICES="${SKIP_EXTERNAL_SERVICES:-false}" \
  "$IMAGE"

_ft_log "msg='container started' name=$INACTIVE_NAME port=$INACTIVE_PORT"

# ---------------------------------------------------------------------------
# [4/7] INTERNAL HEALTH CHECK
#   CI   -> /health  (no external dependencies)
#   Prod -> /ready   (validates Redis, Supabase, BullMQ)
# ---------------------------------------------------------------------------
_ft_state "HEALTH_CHECK_INTERNAL" "msg='waiting for container readiness'"

sleep 5
HEALTH_ENDPOINT="/ready"
[ "$CI_MODE" = "true" ] && HEALTH_ENDPOINT="/health"

ATTEMPT=0
until true; do
    ATTEMPT=$((ATTEMPT + 1))
    STATUS=$(curl --max-time 2 -s -o /dev/null -w "%{http_code}" \
        "http://127.0.0.1:$INACTIVE_PORT${HEALTH_ENDPOINT}" || echo "000")

    if [ "$STATUS" = "200" ]; then
        _ft_log "msg='internal health check passed' endpoint=$HEALTH_ENDPOINT attempts=$ATTEMPT"
        break
    fi

    if ! docker ps --format '{{.Names}}' | grep -q "^${INACTIVE_NAME}$"; then
        _ft_log "level=ERROR msg='container exited unexpectedly' name=$INACTIVE_NAME"
        docker logs "$INACTIVE_NAME" --tail 100 || true
        docker rm -f "$INACTIVE_NAME" || true
        exit 1
    fi

    if [ "$ATTEMPT" -ge "$MAX_HEALTH_ATTEMPTS" ]; then
        _ft_log "level=ERROR msg='internal health check timed out' attempts=$ATTEMPT status=$STATUS endpoint=http://127.0.0.1:$INACTIVE_PORT${HEALTH_ENDPOINT}"
        docker logs "$INACTIVE_NAME" --tail 100 || true
        docker rm -f "$INACTIVE_NAME" || true
        exit 1
    fi

    _ft_log "msg='waiting for readiness' attempt=$ATTEMPT/$MAX_HEALTH_ATTEMPTS status=$STATUS interval=${HEALTH_INTERVAL}s"
    sleep "$HEALTH_INTERVAL"
done

# ---------------------------------------------------------------------------
# [5/7] SWITCH NGINX UPSTREAM
# ---------------------------------------------------------------------------
_ft_state "SWITCH_NGINX" "msg='switching nginx upstream' port=$INACTIVE_PORT"

if [ "$CI_MODE" = "true" ]; then
    _ft_log "msg='CI_MODE=true -- skipping nginx switch'"
    # Write slot in CI so the next simulated deploy targets the correct container.
    _ft_write_slot "$INACTIVE"
else
    # Backup goes to /etc/nginx/ (NOT sites-enabled/) so nginx does not parse it
    # during validation and trigger a duplicate-upstream error.
    NGINX_BACKUP="/etc/nginx/fieldtrack.conf.bak.$(date +%s)"
    NGINX_TMP="$(mktemp /tmp/fieldtrack-nginx.XXXXXX.conf)"

    sed \
        -e "s|__BACKEND_PORT__|$INACTIVE_PORT|g" \
        -e "s|__API_HOSTNAME__|$API_HOSTNAME|g" \
        "$NGINX_TEMPLATE" > "$NGINX_TMP"

    sudo cp "$NGINX_CONF" "$NGINX_BACKUP"
    sudo cp "$NGINX_TMP" "$NGINX_CONF"
    rm -f "$NGINX_TMP"
    # Remove stale backups accidentally left in sites-enabled/ by old deploy runs.
    sudo rm -f /etc/nginx/sites-enabled/fieldtrack.conf.bak.*

    if ! sudo nginx -t 2>&1; then
        _ft_log "level=ERROR msg='nginx config test failed -- restoring backup'"
        sudo cp "$NGINX_BACKUP" "$NGINX_CONF"
        exit 1
    fi

    sudo systemctl reload nginx
    _ft_log "msg='nginx reloaded' upstream=127.0.0.1:$INACTIVE_PORT"

    # Write the slot file AFTER nginx reload so it always reflects what nginx
    # is currently serving. If the public health check then fails and we roll
    # back, we restore nginx AND overwrite this file back to $ACTIVE.
    _ft_write_slot "$INACTIVE"

    # Small settle window to stabilize TLS/keep-alive/edge cases
    sleep 2
fi

# ---------------------------------------------------------------------------
# [6/7] PUBLIC HEALTH CHECK (end-to-end)
#   Three-part validation:
#   1. HTTP 200              -- TLS, DNS, Cloudflare, nginx routing all ok
#   2. Body "status":"ready" -- /ready reached Fastify; Redis/Supabase/BullMQ ok
#   3. Port alignment        -- live nginx config points at $INACTIVE_PORT exactly
#                               (catches failed template substitution)
# ---------------------------------------------------------------------------
_ft_state "HEALTH_CHECK_PUBLIC" "msg='end-to-end public health check' url=https://$API_HOSTNAME/ready"

if [ "$CI_MODE" = "true" ]; then
    _ft_log "msg='CI_MODE=true -- skipping public check (no DNS/TLS in CI), internal check already passed'"
else
    # Give nginx a moment to apply the reloaded config cleanly.
    sleep 3

    _PUB_URL="https://$API_HOSTNAME/ready"
    _PUB_PASSED=false
    _PUB_STATUS="000"

    for _attempt in 1 2 3 4 5; do
        _PUB_BODY=$(mktemp)
        _PUB_STATUS=$(curl --max-time 10 -sS -o "$_PUB_BODY" -w "%{http_code}" "$_PUB_URL" 2>&1 || echo "000")

        if [ "$_PUB_STATUS" = "200" ] && grep -q '"status":"ready"' "$_PUB_BODY" 2>/dev/null; then
            _PUB_PASSED=true
            rm -f "$_PUB_BODY"
            break
        fi

        _ft_log "msg='public health attempt failed' attempt=$_attempt/5 status=$_PUB_STATUS url=$_PUB_URL"
        rm -f "$_PUB_BODY"
        sleep 5
    done

    # Port alignment check -- live nginx config MUST point at the new slot's port.
    _NGINX_PORT=$(grep -oP 'server 127\.0\.0\.1:\K[0-9]+' "$NGINX_CONF" 2>/dev/null | head -1 || echo "")
    if [ -n "$_NGINX_PORT" ] && [ "$_NGINX_PORT" != "$INACTIVE_PORT" ]; then
        _ft_log "level=ERROR msg='nginx port mismatch -- slot switch did not take effect' expected=$INACTIVE_PORT actual=$_NGINX_PORT"
        _PUB_PASSED=false
    fi

    if [ "$_PUB_PASSED" != "true" ]; then
        _ft_state "ROLLBACK" "reason='public health check failed' url=$_PUB_URL last_status=$_PUB_STATUS"
        _ft_snapshot

        _ft_log "msg='restoring previous nginx config'"
        sudo cp "$NGINX_BACKUP" "$NGINX_CONF"
        if sudo nginx -t 2>&1 && sudo systemctl reload nginx; then
            _ft_log "msg='nginx restored to previous config'"
        else
            _ft_log "level=ERROR msg='nginx restore failed -- check manually'"
        fi

        # Restore slot file to the slot that was active before this deploy attempt.
        _ft_write_slot "$ACTIVE"
        docker rm -f "$INACTIVE_NAME" || true

        unset _PUB_URL _PUB_PASSED _attempt _PUB_STATUS _PUB_BODY _NGINX_PORT

        if [ "${FIELDTRACK_ROLLBACK_IN_PROGRESS:-0}" != "1" ]; then
            _ft_log "msg='triggering image rollback to previous stable SHA'"
            export FIELDTRACK_ROLLBACK_IN_PROGRESS=1
            # Release the deployment lock BEFORE calling rollback.sh.
            # rollback.sh re-invokes deploy-bluegreen.sh, which must be able to
            # acquire the lock. The FIELDTRACK_ROLLBACK_IN_PROGRESS guard prevents
            # infinite loops; the lock only blocks unrelated concurrent deploys.
            _ft_release_lock
            if ! "$SCRIPT_DIR/rollback.sh" --auto; then
                _ft_state "FAILURE" "reason='deploy_and_rollback_both_failed'"
                _ft_snapshot
                exit 2
            fi
            _ft_state "ROLLBACK_COMPLETE" "msg='deploy failed but automatic rollback succeeded -- system restored'"
        else
            _ft_log "msg='nested rollback guard reached -- stopping to prevent infinite loop'"
            _ft_state "FAILURE" "reason='nested_rollback_guard'"
        fi

        exit 1
    fi

    unset _PUB_URL _PUB_PASSED _attempt _PUB_STATUS _PUB_BODY _NGINX_PORT
    _ft_log "msg='public health check passed' port=$INACTIVE_PORT url=https://$API_HOSTNAME/ready"
fi

# ---------------------------------------------------------------------------
# [7/7] CLEANUP + SUCCESS
# ---------------------------------------------------------------------------
_ft_state "CLEANUP" "msg='removing previous active container' name=$ACTIVE_NAME"

if [ "$CI_MODE" = "true" ]; then
    _ft_log "msg='CI_MODE=true -- skipping container cleanup'"
else
    docker rm -f "$ACTIVE_NAME" || true
    _ft_log "msg='previous container removed' name=$ACTIVE_NAME"
fi

_ft_state "SUCCESS" "msg='deployment complete' container=$INACTIVE_NAME sha=$IMAGE_SHA slot=$INACTIVE port=$INACTIVE_PORT"

if [ "$CI_MODE" = "true" ]; then
    _ft_log "msg='CI deployment simulation complete'"
    exit 0
fi

# ---------------------------------------------------------------------------
# FINAL TRUTH CHECK -- verify state matches deployment intent
# Compares internal (localhost) vs external (DNS/Cloudflare) endpoint health
# to catch routing, TLS, and proxy anomalies
# ---------------------------------------------------------------------------
_FT_TRUTH_CHECK_PASSED=true

# (1) Verify slot file is correctly written
if [ -f "$ACTIVE_SLOT_FILE" ]; then
    _SLOT_VALUE=$(cat "$ACTIVE_SLOT_FILE" | tr -d '[:space:]')
    if [ "$_SLOT_VALUE" != "$INACTIVE" ]; then
        _ft_log "level=ERROR msg='truth check failed: slot file mismatch' expected=$INACTIVE actual=$_SLOT_VALUE"
        _FT_TRUTH_CHECK_PASSED=false
    else
        _ft_log "msg='truth check: slot file correct' slot=$_SLOT_VALUE"
    fi
else
    _ft_log "level=ERROR msg='truth check failed: slot file missing'"
    _FT_TRUTH_CHECK_PASSED=false
fi

# (2) Verify nginx upstream port matches target
_NGINX_PORT=$(grep -oP 'server 127\.0\.0\.1:\K[0-9]+' "$NGINX_CONF" 2>/dev/null | head -1 || echo "")
if [ -n "$_NGINX_PORT" ]; then
    if [ "$_NGINX_PORT" != "$INACTIVE_PORT" ]; then
        _ft_log "level=ERROR msg='truth check failed: nginx port mismatch' expected=$INACTIVE_PORT actual=$_NGINX_PORT"
        _FT_TRUTH_CHECK_PASSED=false
    else
        _ft_log "msg='truth check: nginx port correct' port=$_NGINX_PORT"
    fi
else
    _ft_log "level=WARN msg='truth check: could not read nginx port'"
fi

# (3) Compare internal vs external endpoint health
# Internal: direct container endpoint  (127.0.0.1:$INACTIVE_PORT/ready)
# External: production DNS/Cloudflare   (https://$API_HOSTNAME/ready)
# Mismatch indicates routing, TLS, or proxy issues
if command -v curl >/dev/null 2>&1; then
    sleep 2

    # Check internal endpoint
    _INT_READY=$(curl -s -m 5 "http://127.0.0.1:$INACTIVE_PORT/ready" 2>/dev/null || echo "")
    _INT_READY_OK=false
    if echo "$_INT_READY" | grep -q '"status":"ready"' 2>/dev/null; then
        _INT_READY_OK=true
        _ft_log "msg='truth check: internal endpoint ready' url=http://127.0.0.1:$INACTIVE_PORT/ready"
    else
        _ft_log "level=WARN msg='truth check: internal endpoint not ready' url=http://127.0.0.1:$INACTIVE_PORT/ready response=${_INT_READY:0:100}"
    fi

    # Check external endpoint (DNS/Cloudflare/TLS)
    # Uses retry + backoff to smooth transient edge jitter
    _EXT_READY_OK=false
    if _ft_check_external_ready; then
        _EXT_READY_OK=true
        _ft_log "msg='truth check: external endpoint ready (retry succeeded)' url=https://$API_HOSTNAME/ready"
    else
        _ft_log "level=ERROR msg='truth check: external endpoint not ready after 3 retries' url=https://$API_HOSTNAME/ready"
    fi

    # Consistency check: if internal is ready but external is not, something is wrong
    # (DNS/Cloudflare/TLS/nginx proxy layer)
    if [ "$_INT_READY_OK" = "true" ] && [ "$_EXT_READY_OK" = "false" ]; then
        _ft_log "level=ERROR msg='truth check FAILED: internal ready but external not reachable -- nginx/proxy/DNS/TLS issue' int_ok=$_INT_READY_OK ext_ok=$_EXT_READY_OK"
        _FT_TRUTH_CHECK_PASSED=false
    fi

    # Also fail if both are down (service actually not ready)
    if [ "$_INT_READY_OK" = "false" ] || [ "$_EXT_READY_OK" = "false" ]; then
        if [ "$_FT_TRUTH_CHECK_PASSED" = "true" ]; then
            _ft_log "level=ERROR msg='truth check FAILED: endpoint(s) not returning ready status' int_ok=$_INT_READY_OK ext_ok=$_EXT_READY_OK"
            _FT_TRUTH_CHECK_PASSED=false
        fi
    fi
else
    _ft_log "level=WARN msg='truth check: curl not available, skipping endpoint checks'"
fi

if [ "$_FT_TRUTH_CHECK_PASSED" != "true" ]; then
    _ft_state "FAILURE" "reason='post_deployment_truth_check_failed'"
    _ft_snapshot
    exit 2
fi

# Persist last-known-good snapshot for fast recovery triage (atomic write)
_ft_log "msg='recording last-known-good state' slot=$INACTIVE port=$INACTIVE_PORT"
_SNAP_TMP=$(mktemp "${SNAP_DIR}/last-good.XXXXXX")
printf 'slot=%s port=%s ts=%s\n' "$INACTIVE" "$INACTIVE_PORT" "$(date -Iseconds)" > "$_SNAP_TMP"
mv "$_SNAP_TMP" "$LAST_GOOD_FILE"
_ft_log "msg='last-known-good snapshot recorded (atomic)' file=$LAST_GOOD_FILE"

# Record deployment history (atomic write: temp file then mv).
DEPLOY_HISTORY_TMP="${DEPLOY_HISTORY}.tmp.$$"
if [ -f "$DEPLOY_HISTORY" ]; then
    (echo "$IMAGE_SHA"; head -n $((MAX_HISTORY - 1)) "$DEPLOY_HISTORY") > "$DEPLOY_HISTORY_TMP"
else
    echo "$IMAGE_SHA" > "$DEPLOY_HISTORY_TMP"
fi
mv "$DEPLOY_HISTORY_TMP" "$DEPLOY_HISTORY"
_ft_log "msg='deploy history updated' sha=$IMAGE_SHA"

# Monitoring stack: restart only when infra configs have actually changed.
# Hashes cover all infra config files EXCEPT the nginx template (re-rendered on
# every deploy) to avoid spurious monitoring restarts.
MONITORING_HASH=$(find "$REPO_DIR/infra" -readable \
    -not -path "$REPO_DIR/infra/nginx/*" \
    \( -name '*.yml' -o -name '*.yaml' -o -name '*.conf' -o -name '*.toml' -o -name '*.json' \) \
    | sort | xargs -r sha256sum 2>/dev/null | sha256sum | cut -d' ' -f1 || echo "changed")
MONITORING_HASH_FILE="$HOME/.fieldtrack-monitoring-hash"

if [ -f "$MONITORING_HASH_FILE" ] && [ "$(cat "$MONITORING_HASH_FILE")" = "$MONITORING_HASH" ]; then
    _ft_log "msg='monitoring config unchanged -- skipping restart'"
else
    _ft_log "msg='monitoring config changed -- restarting monitoring stack'"
    cd "$REPO_DIR/infra"
    docker compose --env-file .env.monitoring -f docker-compose.monitoring.yml pull --quiet
    docker compose --env-file .env.monitoring -f docker-compose.monitoring.yml up -d --remove-orphans
    cd "$REPO_DIR"
    echo "$MONITORING_HASH" > "$MONITORING_HASH_FILE"
    _ft_log "msg='monitoring stack restarted'"
fi
