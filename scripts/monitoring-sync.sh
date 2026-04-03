#!/usr/bin/env bash
# =============================================================================
# monitoring-sync.sh — Self-Healing Monitoring Stack Sync
#
# Called by the CI sync-monitoring job after every production deploy.
#
# Responsibilities:
#   1. SELF-HEAL  — create missing .env.monitoring from example if absent
#   2. BOOTSTRAP  — detect placeholder values and warn (cold-start mode)
#   3. ENSURE NETWORK — create api_network if it does not exist
#   4. SYNC       — idempotent `docker compose up -d` (starts if down, no-ops if healthy)
#   5. VALIDATE   — confirm prometheus / grafana / alertmanager are running + healthy
#   6. ENFORCE    — exit 1 if any required container is not healthy after timeout
#
# Self-healing rules (safe defaults):
#   - .env.monitoring missing  → copy from infra/.env.monitoring.example + warn
#   - .env.monitoring has placeholders (change-me) → skip health wait, warn operator
#   - api_network missing      → create it
#   - alertmanager rendered config missing → render it
#
# Timeouts:
#   - Per-container health check: 60 seconds max (20 attempts × 3 s)
#   - Polling interval: 3 seconds
#   - Total wait tracked to prevent cascading timeouts
#
# Exit codes:
#   0  All required monitoring containers are healthy
#   1  One or more required containers failed to become healthy (deploy must fail)
#
# Required env (exported by load-env.sh / present in DEPLOY_ROOT):
#   DEPLOY_ROOT   — absolute path to the repository root on the VPS
# =============================================================================
set -euo pipefail
trap '_ft_mon_trap "$LINENO"' ERR

# ─────────────────────────────────────────────────────────────────────────
# STATE CLASSIFICATION
# ─────────────────────────────────────────────────────────────────────────
DEPLOY_STATE="SUCCESS"
trap '[ $? -ne 0 ] && DEPLOY_STATE="FAILED" || true' EXIT

# ---------------------------------------------------------------------------
# LOGGING
# ---------------------------------------------------------------------------
_FT_MON_LOG_FILE="${DEPLOY_LOG_FILE:-/var/log/api/deploy.log}"
_LOG_DIR="$(dirname "$_FT_MON_LOG_FILE")"
if ! mkdir -p "$_LOG_DIR" 2>/dev/null; then
    _LOG_DIR="$HOME/api/logs"
    _FT_MON_LOG_FILE="$_LOG_DIR/deploy.log"
    mkdir -p "$_LOG_DIR"
fi

_log() {
    printf '[MON-SYNC] ts=%s %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$*" \
        | tee -a "$_FT_MON_LOG_FILE" >&2
}

_ft_mon_trap() {
    printf '[MON-SYNC] ts=%s level=ERROR msg="unexpected failure at line %s"\n' \
        "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" >&2
}

# ---------------------------------------------------------------------------
# RESOLVE PATHS
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DEPLOY_ROOT="${DEPLOY_ROOT:-$HOME/api}"

if [ ! -d "$DEPLOY_ROOT" ]; then
    _log "level=ERROR msg='DEPLOY_ROOT not found' path=$DEPLOY_ROOT"
    exit 1
fi

INFRA_DIR="$DEPLOY_ROOT/infra"
MON_ENV="$INFRA_DIR/.env.monitoring"
MON_ENV_EXAMPLE="$INFRA_DIR/.env.monitoring.example"
MON_COMPOSE="$INFRA_DIR/docker-compose.monitoring.yml"
ALERTMANAGER_RENDERED="$INFRA_DIR/alertmanager/alertmanager.rendered.yml"
RENDER_SCRIPT="$INFRA_DIR/scripts/render-alertmanager.sh"

_log "msg='monitoring-sync started' deploy_root=$DEPLOY_ROOT state=$DEPLOY_STATE"

# ---------------------------------------------------------------------------
# STEP 1 — SELF-HEAL: .env.monitoring
# Create from example if missing instead of failing hard.
# The user MUST still fill in real values after first-time creation.
# ---------------------------------------------------------------------------
BOOTSTRAP_MODE=false
if [ ! -f "$MON_ENV" ]; then
    if [ -f "$MON_ENV_EXAMPLE" ]; then
        cp "$MON_ENV_EXAMPLE" "$MON_ENV"
        chmod 600 "$MON_ENV"
        BOOTSTRAP_MODE=true
        _log "level=WARN msg='monitoring env file missing — created from example' path=$MON_ENV"
        _log "level=WARN msg='ACTION REQUIRED: edit $MON_ENV with real GRAFANA_ADMIN_PASSWORD, METRICS_SCRAPE_TOKEN, ALERTMANAGER_SLACK_WEBHOOK'"
    else
        _log "level=ERROR msg='monitoring env file and example both missing' path=$MON_ENV"
        DEPLOY_STATE="FAILED"
        exit 1
    fi
else
    chmod 600 "$MON_ENV"
    _log "msg='monitoring env file exists' path=$MON_ENV"
fi

