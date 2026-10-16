'use strict';

/**
 * Local automation API for the "Soul" desktop assistant.
 * WebSocket on 127.0.0.1 only, token auth, user consent, whitelisted commands.
 * Only normal persist:main tabs of normal Vio windows are visible (sleeping ones flagged) — Tor / private /
 * internal pages are filtered here AND re-checked per webContents by the caller's getGuest().
 * Protocol: docs/automation-api.md
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const BASE_PORT = 47821;
const PORT_TRIES = 10;
const RATE_PER_SEC = 20;
const AUTH_TIMEOUT_MS = 5000;
const PAGE_TEXT_MAX = 20_000;
const LOG_MAX_BYTES = 512 * 1024;
// Separate JS world: page scripts can see the DOM we touch but not our functions/results.
const WORLD_ID = 4721;

// ---------- pure helpers (unit-tested in test/automation.test.cjs) ----------

/** Origin absent / "null" / localhost only — blocks web pages connecting from a browser. */
function isAllowedOrigin(origin) {
  if (origin == null || origin === '' || origin === 'null') return true;
  try {
    const u = new URL(origin);
    return (
      (u.protocol === 'http:' || u.protocol === 'https:') &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')
    );
  } catch {
    return false;
  }
}

function tokenEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !b) return false;
  // Hash first so lengths match and timingSafeEqual stays constant-time.
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** Only http(s) to non-internal hosts. Everything else (javascript:, file:, chrome:, devtools:, about:, djxxr:, vio:, data:…) is blocked. */
function isAllowedUrl(url) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.hostname === 'djxxr' || u.hostname === 'vio') return false;
    return true;
  } catch {
    return false;
  }
}

/** "example.com" → "https://example.com"; returns null if the result is not allowed. */
function normalizeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  return isAllowedUrl(withScheme) ? new URL(withScheme).href : null;
}

/**
 * @param {{tabId:string,title:string,url:string,active?:boolean,discarded?:boolean,mode?:string,partition?:string,wcId?:number|null}[]} raw
 *   tabs of normal Vio windows only (the caller never asks private/Tor windows)
 * @param {(wcId:number)=>'live'|'gone'|'forbidden'} guestState  live: persist:main webview of a normal
 *   window; gone: no such webContents (sleeping / restored / stale id); forbidden: exists but fails the check
 */
function filterTabs(raw, guestState) {
  const out = [];
  for (const t of Array.isArray(raw) ? raw : []) {
    if (!t || typeof t.tabId !== 'string') continue;
    if (t.mode && t.mode !== 'normal') continue;
    if (t.partition && t.partition !== 'persist:main') continue;
    if (!isAllowedUrl(t.url)) continue;
    const state = t.wcId != null ? guestState(t.wcId) : 'gone';
    if (state === 'forbidden') continue;
    const sleeping = Boolean(t.discarded) || state !== 'live';
    out.push({
      tabId: t.tabId,
      title: String(t.title || ''),
      url: t.url,
      active: t.active === true,
      sleeping,
      wcId: sleeping ? null : t.wcId,
    });
  }
  return out;
}

function createRateLimiter(perSec = RATE_PER_SEC, now = Date.now) {
  let windowStart = 0;
  let count = 0;
  return () => {
    const t = now();
    if (t - windowStart >= 1000) {
      windowStart = t;
      count = 0;
    }
    count += 1;
    return count <= perSec;
  };
}

// ---------- page scripts (fixed source, args JSON-encoded — no arbitrary eval) ----------

const PAGE_TEXT_JS = `(() => ({ url: location.href, title: document.title, text: (document.body ? document.body.innerText : '').slice(0, ${PAGE_TEXT_MAX}) }))()`;

