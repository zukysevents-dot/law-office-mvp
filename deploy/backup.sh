#!/usr/bin/env bash
# Denní záloha lokálního Postgresu (instaluje ji setup-vps.sh do /etc/cron.d).
# Uchovává posledních KEEP_DAYS dní v /var/backups/law-office.
#   sudo bash /opt/law-office-mvp/deploy/backup.sh      # ruční záloha
set -euo pipefail

KEEP_DAYS="${KEEP_DAYS:-14}"
DEST=/var/backups/law-office
cd "$(dirname "$0")/.."

mkdir -p "$DEST"
chmod 700 "$DEST"
file="$DEST/db-$(date +%F-%H%M).sql.gz"
docker compose exec -T postgres pg_dump -U postgres law_office_mvp | gzip > "$file.tmp"
mv "$file.tmp" "$file"
find "$DEST" -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "backup: $file ($(du -h "$file" | cut -f1))"