# ─────────────────────────────────────────────────────────────────────────
# STEP 1B — BOOTSTRAP MODE: Detect placeholders
# If .env.monitoring contains default 'change-me' values, we're in cold-start.
# Skip health polling to avoid timeout on misconfigured system.
# ─────────────────────────────────────────────────────────────────────────
if grep -q "change-me" "$MON_ENV" 2>/dev/null; then
    BOOTSTRAP_MODE=true
    _log "level=WARN msg='bootstrap mode detected: .env.monitoring contains placeholder values' action='skipping health check'"
    _log "level=WARN msg='OPERATOR ACTION: edit infra/.env.monitoring and set real values, then re-run deploy'"
fi

# ---------------------------------------------------------------------------
# STEP 2 — SELF-HEAL: Docker network api_network
# ---------------------------------------------------------------------------
if ! docker network ls --format '{{.Name}}' | grep -Eq '^api_network$'; then
    _log "msg='api_network missing — creating' driver=bridge"
    docker network create --driver bridge api_network
    _log "msg='api_network created'"
else
    _log "msg='api_network exists'"
fi

# ---------------------------------------------------------------------------
# STEP 3 — SELF-HEAL: Render alertmanager config
# render-alertmanager.sh is idempotent; always safe to run.
# ---------------------------------------------------------------------------
if [ -x "$RENDER_SCRIPT" ]; then
    _log "msg='rendering alertmanager config'"
    bash "$RENDER_SCRIPT"
    _log "msg='alertmanager config rendered' file=$ALERTMANAGER_RENDERED"
elif [ ! -f "$ALERTMANAGER_RENDERED" ]; then
    _log "level=ERROR msg='render-alertmanager.sh not found AND rendered config missing' script=$RENDER_SCRIPT"
    exit 1
else
    _log "level=WARN msg='render-alertmanager.sh not found but rendered config exists — continuing' script=$RENDER_SCRIPT"
fi

# ---------------------------------------------------------------------------
# STEP 4 — SYNC: docker compose up -d (idempotent)
# Creates containers that are missing; leaves healthy containers untouched.
# ---------------------------------------------------------------------------
_log "msg='starting monitoring stack (idempotent)'"
cd "$INFRA_DIR"
docker compose --env-file .env.monitoring -f docker-compose.monitoring.yml up -d --remove-orphans
cd "$DEPLOY_ROOT"
_log "msg='docker compose up -d complete'"

# ---------------------------------------------------------------------------
# STEP 5 — VALIDATE: wait for required containers to become healthy
#
# Required containers (must be healthy for deploy to succeed):
#   prometheus   — metrics collection (health: http://localhost:9090/-/healthy)
#   alertmanager — alert routing      (health: http://localhost:9093/-/healthy)
#   grafana      — dashboards         (health: http://localhost:3001/api/health)
#
# Strategy: poll docker inspect for Health.Status.
# Times out at 60 s per container (20 attempts × 3 s).
# ---------------------------------------------------------------------------

_wait_container_healthy() {
    local name="$1"
    local max_wait_sec="${2:-60}"
    local interval="${3:-3}"

    _log "msg='waiting for container health' container=$name max_wait_sec=$max_wait_sec interval=$interval"

    local waited=0
    while [ $waited -lt $max_wait_sec ]; do
        # Explicit container name enforcement: use docker inspect directly.
        # Avoids fragile grep patterns; fails fast if container name is wrong.
        if ! docker inspect "$name" >/dev/null 2>&1; then
            _log "level=WARN msg='container does not exist or inspect failed' container=$name waited_sec=$waited"
            sleep "$interval"
            waited=$((waited + interval))
            continue
        fi

        # Container exists — check health status
        local health_status
        health_status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$name" 2>/dev/null || echo "inspect-failed")

        case "$health_status" in
            healthy)
                _log "msg='container healthy' container=$name waited_sec=$waited"
                return 0
                ;;
            no-healthcheck)
                # Container has no Docker healthcheck — verify it is at least running.
                local running
                running=$(docker inspect --format='{{.State.Running}}' "$name" 2>/dev/null || echo "false")
                if [ "$running" = "true" ]; then
                    _log "msg='container running (no healthcheck configured)' container=$name"
                    return 0
                fi
                ;;
            starting)
                _log "msg='container starting' container=$name waited_sec=$waited/$max_wait_sec"
                ;;
            unhealthy)
                _log "level=WARN msg='container unhealthy' container=$name waited_sec=$waited/$max_wait_sec"
                ;;
            inspect-failed)
                _log "level=WARN msg='docker inspect failed' container=$name waited_sec=$waited"
                ;;
            *)
                _log "level=WARN msg='unknown health status' container=$name status=$health_status waited_sec=$waited"
                ;;
        esac

        sleep "$interval"
        waited=$((waited + interval))
    done

    _log "level=ERROR msg='container did not become healthy within timeout' container=$name max_wait_sec=$max_wait_sec"
    docker logs "$name" --tail 30 >&2 2>/dev/null || true
    return 1
}

