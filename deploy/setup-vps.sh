#!/usr/bin/env bash
# =============================================================================
# One-shot (and re-runnable) VPS setup: Docker + nginx + Let's Encrypt + app.
#
#   sudo DOMAIN=app.kancelar.cz EMAIL=it@kancelar.cz bash deploy/setup-vps.sh
#
# Optional env: LANDING_DOMAINS ("kancelar.cz www.kancelar.cz" — hosts that
#               serve only the public landing page, from the same app),
#               BRANCH (default main), APP_DIR (default /opt/law-office-mvp),
#               REPO_URL (default the GitHub repo), SKIP_TLS=1 (HTTP only).
#
# Idempotent: an existing .env is never overwritten (only missing keys are
# added), the repo is fast-forwarded, migrations only apply what's pending.
# See deploy/DEPLOY.md for what each step does.
# =============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:?Nastav DOMAIN=tvoje.domena.cz}"
EMAIL="${EMAIL:?Nastav EMAIL=kontakt@pro-lets-encrypt.cz}"
LANDING_DOMAINS="$(echo "${LANDING_DOMAINS:-}" | tr ',' ' ' | xargs)"
ALL_DOMAINS="$(echo "$DOMAIN $LANDING_DOMAINS" | xargs)"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/law-office-mvp}"
REPO_URL="${REPO_URL:-https://github.com/zukysevents-dot/law-office-mvp.git}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }

if [ "$(id -u)" -ne 0 ]; then
  echo "Spusť jako root (sudo)." >&2
  exit 1
fi

# --- 1. Systémové balíčky ----------------------------------------------------
log "Instaluji balíčky (git, nginx, certbot, ufw)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates openssl nginx certbot \
  python3-certbot-nginx ufw dnsutils >/dev/null

if ! command -v docker >/dev/null 2>&1; then
  log "Instaluji Docker (oficiální skript get.docker.com)"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null

# Malé VPS (≤ 2 GB RAM) nezvládnou `next build` bez swapu.
if [ "$(swapon --show | wc -l)" -eq 0 ] && [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 3500 ]; then
  log "Zakládám 2 GB swap (málo RAM pro build)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# --- 2. Firewall ---------------------------------------------------------------
log "Firewall: povoleno jen SSH + HTTP/HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null

# --- 3. Kód z GitHubu ------------------------------------------------------------
if [ -d "$APP_DIR/.git" ]; then
  log "Aktualizuji repozitář ($BRANCH)"
  git -C "$APP_DIR" fetch --quiet origin
  git -C "$APP_DIR" checkout --quiet "$BRANCH"
  git -C "$APP_DIR" pull --quiet --ff-only origin "$BRANCH"
else
  log "Klonuji $REPO_URL ($BRANCH) do $APP_DIR"
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# --- 4. .env (secrety se generují jen jednou) ------------------------------------
secret() { openssl rand -base64 32 | tr -d '\n'; }
# Nastaví KEY jen když v .env chybí nebo je prázdný — nikdy nepřepíše vyplněnou hodnotu.
ensure_env() {
  local key="$1" value="$2"
  if grep -qE "^${key}=.+" .env; then
    return
  fi
  if grep -qE "^${key}=" .env; then
    # Hodnoty z openssl base64 obsahují "/" a "+", proto oddělovač "|".
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

if [ ! -f .env ]; then
  log "Vytvářím .env z deploy/.env.example"
  cp deploy/.env.example .env
fi
chmod 600 .env

ensure_env COMPOSE_FILE compose.prod.yaml
ensure_env COMPOSE_PROFILES local-db
ensure_env APP_BASE_URL "https://${DOMAIN}"
ensure_env REGISTRATION_ENABLED false
if [ -n "$LANDING_DOMAINS" ]; then
  ensure_env LANDING_ONLY_HOSTS "$(echo "$LANDING_DOMAINS" | tr ' ' ',')"
fi
# Hex heslo — bez znaků, které by bylo nutné escapovat v connection stringu.
ensure_env POSTGRES_PASSWORD "$(openssl rand -hex 24)"
PG_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)"
ensure_env DATABASE_URL "postgresql://postgres:${PG_PASSWORD}@postgres:5432/law_office_mvp"
ensure_env DIRECT_URL "postgresql://postgres:${PG_PASSWORD}@postgres:5432/law_office_mvp"
ensure_env SESSION_SECRET "$(secret)"
ensure_env PORTAL_SESSION_SECRET "$(secret)"
ensure_env DATA_ENCRYPTION_KEY "$(secret)"
ensure_env CRON_SECRET "$(secret)"
ensure_env NOTIFICATION_RUN_SECRET "$(grep -E '^CRON_SECRET=' .env | cut -d= -f2-)"