function elementsJs(gen, all) {
  return `(() => {
  const gen = ${JSON.stringify(gen)};
  const all = ${JSON.stringify(Boolean(all))};
  document.querySelectorAll('[data-vio-ref]').forEach((e) => e.removeAttribute('data-vio-ref'));
  const sel = 'a[href],button,input,select,textarea,summary,[contenteditable=""],[contenteditable="true"],[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=switch],[role=textbox],[role=combobox]';
  const vw = innerWidth, vh = innerHeight;
  const clip = (s, n) => String(s || '').replace(/\\s+/g, ' ').trim().slice(0, n);
  const implicitRole = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'checkbox' || t === 'radio') return t;
      if (t === 'submit' || t === 'button' || t === 'reset' || t === 'image') return 'button';
      return 'textbox';
    }
    return el.isContentEditable ? 'textbox' : '';
  };
  const labelOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria) return aria;
    const by = el.getAttribute('aria-labelledby');
    if (by) {
      const t = by.split(/\\s+/).map((id) => document.getElementById(id)?.innerText || '').join(' ');
      if (t.trim()) return t;
    }
    if (el.labels && el.labels.length) return el.labels[0].innerText;
    const tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') {
      const t = el.innerText;
      if (t && t.trim()) return t;
    }
    if (tag === 'input' && /^(submit|button|reset)$/i.test(el.type)) return el.value;
    return el.getAttribute('title') || el.getAttribute('alt') || el.querySelector?.('img[alt]')?.alt || '';
  };
  const out = [];
  let i = 0;
  for (const el of document.querySelectorAll(sel)) {
    if (out.length >= 300) break;
    if (el.disabled || el.type === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const visible = !(r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw);
    if (!visible && !all) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const ref = gen + '-' + (i++);
    el.setAttribute('data-vio-ref', ref);
    const tag = el.tagName.toLowerCase();
    const type = tag === 'input' ? (el.type || 'text').toLowerCase() : '';
    const isPw = type === 'password';
    let value = '';
    if (tag === 'select') value = el.selectedOptions?.[0]?.text || '';
    else if (tag === 'input' || tag === 'textarea') value = el.value || '';
    else if (el.isContentEditable) value = el.innerText || '';
    const item = {
      ref, role: el.getAttribute('role') || implicitRole(el), tag, type,
      label: clip(labelOf(el), 120), name: clip(el.getAttribute('name'), 80),
      placeholder: clip(el.getAttribute('placeholder'), 80),
      value: isPw ? null : clip(value, 200), empty: !value, visible,
    };
    if (tag === 'select') item.options = Array.from(el.options).slice(0, 30).map((o) => ({ value: clip(o.value, 80), label: clip(o.text, 80), selected: o.selected }));
    if (type === 'checkbox' || type === 'radio') item.checked = Boolean(el.checked);
    else if (el.hasAttribute('aria-checked')) item.checked = el.getAttribute('aria-checked') === 'true';
    out.push(item);
  }
  return out;
})()`;
}

// Inputs whose value is set natively (no typing): fill validates the format first.
const NATIVE_TYPES = /^(time|date|datetime-local|number|range)$/;

const refEl = (ref) =>
  `const el = document.querySelector('[data-vio-ref=' + JSON.stringify(${JSON.stringify(ref)}) + ']');
  if (!el) return { error: 'stale ref' };`;

/** Is v a valid value for a native input type? Empty string = clear. */
function checkNativeValue(type, v) {
  if (v === '') return true;
  if (type === 'number' || type === 'range') return /^-?\d+(\.\d+)?$/.test(v);
  const time = (t) => {
    const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(t);
    return Boolean(m) && +m[1] < 24 && +m[2] < 60 && (m[3] == null || +m[3] < 60);
  };
  const date = (d) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return false;
    const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return dt.getUTCFullYear() === +m[1] && dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3];
  };
  if (type === 'time') return time(v);
  if (type === 'date') return date(v);
  if (type === 'datetime-local') {
    const [d, t, ...rest] = v.split('T');
    return rest.length === 0 && t != null && date(d) && time(t);
  }
  return false;
}

/** Native value setter + input/change: works with React/Vue; echoes the (browser-sanitized) value. */
function setNativeJs(ref, value) {
  return `(() => {
  ${refEl(ref)}
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, value: el.value };
})()`;
}

