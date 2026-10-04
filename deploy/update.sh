#!/usr/bin/env bash
# Nasadí nejnovější verzi z GitHubu: pull → build → migrace → restart.
#   sudo bash /opt/law-office-mvp/deploy/update.sh
set -euo pipefail

cd "$(dirname "$0")/.."
branch="$(git rev-parse --abbrev-ref HEAD)"

echo "==> git pull ($branch)"
git pull --ff-only origin "$branch"

echo "==> build"
docker compose build

echo "==> migrace"
docker compose up -d postgres 2>/dev/null || true
docker compose run --rm --no-deps app npx prisma migrate deploy

echo "==> restart"
docker compose up -d --remove-orphans
docker image prune -f >/dev/null
docker compose ps
