'use strict';

/**
 * Manual check of the Soul automation API against a running Vio.
 * Usage: node scripts/automation-test.cjs [path/to/automation.json]
 * Enable first: Settings → Zaawansowane → "Pozwól Soul sterować przeglądarką", then click "Zezwól".
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');

function defaultInfoPath() {
  const base =
    process.platform === 'win32'
      ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  // main.cjs pins userData to "moja-przegladarka" (not "Vio")
  return path.join(base, 'moja-przegladarka', 'automation.json');
}

async function main() {
  const infoPath = process.argv[2] || defaultInfoPath();
  if (!fs.existsSync(infoPath)) {
    console.error(`Brak ${infoPath} — włącz automatyzację w ustawieniach Vio.`);
    process.exit(2);
  }
  const { port, token, pid } = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  console.log(`Vio pid=${pid} port=${port}`);

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  let seq = 0;
  const waiting = new Map();
  ws.on('message', (d) => {
    const msg = JSON.parse(String(d));
    waiting.get(msg.id)?.(msg);
    waiting.delete(msg.id);
  });
  ws.on('close', (code, reason) => console.log(`closed ${code} ${reason}`));
  const call = (cmd, args) =>
    new Promise((resolve) => {
      const id = ++seq;
      waiting.set(id, resolve);
      ws.send(JSON.stringify({ id, cmd, args, ...(cmd === 'auth' ? { token } : {}) }));
    });

  console.log('auth… (potwierdź w oknie Vio)');
  const auth = await call('auth');
  if (!auth.ok) throw new Error(auth.error);

  const tabs = await call('listTabs');
  console.log('listTabs:', JSON.stringify(tabs.result, null, 2));
  const active = (tabs.result || []).find((t) => t.active);
  if (!active) {
    console.log('Brak aktywnej zwykłej karty (otwórz stronę http/https w Vio).');
  } else {
    const page = await call('getPage', { tabId: active.tabId });
    if (!page.ok) console.log('getPage error:', page.error);
    else
      console.log(
        `getPage: ${page.result.title} <${page.result.url}>\n${page.result.text.slice(0, 500)}…`,
      );
  }
  ws.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { defaultInfoPath };
