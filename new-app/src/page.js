// Die eine Seite: Formular, Fortschritt, Weiterleitung. Kein Framework, kein Build.
export function page({ owner, baseDomain, coolifyUrl }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Neue App erstellen</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f3f4f7; --card: #ffffff; --ink: #16181d; --ink-2: #5b6170; --line: #dfe2e8; --line-strong: #c9cdd6;
    --accent: #2f5bd7; --accent-hover: #2650bf; --accent-soft: #e8eefc; --on-accent: #fff;
    --ok: #1c7c54; --ok-soft: #e3f4ea; --bad: #b3261e; --bad-soft: #fbe9e7;
    --shadow: 0 1px 2px rgba(16, 24, 40, .06), 0 8px 24px -12px rgba(16, 24, 40, .18);
    --radius: 14px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1117; --card: #171a22; --ink: #e8eaf0; --ink-2: #9aa1b2; --line: #262a35; --line-strong: #353a48;
      --accent: #7f9cff; --accent-hover: #93acff; --accent-soft: #1d2540; --on-accent: #0f1117;
      --ok: #5fd39a; --ok-soft: #143122; --bad: #f4938a; --bad-soft: #3a1c19;
      --shadow: 0 1px 2px rgba(0,0,0,.4), 0 12px 32px -16px rgba(0,0,0,.6);
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
  main { max-width: 520px; margin: 0 auto; padding: 56px 20px 80px; }
  h1 { font-size: 26px; font-weight: 650; letter-spacing: -.01em; margin: 0 0 22px; }

  .card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); }
  form.card { padding: 26px 26px 24px; }
  .field { margin-bottom: 20px; }
  .field:last-of-type { margin-bottom: 0; }
  label { display: block; font-weight: 600; font-size: 14px; margin-bottom: 8px; }
  input[type=text], textarea {
    width: 100%; font: inherit; color: inherit; background: var(--bg);
    border: 1px solid var(--line-strong); border-radius: 10px; padding: 11px 13px;
    transition: border-color .15s, box-shadow .15s;
  }
  input[type=text]::placeholder, textarea::placeholder { color: var(--ink-2); opacity: .7; }
  input[type=text]:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
  textarea { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 13.5px; line-height: 1.6; min-height: 120px; resize: vertical; display: block; }

  .check { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--line-strong); border-radius: 10px; cursor: pointer; user-select: none; transition: border-color .15s, background .15s; }
  .check:hover { border-color: var(--accent); }
  .check:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
  .check input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); flex: none; }
  .check span { font-weight: 500; font-size: 15px; }

  button {
    margin-top: 26px; width: 100%; font: inherit; font-weight: 600; font-size: 15px; padding: 13px;
    border: 0; border-radius: 10px; background: var(--accent); color: var(--on-accent); cursor: pointer;
    transition: background .15s, transform .05s;
  }
  button:hover:not(:disabled) { background: var(--accent-hover); }
  button:active:not(:disabled) { transform: translateY(1px); }
  button:disabled { opacity: .55; cursor: default; }

  #progress { margin-top: 20px; padding: 22px 26px; }
  #progress.bad { border-color: color-mix(in srgb, var(--bad) 45%, var(--line)); }
  .steps { list-style: none; padding: 0; margin: 0; }
  .steps li { display: flex; align-items: flex-start; gap: 12px; padding: 9px 0; font-size: 15px; border-bottom: 1px solid var(--line); }
  .steps li:last-child { border-bottom: 0; }
  .steps .ico { flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; margin-top: 1px; }
  .steps .ok .ico { background: var(--ok-soft); color: var(--ok); }
  .steps .bad .ico { background: var(--bad-soft); color: var(--bad); }
  .steps .run .ico { border: 2px solid var(--line-strong); border-top-color: var(--accent); animation: spin .8s linear infinite; }
  .steps .bad { color: var(--bad); }
  .steps .bad code { font-family: ui-monospace, Menlo, monospace; font-size: 13px; word-break: break-word; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .foot { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: 14px; color: var(--ink-2); flex-wrap: wrap; }
  .foot a { color: var(--accent); text-decoration: none; font-weight: 500; }
  .foot a:hover { text-decoration: underline; }
  .done { margin-top: 14px; font-size: 15px; color: var(--ink); }
  .done a { color: var(--accent); font-weight: 600; }
  [hidden] { display: none !important; }
  @media (prefers-reduced-motion: reduce) { .steps .run .ico { animation: none; } }
</style>
</head>
<body>
<main>
  <h1>Neue App erstellen</h1>

  <form id="f" class="card" novalidate>
    <div class="field">
      <label for="name">Name des GitHub Repository</label>
      <input type="text" id="name" name="name" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="meine-app" required>
    </div>

    <div class="field">
      <label class="check"><input type="checkbox" id="storage" name="storage"><span>App benötigt einen persistenten Speicher</span></label>
    </div>

    <div class="field">
      <label class="check"><input type="checkbox" id="protect" name="protect" checked><span>Nur mit Login erreichbar</span></label>
    </div>

    <div class="field">
      <label for="env">Umgebungsvariablen</label>
      <textarea id="env" name="env" placeholder="DATABASE_URL=postgres://…&#10;SOME_FLAG=true"></textarea>
    </div>

    <button type="submit" id="go">Anlegen und deployen</button>
  </form>

  <section id="progress" class="card" hidden aria-live="polite">
    <ul class="steps" id="steps"></ul>
    <div class="foot" id="foot" hidden><span id="elapsed"></span><a id="coolify" target="_blank" rel="noopener">In Coolify öffnen</a></div>
    <div class="done" id="done" hidden></div>
  </section>
</main>
<script>
  const $ = (s) => document.querySelector(s);
  const f = $('#f'), nameEl = $('#name'), go = $('#go');
  const progress = $('#progress'), steps = $('#steps'), foot = $('#foot'), elapsed = $('#elapsed'), coolify = $('#coolify'), done = $('#done');
  const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const ICON = { ok: '✓', bad: '!', run: '' };

  const step = (text, state) => {
    const li = document.createElement('li'); li.className = state;
    const ico = document.createElement('span'); ico.className = 'ico'; ico.textContent = ICON[state];
    const t = document.createElement('span'); t.innerHTML = text;
    li.append(ico, t); steps.appendChild(li); return li;
  };
  const setState = (li, state, text) => { li.className = state; li.firstChild.textContent = ICON[state]; if (text) li.lastChild.innerHTML = text; };
  const fail = (li, msg) => { setState(li, 'bad', 'Fehler: <code></code>'); li.querySelector('code').textContent = msg; progress.classList.add('bad'); go.disabled = false; };
  const reset = () => { steps.innerHTML = ''; done.hidden = true; foot.hidden = true; progress.classList.remove('bad'); progress.hidden = false; requestAnimationFrame(() => progress.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); };

  nameEl.addEventListener('input', () => nameEl.setCustomValidity(''));

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameEl.value.trim().toLowerCase();
    if (!NAME.test(name)) { nameEl.setCustomValidity('Nur Kleinbuchstaben, Ziffern und Bindestriche'); nameEl.reportValidity(); return; }
    go.disabled = true; reset();

    const creating = step('App <strong>' + name + '</strong> anlegen', 'run');
    let res;
    try {
      const r = await fetch('/api/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, storage: $('#storage').checked, protect: $('#protect').checked, env: $('#env').value }) });
      res = await r.json();
      if (!r.ok) throw new Error(res.error || r.statusText);
    } catch (err) { fail(creating, err.message); return; }

    setState(creating, 'ok');
    res.steps.slice(1, -1).forEach((s) => step(s, 'ok'));
    coolify.href = res.coolifyUrl; foot.hidden = false;
    const building = step('Build läuft', 'run');
    const started = Date.now();

    const poll = async () => {
      let d;
      try { d = await (await fetch('/api/deployments/' + res.deploymentUuid)).json(); } catch { d = { status: 'unknown' }; }
      const secs = Math.round((Date.now() - started) / 1000);
      elapsed.textContent = secs + ' s';
      if (d.status === 'finished') {
        setState(building, 'ok', 'Build fertig nach ' + secs + ' s');
        done.innerHTML = 'Läuft unter <a href="' + res.url + '">' + res.url + '</a>, Weiterleitung in 3 s.';
        done.hidden = false;
        setTimeout(() => { location.href = res.url; }, 3000);
        return;
      }
      if (d.status === 'failed' || d.status === 'cancelled-by-user') {
        fail(building, 'Deploy ' + d.status + ', Log in Coolify ansehen'); return;
      }
      setTimeout(poll, 3000);
    };
    poll();
  });
</script>
</body>
</html>`;
}
