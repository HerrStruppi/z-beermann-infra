# Server: ubuntu-1 (Hetzner CX23)

Was auf dem Server eingerichtet ist und warum. Ziel: ein Neuaufbau nach dieser Datei dauert einen Abend.

| | |
|---|---|
| Anbieter | Hetzner Cloud, CX23 (2 vCPU, 4 GB RAM, 40 GB NVMe), Ubuntu 24.04 |
| Öffentliche IP | 46.224.25.205 (A-Records `@` und `*` bei IONOS zeigen hierhin) |
| Tailscale-IP | 100.105.58.55, Name `ubuntu-1` |
| Nutzer | `zacha` (sudo ohne Passwort, `/etc/sudoers.d/zacha`), SSH-Key im 1Password-Agent |
| Coolify | https://deploy.z-beermann.de (öffentlich, Login + 2FA) oder http://100.105.58.55:8000 (nur Tailscale) |

## Einrichtung, in dieser Reihenfolge

### 1. Nutzer und SSH

```bash
adduser zacha && usermod -aG sudo zacha
# als zacha: öffentlichen Schlüssel aus 1Password nach ~/.ssh/authorized_keys
```

`/etc/ssh/sshd_config.d/00-hardening.conf` (wird vor Hetzners cloud-init-Datei gelesen, erste Einstellung gewinnt):

```
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
```

`prohibit-password` statt `no`, weil Coolify sich als root mit eigenem Schlüssel auf den Host verbindet.

### 2. Updates, fail2ban, needrestart

```bash
apt update && apt full-upgrade -y && apt install -y unattended-upgrades fail2ban
dpkg-reconfigure -plow unattended-upgrades   # Yes
sed -i "s/^#\?\$nrconf{restart} = .*/\$nrconf{restart} = 'a';/" /etc/needrestart/needrestart.conf
echo '$nrconf{kernelhints} = -1;' > /etc/needrestart/conf.d/no-kernel-hints.conf
```

needrestart auf Automatik und ohne Kernel-Dialog, sonst bleibt jedes `apt install` oder `curl | bash`-Skript
(Coolify-Installer) in einem Dialog hängen, der bei Skripten unsichtbar ist. Nach Kernel-Updates selbst `reboot`.

### 3. Swap

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf && sysctl -p /etc/sysctl.d/99-swap.conf
```

### 4. Tailscale

```bash
curl -fsSL https://tailscale.com/install.sh | sh && tailscale up --ssh
```

In der Tailscale-Admin-Konsole: Key expiry für den Server deaktivieren.

### 5. Firewall (ufw)

```bash
ufw default deny incoming && ufw default allow outgoing
ufw allow 80/tcp && ufw allow 443/tcp
ufw allow in on tailscale0
ufw allow from 10.0.0.0/8 to any port 22 proto tcp comment 'Coolify container -> host SSH'
ufw enable
```

Port 22 ist aus dem Internet **nicht** offen. SSH nur über Tailscale. 10.0.0.0/8 ist Coolifys Docker-Netz.

**Docker umgeht ufw.** Veröffentlichte Container-Ports (`-p 8000:8000`) sind sonst trotz ufw offen. Deshalb in `/etc/ufw/after.rules` **und** `/etc/ufw/after6.rules` am Ende:

```
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -i tailscale0 -j RETURN
-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A DOCKER-USER -i eth0 -p tcp -m multiport --dports 80,443 -j RETURN
-A DOCKER-USER -i eth0 -j DROP
-A DOCKER-USER -j RETURN
COMMIT
```

Dann `ufw reload`. Ergebnis: Container-Ports aus dem Internet nur 80/443, über Tailscale alles.

### 6. Docker und Coolify

```bash
curl -fsSL https://get.docker.com | sh && usermod -aG docker zacha
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Coolify-Assistent: „This machine“. Settings → Instance's Domain `https://deploy.z-beermann.de`. Sources → GitHub App `coolify-z-beermann`, alle Repos. Projekt `z-beermann`, Environment `production`.

### 7. new-app (Formular und CLI für neue Apps)

