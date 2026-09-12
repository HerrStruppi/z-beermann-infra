# new-app

Legt eine neue App nach dem [App-Vertrag](../APP-CONTRACT.md) in Coolify an und startet den ersten Deploy.
Einmal als Web-Formular (nur über Tailscale erreichbar), einmal als CLI mit derselben Logik.

Was pro App fest ist und nicht mehr abgefragt wird: Projekt `z-beermann`, Environment `production`,
Server `localhost`, GitHub-App `coolify-z-beermann`, Build Pack Dockerfile, Port 3000,
Healthcheck `GET /healthz`, Domain `https://<name>.z-beermann.de`, Auto-Deploy bei Push auf `main`.

Was abgefragt wird: **Name** (= Repo-Name, Subdomain, Volume-Name), **Persistent Storage** ja/nein
(Volume `<name>-data` auf `/data`), **Umgebungsvariablen** (`KEY=WERT` pro Zeile).

Vor dem Anlegen wird geprüft, ob `HerrStruppi/<name>` existiert und für die GitHub-App freigegeben ist.
Wenn nicht, kommt eine klare Meldung statt eines fehlgeschlagenen Builds.

## Lokal ausführen

```bash
cp .env.example .env   # COOLIFY_TOKEN eintragen
npm ci
npm run dev            # http://localhost:3000
```

## Weitere Skripte

- `bin/setup-auth.js`: legt Pocket ID und tinyauth an (einmalig, siehe SERVER.md Abschnitt 9).
- `bin/protect.js <name> [--public]`: bestehende App hinter den Login stellen oder wieder öffnen, deployt neu.

Neue Apps sind standardmäßig geschützt (Checkbox „Nur mit Login erreichbar“, CLI `--public` zum Abschalten).

## CLI

```bash
node bin/new-app.js gym-tracker --storage --env SOME_KEY=wert
node bin/new-app.js --help
```

Die CLI liest dieselben Umgebungsvariablen wie `.env.example`. Auf dem Server liegt die `.env`
unter `~/apps/z-beermann-infra/new-app/.env`, dann geht `node ~/apps/z-beermann-infra/new-app/bin/new-app.js <name>`.

## Selbst auf der Plattform betreiben

Die App erfüllt den Vertrag und läuft als Coolify-App aus diesem Repo, Unterordner `new-app`.
Sie bekommt **keine Domain** (`--internal` setzt `autogenerate_domain: false`, sonst vergibt Coolify eine
öffentliche sslip.io-Adresse), sondern ein Port-Mapping, damit sie nur über Tailscale erreichbar ist
(die Firewall lässt aus dem Internet nur 80/443 zu Containern durch):

```bash
node bin/new-app.js new-app --repo HerrStruppi/z-beermann-infra --base-dir /new-app \
  --internal --ports 3100:3000 \
  --env COOLIFY_URL=https://deploy.z-beermann.de --env COOLIFY_TOKEN=... \
  --env COOLIFY_PROJECT=z-beermann --env COOLIFY_ENVIRONMENT=production --env COOLIFY_SERVER=localhost \
  --env GITHUB_APP=coolify-z-beermann --env GITHUB_OWNER=HerrStruppi --env BASE_DOMAIN=z-beermann.de
```

Danach: `http://100.105.58.55:3100` (Tailscale-IP des Servers). Inzwischen hat new-app zusätzlich die Domain
`https://new.z-beermann.de` hinter dem Login (Domain per API gesetzt, Labels mit `protect: true`).

## Coolify-API, die benutzt wird

`GET /projects`, `GET /projects/{uuid}`, `GET /servers`, `GET /github-apps`, `GET /github-apps/{id}/repositories`, `GET /applications`,
`POST /applications/private-github-app`, `PATCH /applications/{uuid}/envs/bulk`,
`POST /applications/{uuid}/storages`, `POST /applications/{uuid}/start`, `GET /deployments/{uuid}`.
Token braucht die Rechte `read`, `write`, `deploy`.
