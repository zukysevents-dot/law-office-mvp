# Deploy na vlastní VPS (Docker Compose + Caddy)

Krok-za-krokem návod, jak rozjet aplikaci na čistém Linux serveru. Cílem je,
aby sis to prošel sám a rozuměl **proč** každý krok děláš. Počítej tak s hodinou
při prvním nasazení.

---

## Co vlastně poběží (architektura)

Compose spustí několik kontejnerů na jednom serveru:

```
              internet
                 │  :80 / :443
          ┌──────▼───────┐
          │    caddy      │  reverse proxy + automatické HTTPS (Let's Encrypt)
          └──────┬───────┘
                 │  http://app:3000  (jen uvnitř docker sítě)
          ┌──────▼───────┐
          │     app       │  Next.js (next start), tvá aplikace
          └──────┬───────┘
                 │  DATABASE_URL
        ┌────────▼─────────┐
        │  Postgres        │  Supabase (managed)  NEBO  kontejner `postgres`
        └──────────────────┘

          ┌──────────────┐
          │    cron       │  každou hodinu volá /api/internal/*/run (notifikace, rejstříky)
          └──────────────┘
```

- **caddy** — jediný kontejner „ven" (porty 80/443). Sám si vyřídí HTTPS
  certifikát, pokud mu dáš doménu. Zbytek je schovaný v interní docker síti.
- **app** — aplikace. Poslouchá na `0.0.0.0:3000` jen uvnitř sítě; zvenčí se k ní
  chodí přes Caddy.
- **cron** — malý Alpine kontejner, který nahrazuje Vercel cron. Každou hodinu
  „ťukne" na interní endpointy s tajným tokenem (`CRON_SECRET`).
- **postgres** — *volitelný*. Zapíná se profilem `local-db`. Když používáš
  Supabase, tenhle kontejner nespouštíš.

Konfigurace i tajné klíče jdou do souboru **`.env`** v kořeni repa **na serveru**
(nikdy se necommituje). Compose ho vstříkne do kontejnerů (`env_file: .env`).

---

## 0. Předpoklady

- VPS s čistým **Ubuntu 24.04 LTS** (funguje i Debian 12), root nebo sudo přístup přes SSH.
  Pro tuhle aplikaci bohatě stačí **2 vCPU / 4 GB RAM / 40 GB disk**.
- Přístup k repozitáři na GitHubu (deploy klíč nebo Personal Access Token — viz krok 4).
- (Volitelně, doporučeno) **doména** nebo subdoména, kterou nasměruješ na server → dostaneš HTTPS.

> **DB rozhodnutí (probrat se Standou):** necháte databázi na **Supabase**
> (nejméně práce, žádná migrace dat), nebo pojede **Postgres přímo na VPS**?
> Návod pokrývá obě varianty — liší se jen pár řádků v `.env` a jeden přepínač
> u `docker compose`.

---

## 1. (Volitelné) Nasměruj doménu na server

U svého DNS providera přidej **A záznam**:

```
app.tvojekancelar.cz   →   <IP adresa VPS>
```

Než budeš pokračovat s HTTPS, ověř, že se to propsalo (může to trvat pár minut):

```bash
dig +short app.tvojekancelar.cz     # musí vrátit IP tvého VPS
```

Bez domény to jde taky — pojedeš zatím jen na `http://<IP>` (viz krok 5, `APP_DOMAIN=":80"`).

---

## 2. Základní zabezpečení serveru

Přihlas se na server (`ssh root@<IP>`) a zapni firewall — pustíš dovnitř jen SSH a web:

```bash
apt update && apt upgrade -y
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

> Tip: později se hodí založit neroot uživatele se `sudo` a SSH klíčem místo hesla.
> Pro první nasazení to není nutné.

---

## 3. Nainstaluj Docker

Oficiální skript nainstaluje Docker Engine i `docker compose` (v2):

```bash
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version   # ověření
```

(Volitelně, ať nemusíš psát `sudo`: `usermod -aG docker $USER` a znovu se přihlas.)

---

## 4. Stáhni repozitář na server

Repo je privátní, takže potřebuješ autentizaci. Nejjednodušší je **Personal
Access Token** (GitHub → Settings → Developer settings → Fine-grained token,
read-only na tenhle repo):

```bash
cd /opt
git clone https://github.com/zukysevents-dot/law-office-mvp.git
cd law-office-mvp
git checkout main        # deployuje se main
```

Když si Git řekne o heslo, vlož místo něj ten token.

---

## 5. Vytvoř `.env` a vygeneruj tajné klíče

Zkopíruj šablonu a otevři k editaci:

```bash
cp deploy/.env.example .env
nano .env
```

**Vygeneruj silné secrety** (pro každý zvlášť) a vlož do `.env`:

```bash
openssl rand -base64 32     # spusť 4× → SESSION_SECRET, PORTAL_SESSION_SECRET,
                            #             DATA_ENCRYPTION_KEY, CRON_SECRET
