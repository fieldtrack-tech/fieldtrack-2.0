# FieldTrack 2.0

> Production-grade multi-tenant backend for real-time field workforce tracking — attendance, GPS, expense management, and admin analytics.

[![CI](https://github.com/fieldtrack-tech/api/actions/workflows/deploy.yml/badge.svg)](https://github.com/fieldtrack-tech/api/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org)

---

## Overview

FieldTrack 2.0 is a production-ready REST API for managing field workforce operations. It provides secure, multi-tenant APIs for tracking employee attendance, real-time GPS location, expense workflows, and aggregate analytics.

**Boundaries:** This repository is the API only. Infrastructure (nginx, monitoring stack, VPS provisioning) lives in the infra repository.

---

## Features

- **Multi-tenant isolation** — every query is scoped to the authenticated organization; cross-tenant access is architecturally impossible
- **Attendance sessions** — check-in / check-out lifecycle with state machine enforcement
- **Real-time GPS ingestion** — single and batch endpoints (up to 100 points), idempotent upsert, per-user rate limiting
- **Async distance calculation** — BullMQ background worker computes Haversine distance after check-out; never blocks the HTTP response
- **Expense workflow** — PENDING → APPROVED / REJECTED lifecycle, with re-review guard
- **Admin analytics** — org-wide summaries, per-user breakdowns, configurable leaderboard
- **Redis-backed rate limiting** — per-JWT-sub limits survive corporate NAT and horizontal scaling
- **Security** — Helmet, CORS, Redis rate limiter, brute-force detection
- **Distributed tracing** — OpenTelemetry → OTLP; trace IDs injected into every Pino log line
- **Blue-green zero-downtime deployments** — nginx upstream swap, health-check gate, 5-SHA rollback history
- **Full test suite** — Vitest unit + integration coverage; CI blocks deploy on failure

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 24 (Debian slim / distroless) |
| **Language** | TypeScript 5.9 (strict, ESM) |
| **Framework** | Fastify 5 |
| **Database** | PostgreSQL via [Supabase](https://supabase.com) |
| **Auth** | JWT (`@fastify/jwt`) — Supabase-issued tokens |
| **Job Queue** | [BullMQ](https://docs.bullmq.io/) + Redis |
| **Validation** | [Zod 4](https://zod.dev/) |
| **Tracing** | OpenTelemetry (OTLP export) |
| **Security** | `@fastify/helmet` · `@fastify/cors` · `@fastify/rate-limit` · `@fastify/compress` |
| **Testing** | [Vitest](https://vitest.dev/) |
| **CI/CD** | GitHub Actions → GHCR → Blue-Green VPS Deploy |

---

## Local Development

**Prerequisites:** Node.js ≥ 24, npm, a running Redis instance, a Supabase project

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env — fill in SUPABASE_URL, keys, REDIS_URL, and CORS_ORIGIN

# Start in development mode (hot reload)
npm run dev
```

The API will start on `http://localhost:3000`.

---

## Environment Variables

All variables are validated at startup by `src/config/env.ts` (Zod schema, fail-fast).

### URLs

| Variable | Required | Purpose |
|----------|:---:|---------|
| `API_BASE_URL` | ✅ | Canonical public URL of this API (`https://…`, no trailing slash) |
| `APP_BASE_URL` | ✅ | Root URL of the application — used in email footers and redirects |
| `FRONTEND_BASE_URL` | ✅ prod | URL of the web frontend — used to build email links |

### Runtime

| Variable | Required | Default | Purpose |
|----------|:---:|---------|---------|
| `CONFIG_VERSION` | ✅ | `"1"` | Schema version guard — must be `"1"` |
| `APP_ENV` | ✅ | `development` | Application environment — drives all app-level logic |
| `PORT` | ✅ | `3000` | Container listen port |

### Auth & Data

| Variable | Required | Purpose |
|----------|:---:|---------|
| `SUPABASE_URL` | ✅ | Supabase project URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase public/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key — bypasses RLS, never expose to clients |
| `SUPABASE_JWT_SECRET` | ✅ | JWT signing secret (≥ 32 chars, HS256) |
| `REDIS_URL` | ✅ | Redis connection URL (`redis://` or `rediss://`) |

### Security

| Variable | Required in Prod | Default | Purpose |
|----------|:---:|---------|---------|
| `CORS_ORIGIN` | ✅ | `""` | Comma-separated allowed CORS origins. Empty activates localhost fallback in dev |
| `METRICS_SCRAPE_TOKEN` | ✅ | — | Token required to scrape `/metrics`. Unset = open in dev/test |
| `TEMPO_ENDPOINT` | — | `http://tempo:4318` | OTLP HTTP endpoint for trace export |

> **Observability variables (`METRICS_SCRAPE_TOKEN`, `TEMPO_ENDPOINT`) are optional for standalone operation.** The API starts and handles requests without them. `METRICS_SCRAPE_TOKEN` gates the `/metrics` endpoint (unset = endpoint is open, safe in dev/test). `TEMPO_ENDPOINT` controls where traces are exported; if the Tempo collector is unreachable, traces are silently dropped with no impact to request handling. The monitoring stack that scrapes these endpoints is managed in the [infra repository].

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server with hot reload |
| `npm run typecheck` | TypeScript type check (no emit) |
| `npm test` | Run full test suite (Vitest) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Start compiled production server |
| `./scripts/deploy.sh <sha>` | Blue-green deploy a specific image SHA |
| `./scripts/deploy.sh --rollback` | Interactive rollback to previous SHA |
| `./scripts/deploy.sh --rollback --auto` | Non-interactive rollback (CI) |

---

## Health Endpoints

| Endpoint | Purpose | Deploy Gate |
|----------|---------|-------------|
| `GET /health` | Liveness check — returns `{"status":"ok"}` once the server bootstraps | **YES** — used by deploy.sh and CI |
| `GET /ready` | Dependency check — verifies Redis and Supabase connectivity | NO — informational only, not a deploy gate |

`/health` returns 200 after server bootstrap regardless of dependency status. `/ready` failing does not block a deployment; a degraded-but-running API is preferred over a stuck deploy.

---

## Deployment Overview

> **First-deployment requirement:** The API container joins `api_network`. On a fresh VPS, **nginx** (reverse-proxy) and **Redis** must already be running and attached to that network via the infra repository before the first `deploy.sh` run. Subsequent deploys are fully self-contained.

## Infra Requirement

This API requires an external infra repository.

Expected on server (all under **`INFRA_ROOT=/opt/infra`**):
- `$INFRA_ROOT/docker-compose.nginx.yml` — operator runs nginx from here
- `$INFRA_ROOT/docker-compose.redis.yml` — operator runs Redis from here
- `$INFRA_ROOT/nginx/live`, `nginx/backup`, `nginx/api.conf` — layout enforced by `deploy.sh` and readiness check
- nginx container on `api_network`; Redis at `redis:6379` on `api_network`

Deployments run automatically via GitHub Actions on every push to `master` (after CodeQL scan passes).

```
CodeQL deep scan (master)
  → validate (typecheck + audit) ──┐
  → test-api ─────────────────────┼──► build-scan-push ──► vps-readiness-check ──► deploy
                                  ┘                                                     │
                                                       api-health-gate ◄────────────────┘
                                                             │
                                                       health-and-smoke ──► rollback (on failure)
```

**Blue-green strategy:** The VPS always runs two containers (`api-blue`, `api-green`). On each deploy, the inactive slot is updated and nginx is reloaded to point at it. The previous slot is stopped only after the health gate passes.

**nginx is managed by the infra repository.** The API container joins `api_network`; nginx is expected to already be running and configured.

**Manual deploy:**
```bash
./scripts/deploy.sh <sha>
```

**Rollback:**
```bash
./scripts/deploy.sh --rollback
```

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for full deployment details.

---

## Project Structure

```
api/
├── src/               # Application source
│   ├── modules/       # Domain modules (attendance · locations · expenses · analytics)
│   ├── plugins/       # Fastify plugins (JWT · metrics · security)
│   ├── workers/       # BullMQ distance calculation worker
│   ├── middleware/    # Auth + role guard
│   └── utils/         # Shared utilities (errors · response · tenant)
├── tests/             # Vitest unit and integration tests
├── scripts/           # Deploy, rollback, and utility scripts
├── docs/              # Project documentation
└── .github/workflows/ # GitHub Actions CI/CD
```

> The web frontend is in a separate repository: [fieldtrack-tech/web](https://github.com/fieldtrack-tech/web)  
> Infrastructure (nginx, monitoring, VPS setup) is in a separate infra repository.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System design, component diagrams, data flows |
| [API Reference](docs/API_REFERENCE.md) | All endpoints, auth requirements, request/response schemas, error codes |
| [Deployment Guide](docs/DEPLOYMENT.md) | VPS provisioning, CI/CD setup, blue-green deploy, troubleshooting |
| [Rollback System](docs/ROLLBACK_SYSTEM.md) | Rollback architecture, deployment history, safety features |
| [Rollback Quick Reference](docs/ROLLBACK_QUICKREF.md) | Fast operator reference card |
| [Environment Contract](docs/env-contract.md) | All environment variables, naming rules |
| [Infra Contract](docs/infra-contract.md) | External infra responsibilities and path contract (`INFRA_ROOT`) |
| [Changelog](CHANGELOG.md) | Full history of every phase |
| [Contributing](CONTRIBUTING.md) | Contribution workflow, branching, code conventions |
| [Security Policy](SECURITY.md) | How to report vulnerabilities |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, branch naming conventions, and commit format.

**Branch naming:**
```
feature/<description>   # new functionality
fix/<description>       # bug fixes
docs/<description>      # documentation
test/<description>      # test additions
chore/<description>     # maintenance / deps
```

**Commit format:**
```
type(scope): short imperative description
```
Allowed types: `feat` `fix` `refactor` `ci` `docs` `test` `chore`

All PRs require review from CODEOWNERS and must pass CI before merge.
