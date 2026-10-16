'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const WebSocket = require('ws');
const {
  createAutomation,
  isAllowedOrigin,
  tokenEquals,
  isAllowedUrl,
  normalizeUrl,
  filterTabs,
  createRateLimiter,
} = require('../electron/lib/automation.cjs');

// --- origin check ---
assert.equal(isAllowedOrigin(undefined), true);
assert.equal(isAllowedOrigin('null'), true);
assert.equal(isAllowedOrigin('http://localhost:3000'), true);
assert.equal(isAllowedOrigin('http://127.0.0.1'), true);
assert.equal(isAllowedOrigin('https://evil.example'), false);
assert.equal(isAllowedOrigin('http://localhost.evil.example'), false);
assert.equal(isAllowedOrigin('chrome-extension://abc'), false);
assert.equal(isAllowedOrigin('garbage'), false);

// --- token compare ---
assert.equal(tokenEquals('abc', 'abc'), true);
assert.equal(tokenEquals('abd', 'abc'), false);
assert.equal(tokenEquals('', ''), false);
assert.equal(tokenEquals(undefined, 'abc'), false);
assert.equal(tokenEquals('abcd', 'abc'), false);

// --- URL blocklist ---
for (const bad of [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  'file:///C:/Windows/win.ini',
  'chrome://settings',
  'devtools://devtools/bundled/inspector.html',
  'about:home',
  'about:extensions',
  'djxxr://about',
  'vio://settings',
  'http://djxxr/about',
  'data:text/html,hi',
  'view-source:https://a.com',
  'chrome-extension://abc/options.html',
]) {
  assert.equal(isAllowedUrl(bad), false, bad);
  assert.equal(normalizeUrl(bad), null, bad);
}
assert.equal(isAllowedUrl('https://example.com/a?b=1'), true);
assert.equal(normalizeUrl('example.com'), 'https://example.com/');
assert.equal(normalizeUrl('  '), null);

// --- Tor / private / internal tab filtering ---
const raw = [
  { tabId: 'n1', title: 'A', url: 'https://a.com/', mode: 'normal', wcId: 1 },
  { tabId: 'n2', title: 'B', url: 'https://b.com/', wcId: null },
  {
    tabId: 't1',
    title: 'Tor',
    url: 'https://check.torproject.org/',
    mode: 'tor',
    partition: 'tor-1',
    wcId: 2,
  },
  { tabId: 't2', title: 'Tor no mode', url: 'https://x.com/', partition: 'tor-abc', wcId: 3 },
  { tabId: 'p1', title: 'Priv', url: 'https://p.com/', mode: 'private', wcId: 4 },
  { tabId: 'p2', title: 'Priv part', url: 'https://p.com/', partition: 'private-xyz', wcId: 5 },
  { tabId: 'i1', title: 'Home', url: 'about:home' },
  { tabId: 'i2', title: 'Ext', url: 'about:extensions' },
  { tabId: 'i3', title: 'About', url: 'djxxr://about' },
  { tabId: 'n3', title: 'Bad wc', url: 'https://c.com/', wcId: 9 },
  // restored from session: stale webContents id that no longer exists
  { tabId: 'r1', title: 'Restored', url: 'https://r.com/', wcId: 77 },
  // slept by the discard timer
  { tabId: 's1', title: 'Asleep', url: 'https://s.com/', discarded: true, wcId: 1 },
];
// 1 = live persist:main guest, 9 = live but fails the check (e.g. Tor webview), others gone
const guestState = (id) => (id === 1 ? 'live' : id === 9 ? 'forbidden' : 'gone');
const shown = filterTabs(
  raw.map((t) => ({ ...t, active: t.tabId === 'n1' })),
  guestState,
);
assert.deepEqual(
  shown.map((t) => [t.tabId, t.sleeping]),
  [
    ['n1', false],
    ['n2', true],
    ['r1', true],
    ['s1', true],
  ],
);
assert.equal(shown[0].active, true);
assert.equal(shown[1].active, false);
assert.equal(shown[2].wcId, null);

// --- rate limiter ---
let now = 0;
const allow = createRateLimiter(20, () => now);
for (let i = 0; i < 20; i++) assert.equal(allow(), true);
assert.equal(allow(), false);
now = 1000;
assert.equal(allow(), true);

