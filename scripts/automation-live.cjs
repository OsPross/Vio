'use strict';

/**
 * LIVE check of the Soul automation API on real pages in a running Vio.
 * Usage: node scripts/automation-live.cjs [path/to/automation.json]
 * Needs Vio running with the Soul toggle on (click "Zezwól" when asked). Hands off mouse and keyboard while it runs:
 * it sends real OS keystrokes (focus test) and opens a console window in front of Vio (pressKey test).
 * Pages are served from 127.0.0.1 (file:// is blocked by the API): Soul's order.html + scripts/automation-test-page.html.
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const WebSocket = require('ws');
const { defaultInfoPath } = require('./automation-test.cjs');

const ORDER = 'C:\\Users\\Oskar\\Desktop\\Soul\\tests\\e2e\\pages\\order.html';
const EXTRA = path.join(__dirname, 'automation-test-page.html');
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
const activate = (pid) => ps(`(New-Object -ComObject WScript.Shell).AppActivate(${Number(pid)})`);
const sendKeys = (keys) =>
  ps(`Add-Type -AssemblyName System.Windows.Forms;[System.Windows.Forms.SendKeys]::SendWait('${keys}')`);

async function main() {
  const infoPath = process.argv[2] || defaultInfoPath();
  const { port, token, pid } = JSON.parse(fs.readFileSync(infoPath, 'utf8'));

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(req.url.startsWith('/order') ? ORDER : EXTRA));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  await new Promise((res, rej) => (ws.once('open', res), ws.once('error', rej)));
  let seq = 0;
  const waiting = new Map();
  ws.on('message', (d) => {
    const m = JSON.parse(String(d));
    waiting.get(m.id)?.(m);
    waiting.delete(m.id);
  });
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
  spawn('cmd.exe', ['/c', 'start', 'VioLiveOther', '/wait', 'cmd', '/k', 'title VioLiveOther'], { detached: true, stdio: 'ignore' }).unref();
  await sleep(2500);
  ps("(New-Object -ComObject WScript.Shell).AppActivate('VioLiveOther')");
  await sleep(800);
  const fg = foreground();
  check('other window in front (precondition)', fg !== String(pid), `fg=${fg} vio=${pid}`);
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

  const w = Math.max(...rows.map((x) => x.name.length));
  console.log('\n' + rows.map((x) => `${x.ok ? 'PASS' : 'FAIL'}  ${x.name.padEnd(w)}  ${x.ok ? '' : x.detail}`).join('\n'));
  const bad = rows.filter((x) => !x.ok).length;
  console.log(`\n${rows.length - bad}/${rows.length} passed`);
  ws.close();
  server.close();
  process.exit(bad ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