Läuft als Coolify-App aus diesem Repo (Unterordner `new-app`), ohne Domain, mit Port-Mapping `3100:3000`,
also nur über Tailscale: http://100.105.58.55:3100. Braucht einen Coolify-API-Token (Keys & Tokens,
Rechte read/write/deploy) als Env-Variable `COOLIFY_TOKEN`. Erstanlage vom Mac aus, siehe `new-app/README.md`.

Für Claude Code auf dem Server: `~/apps/z-beermann-infra/new-app/.env` mit denselben Variablen, dann
`node ~/apps/z-beermann-infra/new-app/bin/new-app.js <name>`.

### 8. Claude Code auf dem Server

```bash
apt install -y tmux gh
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
# als zacha:
curl -fsSL https://claude.ai/install.sh | bash        # legt ~/.local/bin/claude an
gh auth login -p https -w                            # GitHub-Login im Browser
mkdir -p ~/apps && cd ~/apps && gh repo clone HerrStruppi/z-beermann-infra && gh repo clone HerrStruppi/gym-tracker
cd ~/apps/z-beermann-infra/new-app && npm ci --omit=dev && cp .env.example .env   # COOLIFY_TOKEN eintragen
```

Zwei Wege, Claude Code zu benutzen. Nichts läuft dauerhaft auf dem Server.

| Weg | Claude läuft | Server-Zugriff | Wofür |
|---|---|---|---|
| Desktop-App mit SSH-Host `zacha@ubuntu-1` | auf dem Server, nur während der Sitzung | ja | Arbeit am Mac, Server-Aufgaben, new-app-CLI, Logs |
| Mobile-App, Cloud-Sitzung mit GitHub-Repo | in Anthropics Cloud | nein | Code unterwegs, PR, Merge auf `main` deployt |

Neue Apps vom Handy: Formular unter `https://new.z-beermann.de` (Login nötig). Notfall per Terminal: `ssh zacha@ubuntu-1`, `claude`.

### 9. Login: Pocket ID + tinyauth

Angelegt mit `node ~/apps/z-beermann-infra/new-app/bin/setup-auth.js` (zwei Coolify-Apps aus Docker-Images):

| | Domain | Aufgabe |
|---|---|---|
| Pocket ID | `id.z-beermann.de` | Nutzer, Gruppen, Passkeys. Admin-UI unter /settings/admin. Volume `pocket-id-data`. |
| tinyauth | `auth.z-beermann.de` | Forward-Auth vor Traefik, leitet zu Pocket ID, setzt `Remote-Email` / `Remote-Groups`. Netzwerk-Alias `tinyauth`. |

Handarbeit nach dem Skript: Pocket ID `/setup` (Admin mit Passkey), OIDC-Client `tinyauth` mit Callback
`https://auth.z-beermann.de/api/oauth/callback/pocketid`, Reiter „Qualifikationen“ für das Secret, Reiter
„Erlaubte Benutzergruppen“ freigeben (Gruppe `familie`), Client-ID und Secret in Coolify bei tinyauth eintragen, Restart.

Pocket ID → Anwendungskonfiguration → E-Mail: SMTP `smtp.ionos.de`, Port 587, StartTLS, Benutzer und Absender
`info@z-beermann.de` (Passwort in 1Password). Eingeschaltet: E-Mail-Logincode vom Benutzer (Fallback zum Passkey),
E-Mail-Logincode von Administratoren (Einladungen), Benachrichtigung bei Login von neuem Gerät.

Eine App schützen heißt: Traefik-Label `…https-0-<uuid>.middlewares=gzip,tinyauth@docker`. Das macht
`new-app` per Checkbox (Standard an) bzw. `bin/protect.js <name>` für bestehende Apps, `--public` nimmt es weg.
Geschützt sind: gym-tracker, new-app (`new.z-beermann.de`, zusätzlich weiter Port 3100 über Tailscale).

## Prüfen

```bash
# vom Mac
nc -z -G 3 46.224.25.205 22 || echo "22 zu: gut"
nc -z -G 3 46.224.25.205 8000 || echo "8000 zu: gut"
ssh zacha@ubuntu-1 'free -h; docker ps'
```

## Noch nicht

Postgres, Off-Site-Backups (restic), Uptime Kuma. Siehe Plan.
