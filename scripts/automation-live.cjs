'use strict';

/**
 * LIVE check of the Soul automation API on real pages in a running Vio.
 * Usage: node scripts/automation-live.cjs [path/to/automation.json]
 * Needs Vio running with the Soul toggle on (click "Zezwól" when asked). Hands off mouse and keyboard while it runs:
 * it sends real OS keystrokes (focus test) and opens a console window in front of Vio (pressKey test).
 * Pages are served from 127.0.0.1 (file:// is blocked by the API): Soul's order.html + scripts/automation-test-page.html
 * + scripts/automation-test-page-v2.html (API v2: events, readable, screenshot, find, media, history…).
 * STOP button, Soul icon and panel clicks need a human: they are covered by test/automation.test.cjs and listed as MANUAL.
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const WebSocket = require('ws');
const { defaultInfoPath } = require('./automation-test.cjs');

const ORDER = 'C:\\Users\\Oskar\\Desktop\\Soul\\tests\\e2e\\pages\\order.html';
const EXTRA = path.join(__dirname, 'automation-test-page.html');
const V2 = path.join(__dirname, 'automation-test-page-v2.html');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = [];
const check = (name, ok, detail = '') => {
  rows.push({ name, ok: Boolean(ok), detail: String(detail).slice(0, 90) });
  if (!ok) console.log(`  FAIL ${name} ${detail}`);
};

const ps = (code) =>
  execFileSync('powershell', ['-NoProfile', '-Command', code], { encoding: 'utf8' }).trim();
const FG_TYPE =
  'Add-Type \'using System;using System.Runtime.InteropServices;public class W{[DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();[DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);}\';';
/** pid of the process owning the foreground window */
const foreground = () =>
  ps(`${FG_TYPE}$p=0;[void][W]::GetWindowThreadProcessId([W]::GetForegroundWindow(),[ref]$p);$p`);
const sendKeys = (keys) =>
  ps(`Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait('${keys}')`);
// a lone Alt press lifts Windows' foreground lock, otherwise AppActivate fails when this console is not in front;
// same process for both, only the process that sent the last input may take the foreground
const activate = (target) =>
  ps(`Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait('%');(New-Object -ComObject WScript.Shell).AppActivate(${JSON.stringify(target)})`);

