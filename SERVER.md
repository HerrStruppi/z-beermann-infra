# Server: ubuntu-1 (Hetzner CX23)

Was auf dem Server eingerichtet ist und warum. Ziel: ein Neuaufbau nach dieser Datei dauert einen Abend.

| | |
|---|---|
| Anbieter | Hetzner Cloud, CX23 (2 vCPU, 4 GB RAM, 40 GB NVMe), Ubuntu 24.04 |
| Öffentliche IP | 46.224.25.205 (A-Records `@` und `*` bei IONOS zeigen hierhin) |
| Tailscale-IP | 100.105.58.55, Name `ubuntu-1` |
| Nutzer | `zacha` (sudo), SSH-Key im 1Password-Agent |
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
```

needrestart auf Automatik, sonst bleibt jedes `curl | bash`-Skript (Coolify-Installer) in einem unsichtbaren Dialog hängen.

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

## Prüfen

```bash
# vom Mac
nc -z -G 3 46.224.25.205 22 || echo "22 zu: gut"
nc -z -G 3 46.224.25.205 8000 || echo "8000 zu: gut"
ssh zacha@ubuntu-1 'free -h; docker ps'
```

## Noch nicht

Pocket ID + tinyauth (Login), Postgres, Backups (restic), Uptime Kuma, Claude Code auf dem Server. Siehe Plan.
