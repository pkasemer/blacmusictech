#!/usr/bin/env bash
# Build the admin site image on THIS machine, copy it to the server and (re)start it.
#
#   deploy/ship.sh pk@178.79.160.251 [path/to/ssh_key]
#
# Needs Docker and ssh locally. The Backend stack (/opt/blacmusic) must already be running:
# the site joins its private network to reach the API.
set -euo pipefail
TARGET="${1:?usage: deploy/ship.sh user@host [ssh_key]}"
KEY="${2:-$HOME/.ssh/blac_vps}"
cd "$(dirname "$0")/.."
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20)
# The server can drop a new connection right after a big upload: retry a few times.
retry() { local n; for n in 1 2 3 4 5 6; do "$@" && return 0; echo "  (attempt $n failed, retrying in 15s)"; sleep 15; done; return 1; }
DIR=/opt/blacmusic/admin
TAG="$(date +%Y%m%d%H%M%S)"

echo "== build image ($TAG)"
docker build -t "blacmusic-admin:$TAG" .

echo "== copy image"
docker save "blacmusic-admin:$TAG" | gzip | "${SSH[@]}" "$TARGET" 'gunzip | docker load'

echo "== copy compose files"
retry "${SSH[@]}" "$TARGET" "mkdir -p $DIR"
retry scp -i "$KEY" -o IdentitiesOnly=yes -o ConnectTimeout=20 deploy/docker-compose.prod.yml deploy/env.example "$TARGET:$DIR/"

echo "== start"
retry "${SSH[@]}" "$TARGET" "TAG=$TAG DIR=$DIR bash -s" <<'REMOTE'
set -euo pipefail
cd "$DIR"
if [ ! -f .env ]; then
  echo "creating .env with a fresh SESSION_SECRET"
  umask 077
  cp env.example .env
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')|" .env
fi
chmod 600 .env
sed -i "s/^TAG=.*/TAG=$TAG/" .env
docker compose -f docker-compose.prod.yml --env-file .env up -d --remove-orphans
echo "== waiting for the site"
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null http://127.0.0.1:3100/login 2>/dev/null; then echo "up after ~${i}s"; break; fi
  sleep 1
done
curl -sS -o /dev/null -w "GET /login -> %{http_code}\n" http://127.0.0.1:3100/login
docker compose -f docker-compose.prod.yml ps --format 'table {{.Service}}\t{{.Status}}'
docker image prune -f >/dev/null
REMOTE
