# Deploy na vlastní VPS (Docker Compose + nginx + Let's Encrypt)

Aplikace běží v Dockeru, před ní je **nginx na hostu** a HTTPS certifikát
vydává a sám obnovuje **certbot** (Let's Encrypt). Celé nasazení obstará jeden
skript, [`deploy/setup-vps.sh`](setup-vps.sh), který jde spouštět opakovaně.

---

## Co poběží

```
              internet
                 │  :80 / :443
          ┌──────▼───────┐
          │    nginx      │  na hostu: TLS (certbot), limity, proxy
          └──────┬───────┘
                 │  http://127.0.0.1:3000   (jen loopback, zvenku nedostupné)
          ┌──────▼───────┐
          │     app       │  Docker: Next.js (next start)
          └──────┬───────┘
                 │  DATABASE_URL
          ┌──────▼───────┐
          │   postgres    │  Docker: Postgres 17, data ve volume `postgres-data`
          └──────────────┘
          ┌──────────────┐
          │    cron       │  Docker: každou hodinu volá /api/internal/*/run
          └──────────────┘
```

- **nginx** — jediné, co je vidět z internetu (porty 80/443). Konfigurace je
  v [`deploy/nginx/law-office.conf`](nginx/law-office.conf): přeposílá hlavičky,
  které potřebují Server Actions, vypíná buffering kvůli streamování, omezuje
  pokusy o přihlášení a `/api/internal/*` zvenku vůbec nepustí.
- **certbot** — po prvním vydání certifikátu ho obnovuje systemd timer
  (`systemctl list-timers | grep certbot`).
- **app / postgres / cron** — `compose.prod.yaml`. Všechna nastavení a secrety
  jsou v `/opt/law-office-mvp/.env` (nikdy se necommituje, práva `600`).

---

## Rychlé nasazení

Předpoklady: čisté **Ubuntu 22.04/24.04** nebo **Debian 12**, root/sudo přes SSH,
a **A záznam domény** nasměrovaný na IP serveru (`dig +short app.kancelar.cz`).

```bash
# na serveru (repo je veřejné, klon nepotřebuje přihlášení)
apt-get update && apt-get install -y git
git clone https://github.com/zukysevents-dot/law-office-mvp.git /opt/law-office-mvp
cd /opt/law-office-mvp
sudo DOMAIN=app.kancelar.cz EMAIL=it@kancelar.cz bash deploy/setup-vps.sh
```

Skript postupně:

1. nainstaluje `git`, `nginx`, `certbot`, `ufw` a Docker (oficiální `get.docker.com`),
   na malém stroji založí 2 GB swap (jinak `next build` spadne na paměti),
2. pustí ve firewallu jen SSH + HTTP/HTTPS,
3. naklonuje / fast-forwardne repo (větev `BRANCH`, výchozí `main`),
4. vytvoří `.env` a **vygeneruje všechny secrety** a heslo do Postgresu
   (už vyplněné hodnoty nikdy nepřepíše),
5. postaví image, spustí Postgres, aplikuje migrace (`prisma migrate deploy`),
   spustí app + cron,
6. nainstaluje nginx site a vydá certifikát (`certbot --nginx --redirect`).
   Když DNS ještě neukazuje na server, HTTPS přeskočí a řekne to — stačí skript
   pustit znovu, až se DNS propíše.

Volitelné proměnné: `BRANCH=…`, `APP_DIR=…`, `SKIP_TLS=1` (jen HTTP) a
`LANDING_DOMAINS="kancelar.cz www.kancelar.cz"` — domény, které ze stejné
aplikace servírují **jen veřejnou landing page** (nastaví `LANDING_ONLY_HOSTS`).
Certifikát se vydá pro všechny domény, které už v DNS ukazují na server;
zbylé doplní další spuštění skriptu.

### První kancelář a admin (jen prázdná DB)

```bash
cd /opt/law-office-mvp
docker compose exec \
  -e BOOTSTRAP_EMAIL="ty@kancelar.cz" \
  -e BOOTSTRAP_PASSWORD="<silné-heslo-min-8>" \
  -e BOOTSTRAP_NAME="Jméno Příjmení" \
  -e BOOTSTRAP_ORG_NAME="Kancelář s.r.o." \
  -e BOOTSTRAP_ORG_SLUG="kancelar" \
  app npm run db:bootstrap
```

Skript je idempotentní — opakované spuštění jen resetuje heslo.

---

## SharePoint

Připojení se nastavuje **v aplikaci**, ne v `.env`: *Nastavení → SharePoint*
(partner/administrátor). Postup registrace aplikace v Azure (Entra ID) je přímo
na té stránce. Client secret se ukládá šifrovaně přes `DATA_ENCRYPTION_KEY` —
**tenhle klíč po nasazení neměň**, jinak uložený secret nepůjde přečíst.

Po připojení:

- **SharePoint → Procházet celou knihovnu** (`/documents/sharepoint/library`) —
  strom složek jako v SharePointu; kliknutím na soubor se otevře přímo
  v SharePointu (Office Online). Filtry: název souboru/složky, „ve složce
  s názvem", čas změny (24 h / 7 / 30 / 90 dní / rok / vlastní od–do), typ,
  řazení. Filtry hledají v aktuální složce a všech podsložkách.
  Celou knihovnu vidí jen partner/administrátor (aplikace čte SharePoint
  aplikačním oprávněním, takže by jinak obešla oprávnění ke spisům).
- **Složky spisů** — každý uživatel prochází složky spisů, ke kterým má přístup.

---

## Provoz

```bash
cd /opt/law-office-mvp
sudo bash deploy/update.sh          # nová verze z GitHubu: pull, build, migrace, restart
docker compose ps                   # stav
docker compose logs -f app          # živé logy aplikace
docker compose restart app          # restart
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run        # test obnovy certifikátu
```

`docker compose` na serveru automaticky bere `compose.prod.yaml` a profil
`local-db` (nastavené v `.env` přes `COMPOSE_FILE` / `COMPOSE_PROFILES`).

### Zálohy databáze

```bash
# záloha
docker compose exec -T postgres pg_dump -U postgres law_office_mvp | gzip > backup-$(date +%F).sql.gz
# obnova
gunzip -c backup-YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U postgres law_office_mvp
```

`setup-vps.sh` nastaví **denní zálohu ve 2:30** (`/etc/cron.d/law-office-backup`
→ [`deploy/backup.sh`](backup.sh)) do `/var/backups/law-office`, drží 14 dní.
Ruční záloha: `sudo bash deploy/backup.sh`. Doporučení: kopírovat zálohy i mimo
server (např. OVH Object Storage / rclone).

### Ruční spuštění cron úloh

```bash
docker compose exec cron /usr/local/bin/run.sh notifications   # čekej: ok (200)
docker compose exec cron /usr/local/bin/run.sh registry
```

---

## Managed DB (Supabase) místo Postgresu na VPS

V `.env` nastav `COMPOSE_PROFILES=` (prázdné), `DATABASE_URL` = pooled URL
(port 6543, `?pgbouncer=true`) a `DIRECT_URL` = direct URL (port 5432), pak
`sudo bash deploy/update.sh`.

---

## Řešení potíží

| Příznak | Příčina / řešení |
|---|---|
| certbot: *Challenge failed* | DNS ještě neukazuje na server, nebo port 80 blokuje firewall poskytovatele (OVH/Hetzner panel). `dig +short <doména>`, `ufw status`. |
| 502 Bad Gateway | App neběží / startuje. `docker compose ps`, `docker compose logs app`. |
| Build spadne (`Killed`, exit 137) | Málo paměti — ověř swap (`swapon --show`). |
| Formuláře hlásí chybu „origin" / Server Action | nginx musí posílat `Host` a `X-Forwarded-Host` (je v dodané konfiguraci). |
| Změna `.env` se neprojevila | `docker compose up -d` (kontejnery se přetvoří s novým env). |
| Odkazy v e-mailech vedou jinam | `APP_BASE_URL` v `.env` musí být `https://<doména>`. |
| SharePoint: „Připojení selhalo" | Adresa webu, admin consent v Azure, platnost client secretu. |

## Bezpečnost

- `.env` je jen na serveru (`chmod 600`), secrety generuje skript (`openssl rand`).
- Ven jsou jen 80/443 (nginx) a SSH. App poslouchá na `127.0.0.1:3000`,
  Postgres nemá publikovaný port vůbec.
- Veřejná registrace je vypnutá (`REGISTRATION_ENABLED=false`).
- Po prvním přihlášení změň bootstrap heslo; `db:seed*` jsou jen testovací data.