```

Doplň v `.env` minimálně:

| Proměnná | Hodnota |
|---|---|
| `APP_DOMAIN` | `app.tvojekancelar.cz` (doména) **nebo** `:80` (jen IP, bez HTTPS) |
| `ACME_EMAIL` | tvůj e-mail (pro Let's Encrypt) |
| `APP_BASE_URL` | `https://app.tvojekancelar.cz` (musí sedět s doménou) |
| `SESSION_SECRET`, `PORTAL_SESSION_SECRET`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET` | z `openssl rand` výše |
| `NOTIFICATION_RUN_SECRET` | dej stejné jako `CRON_SECRET` (kompatibilita) |
| `DATABASE_URL`, `DIRECT_URL` | podle volby DB — viz krok 6 |

SMTP/SharePoint/ISDS/AML vyplň jen když ty funkce hned zapínáš; jinak nech prázdné.

---

## 6. Databáze — vyber jednu variantu

### Varianta A — Supabase (managed, doporučeno na start)

V Supabase dashboardu → **Connect** zkopíruj dvě connection stringy a vlož do `.env`:

```env
# pooled (port 6543) — pro runtime aplikace
DATABASE_URL=postgresql://postgres.<ref>:<heslo>@aws-...pooler.supabase.com:6543/postgres?pgbouncer=true
# direct (port 5432) — pro migrace/studio
DIRECT_URL=postgresql://postgres.<ref>:<heslo>@aws-...supabase.com:5432/postgres
```

Postgres kontejner **nespouštíš**. Přeskoč na krok 7 (bez `--profile`).

### Varianta B — Postgres na VPS

Nastav heslo a nasměruj oba URL na interní kontejner `postgres`:

```env
POSTGRES_PASSWORD=<silné-heslo>
DATABASE_URL=postgresql://postgres:<silné-heslo>@postgres:5432/law_office_mvp
DIRECT_URL=postgresql://postgres:<silné-heslo>@postgres:5432/law_office_mvp
```

V kroku 7 pak přidáš `--profile local-db`. (Přenos dat ze Supabase = `pg_dump`
ze Supabase → `psql` do kontejneru; řešte se Standou, až padne rozhodnutí.)

---

## 7. Postav a spusť

> **Konvence:** produkční compose se jmenuje `compose.prod.yaml` (ne default
> `compose.yaml`), aby nekolidoval s lokálním `docker-compose.yml`. Nastav ho
> pro celou session jednou — pak platí pro všechny příkazy `docker compose` níže:
> ```bash
> export COMPOSE_FILE=compose.prod.yaml
> ```
> (Alternativně přidávej ke každému příkazu `-f compose.prod.yaml`. Po novém SSH
> přihlášení `export` zopakuj, nebo si ho přidej do `~/.bashrc`.)

```bash
# Varianta A (Supabase):
docker compose up -d --build

# Varianta B (Postgres na VPS):
docker compose --profile local-db up -d --build
```

První build chvíli trvá (stahuje node image, `npm ci`, `next build`). Průběh:

```bash
docker compose ps          # měly by běžet: app, caddy, cron (+ postgres u B)
docker compose logs -f app # sleduj start aplikace (Ctrl+C ukončí sledování)
```

---

## 8. Aplikuj databázové migrace

Aplikace při startu **sama nemigruje** (schválně — bezpečnější). Spusť migrace
ručně z běžícího `app` kontejneru (má v sobě Prisma CLI i schéma):

```bash
docker compose exec app npx prisma migrate deploy
```

Použije `DIRECT_URL` (nepooled spojení — Prisma to tak vyžaduje pro migrace).
Uvidíš seznam aplikovaných migrací. Když je DB už migrovaná (Supabase prod),
napíše „No pending migrations" — to je v pořádku.

---

## 9. Založ první kancelář a admina

> Jen když je DB **prázdná** (nová instance). Pokud jedeš na existující Supabase
> prod DB, která už uživatele má, tenhle krok přeskoč.

Skript `db:bootstrap` vytvoří organizaci + účet s plnými právy (platform admin
i org ADMIN). Údaje předáš přes `BOOTSTRAP_*` proměnné inline:

```bash
docker compose exec \
  -e BOOTSTRAP_EMAIL="ty@tvojekancelar.cz" \
  -e BOOTSTRAP_PASSWORD="<silné-heslo-min-8>" \
  -e BOOTSTRAP_NAME="Jméno Příjmení" \
  -e BOOTSTRAP_ORG_NAME="Tvoje kancelář s.r.o." \
  -e BOOTSTRAP_ORG_SLUG="tvoje-kancelar" \
  app npm run db:bootstrap
