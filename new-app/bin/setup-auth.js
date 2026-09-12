#!/usr/bin/env node
// Legt die Login-Infrastruktur als zwei Coolify-Apps an (einmalig):
//   pocket-id  → https://id.<domain>    Identity Provider, Passkey-only, OIDC
//   tinyauth   → https://auth.<domain>  Forward-Auth vor Traefik, redirectet zu Pocket ID, setzt Remote-Email
//
// Danach von Hand: https://id.<domain>/setup (Admin mit Passkey), OIDC-Client "tinyauth" anlegen,
// Client-ID und Secret in Coolify bei tinyauth in die beiden leeren Env-Variablen eintragen, tinyauth neu starten.

import { randomBytes } from 'node:crypto';
import { Coolify, loadConfig } from '../src/coolify.js';

const cfg = loadConfig();
const coolify = new Coolify(cfg);
const idHost = `id.${cfg.baseDomain}`;
const authHost = `auth.${cfg.baseDomain}`;

async function ensure(name, create) {
  const existing = await coolify.findApp(name);
  if (existing) { console.log(`${name}: gibt es schon (${existing.uuid}), übersprungen`); return existing.uuid; }
  const created = await create();
  console.log(`${name}: angelegt (${created.uuid}) → ${created.url}`);
  const dep = await coolify.deploy(created.uuid);
  const d = await coolify.waitForDeployment(dep);
  console.log(`${name}: Deploy ${d.status}`);
  return created.uuid;
}

try {
  await ensure('pocket-id', () => coolify.createImageApp({
    name: 'pocket-id', image: 'ghcr.io/pocket-id/pocket-id', tag: 'v2', port: 1411, domain: idHost,
    envs: [
      { key: 'APP_URL', value: `https://${idHost}` },
      { key: 'TRUST_PROXY', value: 'true' },
      { key: 'ENCRYPTION_KEY', value: randomBytes(32).toString('base64') },
      { key: 'ANALYTICS_DISABLED', value: 'true' },
    ],
    storage: { name: 'pocket-id-data', mount: '/app/data' },
  }));

  await ensure('tinyauth', () => coolify.createImageApp({
    name: 'tinyauth', image: 'ghcr.io/tinyauthapp/tinyauth', tag: 'v5', port: 3000, domain: authHost,
    aliases: 'tinyauth',
    envs: [
      { key: 'TINYAUTH_APPURL', value: `https://${authHost}` },
      // Gleiches Bild und Name wie Pocket ID, damit die kurze Zwischenseite nicht wie ein fremder Dienst aussieht.
      { key: 'TINYAUTH_UI_TITLE', value: cfg.baseDomain },
      { key: 'TINYAUTH_UI_BACKGROUNDIMAGE', value: `https://${idHost}/api/application-images/background` },
      { key: 'TINYAUTH_AUTH_TRUSTEDPROXIES', value: '10.0.0.0/8' },
      { key: 'TINYAUTH_AUTH_SECURECOOKIE', value: 'true' },
      { key: 'TINYAUTH_OAUTH_AUTOREDIRECT', value: 'pocketid' },
      { key: 'TINYAUTH_OAUTH_PROVIDERS_POCKETID_NAME', value: 'Pocket ID' },
      { key: 'TINYAUTH_OAUTH_PROVIDERS_POCKETID_CLIENTID', value: '' },
      { key: 'TINYAUTH_OAUTH_PROVIDERS_POCKETID_CLIENTSECRET', value: '' },
      { key: 'TINYAUTH_OAUTH_PROVIDERS_POCKETID_AUTHURL', value: `https://${idHost}/authorize` },
      { key: 'TINYAUTH_OAUTH_PROVIDERS_POCKETID_TOKENURL', value: `https://${idHost}/api/oidc/token` },
      { key: 'TINYAUTH_OAUTH_PROVIDERS_POCKETID_USERINFOURL', value: `https://${idHost}/api/oidc/userinfo` },
      { key: 'TINYAUTH_OAUTH_PROVIDERS_POCKETID_REDIRECTURL', value: `https://${authHost}/api/oauth/callback/pocketid` },
      { key: 'TINYAUTH_OAUTH_PROVIDERS_POCKETID_SCOPES', value: 'openid email profile groups' },
    ],
    // Die Middleware, die geschützte Apps als "tinyauth@docker" referenzieren.
    extraLabels: [
      'traefik.http.middlewares.tinyauth.forwardauth.address=http://tinyauth:3000/api/auth/traefik',
      'traefik.http.middlewares.tinyauth.forwardauth.authResponseHeaders=Remote-User,Remote-Email,Remote-Name,Remote-Groups',
    ],
  }));

  console.log(`
Nächste Schritte von Hand:
1. https://${idHost}/setup öffnen, Admin-Konto mit Passkey anlegen.
2. In Pocket ID: Anwendungskonfiguration → Name "${cfg.baseDomain}", Hintergrundbild nach Geschmack.
   OIDC Clients → neu, Name "${cfg.baseDomain}", Callback URL https://${authHost}/api/oauth/callback/pocketid,
   "Einwilligungsbildschirm überspringen" an, Reiter Qualifikationen → Secret, Reiter Erlaubte Benutzergruppen → Gruppe freigeben.
3. Client-ID und Client-Secret in Coolify bei "tinyauth" in TINYAUTH_OAUTH_PROVIDERS_POCKETID_CLIENTID / _CLIENTSECRET eintragen, Restart.
4. Test: https://${authHost} muss zu Pocket ID weiterleiten.`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