# --- 5. Build, databáze, migrace, start ------------------------------------------
log "Builduji image (první build trvá několik minut)"
docker compose build

log "Startuji Postgres"
docker compose up -d postgres
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

log "Aplikuji databázové migrace"
docker compose run --rm --no-deps app npx prisma migrate deploy

log "Startuji aplikaci a cron"
docker compose up -d --remove-orphans

# --- 6. nginx --------------------------------------------------------------------
log "Konfiguruji nginx pro: ${ALL_DOMAINS}"
SITE=/etc/nginx/sites-available/law-office
if [ -f "$SITE" ] && grep -q "managed by Certbot" "$SITE"; then
  # Certbot už do souboru dopsal HTTPS blok — nepřepisovat, jen aktualizovat
  # seznam domén (certbot --expand pak doplní certifikát a přesměrování).
  sed -i "s/^\(\s*server_name\) .*;/\1 ${ALL_DOMAINS};/" "$SITE"
else
  sed "s/__DOMAIN__/${ALL_DOMAINS}/g" deploy/nginx/law-office.conf > "$SITE"
fi
ln -sf "$SITE" /etc/nginx/sites-enabled/law-office
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# --- 7. HTTPS certifikát ---------------------------------------------------------
if [ "${SKIP_TLS:-0}" = "1" ]; then
  warn "SKIP_TLS=1 — HTTPS přeskočeno."
else
  SERVER_IP="$(curl -4 -fsS https://api.ipify.org || true)"
  # Certifikát jen pro domény, které už v DNS ukazují sem — jinak by certbot
  # selhal celý. Zbylé se doplní dalším spuštěním (--expand).
  CERT_ARGS=()
  for name in $ALL_DOMAINS; do
    resolved="$(dig +short A "$name" | tail -n1)"
    if [ -n "$SERVER_IP" ] && [ "$resolved" != "$SERVER_IP" ]; then
      warn "DNS ${name} ukazuje na '${resolved:-nic}', server má ${SERVER_IP} — zatím bez HTTPS."
    else
      CERT_ARGS+=(-d "$name")
    fi
  done
  if [ "${#CERT_ARGS[@]}" -gt 0 ]; then
    log "Vydávám Let's Encrypt certifikát"
    certbot --nginx "${CERT_ARGS[@]}" --cert-name law-office -m "$EMAIL" \
      --agree-tos -n --redirect --expand
    systemctl reload nginx
  else
    warn "Žádná doména zatím neukazuje na server — nastav A záznamy a spusť skript znovu."
  fi
fi

# --- 8. Kontrola -----------------------------------------------------------------
log "Čekám, až aplikace odpoví"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/login; then
    break
  fi
  sleep 3
done
docker compose ps

cat <<EOF

Hotovo. Aplikace: https://${DOMAIN}

Pokud je databáze nová, založ první kancelář a admina:
  cd ${APP_DIR} && docker compose exec \\
    -e BOOTSTRAP_EMAIL="ty@kancelar.cz" -e BOOTSTRAP_PASSWORD="<heslo>" \\
    -e BOOTSTRAP_NAME="Jméno Příjmení" -e BOOTSTRAP_ORG_NAME="Kancelář s.r.o." \\
    -e BOOTSTRAP_ORG_SLUG="kancelar" app npm run db:bootstrap

Nová verze z GitHubu:  sudo bash ${APP_DIR}/deploy/update.sh
EOF
