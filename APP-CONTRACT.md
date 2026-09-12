# App-Vertrag für z-beermann.de

Kurzanleitung für Menschen und LLMs. Jede Web-App, die auf der Plattform laufen soll,
erfüllt diese Regeln. Dann ist das Deploy ein Formular (`new-app`, nur über Tailscale) oder ein Befehl:
`new-app <name> [--storage] [--env KEY=WERT]`. Siehe [new-app/README.md](new-app/README.md).

**Der Stack ist frei.** Sprache, Framework, Datenbank-Bibliothek, Frontend: alles, was in einem
Container läuft und die Regeln unten erfüllt. Die Vorlagen weiter unten sind Beispiele für häufige
Fälle, keine Vorgabe. Wähle, was zur App passt.

## Muss

1. **`Dockerfile` im Repo-Root.** `docker build .` muss lokal ohne weitere Argumente funktionieren.
   Multi-Stage: Build-Stage mit allen Dev-Abhängigkeiten, Runtime-Stage so klein wie möglich.
2. **Ein Prozess, ein Port.** Der Container lauscht auf **allen Interfaces, IPv4 und IPv6** (`::`,
   nicht nur `0.0.0.0`) und dem Port aus der Umgebungsvariable `PORT` (Default `3000`). Grund: Der
   Healthcheck ruft `localhost` auf, und das ist in Alpine-Images `::1`. Kein HTTPS im Container, das macht der Proxy.
3. **Konfiguration nur über Umgebungsvariablen.** Keine Secrets im Repo. Alle Variablen mit
   Beispielwerten in `.env.example`. Beim Start fehlende Pflichtvariablen mit klarer Meldung abbrechen.
4. **Health-Endpoint `GET /healthz`** antwortet `200` mit `ok`, sobald die App Anfragen bedienen kann.
5. **Logs nach stdout/stderr**, keine Logdateien.
6. **Daten liegen außerhalb des Containers.** Entweder Postgres über `DATABASE_URL`
   (wird von Coolify bereitgestellt) oder SQLite unter `/data` (wird als Volume gemountet).
   Nichts anderes im Dateisystem darf den Neustart überleben müssen.
7. **Kein eigener Login.** Geschützte Apps bekommen vom Proxy den angemeldeten Nutzer als Header
   `Remote-Email` (später auch `Remote-Groups`). Die App vertraut diesem Header und baut keine
   Registrierung, kein Passwort, keine Session-Verwaltung. Öffentliche Apps ignorieren den Header.
8. **`README.md`** mit: was die App tut, wie sie lokal läuft (`npm run dev` o. ä.),
   welche Umgebungsvariablen es gibt.

## Soll

- Static-Apps (reines Frontend ohne Server) liefern das Build-Verzeichnis mit Caddy aus, siehe Beispiel unten.
- Der Prozess läuft direkt als PID 1 (z. B. `node`, `python`, das Go-Binary), nicht über `npm start`
  oder eine Shell, damit Stop-Signale ankommen.
- Migrationen laufen beim Start der App, idempotent.
- `.dockerignore` mit mindestens `node_modules`, `.git`, `dist`.
- Domain-Konvention: `<repo-name>.z-beermann.de`.

## Beispiel: statische App (reines Frontend, egal welches Framework)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
```

`Caddyfile` daneben:

```
:{$PORT:3000} {
	root * /srv
	encode gzip
	try_files {path} /index.html
	file_server
	respond /healthz "ok" 200
}
```

## Beispiel: Node-App mit Server

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Der Server liest `process.env.PORT ?? 3000`, `process.env.DATABASE_URL`, bedient `/healthz` und lauscht
auf `::` (Node: `server.listen(port, '::')`, Hono: `serve({ fetch, port, hostname: '::' })`).

Für andere Sprachen gilt dasselbe Muster: Build-Stage, schlanke Runtime-Stage (z. B. `python:3.13-slim`,
`golang` → `scratch`/`distroless`), Prozess lauscht auf `PORT`, Nicht-Root-Nutzer wenn möglich.

## Was die Plattform liefert

| Wer | Was |
|---|---|
| Traefik (Proxy) | TLS-Zertifikat, Weiterleitung `<name>.z-beermann.de` → Container-Port |
| Coolify | Build aus dem Dockerfile bei jedem Push auf `main`, Umgebungsvariablen, Postgres, Volumes, Logs |
| new-app | Legt eine App mit allen Konventionen per Coolify-API an: Name, Storage ja/nein, Env-Variablen |
| Pocket ID + tinyauth | Login-Seite und der Header `Remote-Email` für geschützte Apps |
| Backups | Tägliche Sicherung aller Postgres-Datenbanken und Volumes |

## Hinweis für LLMs

Wenn du ein Repo für diese Plattform anlegst oder umbaust: Erfülle die Muss-Liste vollständig.
Wähle den Stack nach der Aufgabe, nicht nach den Beispielen hier. Prüfe mit `docker build . && docker run -p 3000:3000 -e PORT=3000 <image>`
und `curl localhost:3000/healthz`. Entferne Hosting-Code für andere Anbieter (Cloudflare Workers,
Vercel-Konfiguration, GitHub-Actions-Deploys), sobald die App hier läuft.
