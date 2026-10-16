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
  checkNativeValue,
  sanitizePanel,
  checkMediaArgs,
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
    calls: [],
    reply: null,
    focus() {
      this.calls.push('focus');
    },
    insertText(t) {
      this.calls.push(`insertText:${t}`);
    },
    sendInputEvent(e) {
      this.calls.push(`key:${e.type}`);
    },
    executeJavaScriptInIsolatedWorld: async function (_w, [{ code }]) {
      liveGuest.code = code;
      if (liveGuest.reply) return liveGuest.reply;
      return { url: 'https://httpbin.org/forms/post', title: 'Form', text: 'x' };
    },
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
  // --- form commands (mocked page; scripts are fixed source, we check the flow around them)
  const g = liveGuest;
  const cmd = async (name, args) => (await new Promise((r) => setTimeout(r, 70)), call(pws, { id: 9, cmd: name, args: { tabId: 'a1', ...args } }));
  g.reply = [];
  assert.equal((await cmd('getElements', { all: true })).ok, true);
  assert.match(g.code, /const all = true/);
  assert.equal(g.code.includes('item.options'), true);
  assert.equal(g.code.includes('slice(0, 30)'), true);
  assert.match(g.code, /visible/);
  await cmd('getElements', {});
  assert.match(g.code, /const all = false/);
  const refOf = async () => {
    const gen = /const gen = "([a-f0-9]+)"/.exec(g.code)[1];
    return `${gen}-0`;
  };
  g.reply = [];
  await cmd('getElements', {});
  const ref = await refOf();

  g.calls.length = 0;
  g.reply = { ok: true };
  assert.equal((await cmd('click', { ref })).ok, true);
  assert.equal(g.calls[0], 'focus');

  g.calls.length = 0;
  assert.equal((await cmd('fill', { ref, text: 'abc' })).ok, true);
  assert.deepEqual(g.calls, ['focus', 'insertText:abc']);

  // native types: validated in main, set natively, no typing
  g.calls.length = 0;
  g.reply = { ok: true, native: 'time', value: '14:30' };
  assert.equal((await cmd('fill', { ref, text: '14:30' })).ok, true);
  assert.equal(g.calls.includes('insertText:14:30'), false);
  assert.match(g.code, /dispatchEvent\(new Event\('change'/);
  assert.equal((await cmd('fill', { ref, text: '25:00' })).error, 'invalid time value');
  g.reply = { ok: true, native: 'time', value: '' }; // browser refused the value
  assert.equal((await cmd('fill', { ref, text: '14:30' })).error, 'invalid time value');

  g.reply = { error: 'forbidden' };
  assert.equal((await cmd('fill', { ref, text: 'x' })).error, 'forbidden');
  assert.equal((await cmd('insertText', { text: 'x' })).error, 'forbidden');
  assert.equal((await cmd('getSelection', {})).error, 'forbidden');

  g.reply = { ok: true, value: 'b', label: 'Beta' };
  assert.deepEqual((await cmd('selectOption', { ref, label: 'Beta' })).result, { value: 'b', label: 'Beta' });
  assert.equal((await cmd('selectOption', { ref })).error, 'value or label required');
  assert.equal((await cmd('selectOption', { ref: 'bad-1', value: 'b' })).error, 'stale ref');

  g.calls.length = 0;
  g.reply = { ok: true };
  assert.equal((await cmd('insertText', { text: 'dyktando' })).ok, true);
  assert.deepEqual(g.calls, ['focus', 'insertText:dyktando']);
  assert.equal((await cmd('insertText', { text: '' })).error, 'text required');
  g.reply = { ok: true, text: 'zaznaczone' };
  assert.deepEqual((await cmd('getSelection', {})).result, { text: 'zaznaczone' });

  g.calls.length = 0;
  assert.equal((await cmd('pressKey', { key: 'Enter' })).ok, true);
  assert.equal(g.calls[0], 'focus');
  g.reply = null;

  assert.equal(checkNativeValue('time', '09:05'), true);
  assert.equal(checkNativeValue('time', '24:00'), false);
  assert.equal(checkNativeValue('date', '2026-02-29'), false);
  assert.equal(checkNativeValue('date', '2028-02-29'), true);
  assert.equal(checkNativeValue('datetime-local', '2026-10-16T09:05'), true);
  assert.equal(checkNativeValue('datetime-local', '2026-10-16 09:05'), false);
  assert.equal(checkNativeValue('number', '-3.5'), true);
  assert.equal(checkNativeValue('number', '1e5'), false);
  assert.equal(checkNativeValue('range', ''), true);

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
  await v2();
  console.log('automation.test.cjs OK');
}

// --- API v2: hello, events, new commands, STOP, log, security ---
async function v2() {
  assert.deepEqual(sanitizePanel({ open: false }), { open: false });
  const p = sanitizePanel({
    open: true,
    content: { title: 'T', items: [{ text: 'a', action: 'go', payload: { x: 1 } }, { nope: 1 }, { text: 'b', payload: 'x'.repeat(3000) }] },
  });
  assert.deepEqual(p.content.items, [{ text: 'a', action: 'go', payload: { x: 1 } }, { text: 'b' }]);
  assert.deepEqual(checkMediaArgs({ action: 'toggle' }), { action: 'toggle', value: null });
  assert.throws(() => checkMediaArgs({ action: 'eval' }), /action must be/);
  assert.throws(() => checkMediaArgs({ action: 'seek', value: '5' }), /number/);
  assert.throws(() => checkMediaArgs({ action: 'volume', value: 2 }), /volume/);
  assert.throws(() => checkMediaArgs({ action: 'rate', value: 10 }), /rate/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vio-automation-v2-'));
  const { EventEmitter } = require('node:events');
  const mkGuest = (id, url) => {
    const g = new EventEmitter();
    Object.assign(g, {
      id,
      url,
      title: `Title ${id}`,
      muted: false,
      code: '',
      reply: null,
      back: true,
      calls: [],
      getURL: () => g.url,
      getTitle: () => g.title,
      isDestroyed: () => false,
      isAudioMuted: () => g.muted,
      focus() {},
      hostWebContents: { isFocused: () => true, isDestroyed: () => false, executeJavaScript: async () => {} },
      navigationHistory: {
        canGoBack: () => g.back,
        canGoForward: () => false,
        goBack: () => g.calls.push('back'),
        goForward: () => g.calls.push('forward'),
      },
      findInPage(text, opts) {
        g.calls.push(`find:${text}:${opts.findNext}`);
        setTimeout(() => auto.guestEvent(g, 'found', { requestId: 7, matches: 3, activeMatchOrdinal: 1, finalUpdate: true }), 10);
        return 7;
      },
      stopFindInPage: () => g.calls.push('stopFind'),
      capturePage: async () => ({ getSize: () => ({ width: 800, height: 600 }), toPNG: () => Buffer.from('png') }),
      executeJavaScriptInIsolatedWorld: async (_w, [{ code }], gesture) => {
        g.code = code;
        g.gesture = gesture;
        return typeof g.reply === 'function' ? g.reply(code) : g.reply;
      },
    });
    return g;
  };
  const g1 = mkGuest(1, 'https://a.com/');
  const g2 = mkGuest(2, 'https://b.com/'); // background tab
  const torWc = mkGuest(9, 'https://tor.example/');
  const guests = { 1: g1, 2: g2 };
  let tabs = [
    { tabId: 'a', title: 'A', url: 'https://a.com/', wcId: 1, active: true },
    { tabId: 'b', title: 'B', url: 'https://b.com/', wcId: 2 },
    { tabId: 'tor', title: 'Tor', url: 'https://tor.example/', mode: 'tor', partition: 'tor-1', wcId: 9 },
  ];
  const states = [];
  const panels = [];
  const asked = [];
  const auto = createAutomation({
    userDataDir: dir,
    askConsent: async () => true,
    getGuest: (id) => guests[id] || null,
    webContentsExists: (id) => id === 1 || id === 2 || id === 9,
    vioVersion: '9.9.9',
    isGuestVisible: (wc) => wc === g1,
    history: {
      list: () => ({
        items: [
          { url: 'https://new.com/', title: 'New', lastVisit: 2000, visitCount: 1 },
          { url: 'about:history', title: 'Internal', lastVisit: 1500 },
          { url: 'https://old.com/', title: 'Old', lastVisit: 500 },
        ],
      }),
    },
    onSoulState: (s) => states.push(s),
    onPanel: (x) => panels.push(x),
    rendererRequest: async (cmd, args) => {
      asked.push([cmd, args]);
      if (cmd === 'tabs') return { tabs };
      if (cmd === 'reopen') return { tabId: 'r1' };
      if (cmd === 'bookmarks')
        return { items: [{ url: 'https://bm.com/', title: 'BM', folder: 'Pasek' }, { url: 'javascript:alert(1)', title: 'x' }] };
      return {};
    },
  });
  auto.guestEvent(torWc, 'media-start'); // before start: ignored
  const { port } = await auto.setEnabled(true);
  const token = JSON.parse(fs.readFileSync(path.join(dir, 'automation.json'), 'utf8')).token;
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((r) => ws.once('open', r));
  const events = [];
  const waiting = new Map();
  let seq = 0;
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'event') events.push(m);
    else (waiting.get(m.id) || (() => {}))(m), waiting.delete(m.id);
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const call = async (cmd, args, extra = {}) => {
    await sleep(55); // under 20/s
    const id = ++seq;
    return new Promise((r) => {
      waiting.set(id, r);
      ws.send(JSON.stringify({ id, cmd, args, ...extra }));
    });
  };
  assert.equal((await call('auth', undefined, { token })).ok, true);

  // handshake
  const hello = await call('hello', { client: 'soul', version: '1.0' });
  assert.equal(hello.result.apiVersion, 2);
  assert.equal(hello.result.vioVersion, '9.9.9');
  for (const c of ['listTabs', 'scroll', 'getReadable', 'screenshot', 'panel', 'setSoulState']) assert.ok(hello.result.capabilities.includes(c), c);
  assert.ok(hello.result.events.includes('selectionChanged'));
  assert.deepEqual((await call('capabilities')).result, hello.result);

  // subscribe
  assert.match((await call('subscribe', { events: ['nope'] })).error, /unknown event/);
  const sub = await call('subscribe', { events: ['tabActivated', 'tabClosed', 'pageLoaded', 'mediaState', 'windowFocus', 'soulIconClicked', 'panelAction', 'stopRequested'] });
  assert.equal(sub.ok, true);

  // tab events: normal passes, Tor / private / internal never emitted
  auto.tabEvent('tabActivated', { tabId: 'a', title: 'A', url: 'https://a.com/', wcId: 1 });
  auto.tabEvent('tabActivated', { tabId: 'tor', url: 'https://x.com/', mode: 'tor', partition: 'tor-1', wcId: 9 });
  auto.tabEvent('tabActivated', { tabId: 'p', url: 'https://x.com/', mode: 'private', wcId: 5 });
  auto.tabEvent('tabActivated', { tabId: 'p2', url: 'https://x.com/', partition: 'private-1', wcId: null });
  auto.tabEvent('tabActivated', { tabId: 'h', url: 'about:home', wcId: null });
  auto.tabEvent('tabActivated', { tabId: 'w', url: 'https://x.com/', wcId: 9 }); // live Tor webContents behind a "normal" tab
  auto.tabEvent('tabClosed', { tabId: 'b', url: 'https://b.com/', wcId: 77 });
  auto.tabEvent('tabClosed', { tabId: 'tor', url: 'https://x.com/', mode: 'tor', wcId: null });
  // guest events
  await auto.guestEvent(g1, 'load');
  await auto.guestEvent(torWc, 'load');
  g1.reply = { playing: true, muted: false, currentTime: 1, duration: 10, title: 'Song' };
  await auto.guestEvent(g1, 'media-start');
  await auto.guestEvent(torWc, 'media-start');
  auto.windowFocus(true);
  auto.windowFocus(true); // deduped
  auto.uiEvent('soulIconClicked');
  auto.uiEvent('panelAction', { action: 'open', payload: { n: 1 } });
  await sleep(100);
  assert.deepEqual(
    events.map((e) => [e.event, e.data]),
    [
      ['windowFocus', { focused: false }], // current state, sent on subscribe
      ['tabActivated', { tabId: 'a', url: 'https://a.com/', title: 'A' }],
      ['tabClosed', { tabId: 'b' }],
      ['pageLoaded', { tabId: 'a', url: 'https://a.com/', title: 'Title 1' }],
      ['mediaState', { tabId: 'a', playing: true, muted: false, currentTime: 1, duration: 10, title: 'Song' }],
      ['windowFocus', { focused: true }],
      ['soulIconClicked', {}],
      ['panelAction', { action: 'open', payload: { n: 1 } }],
    ],
  );
  events.length = 0;

  // selectionChanged / focusedField: poller on the active tab, debounced, password field has no value
  assert.equal((await call('subscribe', { events: ['selectionChanged', 'focusedField'] })).ok, true);
  let snap = { sel: 'hello', field: { ref: 'x-100001', type: 'text', label: 'Imię', editable: true } };
  g1.reply = (code) => (code.includes('__vioSeq') ? snap : null);
  await sleep(1300);
  assert.deepEqual(events.find((e) => e.event === 'selectionChanged').data, { tabId: 'a', text: 'hello' });
  assert.deepEqual(events.find((e) => e.event === 'focusedField').data, { tabId: 'a', ref: 'x-100001', type: 'text', label: 'Imię', editable: true });
  assert.equal(events.filter((e) => e.event === 'selectionChanged').length, 1);
  assert.match(g1.code, /type === 'password'/);
  snap = { sel: '', field: null };
  await sleep(1200);
  assert.equal(events.filter((e) => e.event === 'focusedField').at(-1).data, null);
  assert.equal(events.filter((e) => e.event === 'selectionChanged').at(-1).data.text, '');
  // poller never looks at the Tor tab even when it is the only active one
  tabs = tabs.map((t) => ({ ...t, active: t.tabId === 'tor' }));
  g1.code = '';
  await sleep(700);
  assert.equal(g1.code, '');
  assert.equal(torWc.code, '');
  tabs = tabs.map((t) => ({ ...t, active: t.tabId === 'a' }));
  await call('unsubscribe', { events: ['selectionChanged', 'focusedField'] });
  events.length = 0;

  // new commands
  g1.reply = { title: 'Art', byline: 'Jan', text: 'body', lang: 'pl' };
  assert.deepEqual((await call('getReadable', { tabId: 'a' })).result, { title: 'Art', byline: 'Jan', text: 'body', lang: 'pl' });
  assert.match(g1.code, /50000/);
  const shot = await call('screenshot', { tabId: 'a' });
  assert.deepEqual(shot.result, { pngBase64: Buffer.from('png').toString('base64'), width: 800, height: 600 });
  assert.equal((await call('screenshot', { tabId: 'b' })).error, 'tab not visible');
  assert.equal((await call('screenshot', { tabId: 'a', fullPage: true })).error, 'fullPage not supported');
  assert.deepEqual((await call('findInPage', { tabId: 'a', text: 'kot' })).result, { matches: 3, active: 1 });
  await call('findInPage', { tabId: 'a', text: 'kot', next: true });
  assert.deepEqual(g1.calls.slice(-2), ['find:kot:true', 'find:kot:false']);
  assert.equal((await call('findInPage', { tabId: 'a', text: '' })).error, 'text required');
  assert.equal((await call('stopFind', { tabId: 'a' })).ok, true);
  g1.reply = { ok: true };
  assert.equal((await call('scrollTo', { tabId: 'a', text: 'Rozdział 2' })).ok, true);
  assert.match(g1.code, /Rozdział 2/);
  assert.equal((await call('scrollTo', { tabId: 'a', ref: 'zz-1' })).error, 'stale ref');
  assert.equal((await call('scrollTo', { tabId: 'a' })).error, 'ref or text required');
  g1.reply = { playing: false, muted: false, currentTime: 5, duration: 10, title: 'Song' };
  g1.muted = true;
  const mc = await call('mediaControl', { action: 'pause' }); // no tabId → the playing tab
  assert.equal(mc.result.muted, true);
  assert.equal(g1.gesture, true);
  assert.match((await call('mediaControl', { action: 'volume', value: 5 })).error, /volume/);
  assert.equal((await call('muteTab', { tabId: 'a', muted: true })).ok, true);
  assert.equal((await call('pinTab', { tabId: 'a', pinned: false })).ok, true);
  assert.deepEqual(asked.filter(([c]) => c === 'mute' || c === 'pin').map(([c, a]) => [c, a.value]), [['mute', true], ['pin', false]]);
  assert.match((await call('muteTab', { tabId: 'a' })).error, /muted must be/);
  assert.equal((await call('muteTab', { tabId: 'tor', muted: true })).error, 'forbidden');
  assert.deepEqual((await call('reopenClosedTab', {})).result, { tabId: 'r1' });
  assert.equal((await call('goBack', { tabId: 'a' })).ok, true);
  assert.equal((await call('goForward', { tabId: 'a' })).error, 'cannot go forward');
  assert.deepEqual((await call('searchHistory', { query: 'x', since: 1000 })).result, [{ url: 'https://new.com/', title: 'New', lastVisit: 2000 }]);
  assert.deepEqual((await call('searchBookmarks', { query: 'b' })).result, [{ url: 'https://bm.com/', title: 'BM', folder: 'Pasek' }]);
  // highlight needs a fresh ref from getElements
  g1.reply = [];
  await call('getElements', { tabId: 'a' });
  const ref = `${/const gen = "([a-f0-9]+)"/.exec(g1.code)[1]}-0`;
  g1.reply = { ok: true };
  assert.equal((await call('highlight', { tabId: 'a', ref, label: 'Klikam' })).ok, true);
  assert.match(g1.code, /Klikam/);
  assert.equal((await call('clearHighlight', { tabId: 'a' })).ok, true);
  assert.match((await call('setSoulState', { state: 'dancing' })).error, /state must be/);
  assert.equal((await call('setSoulState', { state: 'acting', text: 'Klikam' })).ok, true);
  assert.deepEqual(states.at(-1), { state: 'acting', text: 'Klikam' });
  assert.equal((await call('panel', { open: true, content: { title: 'Hi', items: [{ text: 'x', action: 'y' }] } })).ok, true);
  assert.deepEqual(panels.at(-1), { open: true, content: { title: 'Hi', items: [{ text: 'x', action: 'y' }] } });

  // every new tab command refuses Tor / unknown tabs
  for (const c of ['getReadable', 'screenshot', 'findInPage', 'stopFind', 'scrollTo', 'goBack', 'goForward', 'highlight', 'clearHighlight', 'pinTab'])
    assert.equal((await call(c, { tabId: 'tor', text: 'x', ref, pinned: true })).error, 'forbidden', c);
  assert.equal((await call('mediaControl', { tabId: 'tor', action: 'play' })).error, 'forbidden');

  // STOP: event, idle state, agent commands refused for 3 s, meta still allowed
  auto.uiEvent('stopRequested');
  await sleep(50);
  assert.equal(events.at(-1).event, 'stopRequested');
  assert.deepEqual(states.at(-1), { state: 'idle', text: '' });
  assert.equal((await call('listTabs')).error, 'stopped by user');
  assert.equal((await call('click', { tabId: 'a', ref })).error, 'stopped by user');
  assert.equal((await call('setSoulState', { state: 'idle' })).ok, true);
  await sleep(3000);
  assert.equal((await call('listTabs')).ok, true);

  // command log: last 200, no values
  const log = auto.getLog();
  assert.ok(log.length > 30);
  assert.deepEqual(Object.keys(log[0]).sort(), ['cmd', 'result', 'tabId', 'time']);
  assert.equal(JSON.stringify(log).includes('Klikam'), false);
  assert.equal(log.find((e) => e.cmd === 'listTabs' && e.result !== 'ok').result, 'stopped by user');

  // events are rate-limited (20/s per client)
  events.length = 0;
  for (let i = 0; i < 40; i++) auto.uiEvent('soulIconClicked');
  await sleep(100);
  assert.equal(events.length, 20);

  ws.close();
  await auto.stop();
  fs.rmSync(dir, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
