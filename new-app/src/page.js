// Die eine Seite: Formular, Fortschritt, Weiterleitung. Kein Framework, kein Build.
export function page({ owner, baseDomain, coolifyUrl }) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Neue App</title>
<style>
  :root { color-scheme: light dark; --ink: #1a1a1a; --muted: #6b7280; --line: #d1d5db; --accent: #2b52c9; --bg: #f7f7f8; --card: #fff; --ok: #1e7f57; --bad: #b42318; }
  @media (prefers-color-scheme: dark) { :root { --ink: #e6e8ef; --muted: #9aa3b2; --line: #333a48; --accent: #8aa4ff; --bg: #12151e; --card: #191d29; --ok: #5fcf95; --bad: #f28b82; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, sans-serif; }
  main { max-width: 560px; margin: 0 auto; padding: 32px 20px 64px; }
  h1 { font-size: 24px; margin: 0 0 20px; }
  form, .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 20px; }
  label { display: block; font-weight: 600; font-size: 14px; margin: 14px 0 6px; }
  label:first-child { margin-top: 0; }
  .hint { font-weight: 400; color: var(--muted); font-size: 13px; }
  input[type=text], textarea { width: 100%; font: inherit; padding: 9px 11px; border: 1px solid var(--line); border-radius: 7px; background: transparent; color: inherit; }
  textarea { font-family: ui-monospace, Menlo, monospace; font-size: 13.5px; min-height: 110px; }
  .row { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
  .row input { width: 18px; height: 18px; }
  .row label { margin: 0; }
  button { margin-top: 20px; width: 100%; font: inherit; font-weight: 600; padding: 12px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; cursor: pointer; }
  button:disabled { opacity: .5; cursor: default; }
  ul.steps { list-style: none; padding: 0; margin: 0; }
  ul.steps li { padding: 6px 0; border-bottom: 1px solid var(--line); }
  ul.steps li:last-child { border: 0; }
  .ok { color: var(--ok); } .bad { color: var(--bad); }
  .status { font-weight: 600; margin: 12px 0 4px; }
  a { color: var(--accent); }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main>
  <h1>Neue App</h1>

  <form id="f">
    <label for="name">Name</label>
    <input type="text" id="name" name="name" autocomplete="off" autocapitalize="off" spellcheck="false" pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?" required placeholder="meine-app">

    <div class="row">
      <input type="checkbox" id="storage" name="storage">
      <label for="storage">Persistenten Speicher erstellen</label>
    </div>

    <label for="env">Umgebungsvariablen <span class="hint">eine pro Zeile, KEY=WERT, optional</span></label>
    <textarea id="env" name="env" placeholder="DATABASE_URL=postgres://…&#10;SOME_FLAG=true"></textarea>

    <button type="submit" id="go">Anlegen und deployen</button>
  </form>

  <div class="card" id="progress" hidden>
    <ul class="steps" id="steps"></ul>
    <div class="status" id="status"></div>
    <div id="links"></div>
  </div>
</main>
<script>
  const $ = (s) => document.querySelector(s);
  const f = $('#f'), nameEl = $('#name'), go = $('#go');
  const progress = $('#progress'), steps = $('#steps'), status = $('#status'), links = $('#links');
  const addStep = (text, cls) => { const li = document.createElement('li'); li.textContent = text; if (cls) li.className = cls; steps.appendChild(li); };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    go.disabled = true; progress.hidden = false; steps.innerHTML = ''; status.textContent = ''; links.innerHTML = '';
    const body = { name: nameEl.value.trim().toLowerCase(), storage: $('#storage').checked, env: $('#env').value };
    let res;
    try {
      const r = await fetch('/api/apps', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      res = await r.json();
      if (!r.ok) throw new Error(res.error || r.statusText);
    } catch (err) {
      addStep('Fehler: ' + err.message, 'bad'); go.disabled = false; return;
    }
    res.steps.forEach((s) => addStep(s, 'ok'));
    links.innerHTML = '<a href="' + res.coolifyUrl + '" target="_blank">In Coolify öffnen</a>';
    status.textContent = 'Build läuft …';
    const started = Date.now();
    const poll = async () => {
      let d;
      try { d = await (await fetch('/api/deployments/' + res.deploymentUuid)).json(); } catch { d = { status: 'unknown' }; }
      const secs = Math.round((Date.now() - started) / 1000);
      if (d.status === 'finished') {
        addStep('Deploy fertig nach ' + secs + ' s', 'ok');
        status.innerHTML = 'Läuft: <a href="' + res.url + '">' + res.url + '</a> – Weiterleitung in 3 s';
        setTimeout(() => { location.href = res.url; }, 3000);
        return;
      }
      if (d.status === 'failed' || d.status === 'cancelled-by-user') {
        addStep('Deploy ' + d.status, 'bad');
        status.innerHTML = 'Fehlgeschlagen, Log in Coolify ansehen.';
        go.disabled = false; return;
      }
      status.textContent = 'Build läuft … (' + d.status + ', ' + secs + ' s)';
      setTimeout(poll, 3000);
    };
    poll();
  });
</script>
</body>
</html>`;
}