function selectOptionJs(ref, value, label) {
  return `(() => {
  ${refEl(ref)}
  if (el.tagName !== 'SELECT') return { error: 'element is not a select' };
  const value = ${JSON.stringify(value)}, label = ${JSON.stringify(label)};
  const norm = (s) => String(s).replace(/\\s+/g, ' ').trim().toLowerCase();
  const opts = Array.from(el.options);
  const o = value != null ? opts.find((x) => x.value === value) : opts.find((x) => norm(x.text) === norm(label));
  if (!o) return { error: 'no such option' };
  if (o.disabled) return { error: 'option disabled' };
  el.focus();
  el.value = o.value;
  o.selected = true;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, value: o.value, label: o.text.trim() };
})()`;
}

/** Focused editable element (never a password field) → {ok, text?} / {error}. */
const focusedJs = (wantSelection) => `(() => {
  const el = document.activeElement;
  const tag = el && el.tagName ? el.tagName.toLowerCase() : '';
  const type = tag === 'input' ? (el.type || 'text').toLowerCase() : '';
  const field = tag === 'textarea' || (tag === 'input' && /^(text|search|email|url|tel|number|)$/.test(type));
  if (type === 'password' || (el && /password/i.test(el.getAttribute?.('autocomplete') || ''))) return { error: 'forbidden' };
  if (${JSON.stringify(wantSelection)}) {
    const text = field ? String(el.value).slice(el.selectionStart, el.selectionEnd) : String(getSelection());
    return { ok: true, text: text.slice(0, 10000) };
  }
  if (!field && !(el && el.isContentEditable)) return { error: 'no editable element focused' };
  return { ok: true };
})()`;

/** action: 'click' | 'focus-fill' */
function refActionJs(ref, action) {
  return `(() => {
  ${refEl(ref)}
  const NATIVE_TYPES = ${NATIVE_TYPES};
  el.scrollIntoView({ block: 'center', inline: 'center' });
  if (${JSON.stringify(action)} === 'click') { el.focus?.(); el.click(); return { ok: true }; }
  const tag = el.tagName.toLowerCase();
  const type = tag === 'input' ? (el.type || 'text').toLowerCase() : '';
  if (type === 'password' || /password/i.test(el.getAttribute('autocomplete') || '')) return { error: 'forbidden' };
  el.focus();
  if (NATIVE_TYPES.test(type)) return { ok: true, native: type };
  const textLike = tag === 'textarea' || (tag === 'input' && /^(text|search|email|url|tel|)$/.test(type)) || el.isContentEditable;
  if (!textLike) return { error: 'element is not a text field' };
  if (el.isContentEditable) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  else el.select();
  return { ok: true };
})()`;
}

const SCROLL_JS = (dir) =>
  `(() => { window.scrollBy({ top: ${dir === 'up' ? -1 : 1} * Math.round(innerHeight * 0.8), behavior: 'instant' }); return { scrollY: Math.round(scrollY) }; })()`;

/** Allowed keys → Electron accelerator keyCode */
const KEYS = {
  Enter: 'Enter',
  Tab: 'Tab',
  Escape: 'Escape',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Home: 'Home',
  End: 'End',
  Space: 'Space',
};

// ---------- server ----------

/**
 * @param {object} deps
 * @param {string} deps.userDataDir
 * @param {(cmd:string, args?:object)=>Promise<any>} deps.rendererRequest  tabs | open | close | activate
 * @param {(wcId:number)=>import('electron').WebContents|null} deps.getGuest  null unless persist:main webview of a normal window
 * @param {(wcId:number)=>boolean} [deps.webContentsExists]  any live webContents with this id (default: assume yes → fail-closed)
 * @param {()=>Promise<boolean>} deps.askConsent
 * @param {(connected:number)=>void} [deps.onStatus]
 */