// --- live server: auth, origin, consent, info file, filtering through the API ---
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vio-automation-'));
  let consentAsked = 0;
  const auto = createAutomation({
    userDataDir: dir,
    askConsent: async () => {
      consentAsked += 1;
      return true;
    },
    getGuest: () => null,
    rendererRequest: async (cmd) =>
      cmd === 'tabs'
        ? { tabs: raw.map((t) => ({ ...t, active: t.tabId === 'n2' })) }
        : { tabId: 'new' },
  });
  const st = await auto.setEnabled(true);
  const infoPath = path.join(dir, 'automation.json');
  const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  assert.equal(info.port, st.port);
  assert.equal(info.pid, process.pid);
  assert.match(info.token, /^[a-f0-9]{64}$/);
  if (process.platform !== 'win32') assert.equal(fs.statSync(infoPath).mode & 0o077, 0);

  const url = `ws://127.0.0.1:${info.port}`;
  const open = (opts) =>
    new Promise((resolve, reject) => {
      const ws = new WebSocket(url, opts);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  const closeCode = (ws) => new Promise((r) => ws.once('close', (code) => r(code)));
  const call = (ws, msg) =>
    new Promise((r) => {
      ws.once('message', (d) => r(JSON.parse(String(d))));
      ws.send(JSON.stringify(msg));
    });

  // web page origin → rejected at handshake
  await assert.rejects(open({ origin: 'https://evil.example' }));

  // wrong token → socket closed
  const bad = await open();
  const badClosed = closeCode(bad);
  bad.send(JSON.stringify({ cmd: 'auth', token: 'x'.repeat(64) }));
  assert.equal(await badClosed, 4401);

  // command before auth → closed
  const early = await open();
  const earlyClosed = closeCode(early);
  early.send(JSON.stringify({ id: 1, cmd: 'listTabs' }));
  assert.equal(await earlyClosed, 4401);

  // good token
  const ws = await open({ origin: 'http://localhost' });
  const a = await call(ws, { id: 1, cmd: 'auth', token: info.token });
  assert.equal(a.ok, true);
  assert.equal(consentAsked, 1);

  const list = await call(ws, { id: 2, cmd: 'listTabs' });
  assert.equal(list.ok, true);
  assert.deepEqual(
    list.result.map((t) => t.tabId),
    ['n2'], // no webContentsExists dep → unverifiable wcIds are dropped (fail-closed)
  );
  assert.equal('wcId' in list.result[0], false);
  assert.equal(list.result[0].sleeping, true);
  assert.equal(list.result[0].active, true);

  for (const tabId of ['t1', 'p1', 'i1', 'nope']) {
    const r = await call(ws, { id: 3, cmd: 'getPage', args: { tabId } });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'forbidden', tabId);
  }
  const r1 = await call(ws, { id: 4, cmd: 'openTab', args: { url: 'javascript:alert(1)' } });
  assert.equal(r1.error, 'forbidden url');
  const r2 = await call(ws, { id: 5, cmd: 'eval', args: { code: '1' } });
  assert.equal(r2.error, 'unknown command');
  const r3 = await call(ws, { id: 6, cmd: 'openTab', args: { url: 'example.com' } });
  assert.deepEqual(r3, { id: 6, ok: true, result: { tabId: 'new' } });

  // second client reuses consent (same token)
  const ws2 = await open();
  assert.equal((await call(ws2, { id: 1, cmd: 'auth', token: info.token })).ok, true);
  assert.equal(consentAsked, 1);

  // log never contains the token
  const logText = fs.readFileSync(path.join(dir, 'logs', 'automation.log'), 'utf8');
  assert.equal(logText.includes(info.token), false);

  await auto.setEnabled(false);
  assert.equal(fs.existsSync(infoPath), false);

  // restart → new token, consent asked again
  await auto.setEnabled(true);
  const info2 = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  assert.notEqual(info2.token, info.token);
  const ws3 = new WebSocket(`ws://127.0.0.1:${info2.port}`);
  await new Promise((r) => ws3.once('open', r));
  assert.equal((await call(ws3, { id: 1, cmd: 'auth', token: info2.token })).ok, true);
  assert.equal(consentAsked, 2);
  await auto.stop();

  // tabs opened before the API was enabled + restored/sleeping ones are listed;
  // commands on sleeping tabs say "tab not loaded" until activateTab
  const preDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vio-automation-pre-'));
  const liveGuest = {
    id: 1,
    getURL: () => 'https://httpbin.org/forms/post',
    on() {},
    once() {},
    executeJavaScriptInIsolatedWorld: async () => ({
      url: 'https://httpbin.org/forms/post',
      title: 'Form',
      text: 'x',
    }),
  };
  const preTabs = [
    // window A (opened long before Soul connected)
    { tabId: 'a1', title: 'Form', url: 'https://httpbin.org/forms/post', wcId: 1, active: true },
    { tabId: 'a2', title: 'Wiki', url: 'https://pl.wikipedia.org/', wcId: 50, discarded: true },
    // window B, session restore: webview never mounted yet
    { tabId: 'b1', title: 'Restored', url: 'https://example.com/', wcId: null },
    { tabId: 'b2', title: 'Tor', url: 'https://x.com/', mode: 'tor', partition: 'tor-1', wcId: 9 },
  ];
  const activated = [];
  const pre = createAutomation({
    userDataDir: preDir,
    // slower than the 5 s auth timeout: a user reading the dialog must not get disconnected
    askConsent: () => new Promise((r) => setTimeout(() => r(true), 5300)),
    getGuest: (id) => (id === 1 ? liveGuest : null),
    webContentsExists: (id) => id === 1 || id === 9,
    rendererRequest: async (cmd, args) => {
      if (cmd === 'activate') activated.push(args.tabId);
      return cmd === 'tabs' ? { tabs: preTabs } : {};
    },
  });
  const pInfo = (await pre.setEnabled(true)).port;
  const pws = new WebSocket(`ws://127.0.0.1:${pInfo}`);
  await new Promise((r) => pws.once('open', r));
  const pTok = JSON.parse(fs.readFileSync(path.join(preDir, 'automation.json'), 'utf8')).token;
  assert.equal((await call(pws, { id: 1, cmd: 'auth', token: pTok })).ok, true);
  const pList = (await call(pws, { id: 2, cmd: 'listTabs' })).result;
  assert.deepEqual(pList, [
    {
      tabId: 'a1',
      title: 'Form',
      url: 'https://httpbin.org/forms/post',
      active: true,
      sleeping: false,
    },
    { tabId: 'a2', title: 'Wiki', url: 'https://pl.wikipedia.org/', active: false, sleeping: true },
    { tabId: 'b1', title: 'Restored', url: 'https://example.com/', active: false, sleeping: true },
  ]);
  assert.equal((await call(pws, { id: 3, cmd: 'getPage', args: { tabId: 'a1' } })).ok, true);
  for (const tabId of ['a2', 'b1']) {
    const r = await call(pws, { id: 4, cmd: 'getElements', args: { tabId } });
    assert.equal(r.error, 'tab not loaded (activateTab first)', tabId);
    assert.equal((await call(pws, { id: 5, cmd: 'activateTab', args: { tabId } })).ok, true);
  }
  assert.deepEqual(activated, ['a2', 'b1']);
  assert.equal(
    (await call(pws, { id: 6, cmd: 'getPage', args: { tabId: 'b2' } })).error,
    'forbidden',
  );
  await pre.stop();
  fs.rmSync(preDir, { recursive: true, force: true });

  // consent denied → socket closed, nothing reachable
  const denyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vio-automation-deny-'));
  const denier = createAutomation({
    userDataDir: denyDir,
    askConsent: async () => false,
    getGuest: () => null,
    rendererRequest: async () => ({ activeId: '', tabs: raw }),
  });
  await denier.setEnabled(true);
  const dInfo = JSON.parse(fs.readFileSync(path.join(denyDir, 'automation.json'), 'utf8'));
  const dws = new WebSocket(`ws://127.0.0.1:${dInfo.port}`);
  await new Promise((r) => dws.once('open', r));
  const denied = closeCode(dws);
  dws.send(JSON.stringify({ cmd: 'auth', token: dInfo.token }));
  assert.equal(await denied, 4403);
  await denier.stop();
  fs.rmSync(denyDir, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('automation.test.cjs OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