```

Skript je **idempotentní** — když ho pustíš znovu, jen resetuje heslo na zadané.

---

## 10. Ověř, že to jede

1. **Web**: otevři `https://app.tvojekancelar.cz` (nebo `http://<IP>`). Měl bys
   vidět přihlášení. Přihlas se účtem z kroku 9.
2. **HTTPS**: certifikát naskočí do pár desítek vteřin po prvním requestu na doménu.
   Pokud drhne, mrkni `docker compose logs caddy` (častá příčina: DNS ještě
   neukazuje na server, nebo port 80 není otevřený).
3. **Cron** — ověř, že sidecar umí zavolat endpoint (nemusíš čekat na celou hodinu):
   ```bash
   docker compose exec cron /usr/local/bin/run.sh notifications
   # očekávej: cron[notifications]: ok (200)
   ```
4. **Logy** čehokoli: `docker compose logs -f <app|caddy|cron>`.

Hotovo. 🎉

---

## Provoz — co budeš potřebovat běžně

### Nasazení nové verze (po merge do `main`)

```bash
cd /opt/law-office-mvp
git pull
docker compose up -d --build            # (+ --profile local-db u varianty B)
docker compose exec app npx prisma migrate deploy   # když přibyly migrace
```

Starý kontejner běží, dokud se nová verze nepostaví → prakticky bez výpadku.

### Užitečné příkazy

```bash
docker compose ps                 # stav
docker compose logs -f app        # živé logy
docker compose restart app        # restart jedné služby
docker compose down               # zastav vše (data v DB volume zůstanou)
docker image prune -f             # úklid starých image po redeployi
```

### Zálohy databáze (jen varianta B — u Supabase zálohuje Supabase)

```bash
# záloha
docker compose exec -T postgres pg_dump -U postgres law_office_mvp | gzip > backup-$(date +%F).sql.gz
# obnova
gunzip -c backup-YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U postgres law_office_mvp
```

Doporučení: dej si tenhle dump do denního `cron` na hostu + kopii mimo server.

---

## Řešení potíží

| Příznak | Pravděpodobná příčina / řešení |
|---|---|
| Caddy nevydá certifikát | DNS ještě neukazuje na server, nebo port 80/443 blokovaný firewallem/cloud panelem. Zkontroluj `dig`, `ufw status`, `docker compose logs caddy`. |
| App padá na startu, v logu Prisma chyba o připojení | Špatné `DATABASE_URL` (u Supabase použij **pooled** 6543 pro runtime). Ověř `docker compose logs app`. |
| Migrace hlásí chybu spojení | `DIRECT_URL` musí být **nepooled** (Supabase port 5432). |
| `cron` vrací 503 `CRON_SECRET_NOT_CONFIGURED` | V `.env` chybí `CRON_SECRET`. Doplň a `docker compose up -d`. |
| `cron` vrací 401 | `CRON_SECRET` v `.env` nesedí s tím, co čeká app (musí být totožné pro app i cron — obojí čte stejný `.env`, takže stačí jednou). |
| Změnil jsem `.env`, ale nic se nezměnilo | Env se načítá při startu kontejneru: `docker compose up -d` (přetvoří kontejnery s novým env). |
| Web běží, ale odkazy/e-maily mají špatnou adresu | Zkontroluj `APP_BASE_URL` (musí být plná veřejná URL). |

---

## Bezpečnostní poznámky

- `.env` **nikdy** necommituj (je v `.gitignore` / `.dockerignore`). Drž práva `chmod 600 .env`.
- Secrety generuj náhodně (`openssl rand`), nepoužívej defaulty ze šablony.
- Ven jsou vystavené jen porty 80/443 (Caddy). App ani Postgres nemají veřejný port.
- Po prvním přihlášení změň bootstrap heslo a nezakládej produkci s demo seedy
  (`db:seed*` jsou jen pro testovací data).
