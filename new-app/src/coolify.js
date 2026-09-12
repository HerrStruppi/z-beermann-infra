// Kleiner Client für die Coolify-REST-API, beschränkt auf das, was der App-Vertrag braucht.
// Konventionen (Projekt, Environment, Server, GitHub-App, Domain) kommen aus der Umgebung.

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
    this.ids = { project: project.uuid, server: server.uuid, environment: environment.name, githubApp: githubApp.uuid };
    return this.ids;
  }

  async findApp(name) {
    const apps = await this.api('/applications');
    return apps.find((a) => a.name === name) || null;
  }

  /**
   * Legt eine App nach Vertrag an. Gibt {uuid, url} zurück, deployt noch nicht.
   * opts: { name, repo?, branch?, storage?, envs?: [{key,value}], baseDirectory?, portsMappings?, internal? }
   * internal=true: keine öffentliche Domain, Erreichbarkeit nur über portsMappings (also nur Tailscale).
   */
  async createApp(opts) {
    const { name } = opts;
    if (!NAME_PATTERN.test(name)) throw new Error(`Ungültiger Name "${name}": nur a-z, 0-9 und -, kein - am Anfang/Ende`);
    if (await this.findApp(name)) throw new Error(`Es gibt schon eine App namens "${name}"`);
    const ids = await this.resolveIds();
    const url = opts.internal ? null : `https://${name}.${this.cfg.baseDomain}`;
    const body = {
      project_uuid: ids.project,
      server_uuid: ids.server,
      environment_name: ids.environment,
      github_app_uuid: ids.githubApp,
      git_repository: opts.repo || `${this.cfg.owner}/${name}`,
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

    if (opts.envs?.length) {
      await this.api(`/applications/${uuid}/envs/bulk`, {
        method: 'PATCH',
        body: { data: opts.envs.map(({ key, value }) => ({ key, value, is_runtime: true, is_buildtime: false, is_preview: false, is_literal: false })) },
      });
    }
    if (opts.storage) {
      await this.api(`/applications/${uuid}/storages`, {
        method: 'POST',
        body: { type: 'persistent', name: `${name}-data`, mount_path: '/data' },
      });
    }
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
