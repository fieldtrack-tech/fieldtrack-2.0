# Infra Contract

This API repository expects an external infra repository to provide runtime infrastructure.

Required external services:
- nginx container attached to `api_network`
- Redis reachable at `redis:6379`

Required external paths under `INFRA_ROOT`:
- `$INFRA_ROOT/nginx/live`
- `$INFRA_ROOT/nginx/backup`
- `$INFRA_ROOT/nginx/api.conf`

Default on server:
- `INFRA_ROOT=/opt/infra`

Deployment assumptions:
- API deploy script (`scripts/deploy.sh`) never starts infra services
- API deploy script only renders and reloads nginx config via paths under `INFRA_ROOT`
- API and infra share the Docker bridge network `api_network`
