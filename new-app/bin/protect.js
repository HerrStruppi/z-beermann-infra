#!/usr/bin/env node
// Bestehende App nachträglich hinter den Login stellen (oder wieder öffentlich machen) und neu deployen.
//
//   protect <name>                          Login nötig (tinyauth vor der App, Header Remote-Email)
//   protect <name> --public                 Login entfernen
//   protect <name> --public-path /api/agent Pfad-Präfix ohne Login lassen (wiederholbar), Rest bleibt geschützt
//   protect <name> --env KEY=WERT           Umgebungsvariable setzen (wiederholbar), z. B. ein API-Token

import { parseArgs } from 'node:util';
import { Coolify, loadConfig, traefikLabels } from '../src/coolify.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { public: { type: 'boolean', default: false }, 'public-path': { type: 'string', multiple: true, default: [] }, env: { type: 'string', multiple: true, default: [] } },
});
if (positionals.length !== 1) {
  console.log('Aufruf: protect <name> [--public] [--public-path /pfad ...] [--env KEY=WERT ...]');
  process.exit(1);
}
const publicPaths = values['public-path'];
if (publicPaths.some((p) => !p.startsWith('/'))) {
  console.error('--public-path muss mit / beginnen');
  process.exit(1);
}
const envs = values.env.map((kv) => {
  const i = kv.indexOf('=');
  if (i < 1) {
    console.error(`--env erwartet KEY=WERT, bekommen: ${kv}`);
    process.exit(1);
  }
  return { key: kv.slice(0, i), value: kv.slice(i + 1) };
});

const cfg = loadConfig();
const coolify = new Coolify(cfg);
try {
  const app = await coolify.findApp(positionals[0]);
  if (!app) throw new Error(`App "${positionals[0]}" nicht gefunden`);
  const host = `${app.name}.${cfg.baseDomain}`;
  const port = Number(app.ports_exposes || 3000);
  await coolify.setEnvs(app.uuid, envs);
  await coolify.setLabels(app.uuid, traefikLabels({ uuid: app.uuid, host, port, protect: !values.public, publicPaths }));
  const mode = values.public ? 'öffentlich' : `Login nötig${publicPaths.length ? `, offen: ${publicPaths.join(', ')}` : ''}`;
  console.log(`${app.name}: ${mode}${envs.length ? `, ${envs.length} Env-Variable(n) gesetzt` : ''}, deploye neu …`);
  const d = await coolify.waitForDeployment(await coolify.deploy(app.uuid));
  console.log(`Deploy ${d.status}`);
  process.exit(d.status === 'finished' ? 0 : 2);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
