#!/usr/bin/env bash
# Tägliches Off-Site-Backup mit restic nach Backblaze B2.
# Sichert: alle benannten Docker-Volumes (App-Daten), einen Dump der Coolify-Datenbank,
# Coolifys Konfiguration und Schlüssel, Firewall- und SSH-Konfiguration.
# Zugangsdaten in /root/.restic.env (Repository, Archiv-Passwort, B2-Key). Läuft als root über systemd-Timer.
set -euo pipefail

ENV_FILE=/root/.restic.env
[ -r "$ENV_FILE" ] || { echo "Fehlt: $ENV_FILE (RESTIC_REPOSITORY, RESTIC_PASSWORD, B2_ACCOUNT_ID, B2_ACCOUNT_KEY)"; exit 1; }
set -a; . "$ENV_FILE"; set +a

DUMP_DIR=/var/backups/z-beermann
mkdir -p "$DUMP_DIR" && chmod 700 "$DUMP_DIR"

# 1. Coolify-Datenbank als SQL-Dump (Volumes von laufenden Postgres-Containern sind nicht konsistent kopierbar)
docker exec coolify-db pg_dump -U coolify --clean --if-exists coolify > "$DUMP_DIR/coolify-db.sql"

# 2. Alle benannten Volumes außer Coolifys eigener DB/Redis (die stecken im Dump bzw. sind Cache)
mapfile -t VOLUMES < <(docker volume ls --format '{{.Name}}' | grep -vE '^[0-9a-f]{64}$|^coolify-(db|redis)$')
PATHS=()
for v in "${VOLUMES[@]}"; do PATHS+=("/var/lib/docker/volumes/$v/_data"); done

# 3. Server-Konfiguration, die ein Neuaufbau braucht
PATHS+=("$DUMP_DIR" /data/coolify/source /data/coolify/ssh /data/coolify/proxy /etc/ufw /etc/ssh/sshd_config.d /etc/needrestart/conf.d)

restic snapshots >/dev/null 2>&1 || restic init
restic backup --tag daily --exclude-caches "${PATHS[@]}"
restic forget --tag daily --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
echo "Backup fertig: $(date -Is), ${#VOLUMES[@]} Volumes"
