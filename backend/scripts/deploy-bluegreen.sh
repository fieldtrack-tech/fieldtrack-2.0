#!/bin/bash
set -euo pipefail

IMAGE="ghcr.io/rajashish147/fieldtrack-backend:${1:-latest}"

BLUE_NAME="fieldtrack_backend_blue"
GREEN_NAME="fieldtrack_backend_green"

BLUE_PORT=3001
GREEN_PORT=3002
APP_PORT=3000

ENV_FILE="/home/ashish/FieldTrack-2.0/backend/.env"
NGINX_CONF="/etc/nginx/sites-enabled/fieldtrack.conf"

MAX_HEALTH_ATTEMPTS=20
HEALTH_INTERVAL=3

echo "========================================="
echo "FieldTrack Blue-Green Deployment Started"
echo "========================================="

echo "[1/7] Pulling image..."
docker pull "$IMAGE"

echo "[2/7] Detecting active container..."

if grep -q "127.0.0.1:$BLUE_PORT" "$NGINX_CONF"; then
    ACTIVE="blue"
    ACTIVE_NAME=$BLUE_NAME
    ACTIVE_PORT=$BLUE_PORT

    INACTIVE="green"
    INACTIVE_NAME=$GREEN_NAME
    INACTIVE_PORT=$GREEN_PORT
else
    ACTIVE="green"
    ACTIVE_NAME=$GREEN_NAME
    ACTIVE_PORT=$GREEN_PORT

    INACTIVE="blue"
    INACTIVE_NAME=$BLUE_NAME
    INACTIVE_PORT=$BLUE_PORT
fi

echo "Active container   : $ACTIVE ($ACTIVE_PORT)"
echo "Inactive container : $INACTIVE ($INACTIVE_PORT)"

echo "[3/7] Starting inactive container..."

if docker ps -a --format '{{.Names}}' | grep -Eq "^${INACTIVE_NAME}$"; then
    docker rm -f "$INACTIVE_NAME"
fi

docker run -d \
  --name "$INACTIVE_NAME" \
  -p "$INACTIVE_PORT:$APP_PORT" \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  "$IMAGE"

echo "[4/7] Waiting for health check..."

ATTEMPT=0

until curl -s "http://127.0.0.1:$INACTIVE_PORT/health" | grep -q "ok"; do
    ATTEMPT=$((ATTEMPT+1))

    if [ "$ATTEMPT" -ge "$MAX_HEALTH_ATTEMPTS" ]; then
        echo "Health check failed."
        exit 1
    fi

    sleep "$HEALTH_INTERVAL"
done

echo "[5/7] Switching nginx..."

sudo sed -i "s/127.0.0.1:$ACTIVE_PORT/127.0.0.1:$INACTIVE_PORT/" "$NGINX_CONF"

echo "[6/7] Reloading nginx..."

sudo nginx -t
sudo systemctl reload nginx

echo "[7/7] Cleaning old container..."

docker rm -f "$ACTIVE_NAME" || true

echo "========================================="
echo "Deployment successful."
echo "$INACTIVE_NAME container is now LIVE."
echo "========================================="