_check_endpoint() {
    local name="$1"
    local url="$2"

    local status
    status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")

    if [ "$status" = "200" ]; then
        _log "msg='endpoint healthy' container=$name url=$url status=200"
        return 0
    else
        _log "level=ERROR msg='endpoint unhealthy' container=$name url=$url status=$status"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────
# SKIP HEALTH CHECKS IN BOOTSTRAP MODE
# ─────────────────────────────────────────────────────────────────────────
if [ "$BOOTSTRAP_MODE" = "true" ]; then
    DEPLOY_STATE="BOOTSTRAP"
    _log "level=WARN msg='bootstrap mode detected — skipping container health checks' state=$DEPLOY_STATE"
    _log "level=WARN msg='ACTION: configure infra/.env.monitoring with real values and re-run deploy to enable monitoring'"
    exit 0
fi

# ─────────────────────────────────────────────────────────────────────────
# ENFORCE: Container name validation + health checks
# ─────────────────────────────────────────────────────────────────────────
# Exact container name enforcement: fail fast if any required container is missing
REQUIRED_CONTAINERS=("prometheus" "alertmanager" "grafana")
for c in "${REQUIRED_CONTAINERS[@]}"; do
    if ! docker inspect "$c" >/dev/null 2>&1; then
        _log "level=ERROR msg='required container missing' container=$c"
        DEPLOY_STATE="FAILED"
        docker ps --format 'table {{.Names}}\t{{.Status}}' 2>/dev/null >&2 || true
        exit 1
    fi
done

MONITORING_ERRORS=0

# ── Prometheus ──────────────────────────────────────────────────────────────
if _wait_container_healthy "prometheus" 60 3; then
    _check_endpoint "prometheus" "http://localhost:9090/-/healthy" || MONITORING_ERRORS=$((MONITORING_ERRORS + 1))
else
    MONITORING_ERRORS=$((MONITORING_ERRORS + 1))
fi

# ── Alertmanager ─────────────────────────────────────────────────────────────
if _wait_container_healthy "alertmanager" 60 3; then
    _check_endpoint "alertmanager" "http://localhost:9093/-/healthy" || MONITORING_ERRORS=$((MONITORING_ERRORS + 1))
else
    MONITORING_ERRORS=$((MONITORING_ERRORS + 1))
fi

# ── Grafana ──────────────────────────────────────────────────────────────────
# Grafana may take longer to start; allow 60s timeout.
if _wait_container_healthy "grafana" 60 3; then
    # Grafana health endpoint returns 200 with JSON when ready.
    _check_endpoint "grafana" "http://localhost:3001/api/health" || MONITORING_ERRORS=$((MONITORING_ERRORS + 1))
else
    MONITORING_ERRORS=$((MONITORING_ERRORS + 1))
fi

# ---------------------------------------------------------------------------
# STABILITY WINDOW — Verify containers remain healthy after initial pass
# This catches "flaky startup" where containers pass health check but crash
# immediately after. Wait settle window then re-verify all containers.
# ---------------------------------------------------------------------------
_log "msg='entering stability window (5s settle + re-check)'"
sleep 5

for c in "${REQUIRED_CONTAINERS[@]}"; do
    STABLE_STATUS=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$c" 2>/dev/null || echo "inspect-failed")
    if [ "$STABLE_STATUS" != "healthy" ] && [ "$STABLE_STATUS" != "running" ]; then
        _log "level=ERROR msg='container became unhealthy during stability window' container=$c status=$STABLE_STATUS"
        MONITORING_ERRORS=$((MONITORING_ERRORS + 1))
    fi
done

# ---------------------------------------------------------------------------
# PROMETHEUS SCRAPING VALIDATION — Ensure Prometheus is actually working
# A healthy Prometheus container is useless if it's not scraping targets.
# Query the Prometheus API to verify targets are UP.
# ---------------------------------------------------------------------------
_log "msg='validating prometheus scraping targets'"
PROM_TARGETS=$(curl -s "http://localhost:9090/api/v1/targets" 2>/dev/null || echo "")

if [ -z "$PROM_TARGETS" ]; then
    _log "level=WARN msg='prometheus API query failed — cannot validate scraping (proceeding with caution)'"
elif ! echo "$PROM_TARGETS" | grep -q '"health":"up"' 2>/dev/null; then
    _log "level=ERROR msg='prometheus has no healthy scrape targets' curl_response=${PROM_TARGETS:0:200}"
    MONITORING_ERRORS=$((MONITORING_ERRORS + 1))
else
    # Count active targets
    ACTIVE_TARGETS=$(echo "$PROM_TARGETS" | grep -o '"health":"up"' | wc -l)
    _log "msg='prometheus scraping targets' active_count=$ACTIVE_TARGETS"
fi

# ---------------------------------------------------------------------------
# FINAL ENFORCEMENT
# ---------------------------------------------------------------------------
if [ "$MONITORING_ERRORS" -gt 0 ]; then
    _log "level=ERROR msg='monitoring validation failed' errors=$MONITORING_ERRORS state=$DEPLOY_STATE"
    _log "level=ERROR msg='container state at failure:'"
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null >&2 || true
    DEPLOY_STATE="FAILED"
    exit 1
fi

_log "msg='monitoring-sync complete' state=$DEPLOY_STATE containers=healthy required=3"
exit 0
