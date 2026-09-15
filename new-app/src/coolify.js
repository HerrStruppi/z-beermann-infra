// Kleiner Client für die Coolify-REST-API, beschränkt auf das, was der App-Vertrag braucht.
// Konventionen (Projekt, Environment, Server, GitHub-App, Domain) kommen aus der Umgebung.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// .env neben package.json einlesen, falls vorhanden. Gesetzte Umgebungsvariablen haben Vorrang.
const envFile = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (existsSync(envFile)) {
  const before = { ...process.env };
  process.loadEnvFile(envFile);
  for (const [k, v] of Object.entries(before)) process.env[k] = v;
}

const required = ['COOLIFY_URL', 'COOLIFY_TOKEN', 'COOLIFY_PROJECT', 'COOLIFY_ENVIRONMENT', 'COOLIFY_SERVER', 'GITHUB_APP', 'GITHUB_OWNER', 'BASE_DOMAIN'];

export function loadConfig(env = process.env) {
  const missing = required.filter((k) => !env[k]);
  if (missing.length) throw new Error(`Fehlende Umgebungsvariablen: ${missing.join(', ')}`);
  return {
    url: env.COOLIFY_URL.replace(/\/$/, ''),
    token: env.COOLIFY_TOKEN,
    project: env.COOLIFY_PROJECT,
    environment: env.COOLIFY_ENVIRONMENT,
    server: env.COOLIFY_SERVER,
    githubApp: env.GITHUB_APP,
    owner: env.GITHUB_OWNER,
    baseDomain: env.BASE_DOMAIN,
  };
}

export const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function parseEnvLines(text = '') {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) throw new Error(`Ungültige Env-Zeile: "${line}" (erwartet KEY=WERT)`);
    const key = line.slice(0, i).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new Error(`Ungültiger Variablenname: "${key}"`);
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out.push({ key, value });
  }
  return out;
}

/**
 * Traefik-Labels so, wie Coolify sie für eine App mit einer Domain erzeugt, optional mit tinyauth davor.
 * Coolify versteckt custom_labels in der API-Antwort, deshalb bauen wir sie deterministisch selbst.
 */
/**
 * Traefik-Labels für eine App. publicPaths: Pfad-Präfixe, die auch bei protect ohne Login erreichbar sind
 * (z. B. eine Token-geschützte API für Skripte). Sie bekommen einen eigenen Router mit längerer Regel,
 * den Traefik automatisch vor dem allgemeinen Router prüft.
 */
export function traefikLabels({ uuid, host, port = 3000, protect = false, extra = [], publicPaths = [] }) {
  const mw = protect ? 'gzip,tinyauth@docker' : 'gzip';
  const open = publicPaths.flatMap((path, i) => [
    `traefik.http.routers.https-open${i}-${uuid}.entryPoints=https`,
    `traefik.http.routers.https-open${i}-${uuid}.middlewares=gzip`,
    `traefik.http.routers.https-open${i}-${uuid}.rule=Host(\`${host}\`) && PathPrefix(\`${path}\`)`,
    `traefik.http.routers.https-open${i}-${uuid}.service=https-0-${uuid}`,
    `traefik.http.routers.https-open${i}-${uuid}.tls.certresolver=letsencrypt`,
    `traefik.http.routers.https-open${i}-${uuid}.tls=true`,
  ]);
  return [
    'traefik.enable=true',
    'traefik.http.middlewares.gzip.compress=true',
    'traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https',
    `traefik.http.routers.http-0-${uuid}.entryPoints=http`,
    `traefik.http.routers.http-0-${uuid}.middlewares=redirect-to-https`,
    `traefik.http.routers.http-0-${uuid}.rule=Host(\`${host}\`) && PathPrefix(\`/\`)`,
    `traefik.http.routers.http-0-${uuid}.service=http-0-${uuid}`,
    `traefik.http.routers.https-0-${uuid}.entryPoints=https`,
    `traefik.http.routers.https-0-${uuid}.middlewares=${mw}`,
    `traefik.http.routers.https-0-${uuid}.rule=Host(\`${host}\`) && PathPrefix(\`/\`)`,
    `traefik.http.routers.https-0-${uuid}.service=https-0-${uuid}`,
    `traefik.http.routers.https-0-${uuid}.tls.certresolver=letsencrypt`,
    `traefik.http.routers.https-0-${uuid}.tls=true`,
    `traefik.http.services.http-0-${uuid}.loadbalancer.server.port=${port}`,
    `traefik.http.services.https-0-${uuid}.loadbalancer.server.port=${port}`,
    ...open,
    ...extra,
  ].join('\n');
}