function createAutomation(deps) {
  const {
    userDataDir,
    rendererRequest,
    getGuest,
    webContentsExists = () => true,
    askConsent,
    onStatus = () => {},
  } = deps;
  const infoPath = path.join(userDataDir, 'automation.json');
  const logPath = path.join(userDataDir, 'logs', 'automation.log');

  let wss = null;
  let port = 0;
  let token = '';
  let consented = false;
  let consentPending = null;
  let connSeq = 0;
  /** wcId → current ref generation; dropped on navigation so old refs expire */
  const refGen = new Map();
  const watched = new WeakSet();
  const clients = new Set();

  function log(line) {
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      try {
        if (fs.statSync(logPath).size > LOG_MAX_BYTES) fs.renameSync(logPath, `${logPath}.1`);
      } catch {
        /* no log yet */
      }
      fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`, 'utf8');
    } catch {
      /* optional */
    }
  }

  function removeInfoFile() {
    try {
      fs.unlinkSync(infoPath);
    } catch {
      /* */
    }
  }

  function writeInfoFile() {
    fs.mkdirSync(userDataDir, { recursive: true });
    removeInfoFile();
    // mode 0600 on Linux; on Windows %APPDATA% is already ACL'd to the user (+SYSTEM/Admins).
    fs.writeFileSync(infoPath, JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 });
  }

  function emitStatus() {
    let n = 0;
    for (const c of clients) if (c.authed) n += 1;
    onStatus(n);
  }

  function listen(p) {
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({
        host: '127.0.0.1',
        port: p,
        maxPayload: 64 * 1024,
        verifyClient: (info) => isAllowedOrigin(info.req.headers.origin),
      });
      server.once('listening', () => resolve(server));
      server.once('error', reject);
    });
  }

  async function start() {
    if (wss) return status();
    token = crypto.randomBytes(32).toString('hex');
    consented = false;
    let lastErr = null;
    for (let i = 0; i < PORT_TRIES && !wss; i++) {
      try {
        wss = await listen(BASE_PORT + i);
        port = BASE_PORT + i;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!wss) throw lastErr || new Error('no free port');
    wss.on('connection', onConnection);
    wss.on('error', (err) => log(`server error ${err && err.code}`));
    writeInfoFile();
    log(`started port=${port}`);
    return status();
  }

  async function stop() {
    removeInfoFile();
    token = '';
    consented = false;
    if (!wss) return status();
    const s = wss;
    wss = null;
    for (const c of clients) c.ws.terminate();
    clients.clear();
    await new Promise((r) => s.close(() => r()));
    log('stopped');
    emitStatus();
    return status();
  }

  function setEnabled(on) {
    return on ? start() : stop();
  }

  function disconnectAll() {
    for (const c of clients) c.ws.close(4001, 'disconnected by user');
  }

  function status() {
    let connected = 0;
    for (const c of clients) if (c.authed) connected += 1;
    return { enabled: Boolean(wss), port: wss ? port : null, connected, infoPath };
  }

  function consentOnce() {
    if (consented) return Promise.resolve(true);
    if (!consentPending) {
      const forToken = token;
      consentPending = Promise.resolve()
        .then(() => askConsent())
        .catch(() => false)
        .then((ok) => {
          consentPending = null;
          if (ok && token === forToken) consented = true;
          return Boolean(ok) && token === forToken;
        });
    }
    return consentPending;
  }

  function onConnection(ws) {
    const c = { id: ++connSeq, ws, authed: false, allow: createRateLimiter() };
    clients.add(c);
    c.authTimer = setTimeout(() => {
      if (!c.authed) ws.close(4401, 'auth timeout');
    }, AUTH_TIMEOUT_MS);
    ws.on('close', () => {
      clearTimeout(c.authTimer);
      clients.delete(c);
      if (c.authed) log(`#${c.id} disconnected`);
      emitStatus();
    });
    ws.on('error', () => {});
    ws.on('message', (data, isBinary) => {
      void onMessage(c, data, isBinary);
    });
  }

  function send(c, msg) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
  }

  async function onMessage(c, data, isBinary) {
    let msg;
    try {
      msg = isBinary ? null : JSON.parse(String(data));
    } catch {
      msg = null;
    }
    if (!msg || typeof msg !== 'object') {
      if (!c.authed) return c.ws.close(4400, 'bad message');
      return send(c, { id: null, ok: false, error: 'bad message' });
    }
    if (!c.authed) {
      if (c.authing || msg.cmd !== 'auth' || !tokenEquals(msg.token, token)) {
        log(`#${c.id} auth failed`);
        return c.ws.close(4401, 'auth failed');
      }
      c.authing = true;
      clearTimeout(c.authTimer); // token is valid — the consent dialog may take longer than the auth timeout
      const ok = await consentOnce();
      if (!ok) {
        log(`#${c.id} consent denied`);
        return c.ws.close(4403, 'consent denied');
      }
      c.authed = true;
      log(`#${c.id} authenticated`);
      emitStatus();
      return send(c, { id: msg.id ?? null, ok: true, result: { authenticated: true } });
    }
    const id = msg.id ?? null;
    if (!c.allow()) return send(c, { id, ok: false, error: 'rate limited' });
    const cmd = String(msg.cmd || '');
    const args = msg.args && typeof msg.args === 'object' ? msg.args : {};
    try {
      const result = await runCommand(cmd, args);
      log(`#${c.id} ${cmd}${args.tabId ? ` tab=${String(args.tabId).slice(0, 40)}` : ''} ok`);
      send(c, { id, ok: true, result });
    } catch (err) {
      const error = String((err && err.message) || err);
      log(`#${c.id} ${cmd.slice(0, 40)} error=${error.slice(0, 80)}`);
      send(c, { id, ok: false, error });
    }
  }

  async function allowedTabs() {
    const res = await rendererRequest('tabs');
    return filterTabs(res && res.tabs, (wcId) =>
      getGuest(wcId) ? 'live' : webContentsExists(wcId) ? 'forbidden' : 'gone',
    );
  }

  /** Tab must be listed (normal persist:main) — anything else is "forbidden". */
  async function tabFor(tabId) {
    const tab = (await allowedTabs()).find((t) => t.tabId === String(tabId || ''));
    if (!tab) throw new Error('forbidden');
    return tab;
  }

  async function guestFor(tabId) {
    const tab = await tabFor(tabId);
    const wc = tab.sleeping ? null : getGuest(tab.wcId);
    if (!wc) throw new Error('tab not loaded (activateTab first)');
    if (!isAllowedUrl(wc.getURL())) throw new Error('forbidden');
    if (!watched.has(wc)) {
      watched.add(wc);
      const drop = () => refGen.delete(wc.id);
      wc.on('did-navigate', drop);
      wc.on('did-navigate-in-page', drop);
      wc.once('destroyed', drop);
    }
    return wc;
  }

  function run(wc, js) {
    return wc.executeJavaScriptInIsolatedWorld(WORLD_ID, [{ code: js }]);
  }

  function checkRef(wc, ref) {
    const r = String(ref || '');
    const gen = refGen.get(wc.id);
    if (!gen || !r.startsWith(`${gen}-`) || !/^[a-f0-9]+-\d+$/.test(r))
      throw new Error('stale ref');
    return r;
  }

  async function runCommand(cmd, args) {
    switch (cmd) {
      case 'listTabs':
        return (await allowedTabs()).map(({ wcId, ...t }) => t);
      case 'openTab': {
        const url = normalizeUrl(args.url);
        if (!url) throw new Error('forbidden url');
        const res = await rendererRequest('open', { url });
        if (!res || typeof res.tabId !== 'string') throw new Error('open failed');
        return { tabId: res.tabId };
      }
      case 'closeTab':
        await tabFor(args.tabId);
        await rendererRequest('close', { tabId: String(args.tabId) });
        return {};
      case 'activateTab':
        await tabFor(args.tabId);
        await rendererRequest('activate', { tabId: String(args.tabId) });
        return {};
      case 'navigate': {
        const url = normalizeUrl(args.url);
        if (!url) throw new Error('forbidden url');
        const wc = await guestFor(args.tabId);
        void wc.loadURL(url).catch(() => {});
        return {};
      }
      case 'getPage': {
        const wc = await guestFor(args.tabId);
        const r = await run(wc, PAGE_TEXT_JS);
        if (!r) throw new Error('page not ready');
        return r;
      }
      case 'getElements': {
        const wc = await guestFor(args.tabId);
        const gen = crypto.randomBytes(4).toString('hex');
        const r = await run(wc, elementsJs(gen, args.all === true));
        if (!Array.isArray(r)) throw new Error('page not ready');
        refGen.set(wc.id, gen);
        return r;
      }
      case 'click': {
        const wc = await guestFor(args.tabId);
        wc.focus(); // keyboard focus into the page, not the address bar
        const r = await run(wc, refActionJs(checkRef(wc, args.ref), 'click'));
        if (!r || r.error) throw new Error((r && r.error) || 'click failed');
        return {};
      }
      case 'fill': {
        const wc = await guestFor(args.tabId);
        const text = typeof args.text === 'string' ? args.text.slice(0, 10_000) : '';
        const ref = checkRef(wc, args.ref);
        wc.focus();
        const r = await run(wc, refActionJs(ref, 'focus-fill'));
        if (!r || r.error) throw new Error((r && r.error) || 'fill failed');
        if (r.native) {
          if (!checkNativeValue(r.native, text)) throw new Error(`invalid ${r.native} value`);
          const n = await run(wc, setNativeJs(ref, text));
          if (!n || n.error) throw new Error((n && n.error) || 'fill failed');
          // range clamps to min/max/step by design; the other types must keep the value as given
          if (n.value !== text && r.native !== 'range') throw new Error(`invalid ${r.native} value`);
          return {};
        }
        // Real text input → works with React/Vue controlled fields.
        if (text) wc.insertText(text);
        else wc.delete();
        return {};
      }
      case 'selectOption': {
        const wc = await guestFor(args.tabId);
        const ref = checkRef(wc, args.ref);
        const hasValue = typeof args.value === 'string';
        if (!hasValue && typeof args.label !== 'string') throw new Error('value or label required');
        wc.focus();
        const r = await run(wc, selectOptionJs(ref, hasValue ? args.value : null, hasValue ? null : args.label));
        if (!r || r.error) throw new Error((r && r.error) || 'selectOption failed');
        return { value: r.value, label: r.label };
      }
      case 'insertText': {
        const wc = await guestFor(args.tabId);
        if (typeof args.text !== 'string' || !args.text) throw new Error('text required');
        wc.focus();
        const r = await run(wc, focusedJs(false));
        if (!r || r.error) throw new Error((r && r.error) || 'insertText failed');
        wc.insertText(args.text.slice(0, 10_000));
        return {};
      }
      case 'getSelection': {
        const wc = await guestFor(args.tabId);
        const r = await run(wc, focusedJs(true));
        if (!r || r.error) throw new Error((r && r.error) || 'getSelection failed');
        return { text: r.text };
      }
      case 'pressKey': {
        const wc = await guestFor(args.tabId);
        const keyCode = KEYS[String(args.key || '')];
        if (!keyCode) throw new Error(`key not allowed (use: ${Object.keys(KEYS).join(', ')})`);
        wc.focus(); // Chromium drops key events for an unfocused widget, even with the OS window in the background
        wc.sendInputEvent({ type: 'keyDown', keyCode });
        if (keyCode === 'Enter' || keyCode === 'Space')
          wc.sendInputEvent({ type: 'char', keyCode });
        wc.sendInputEvent({ type: 'keyUp', keyCode });
        return {};
      }
      case 'scroll': {
        if (args.direction !== 'up' && args.direction !== 'down')
          throw new Error('direction must be up|down');
        const wc = await guestFor(args.tabId);
        return (await run(wc, SCROLL_JS(args.direction))) || {};
      }
      default:
        throw new Error('unknown command');
    }
  }

  // Stale file from a crash must not outlive the process.
  removeInfoFile();

  return { setEnabled, stop, disconnectAll, status };
}

module.exports = {
  createAutomation,
  isAllowedOrigin,
  tokenEquals,
  isAllowedUrl,
  normalizeUrl,
  filterTabs,
  createRateLimiter,
  checkNativeValue,
  BASE_PORT,
};
