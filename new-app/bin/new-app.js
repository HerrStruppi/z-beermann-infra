#!/usr/bin/env node
// CLI mit derselben Logik wie das Formular. Für Claude Code auf dem Server und für die Erstanlage vom Mac.
//
//   new-app <name> [--storage] [--env KEY=WERT ...] [--repo owner/name] [--branch main]
//                  [--base-dir /pfad] [--ports 3100:3000] [--internal] [--no-deploy] [--no-wait]
//
// --internal: keine öffentliche Domain; die App ist nur über --ports (und damit nur über Tailscale) erreichbar.

import { parseArgs } from 'node:util';
import { Coolify, loadConfig, parseEnvLines } from '../src/coolify.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    storage: { type: 'boolean', default: false },
    env: { type: 'string', multiple: true, default: [] },
    repo: { type: 'string' },
    branch: { type: 'string' },
    'base-dir': { type: 'string' },
    ports: { type: 'string' },
    internal: { type: 'boolean', default: false },
    deploy: { type: 'boolean', default: true },
    wait: { type: 'boolean', default: true },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || positionals.length !== 1) {
  console.log('Aufruf: new-app <name> [--storage] [--env KEY=WERT ...] [--repo owner/name] [--branch main] [--base-dir /pfad] [--ports 3100:3000] [--internal] [--no-deploy] [--no-wait]');
  process.exit(values.help ? 0 : 1);
}

const name = positionals[0].toLowerCase();
let envs;
try { envs = parseEnvLines(values.env.join('\n')); } catch (e) { console.error(e.message); process.exit(1); }
if (values.internal && !values.ports) { console.error('--internal braucht --ports, sonst ist die App nirgends erreichbar'); process.exit(1); }

const coolify = new Coolify(loadConfig());
try {
  const created = await coolify.createApp({
    name, envs, storage: values.storage, repo: values.repo, branch: values.branch,
    baseDirectory: values['base-dir'], portsMappings: values.ports, internal: values.internal,
  });
  console.log(`App angelegt: ${name} (${created.uuid})`);
  if (created.url) console.log(`URL: ${created.url}`);
  if (values.ports) console.log(`Port-Mapping: ${values.ports} (nur über Tailscale erreichbar)`);
  console.log(`Coolify: ${created.coolifyUrl}`);
  if (!values.deploy) process.exit(0);

  const deploymentUuid = await coolify.deploy(created.uuid);
  console.log(`Deploy gestartet: ${deploymentUuid}`);
  if (!values.wait) process.exit(0);

  let last = '';
  const d = await coolify.waitForDeployment(deploymentUuid, {
    onTick: (t) => { if (t.status !== last) { console.log(`  … ${t.status}`); last = t.status; } },
  });
  if (d.status === 'finished') { console.log(`Fertig${created.url ? ': ' + created.url : ''}`); process.exit(0); }
  console.error(`Deploy ${d.status}. Log: ${created.coolifyUrl}`);
  process.exit(2);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