export class Coolify {
  constructor(config) {
    this.cfg = config;
    this.ids = null;
  }

  async api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`${this.cfg.url}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = data?.message || data?.error || text || res.statusText;
      const errs = data?.errors ? ' ' + JSON.stringify(data.errors) : '';
      throw new Error(`Coolify ${method} ${path} → ${res.status}: ${msg}${errs}`);
    }
    return data;
  }

  // Namen aus der Konfiguration in Coolify-UUIDs auflösen, einmal pro Prozess.
  async resolveIds() {
    if (this.ids) return this.ids;
    const [projects, servers, githubApps] = await Promise.all([
      this.api('/projects'), this.api('/servers'), this.api('/github-apps'),
    ]);
    const project = projects.find((p) => p.name === this.cfg.project);
    if (!project) throw new Error(`Projekt "${this.cfg.project}" nicht gefunden`);
    const server = servers.find((s) => s.name === this.cfg.server);
    if (!server) throw new Error(`Server "${this.cfg.server}" nicht gefunden`);
    const githubApp = githubApps.find((g) => g.name === this.cfg.githubApp);
    if (!githubApp) throw new Error(`GitHub-App "${this.cfg.githubApp}" nicht gefunden`);
    const full = await this.api(`/projects/${project.uuid}`);
    const environment = (full.environments || []).find((e) => e.name === this.cfg.environment);
    if (!environment) throw new Error(`Environment "${this.cfg.environment}" im Projekt nicht gefunden`);
    this.ids = { project: project.uuid, server: server.uuid, environment: environment.name, githubApp: githubApp.uuid, githubAppId: githubApp.id };
    return this.ids;
  }

  // Prüft über die GitHub-App, ob das Repo existiert und freigegeben ist, bevor ein Deploy ins Leere läuft.
  async repoExists(fullName) {
    const ids = await this.resolveIds();
    const res = await this.api(`/github-apps/${ids.githubAppId}/repositories`);
    const want = fullName.toLowerCase();
    return (res.repositories || []).some((r) => String(r.full_name || '').toLowerCase() === want);
  }

  async findApp(name) {
    const apps = await this.api('/applications');
    return apps.find((a) => a.name === name) || null;
  }

  async setEnvs(uuid, envs) {
    if (!envs?.length) return;
    await this.api(`/applications/${uuid}/envs/bulk`, {
      method: 'PATCH',
      body: { data: envs.map(({ key, value }) => ({ key, value, is_runtime: true, is_buildtime: false, is_preview: false, is_literal: false })) },
    });
  }

  async addStorage(uuid, name, mountPath) {
    await this.api(`/applications/${uuid}/storages`, { method: 'POST', body: { type: 'persistent', name, mount_path: mountPath } });
  }

  async setLabels(uuid, labels) {
    await this.api(`/applications/${uuid}`, { method: 'PATCH', body: { custom_labels: Buffer.from(labels, 'utf8').toString('base64') } });
  }

  /** Setzt tinyauth vor die App: Login nötig, App bekommt Remote-Email. Wirkt ab dem nächsten Deploy. */
  async protect(uuid, host, port = 3000) {
    await this.setLabels(uuid, traefikLabels({ uuid, host, port, protect: true }));
  }

  /**
   * App aus einem fertigen Docker-Image (für Plattform-Dienste wie Pocket ID, tinyauth).
   * opts: { name, image, tag, port, domain?, envs?, storage?: {name, mount}, aliases?, extraLabels?: [], protect? }
   */
  async createImageApp(opts) {
    const { name } = opts;
    if (!NAME_PATTERN.test(name)) throw new Error(`Ungültiger Name "${name}"`);
    if (await this.findApp(name)) throw new Error(`Es gibt schon eine App namens "${name}"`);
    const ids = await this.resolveIds();
    const url = opts.domain ? `https://${opts.domain}` : null;
    const body = {
      project_uuid: ids.project, server_uuid: ids.server, environment_name: ids.environment,
      docker_registry_image_name: opts.image, docker_registry_image_tag: opts.tag || 'latest',
      name, ports_exposes: String(opts.port), instant_deploy: false, is_force_https_enabled: true,
    };
    if (url) body.domains = url; else body.autogenerate_domain = false;
    if (opts.aliases) body.custom_network_aliases = opts.aliases;
    const created = await this.api('/applications/dockerimage', { method: 'POST', body });
    const uuid = created.uuid;
    await this.setEnvs(uuid, opts.envs);
    if (opts.storage) await this.addStorage(uuid, opts.storage.name, opts.storage.mount);
    if (url && (opts.extraLabels?.length || opts.protect)) {
      await this.setLabels(uuid, traefikLabels({ uuid, host: opts.domain, port: opts.port, protect: Boolean(opts.protect), extra: opts.extraLabels || [] }));
    }
    return { uuid, url, coolifyUrl: `${this.cfg.url}/project/${ids.project}/environment/${ids.environment}/application/${uuid}` };
  }

  /**
   * Legt eine App nach Vertrag an. Gibt {uuid, url} zurück, deployt noch nicht.
   * opts: { name, repo?, branch?, storage?, envs?: [{key,value}], baseDirectory?, portsMappings?, internal?, protect? }
   * internal=true: keine öffentliche Domain, Erreichbarkeit nur über portsMappings (also nur Tailscale).
   * protect=true: Login über tinyauth nötig, die App bekommt den Header Remote-Email.
   */
  async createApp(opts) {
    const { name } = opts;
    if (!NAME_PATTERN.test(name)) throw new Error(`Ungültiger Name "${name}": nur a-z, 0-9 und -, kein - am Anfang/Ende`);
    if (await this.findApp(name)) throw new Error(`Es gibt schon eine App namens "${name}"`);
    const ids = await this.resolveIds();
    const repo = opts.repo || `${this.cfg.owner}/${name}`;
    if (!(await this.repoExists(repo))) throw new Error(`Repo ${repo} nicht gefunden oder für die GitHub-App "${this.cfg.githubApp}" nicht freigegeben`);
    const url = opts.internal ? null : `https://${name}.${this.cfg.baseDomain}`;
    const body = {
      project_uuid: ids.project,
      server_uuid: ids.server,
      environment_name: ids.environment,
      github_app_uuid: ids.githubApp,
      git_repository: repo,
      git_branch: opts.branch || 'main',
      build_pack: 'dockerfile',
      dockerfile_location: '/Dockerfile',
      base_directory: opts.baseDirectory || '/',
      name,
      ports_exposes: '3000',
      instant_deploy: false,
      is_auto_deploy_enabled: true,
      is_force_https_enabled: true,
      health_check_enabled: true,
      health_check_path: '/healthz',
      health_check_port: '3000',
      health_check_return_code: 200,
    };
    if (url) body.domains = url;
    else body.autogenerate_domain = false; // sonst vergibt Coolify eine öffentliche sslip.io-Adresse
    if (opts.portsMappings) body.ports_mappings = opts.portsMappings;
    const created = await this.api('/applications/private-github-app', { method: 'POST', body });
    const uuid = created.uuid;

    await this.setEnvs(uuid, opts.envs);
    if (opts.storage) await this.addStorage(uuid, `${name}-data`, '/data');
    if (opts.protect && url) await this.protect(uuid, `${name}.${this.cfg.baseDomain}`);
    return { uuid, url, coolifyUrl: `${this.cfg.url}/project/${ids.project}/environment/${ids.environment}/application/${uuid}` };
  }

  async deploy(uuid) {
    const res = await this.api(`/applications/${uuid}/start`, { method: 'POST', body: { force: false, instant_deploy: false } });
    const deploymentUuid = res.deployment_uuid || res.deployments?.[0]?.deployment_uuid;
    if (!deploymentUuid) throw new Error(`Deploy gestartet, aber keine deployment_uuid in der Antwort: ${JSON.stringify(res)}`);
    return deploymentUuid;
  }

  // status: queued | in_progress | finished | failed | cancelled-by-user
  async deployment(uuid) {
    const d = await this.api(`/deployments/${uuid}`);
    return { status: d.status, logs: d.logs ?? null };
  }

  async waitForDeployment(uuid, { intervalMs = 3000, timeoutMs = 15 * 60 * 1000, onTick } = {}) {
    const start = Date.now();
    for (;;) {
      const d = await this.deployment(uuid);
      onTick?.(d);
      if (['finished', 'failed', 'cancelled-by-user'].includes(d.status)) return d;
      if (Date.now() - start > timeoutMs) throw new Error('Deploy dauert zu lange, bitte in Coolify nachsehen');
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
