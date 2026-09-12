import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Coolify, loadConfig, parseEnvLines, NAME_PATTERN } from './coolify.js';
import { page } from './page.js';

const cfg = loadConfig();
const coolify = new Coolify(cfg);
const app = new Hono();

app.get('/healthz', (c) => c.text('ok'));

app.get('/', (c) => c.html(page({ owner: cfg.owner, baseDomain: cfg.baseDomain, coolifyUrl: cfg.url })));

// Legt die App an und startet den ersten Deploy. Antwort enthält alles, was die Seite zum Verfolgen braucht.
app.post('/api/apps', async (c) => {
  let input;
  try { input = await c.req.json(); } catch { return c.json({ error: 'Ungültiges JSON' }, 400); }
  const name = String(input.name || '').trim().toLowerCase();
  if (!NAME_PATTERN.test(name)) return c.json({ error: 'Name: nur a-z, 0-9 und Bindestrich, kein Bindestrich am Anfang oder Ende' }, 400);
  let envs;
  try { envs = parseEnvLines(input.env || ''); } catch (e) { return c.json({ error: e.message }, 400); }
  try {
    const steps = [];
    const created = await coolify.createApp({ name, storage: Boolean(input.storage), protect: Boolean(input.protect), envs, repo: input.repo || undefined });
    steps.push('App angelegt', envs.length ? `${envs.length} Umgebungsvariablen gesetzt` : null, input.storage ? `Volume ${name}-data auf /data` : null, input.protect ? 'Login über tinyauth aktiviert' : null);
    const deploymentUuid = await coolify.deploy(created.uuid);
    steps.push('Deploy gestartet');
    return c.json({ ...created, deploymentUuid, steps: steps.filter(Boolean) });
  } catch (e) {
    return c.json({ error: e.message }, 502);
  }
});

app.get('/api/deployments/:uuid', async (c) => {
  try {
    const d = await coolify.deployment(c.req.param('uuid'));
    return c.json(d);
  } catch (e) {
    return c.json({ error: e.message }, 502);
  }
});

const port = Number(process.env.PORT ?? 3000);
// '::' = alle Interfaces, IPv4 und IPv6. Der Coolify-Healthcheck ruft localhost auf, das ist in Alpine ::1.
serve({ fetch: app.fetch, port, hostname: '::' }, () => {
  console.log(`new-app läuft auf :${port}, Coolify: ${cfg.url}, Domain: *.${cfg.baseDomain}`);
});
