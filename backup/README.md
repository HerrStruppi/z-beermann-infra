# Backup

Zwei Ebenen:

| Ebene | Was | Wofür |
|---|---|---|
| Hetzner-Backups (Cloud Console) | Komplettes Server-Image, täglich, 7 Stück | Server kaputt, Rollback |
| restic → Backblaze B2 (`backup.sh`, täglich 03:30) | App-Daten (Docker-Volumes), Coolify-DB-Dump, Coolify-Konfiguration und -Schlüssel, Firewall/SSH-Konfiguration | Daten kaputt, Umzug zu anderem Anbieter |

Aufbewahrung: 7 tägliche, 4 wöchentliche, 6 monatliche Snapshots.

## Installation (einmalig, als root)

```bash
apt install -y restic
cp backup.sh /usr/local/bin/z-beermann-backup && chmod 755 /usr/local/bin/z-beermann-backup
cp restic-backup.service restic-backup.timer /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now restic-backup.timer
```

`/root/.restic.env` (chmod 600) mit `RESTIC_REPOSITORY=b2:z-beermann-backup:/server`, `RESTIC_PASSWORD`,
`B2_ACCOUNT_ID`, `B2_ACCOUNT_KEY`. Das Archiv-Passwort liegt in 1Password. Ohne Passwort ist das Backup unlesbar.

## Bedienen

```bash
sudo z-beermann-backup                      # jetzt sichern
sudo systemctl list-timers restic-backup*   # nächster Lauf
sudo journalctl -u restic-backup -n 30      # letztes Log
sudo bash -c 'set -a; . /root/.restic.env; restic snapshots'
```

## Wiederherstellen

```bash
sudo bash -c 'set -a; . /root/.restic.env; restic restore latest --target /tmp/restore'
```

Danach z. B. `/tmp/restore/var/lib/docker/volumes/gym-tracker-data/_data/` in das Volume kopieren
(App vorher in Coolify stoppen) oder `coolify-db.sql` in `coolify-db` einspielen.
Einmal im Quartal probeweise machen.
