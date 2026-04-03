# Deployment Guide

This document covers deploying FieldTrack API to a Linux VPS using the included blue-green deployment system.

> **Scope:** This document covers the API only. Nginx configuration, TLS, and the monitoring stack are managed by the **infra repository**.

---

## Prerequisites

- A Linux VPS (Ubuntu 22.04 recommended) accessible via SSH
- A GitHub Container Registry (GHCR) account with push access to the repository
- GitHub Actions secrets configured (see [CI/CD Setup](#cicd-setup))
- Docker installed on the VPS
- Nginx already running and configured via the **infra repository**

---

## API Deployment

1. SSH into VPS
2. Ensure nginx is running (managed via infra repository)
3. Copy `.env.example` to `.env` and fill in all values
4. Deploy: `./scripts/deploy.sh <sha>`
5. Confirm health: `curl https://<domain>/health`

## Rollback

```bash
./scripts/deploy.sh --rollback           # interactive
./scripts/deploy.sh --rollback --auto    # non-interactive (CI)
```

## Monitoring

The observability stack (Prometheus, Grafana, Loki, Tempo) is **handled by the infra repository**. The API exposes:
- `GET /metrics` — Prometheus-format metrics (protected by `METRICS_SCRAPE_TOKEN`)
- Traces exported via OTLP to `TEMPO_ENDPOINT`

---

## Blue-Green Deployment

The deployment uses a blue-green strategy for zero-downtime releases.

### How It Works

The VPS keeps **two named slots** (`api-blue`, `api-green`). Only the active slot receives traffic through nginx over `api_network`.
The API containers do **not** bind host ports.

On each deploy:

1. The new image is pulled from GHCR
2. The **inactive** container is replaced with the new image
3. The new container is health-checked via `GET /health`
4. Nginx upstream is switched to the new container (`nginx -s reload`)
5. The previously active container is stopped and removed
6. The deployed SHA is prepended to `.deploy_history` (keeps last 5)

### Manual Deploy

```bash
# SSH into the VPS
cd $HOME/api

# Deploy a specific image SHA (e.g. from CI output)
./scripts/deploy.sh a4f91c2
```

---

## Rollback

To instantly revert to the previous deployment:

```bash
cd $HOME/api
./scripts/deploy.sh --rollback
```

The script:
1. Reads `.deploy_history` (requires at least 2 recorded deployments)
2. Displays the full history with current/target markers
3. Prompts for confirmation before proceeding
4. Redeploys the previous SHA — no rebuild, image already in GHCR

**Typical rollback time: under 10 seconds.**

For full rollback system documentation, see [ROLLBACK_SYSTEM.md](ROLLBACK_SYSTEM.md).

---

## Environment Variables

Copy `.env.example` to `.env` on the VPS and fill in all values before the first deploy.

See [README.md](../README.md) and [env-contract.md](env-contract.md) for the full variable reference.

---

## Health Endpoints

| Endpoint | Purpose | Deploy gate |
|----------|---------|-------------|
| `GET /health` | Liveness — returns `{"status":"ok"}` after bootstrap | **YES** |
| `GET /ready` | Dependency check (Redis + Supabase) | NO — informational only |

The deploy script uses `/health` exclusively. `/ready` failing does not block a deployment.

---

## Troubleshooting

**Deployment hangs on health check**  
The new container failed to start. Check Docker logs:
```bash
docker logs api-green   # or api-blue
```

**Rollback fails: "insufficient deployment history"**  
Only one deployment has been recorded. Deploy manually with a known-good SHA:
```bash
./scripts/deploy.sh <known-good-sha>
```

**Container image not found in GHCR**  
The SHA must match a tag pushed to GHCR. Verify with:
```bash
docker pull ghcr.io/fieldtrack-tech/api:<sha>
```

**Nginx fails to reload**  
Nginx is managed by the infra repository. Check its configuration and reload there.

**API starts but /ready fails**  
Acceptable — Redis or Supabase may be temporarily unavailable. The deploy is still considered successful if `/health` returns 200.
