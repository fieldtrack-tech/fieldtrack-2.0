# Infra Contract

This document defines the **canonical naming contract** between the API repo and the
infra repo. All values here are the single source of truth. CI guards enforce these
values — any deviation blocks deployment.

---

## Docker Network

```
api_network
```

All containers that need to communicate must be attached to this network.
Docker DNS resolution (`api-blue`, `api-green`, `redis`, `nginx`) only works within it.

---

## Container Names

| Role | Name |
|---|---|
| Active API slot A | `api-blue` |
| Active API slot B | `api-green` |
| Cache / queue broker | `redis` |
| Reverse proxy | `nginx` |

API containers (`api-blue`, `api-green`) must **never** bind host ports.
All traffic reaches them via `nginx` → `api_network` → container DNS.

---

## Slot File

```
/var/lib/fieldtrack/active-slot
```

Contains one of: `blue` or `green`. Written atomically after nginx reload.
Persistent across reboots (in `/var/lib`, not tmpfs `/var/run`).

Backup (belt-and-suspenders):
```
/var/lib/fieldtrack/active-slot.backup
```

---

## Redis URL

```
REDIS_URL=redis://redis:6379
```

Must be used in all production and CI-production-simulation environments.
Local development may use `redis://localhost:6379` but that value must never
appear in `.env.example`, scripts, or workflows.

---

## nginx Config

Template location (infra repo, rendered by deploy.sh):
```
$INFRA_ROOT/nginx/api.conf          (template — contains __ACTIVE_CONTAINER__ placeholder)
$INFRA_ROOT/nginx/live/api.conf     (live, rendered config — what nginx reads)
$INFRA_ROOT/nginx/backup/           (rolling backup directory)
```

Default `INFRA_ROOT` on server: `/opt/infra`

---

## Health Endpoints

| Endpoint | Purpose | Used where |
|---|---|---|
| `/health` | Shallow liveness check (HTTP + process alive). **Deploy gate.** | `deploy.sh`, CI |
| `/ready` | Deep readiness (Redis, DB, workers). **Observability only.** | Post-deploy logging |

`deploy.sh` must use only `/health` as the deploy gate. `/ready` is never a blocking check.

---

## API Deploy Script Invariants

- `deploy.sh` **never** starts infra services (nginx, Redis) — only renders and reloads nginx config
- API containers run `--network api_network` with **no** `-p` (host port) bindings
- nginx reload is performed exactly once per deploy (inside `switch_nginx()`)
- Slot file is written **after** nginx reload — always reflects what nginx is actually serving

---

## External Dependencies (infra repo)

Required layout under **`INFRA_ROOT=/opt/infra`** (canonical; scripts default to this path):

```
$INFRA_ROOT/nginx/live/                    (directory — deploy writes live api.conf)
$INFRA_ROOT/nginx/backup/                  (directory — rolling backups)
$INFRA_ROOT/nginx/api.conf                 (template with placeholders — infra managed)
$INFRA_ROOT/docker-compose.nginx.yml      (operator starts nginx from here)
$INFRA_ROOT/docker-compose.redis.yml       (operator starts redis from here)
```

The API deploy script (`scripts/deploy.sh`) and `scripts/vps-readiness-check.sh` fail fast if these paths are missing. Compose files are not executed by deploy; they must exist so operators (and checks) know the canonical layout.
