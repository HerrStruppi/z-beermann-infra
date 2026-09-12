#!/usr/bin/env node
// Bestehende App nachträglich hinter den Login stellen (oder wieder öffentlich machen) und neu deployen.
//
//   protect <name>            Login nötig (tinyauth vor der App, Header Remote-Email)
//   protect <name> --public   Login entfernen

import { parseArgs } from 'node:util';
import { Coolify, loadConfig, traefikLabels } from '../src/coolify.js';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { public: { type: 'boolean', default: false } } });
if (positionals.length !== 1) { console.log('Aufruf: protect <name> [--public]'); process.exit(1); }

const cfg = loadConfig();
const coolify = new Coolify(cfg);
try {
  const app = await coolify.findApp(positionals[0]);
  if (!app) throw new Error(`App "${positionals[0]}" nicht gefunden`);
  const host = `${app.name}.${cfg.baseDomain}`;
  const port = Number(app.ports_exposes || 3000);
  await coolify.setLabels(app.uuid, traefikLabels({ uuid: app.uuid, host, port, protect: !values.public }));
  console.log(`${app.name}: ${values.public ? 'öffentlich' : 'Login nötig'}, deploye neu …`);
  const d = await coolify.waitForDeployment(await coolify.deploy(app.uuid));
  console.log(`Deploy ${d.status}`);
  process.exit(d.status === 'finished' ? 0 : 2);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
