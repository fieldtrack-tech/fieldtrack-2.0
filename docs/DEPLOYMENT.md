# Deployment Guide

This document covers deploying FieldTrack 2.0 to a Linux VPS using the included blue-green deployment system.

---

## Prerequisites

- A Linux VPS (Ubuntu 22.04 recommended) accessible via SSH
- A GitHub Container Registry (GHCR) account with push access to the repository
- GitHub Actions secrets configured (see [CI/CD Setup](#cicd-setup))
- Docker and Docker Compose installed on the VPS (handled by `vps-setup.sh`)

---

## Initial VPS Provisioning

The `vps-setup.sh` script handles the full first-time setup of a fresh VPS:

```bash
# Copy the script to the VPS and run as root
scp backend/scripts/vps-setup.sh root@your-server:/tmp/
ssh root@your-server 'bash /tmp/vps-setup.sh'
```

This script:

1. Installs Docker, Docker Compose, Nginx, and system dependencies
2. Creates a dedicated `deploy` OS user with limited permissions
3. Clones the repository and initialises the directory structure
4. Obtains a TLS certificate via Let's Encrypt (`certbot`)
5. Configures Nginx as a reverse proxy (TLS termination + blue-green upstream switching)
6. Sets up a `systemd` service for auto-restart on boot
7. Configures log rotation and minimal `ufw` firewall rules
8. Starts the monitoring stack (Prometheus, Grafana, Loki, Tempo)

Before running, update the variables at the top of the script:

```bash
DOMAIN="yourdomain.com"         # Your server's domain
DEPLOY_USER="fieldtrack"        # OS user to run the service
GH_USER="your-github-username"  # GitHub username (for GHCR)
REPO_URL="https://github.com/your-username/FieldTrack-2.0.git"
```

---

## CI/CD Setup

The GitHub Actions workflow at `.github/workflows/deploy.yml` handles automated deployment on every push to `master`.

### Required GitHub Secrets

Configure these in your repository: **Settings → Secrets and variables → Actions**

| Secret | Description |
|--------|-------------|
| `DO_HOST` | VPS IP address or hostname |
| `DO_USER` | SSH username on the VPS |
| `DO_SSH_KEY` | Private SSH key with access to the VPS |

`GITHUB_TOKEN` is provided automatically by GitHub Actions — no manual setup required.

### Pipeline Flow

```
Push to master
      │
      ▼
┌─────────────────────┐
│  test job           │
│  1. npm ci          │
│  2. tsc --noEmit    │
│  3. npm run test    │
└──────┬──────────────┘
       │ passes
       ▼
┌──────────────────────────────────────────┐
│  build-and-deploy job                    │
│  1. Docker Buildx (GHA cache)            │
│  2. Push to GHCR (SHA tag + latest tag)  │
│  3. SSH → VPS → deploy-bluegreen.sh      │
└──────────────────────────────────────────┘
```

Build-and-deploy is skipped on pull requests — only the `test` job runs, acting as a PR gate.

---

## Blue-Green Deployment

The deployment uses a blue-green strategy for zero-downtime releases.

### How It Works

The VPS always runs **two containers** (`backend-blue` on port 3001, `backend-green` on port 3002). Nginx routes all traffic to whichever is currently active.

On each deploy:

1. The new image is pulled from GHCR
2. The **inactive** container is replaced with the new image
3. Health checks poll `GET /health` until the new container is ready (up to 60 s)
4. Nginx upstream is switched to the new container (`nginx -s reload`)
5. The previously active container is stopped and removed
6. The deployed SHA is prepended to `.deploy_history` (keeps last 5)

### Manual Deploy

```bash
# SSH into the VPS
cd /path/to/FieldTrack-2.0/backend

# Deploy a specific image SHA (e.g. from CI output)
./scripts/deploy-bluegreen.sh a4f91c2

# Deploy the latest tag
./scripts/deploy-bluegreen.sh latest
```

---

## Rollback

To instantly revert to the previous deployment:

```bash
cd /path/to/FieldTrack-2.0/backend
./scripts/rollback.sh
```

The script:
1. Reads `.deploy_history` (requires at least 2 recorded deployments)
2. Displays the full history with current/target markers
3. Prompts for confirmation before proceeding
4. Calls `deploy-bluegreen.sh <previous-sha>` — no rebuild, image already in GHCR

**Typical rollback time: under 10 seconds.**

To deploy any specific historical SHA:

```bash
./scripts/deploy-bluegreen.sh 7b3e9f1
```

For full rollback system documentation, see [ROLLBACK_SYSTEM.md](ROLLBACK_SYSTEM.md).

---

## Monitoring Stack

The observability stack runs alongside the application on the same VPS:

```bash
cd infra
docker compose -f docker-compose.monitoring.yml up -d
```

| Service | Default Port | Access |
|---------|-------------|--------|
| Grafana | 3001 (internal) | Via Nginx proxy or direct |
| Prometheus | 9090 (internal) | Internal only |
| Loki | 3100 (internal) | Internal only |
| Tempo | 3200 / 4318 | Internal only |

The pre-built Grafana dashboard (`infra/grafana/dashboards/fieldtrack.json`) is auto-provisioned and covers HTTP metrics, queue depth, latency, and Redis health.

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` on the VPS and fill in all values before the first deploy.

See [backend/README.md](../backend/README.md) for the full variable reference.

---

## Health Check

The application exposes a public health endpoint:

```bash
curl https://yourdomain.com/health
# {"status":"ok","timestamp":"2026-03-10T12:00:00.000Z"}
```

The deployment script uses this endpoint to validate readiness before switching Nginx traffic.

---

## Troubleshooting

**Deployment hangs on health check**  
The new container failed to start. Check Docker logs:
```bash
docker logs backend-green   # or backend-blue
```

**Rollback fails: "insufficient deployment history"**  
Only one deployment has been recorded. Deploy manually with a known-good SHA:
```bash
./scripts/deploy-bluegreen.sh <known-good-sha>
```

**Container image not found in GHCR**  
The SHA must match a tag pushed to GHCR. Verify with:
```bash
docker pull ghcr.io/<your-username>/fieldtrack-backend:<sha>
```

**Nginx fails to reload**  
Check the Nginx config syntax:
```bash
nginx -t
```