async function main() {
  const infoPath = process.argv[2] || defaultInfoPath();
  const { port, token, pid } = JSON.parse(fs.readFileSync(infoPath, 'utf8'));

  const server = http.createServer((req, res) => {
    if (req.url === '/tone.wav') {
      // Range support, or Chromium treats the file as not seekable
      const wav = silentWav();
      const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      if (!m) {
        res.writeHead(200, { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-length': wav.length });
        return res.end(wav);
      }
      const start = +m[1];
      const end = m[2] ? +m[2] : wav.length - 1;
      res.writeHead(206, { 'content-type': 'audio/wav', 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${wav.length}`, 'content-length': end - start + 1 });
      return res.end(wav.subarray(start, end + 1));
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(req.url.startsWith('/order') ? ORDER : req.url.startsWith('/v2') ? V2 : EXTRA));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  let seq = 0;
  const waiting = new Map();
  const events = [];
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'event') return void events.push(m);
    waiting.get(m.id)?.(m);
    waiting.delete(m.id);
  });
  /** first event after index `from` matching pred, waiting up to ms */
  const waitEvent = async (from, pred, ms = 3000) => {
    for (let t = 0; t <= ms; t += 100) {
      const e = events.slice(from).find(pred);
      if (e) return e;
      await sleep(100);
    }
    return null;
  };
  const raw = (cmd, args) =>
    new Promise((resolve) => {
      const id = ++seq;
      waiting.set(id, resolve);
      ws.send(JSON.stringify({ id, cmd, args, ...(cmd === 'auth' ? { token } : {}) }));
    });
  // stay under the 20 req/s limit
  const call = async (cmd, args) => (await sleep(70), raw(cmd, args));

  console.log('auth… (jeśli pojawi się okno Vio — kliknij „Zezwól”)');
  const auth = await raw('auth');
  if (!auth.ok) throw new Error(`auth: ${auth.error}`);
  const hello = await call('hello', { client: 'soul', version: 'live' });
  check('hello apiVersion 2', hello.ok && hello.result.apiVersion === 2 && hello.result.vioVersion, JSON.stringify(hello));
  check('hello lists every command', ['listTabs', 'scroll', 'getReadable', 'screenshot', 'findInPage', 'mediaControl', 'searchHistory', 'highlight', 'setSoulState', 'panel'].every((c) => hello.result?.capabilities.includes(c)));
  check('hello lists events', hello.result?.events.length === 10);
  const caps = await call('capabilities');
  check('capabilities = hello', JSON.stringify(caps.result) === JSON.stringify(hello.result));
  check('subscribe unknown event refused', /unknown event/.test((await call('subscribe', { events: ['bogus'] })).error));
  const subd = await call('subscribe', { events: hello.result.events });
  check('subscribe all events', subd.ok && subd.result.events.length === 10, subd.error);
  check('windowFocus state sent on subscribe', await waitEvent(0, (e) => e.event === 'windowFocus' && typeof e.data.focused === 'boolean', 1000));

  const open = async (p) => {
    const r = await call('openTab', { url: `${base}${p}` });
    if (!r.ok) throw new Error(`openTab: ${r.error}`);
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      const g = await call('getPage', { tabId: r.result.tabId });
      if (g.ok && g.result.url.startsWith(base)) return r.result.tabId;
    }
    throw new Error('page did not load');
  };
  const els = async (tabId, all = true) => (await call('getElements', { tabId, all })).result || [];
  const named = (list, name) => list.find((e) => e.name === name);
  /** run cmd on the element chosen by `pick` (fresh refs every time) */
  const act = async (tabId, pick, cmd, args = {}) => {
    const el = pick(await els(tabId));
    if (!el) return { ok: false, error: 'element not found' };
    return call(cmd, { tabId, ref: el.ref, ...args });
  };
  const val = async (tabId, pick) => pick(await els(tabId))?.value;
  const text = async (tabId) => (await call('getPage', { tabId })).result?.text || '';
  const logOf = async (tabId) => (await text(tabId)).split('\nData')[0]; // the page's event log (top of the page)
  const n = (name) => (l) => named(l, name);

  // ===== 1. order form (Soul's page) =====
  const orderTab = await open('/order.html');
  await call('activateTab', { tabId: orderTab });
  for (const [name, v] of [
    ['name', 'Jan Kowalski'],
    ['phone', '123456789'],
    ['email', 'jan@example.com'],
    ['time', '18:30'],
  ]) {
    const r = await act(orderTab, n(name), 'fill', { text: v });
    check(`fill ${name}`, r.ok && (await val(orderTab, n(name))) === v, r.error);
  }
  check('fill time invalid', (await act(orderTab, n('time'), 'fill', { text: '25:99' })).error === 'invalid time value');
  check('fill time keeps 18:30', (await val(orderTab, n('time'))) === '18:30');

  let r = await act(orderTab, n('sauce'), 'selectOption', { label: 'Czosnkowy' });
  check('selectOption label', r.ok && r.result.value === 'czosnkowy' && (await val(orderTab, n('sauce'))) === 'Czosnkowy', r.error);
  r = await act(orderTab, n('sauce'), 'selectOption', { value: 'ostry' });
  check('selectOption value', r.ok && (await val(orderTab, n('sauce'))) === 'Ostry', r.error);
  r = await act(orderTab, n('sauce'), 'selectOption', { label: 'Nieistnieje' });
  check('selectOption missing option', r.error === 'no such option', r.error);
  r = await act(orderTab, n('name'), 'selectOption', { value: 'x' });
  check('selectOption on non-select', r.error === 'element is not a select', r.error);
  const sauce = named(await els(orderTab), 'sauce');
  check('select options listed', sauce.options?.length === 4 && sauce.options.some((o) => o.value === 'ostry' && o.selected), JSON.stringify(sauce.options));

  const lab = (s) => (l) => l.find((e) => e.label.trim() === s);
  r = await act(orderTab, lab('Średnia'), 'click');
  check('click radio', r.ok && lab('Średnia')(await els(orderTab)).checked === true, r.error);
  for (const l of ['Ser', 'Oliwki']) {
    r = await act(orderTab, lab(l), 'click');
    check(`click checkbox ${l}`, r.ok && lab(l)(await els(orderTab)).checked === true, r.error);
  }
  await act(orderTab, lab('Ser'), 'click');
  check('uncheck checkbox', lab('Ser')(await els(orderTab)).checked === false);

  await act(orderTab, n('notes'), 'click');
  r = await call('insertText', { tabId: orderTab, text: 'raz dwa trzy' });
  check('insertText textarea', r.ok && (await val(orderTab, n('notes'))) === 'raz dwa trzy', r.error);

  const pw = (l) => l.find((e) => e.type === 'password');
  check('fill password forbidden', (await act(orderTab, pw, 'fill', { text: 'x' })).error === 'forbidden');
  await act(orderTab, pw, 'click');
  check('insertText password forbidden', (await call('insertText', { tabId: orderTab, text: 'x' })).error === 'forbidden');
  check('getSelection password forbidden', (await call('getSelection', { tabId: orderTab })).error === 'forbidden');
  check('password value is null', pw(await els(orderTab)).value === null);

  await act(orderTab, (l) => l.find((e) => e.tag === 'button'), 'click');
  await sleep(300);
  const sum = await text(orderTab);
  const want = ['Jan Kowalski', '123456789', 'jan@example.com', 'srednia', 'oliwki', 'czosnkowy|ostry', '18:30', 'raz dwa trzy'];
  check('submit: page got every value', want.every((s) => new RegExp(s).test(sum)), sum.slice(sum.indexOf('Podsumowanie'), sum.indexOf('Podsumowanie') + 80).replace(/\n/g, ' '));
  await call('closeTab', { tabId: orderTab });

  // ===== 2. extra page =====
  const tab = await open('/extra.html');
  await call('activateTab', { tabId: tab });

  const all = await els(tab, true);
  const vp = await els(tab, false);
  check('all:true has more than viewport', all.length > vp.length, `${all.length} vs ${vp.length}`);
  check('visible flag', named(all, 'late')?.visible === false && named(all, 'a')?.visible === true);
  check('viewport hides below-fold', !named(vp, 'late'));
  check('select options capped at 30', named(all, 'big')?.options?.length === 30);
  check('fill below-fold field', (await act(tab, n('late'), 'fill', { text: 'dół' })).ok && (await val(tab, n('late'))) === 'dół');

  r = await act(tab, n('d'), 'fill', { text: '2026-10-16' });
  check('fill date', r.ok && (await val(tab, n('d'))) === '2026-10-16', r.error);
  check('fill date invalid', (await act(tab, n('d'), 'fill', { text: '2026-02-30' })).error === 'invalid date value');
  r = await act(tab, n('n'), 'fill', { text: '42' });
  check('fill number', r.ok && (await val(tab, n('n'))) === '42', r.error);
  check('fill number invalid', (await act(tab, n('n'), 'fill', { text: 'abc' })).error === 'invalid number value');
  r = await act(tab, n('r'), 'fill', { text: '55' });
  check('fill range (clamped to step)', r.ok && ['50', '60'].includes(await val(tab, n('r'))), r.error);
  const lg = await text(tab);
  check('change events reached the page', /change:d=2026-10-16/.test(lg) && /change:n=42/.test(lg));

  await act(tab, n('sel-field'), 'click');
  r = await call('getSelection', { tabId: tab });
  check('getSelection in field', r.ok && r.result.text === 'alfa', JSON.stringify(r.result) + (r.error || ''));
  await act(tab, n('sel-page'), 'click');
  r = await call('getSelection', { tabId: tab });
  check('getSelection on page', r.ok && r.result.text === 'Akapit do zaznaczenia na stronie.', JSON.stringify(r.result) + (r.error || ''));
  await act(tab, n('a'), 'click');
  r = await call('getSelection', { tabId: tab });
  check('getSelection empty', r.ok && r.result.text === '', JSON.stringify(r.result));
  await act(tab, n('sel-page'), 'click');
  r = await call('insertText', { tabId: tab, text: 'x' });
  check('insertText without focus refused', r.error === 'no editable element focused', r.error);

  // pressKey with Vio focused
  await act(tab, n('a'), 'click');
  let mark = (await logOf(tab)).length;
  await call('pressKey', { tabId: tab, key: 'Tab' });
  await sleep(200);
  let t = (await logOf(tab)).slice(mark);
  check('pressKey Tab (Vio focused)', t.includes('key:Tab') && t.includes('focus:b'), t.replace(/\n/g, ' '));
  await call('pressKey', { tabId: tab, key: 'Tab' }); // b → btn
  await call('pressKey', { tabId: tab, key: 'Enter' });
  await sleep(200);
  const c1 = (await text(tab)).match(/Licznik\s*(\d+)/)?.[1];
  check('pressKey Enter clicks focused button', c1 === '1', `count=${c1}`);

  // pressKey with Notepad in front
  // a console window with a unique title is a reliable "other window" (Win11 Notepad is a Store app and often refuses to take the foreground)
  activate(pid); // Vio in front first, so moving the other window in front is a real focus change
  await sleep(800);
  const blurMark = events.length;
  spawn('cmd.exe', ['/c', 'start', 'VioLiveOther', '/wait', 'cmd', '/k', 'title VioLiveOther'], { detached: true, stdio: 'ignore' }).unref();
  await sleep(2500);
  activate('VioLiveOther');
  await sleep(800);
  const fg = foreground();
  check('other window in front (precondition)', fg !== String(pid), `fg=${fg} vio=${pid}`);
  check('event windowFocus false', await waitEvent(blurMark, (e) => e.event === 'windowFocus' && e.data.focused === false, 1500));
  const focusMark = events.length;
  await act(tab, n('a'), 'click');
  mark = (await logOf(tab)).length;
  await call('pressKey', { tabId: tab, key: 'Tab' });
  await call('pressKey', { tabId: tab, key: 'Tab' });
  await call('pressKey', { tabId: tab, key: 'Enter' });
  await sleep(300);
  const after = await text(tab);
  t = (await logOf(tab)).slice(mark);
  check('pressKey Tab, Vio in background (effect: see Enter)', t.includes('key:Tab'), t.replace(/\n/g, ' '));
  const c2 = after.match(/Licznik\s*(\d+)/)?.[1];
  check('pressKey Enter, Vio in background', c2 === '2', `count=${c2}`);
  check('Vio stayed in background', foreground() !== String(pid), `fg=${foreground()}`);
  try { ps('Get-Process cmd | Where-Object { $_.MainWindowTitle -like "*VioLiveOther*" } | Stop-Process -Force'); } catch { /* */ }

  // focus: real OS keystrokes after fill/click land in the page, not the address bar
  await sleep(500);
  for (let i = 0; i < 4 && foreground() !== String(pid); i++) {
    activate(pid);
    await sleep(800);
  }
  const inFront = foreground() === String(pid);
  check('Vio in front (precondition)', inFront, `fg=${foreground()} vio=${pid}`);
  check('event windowFocus true', await waitEvent(focusMark, (e) => e.event === 'windowFocus' && e.data.focused === true, 1500));
  if (inFront) {
    await act(tab, n('b'), 'fill', { text: 'abc' });
    await sleep(200);
    sendKeys('XYZ');
    await sleep(500);
    const v = await val(tab, n('b'));
    check('OS keystrokes after fill go to the page', v === 'abcXYZ', `value=${v} log=${(await logOf(tab)).slice(-60).replaceAll('\n', ' ')}`);
    sendKeys('^a');
    await sleep(300);
    r = await call('getSelection', { tabId: tab });
    check('Ctrl+A after fill selects the field text', r.ok && r.result.text === 'abcXYZ', JSON.stringify(r.result));
    await act(tab, n('a'), 'click');
    sendKeys('Q');
    await sleep(400);
    const q = await val(tab, n('a'));
    check('OS keystrokes after click go to the page', q === 'Q', `value=${q}`);
  }
  await call('closeTab', { tabId: tab });

  await v2({ call, open, els, named, events, waitEvent, base });

  const w = Math.max(...rows.map((x) => x.name.length));
  console.log('\n' + rows.map((x) => `${x.ok ? 'PASS' : 'FAIL'}  ${x.name.padEnd(w)}  ${x.ok ? '' : x.detail}`).join('\n'));
  const bad = rows.filter((x) => !x.ok).length;
  console.log(`\n${rows.length - bad}/${rows.length} passed`);
  ws.close();
  server.close();
  process.exit(bad ? 1 : 0);
}

/** 6 s of silence, 8 kHz mono PCM — a media element to drive without making noise */
function silentWav(seconds = 6, rate = 8000) {
  const bytes = seconds * rate * 2;
  const b = Buffer.alloc(44 + bytes);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + bytes, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(bytes, 40);
  return b;
}

// ===== 3. API v2 =====
async function v2({ call, open, els, named, events, waitEvent, base }) {
  let mark = events.length;
  const tab = await open('/v2.html');
  await call('activateTab', { tabId: tab });
  check('event pageLoaded', await waitEvent(mark, (e) => e.event === 'pageLoaded' && e.data.tabId === tab && e.data.url.startsWith(base)));
  check('event tabActivated', await waitEvent(mark, (e) => e.event === 'tabActivated' && e.data.tabId === tab));

  let r = await call('getReadable', { tabId: tab });
  const rd = r.result || {};
  check('getReadable title/byline/lang', rd.title === 'Artykuł testowy' && rd.byline === 'Anna Nowak' && rd.lang === 'pl', JSON.stringify({ ...rd, text: undefined }));
  check('getReadable main text only', /Tekst do zaznaczenia/.test(rd.text) && !/Menu Start/.test(rd.text), (rd.text || '').slice(0, 80));
  check('getReadable never shows password value', !JSON.stringify(rd).includes('sekret123'));

  r = await call('screenshot', { tabId: tab });
  check('screenshot active tab', r.ok && r.result.pngBase64.startsWith('iVBOR') && r.result.width > 100 && r.result.height > 100, r.error);
  check('screenshot fullPage refused', (await call('screenshot', { tabId: tab, fullPage: true })).error === 'fullPage not supported');

  r = await call('findInPage', { tabId: tab, text: 'akapit' });
  check('findInPage', r.ok && r.result.matches >= 4 && r.result.active === 1, JSON.stringify(r.result) + (r.error || ''));
  r = await call('findInPage', { tabId: tab, text: 'akapit', next: true });
  check('findInPage next', r.ok && r.result.active === 2, JSON.stringify(r.result));
  check('stopFind', (await call('stopFind', { tabId: tab })).ok);

  const far = () => els(tab).then((l) => named(l, 'far')?.visible);
  check('far field below the fold (precondition)', (await far()) === false);
  r = await call('scrollTo', { tabId: tab, text: 'daleki AKAPIT' });
  check('scrollTo text', r.ok && (await far()) === true, r.error);
  check('scrollTo missing text', (await call('scrollTo', { tabId: tab, text: 'nie ma takiego tekstu' })).error === 'text not found');
  const q = named(await els(tab), 'q');
  r = await call('scrollTo', { tabId: tab, ref: q.ref });
  check('scrollTo ref', r.ok && named(await els(tab), 'q').visible === true, r.error);

  const q2 = named(await els(tab), 'q');
  check('highlight', (await call('highlight', { tabId: tab, ref: q2.ref, label: 'Tu wpiszę' })).ok);
  check('highlight stale ref', (await call('highlight', { tabId: tab, ref: 'deadbeef-0' })).error === 'stale ref');
  check('clearHighlight', (await call('clearHighlight', { tabId: tab })).ok);

  // selection + focused field (poller, ~500 ms debounce)
  mark = events.length;
  let l = await els(tab);
  await call('click', { tabId: tab, ref: named(l, 'sel').ref });
  const sel = await waitEvent(mark, (e) => e.event === 'selectionChanged' && e.data.tabId === tab && e.data.text);
  check('event selectionChanged', sel && sel.data.text === 'Tekst do zaznaczenia przez test automatyzacji.', JSON.stringify(sel && sel.data));
  mark = events.length;
  l = await els(tab);
  await call('click', { tabId: tab, ref: named(l, 'q').ref });
  const ff = await waitEvent(mark, (e) => e.event === 'focusedField' && e.data && e.data.type === 'text');
  check('event focusedField', ff && ff.data.tabId === tab && ff.data.label === 'Szukaj' && ff.data.editable === true && ff.data.ref, JSON.stringify(ff && ff.data));
  mark = events.length;
  await call('click', { tabId: tab, ref: named(l, 'pw').ref });
  const fp = await waitEvent(mark, (e) => e.event === 'focusedField' && e.data && e.data.type === 'password');
  check('focusedField password: not editable, no value', fp && fp.data.editable === false && !('value' in fp.data) && !JSON.stringify(fp.data).includes('sekret'), JSON.stringify(fp && fp.data));

  // media
  mark = events.length;
  r = await call('mediaControl', { tabId: tab, action: 'play' });
  check('mediaControl play', r.ok && r.result.playing === true, JSON.stringify(r.result) + (r.error || ''));
  check('event mediaState playing', await waitEvent(mark, (e) => e.event === 'mediaState' && e.data.tabId === tab && e.data.playing === true));
  r = await call('mediaControl', { action: 'seek', value: 2 }); // no tabId → the playing tab
  check('mediaControl seek (default tab)', r.ok && Math.abs(r.result.currentTime - 2) < 0.6, JSON.stringify(r.result) + (r.error || ''));
  check('mediaControl rate', (await call('mediaControl', { tabId: tab, action: 'rate', value: 1.5 })).ok);
  check('mediaControl volume', (await call('mediaControl', { tabId: tab, action: 'volume', value: 0.5 })).ok);
  check('mediaControl bad volume', /volume/.test((await call('mediaControl', { tabId: tab, action: 'volume', value: 3 })).error));
  check('muteTab', (await call('muteTab', { tabId: tab, muted: true })).ok);
  await sleep(400);
  r = await call('mediaControl', { tabId: tab, action: 'seekBy', value: 0.5 });
  check('muted tab reported muted', r.ok && r.result.muted === true, JSON.stringify(r.result));
  await call('muteTab', { tabId: tab, muted: false });
  mark = events.length;
  r = await call('mediaControl', { tabId: tab, action: 'toggle' });
  check('mediaControl toggle → paused', r.ok && r.result.playing === false, JSON.stringify(r.result));
  check('event mediaState paused', await waitEvent(mark, (e) => e.event === 'mediaState' && e.data.playing === false));

  check('pinTab on', (await call('pinTab', { tabId: tab, pinned: true })).ok);
  check('pinTab off', (await call('pinTab', { tabId: tab, pinned: false })).ok);

  // back / forward
  await call('navigate', { tabId: tab, url: `${base}/extra.html` });
  await sleep(1200);
  r = await call('goBack', { tabId: tab });
  await sleep(1000);
  check('goBack', r.ok && (await call('getPage', { tabId: tab })).result?.url.includes('/v2'), r.error);
  r = await call('goForward', { tabId: tab });
  await sleep(1000);
  check('goForward', r.ok && (await call('getPage', { tabId: tab })).result?.url.includes('/extra'), r.error);

  // history / bookmarks: only http(s), capped
  r = await call('searchHistory', { query: '', limit: 50 });
  check('searchHistory capped at 20, http(s) only', r.ok && r.result.length <= 20 && r.result.every((h) => /^https?:/.test(h.url) && h.lastVisit > 0), r.error);
  r = await call('searchHistory', { query: '', since: Date.now() + 60_000 });
  check('searchHistory since', r.ok && r.result.length === 0);
  r = await call('searchBookmarks', { query: '' });
  check('searchBookmarks http(s) only', r.ok && r.result.length <= 20 && r.result.every((b) => /^https?:/.test(b.url) && 'folder' in b), r.error);

  // Soul UI (visual only)
  check('setSoulState acting', (await call('setSoulState', { state: 'acting', text: 'Test na żywo' })).ok);
  check('setSoulState invalid', /state must be/.test((await call('setSoulState', { state: 'x' })).error));
  check('panel open', (await call('panel', { open: true, content: { title: 'Soul test', items: [{ text: 'Info' }, { text: 'Kliknij', action: 'demo' }] } })).ok);
  await sleep(800);
  check('panel close', (await call('panel', { open: false })).ok);
  await call('setSoulState', { state: 'idle' });

  // close → tabClosed, reopen
  mark = events.length;
  await call('closeTab', { tabId: tab });
  check('event tabClosed', await waitEvent(mark, (e) => e.event === 'tabClosed' && e.data.tabId === tab));
  r = await call('reopenClosedTab', {});
  check('reopenClosedTab', r.ok && typeof r.result.tabId === 'string', r.error);
  await sleep(800);
  const list = (await call('listTabs')).result || [];
  check('reopened tab listed', list.some((t) => t.tabId === r.result?.tabId && t.url.includes('/extra')), JSON.stringify(list.map((t) => t.url)));
  check('listTabs: http(s) only (no internal / Tor / private)', list.every((t) => /^https?:/.test(t.url)));

  // security: every new tab command refuses unknown / non-listed tabs
  for (const c of ['getReadable', 'screenshot', 'findInPage', 'stopFind', 'scrollTo', 'mediaControl', 'muteTab', 'pinTab', 'goBack', 'goForward', 'highlight', 'clearHighlight'])
    check(`${c} forbidden tab`, (await call(c, { tabId: 'nope', text: 'x', ref: 'a-1', action: 'play', muted: true, pinned: true })).error === 'forbidden');
  if (r.result?.tabId) await call('closeTab', { tabId: r.result.tabId });
  // a background tab cannot be captured
  const t1 = await open('/v2.html');
  const t2 = await open('/extra.html');
  check('screenshot background tab refused', (await call('screenshot', { tabId: t1 })).error === 'tab not visible');
  await call('closeTab', { tabId: t2 });
  await call('closeTab', { tabId: t1 });
  for (const m of ['STOP button → stopRequested + 3 s block', 'Soul icon click → soulIconClicked', 'panel item click → panelAction'])
    console.log(`  MANUAL ${m} (unit-tested in test/automation.test.cjs)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
