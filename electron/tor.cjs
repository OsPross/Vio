'use strict';

/**
 * Isolated Tor mode — ephemeral in-memory partition, SOCKS only on that session.
 * Normal browsing stays on persist:main with system proxy (no Tor).
 *
 * DNS note (Chromium / Electron):
 * For SOCKS5 proxies configured via session.setProxy({ proxyRules: 'socks5://…' }),
 * Chromium sends the hostname to the SOCKS server (remote DNS), equivalent to curl's
 * socks5h://. Local OS DNS should not resolve destination names for that session's
 * navigations. SOCKS4 would be local DNS — we only allow socks5.
 *
 * Embedded tor.exe: electron/tor-daemon.cjs downloads Tor Expert Bundle on first use
 * (Windows) and listens on 127.0.0.1:19050. External 9050/9150 still preferred when up.
 */

const net = require('node:net');
const crypto = require('node:crypto');
const path = require('node:path');
const { session, net: electronNet } = require('electron');
const torDaemon = require('./tor-daemon.cjs');

/** Tor Browser–like UA; no djxxr / Electron / Chrome brand tokens */
const TOR_UA =
  'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0';

const ACCEPT_LANG = 'en-US,en;q=0.5';

const WEBRTC_AND_TZ_KILL = `(function () {
  function block() { throw new Error('Blocked in Tor mode'); }
  try {
    window.RTCPeerConnection = block;
    window.webkitRTCPeerConnection = block;
    window.mozRTCPeerConnection = block;
  } catch (e) {}
  try {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      get() {
        return {
          getUserMedia() { return Promise.reject(new Error('Blocked')); },
          enumerateDevices() { return Promise.resolve([]); },
          getDisplayMedia() { return Promise.reject(new Error('Blocked')); },
        };
      },
    });
  } catch (e) {}
  try {
    Date.prototype.getTimezoneOffset = function () { return 0; };
    const Orig = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function (locales, options) {
      const opts = options && typeof options === 'object' ? { ...options, timeZone: 'UTC' } : { timeZone: 'UTC' };
      return new Orig(locales, opts);
    };
    Intl.DateTimeFormat.prototype = Orig.prototype;
    Object.keys(Orig).forEach((k) => { try { Intl.DateTimeFormat[k] = Orig[k]; } catch (e) {} });
  } catch (e) {}
})();`;

/** @type {{
 *  active: boolean,
 *  partition: string | null,
 *  proxyUrl: string,
 *  exitIp: string | null,
 *  exitCountry: string | null,
 *  lastCheck: number | null,
 *  error: string | null,
 *  isTor: boolean,
 *  embedded: boolean,
 * }} */
let state = {
  active: false,
  partition: null,
  proxyUrl: 'socks5://127.0.0.1:9050',
  exitIp: null,
  exitCountry: null,
  lastCheck: null,
  error: null,
  isTor: false,
  embedded: false,
};

/** @type {((ses: import('electron').Session) => void) | null} */
let attachAdblock = null;
/** @type {(() => import('electron').BrowserWindow | null) | null} */
let getMainWindow = null;

function setAdblockAttach(fn) {
  attachAdblock = fn;
}

function setMainWindowGetter(fn) {
  getMainWindow = fn;
}

function isTorPartition(name) {
  return typeof name === 'string' && /^tor-[0-9a-f-]{8,}$/i.test(name);
}

function parseProxy(url) {
  const raw = String(url || '').trim();
  const m =
    raw.match(/^(?:socks5h?:\/\/)?([^:/]+):(\d+)\s*$/i) ||
    raw.match(/^socks5h?:\/\/([^:/]+):(\d+)/i);
  let host = '127.0.0.1';
  let port = 9050;
  if (m) {
    host = m[1];
    port = Number(m[2]);
  } else if (/^socks5h?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw.replace(/^socks5h/i, 'socks5'));
      host = u.hostname || host;
      port = Number(u.port) || port;
    } catch {
      /* defaults */
    }
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw Object.assign(new Error('Nieprawidłowy port proxy Tor'), { code: 'BAD_PROXY' });
  }
  // Chromium SOCKS5 → remote DNS (socks5h semantics)
  const rules = `socks5://${host}:${port}`;
  return { host, port, rules };
}

function probePort(host, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const t = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(t);
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      clearTimeout(t);
      resolve(false);
    });
  });
}

/**
 * @param {import('electron').Session} ses
 * @param {string} url
 * @param {number} timeoutMs
 */
function fetchWithSession(ses, url, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort();
      reject(new Error('Timeout połączenia przez Tor'));
    }, timeoutMs);
    // Prefer ses.fetch — net.fetch({ session }) may hit defaultSession (clearnet → IsTor=false).
    const req =
      typeof ses.fetch === 'function'
        ? ses.fetch(url, { signal: ctrl.signal, redirect: 'follow' })
        : electronNet.fetch(url, { session: ses, signal: ctrl.signal, redirect: 'follow' });
    req
      .then(async (res) => {
        clearTimeout(timer);
        const text = await res.text();
        if (!res.ok) reject(new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`));
        else resolve(text);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * @param {import('electron').Session} ses
 */
async function wipeSession(ses) {
  try {
    await ses.clearStorageData();
  } catch {
    /* */
  }
  try {
    await ses.clearCache();
  } catch {
    /* */
  }
  try {
    await ses.clearAuthCache();
  } catch {
    /* */
  }
  try {
    if (typeof ses.clearHostResolverCache === 'function') await ses.clearHostResolverCache();
  } catch {
    /* */
  }
}

/**
 * @param {import('electron').Session} ses
 */
function hardenTorSession(ses) {
  // Always deny — no prompts (media, geo, notifications, clipboard, USB/HID/serial/Bluetooth, MIDI, …)
  ses.setPermissionRequestHandler((_wc, _permission, callback) => {
    callback(false);
  });
  ses.setPermissionCheckHandler(() => false);
  try {
    if (typeof ses.setDevicePermissionHandler === 'function') {
      ses.setDevicePermissionHandler(() => false);
    }
  } catch {
    /* */
  }

  try {
    ses.setUserAgent(TOR_UA);
  } catch {
    /* */
  }

  ses.webRequest.onBeforeSendHeaders({ urls: ['*://*/*'] }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    requestHeaders['User-Agent'] = TOR_UA;
    requestHeaders['Accept-Language'] = ACCEPT_LANG;
    delete requestHeaders['sec-ch-ua'];
    delete requestHeaders['sec-ch-ua-mobile'];
    delete requestHeaders['sec-ch-ua-platform'];
    callback({ requestHeaders });
  });

  // Downloads use THIS session's Tor proxy — handled by downloads manager (Tor dialog preserved)
  const downloads = require('./downloads.cjs');
  downloads.attachToSession(ses, { tor: true });

  // Ghostery/legacy attach — in-memory rules only (list fetch is clearnet at app init, not per Tor nav)
  if (typeof attachAdblock === 'function') {
    try {
      attachAdblock(ses);
    } catch (err) {
      console.warn('[tor] adblock attach', err);
    }
  }
}

/**
 * @param {string} partition
 */
async function verifyCircuit(partition) {
  const ses = session.fromPartition(partition);
  let proxyHint = '';
  try {
    if (typeof ses.resolveProxy === 'function') {
      proxyHint = await ses.resolveProxy('https://check.torproject.org/');
    }
  } catch {
    /* */
  }
  const text = await fetchWithSession(ses, 'https://check.torproject.org/api/ip', 45000);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      `Niepoprawna odpowiedź check.torproject.org (proxy=${proxyHint || '?'}): ${text.slice(0, 160)}`,
    );
  }
  return {
    ok: true,
    IsTor: Boolean(data.IsTor),
    IP: typeof data.IP === 'string' ? data.IP : null,
    Country: typeof data.Country === 'string' ? data.Country : null,
    proxyHint,
  };
}

function status() {
  const d = torDaemon.status();
  return {
    ok: state.active && state.isTor,
    active: state.active,
    isTor: state.isTor,
    partition: state.partition,
    proxyUrl: state.proxyUrl,
    exitIp: state.exitIp,
    exitCountry: state.exitCountry,
    lastCheck: state.lastCheck,
    error: state.error,
    embedded: state.embedded,
    dnsMode: 'remote-via-socks5',
    dnsNote:
      'Chromium przy SOCKS5 przekazuje hostname do proxy (zdalne DNS ≈ socks5h). Nie używamy socks4.',
    ua: TOR_UA,
    embeddedTor: d.embeddedAvailable,
    embeddedRunning: d.embeddedRunning,
    embeddedVersion: d.version,
    embeddedTorNote:
      'Przy braku zewnętrznego Tora aplikacja pobiera Tor Expert Bundle (~21 MB) i uruchamia tor.exe lokalnie (port 19050).',
    daemon: d,
  };
}

/**
 * Fail-closed start: probe SOCKS → ephemeral partition → proxy → verify IsTor.
 * @param {{ proxyUrl?: string }} opts
 */
async function start(opts = {}) {
  let parsed;
  try {
    parsed = parseProxy(opts.proxyUrl || state.proxyUrl);
  } catch (err) {
    return {
      ...status(),
      ok: false,
      active: false,
      error: String(err.message || err),
      code: err.code || 'BAD_PROXY',
    };
  }

  let portOk = await probePort(parsed.host, parsed.port);
  let embedded = false;
  // Auto-fallback between Tor daemon (9050) and Tor Browser (9150)
  if (!portOk && (parsed.port === 9050 || parsed.port === 9150)) {
    const alt = parsed.port === 9050 ? 9150 : 9050;
    if (await probePort(parsed.host, alt)) {
      parsed = { host: parsed.host, port: alt, rules: `socks5://${parsed.host}:${alt}` };
      portOk = true;
    }
  }
  // Embedded Expert Bundle when no external SOCKS
  if (!portOk && opts.useEmbedded !== false) {
    const emb = await torDaemon.ensureRunning();
    if (!emb.ok) {
      state.error = emb.error || 'Nie udało się uruchomić wbudowanego Tora.';
      return {
        ...status(),
        ok: false,
        active: false,
        error: state.error,
        code: emb.code || 'TOR_EMBED_FAIL',
      };
    }
    parsed = parseProxy(emb.proxyUrl);
    portOk = true;
    embedded = true;
  }
  if (!portOk) {
    state.error =
      'Brak Tora (zewnętrznego i wbudowanego). Sprawdź sieć przy pierwszym pobieraniu paczki.';
    return {
      ...status(),
      ok: false,
      active: false,
      error: state.error,
      code: 'TOR_OFFLINE',
    };
  }

  if (state.active && state.partition && state.proxyUrl === parsed.rules) {
    try {
      const check = await verifyCircuit(state.partition);
      if (check.ok && check.IsTor) {
        state.exitIp = check.IP;
        state.exitCountry = check.Country;
        state.lastCheck = Date.now();
        state.isTor = true;
        state.error = null;
        return status();
      }
    } catch {
      /* recreate */
    }
    await stop();
  } else if (state.active) {
    await stop();
  }

  const partition = `tor-${crypto.randomUUID()}`;
  const ses = session.fromPartition(partition);

  await ses.setProxy({
    mode: 'fixed_servers',
    proxyRules: parsed.rules,
    proxyBypassRules: '<-loopback>',
  });
  try {
    if (typeof ses.closeAllConnections === 'function') ses.closeAllConnections();
  } catch {
    /* */
  }

  hardenTorSession(ses);

  let check = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      check = await verifyCircuit(partition);
      if (check.IsTor) break;
      lastErr = `IsTor=false (próba ${attempt}/4, proxy=${check.proxyHint || '?'})`;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    } catch (err) {
      lastErr = String(err.message || err);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }

  if (!check || !check.IsTor) {
    await wipeSession(ses);
    state.error =
      lastErr ||
      'Połączenie nie idzie przez sieć Tor (IsTor=false). Fail-closed — brak karty.';
    return {
      ...status(),
      ok: false,
      active: false,
      error: state.error,
      code: 'NOT_TOR',
    };
  }

  state = {
    active: true,
    partition,
    proxyUrl: parsed.rules,
    exitIp: check.IP,
    exitCountry: check.Country,
    lastCheck: Date.now(),
    error: null,
    isTor: true,
    embedded,
  };
  return status();
}

async function stop() {
  // Clear in-memory Tor download entries
  try {
    require('./downloads.cjs').wipeTorEntries();
  } catch {
    /* */
  }
  if (state.partition) {
    try {
      const ses = session.fromPartition(state.partition);
      await wipeSession(ses);
    } catch (err) {
      console.warn('[tor] wipe', err);
    }
  }
  if (state.embedded) {
    await torDaemon.stop();
  }
  const keptProxy = state.proxyUrl;
  state = {
    active: false,
    partition: null,
    proxyUrl: keptProxy,
    exitIp: null,
    exitCountry: null,
    lastCheck: null,
    error: null,
    isTor: false,
    embedded: false,
  };
  return status();
}

/**
 * New Identity: wipe current Tor session, SIGNAL NEWNYM (embedded), new partition, re-verify.
 * Renderer must close Tor tabs and open a fresh one with the returned partition.
 */
async function newIdentity() {
  if (!state.active) {
    return { ...status(), ok: false, error: 'Tryb Tor nieaktywny' };
  }
  const proxyUrl = state.proxyUrl;
  const wasEmbedded = state.embedded;

  // Wipe + drop partition (do NOT stop embedded daemon — keep circuits for NEWNYM)
  try {
    require('./downloads.cjs').wipeTorEntries();
  } catch {
    /* */
  }
  if (state.partition) {
    try {
      await wipeSession(session.fromPartition(state.partition));
    } catch (err) {
      console.warn('[tor] newIdentity wipe', err);
    }
  }

  let newnym = { ok: false, skipped: true };
  if (wasEmbedded) {
    newnym = await torDaemon.signalNewnym();
    // Tor recommends waiting ~10s between NEWNYM; we wait briefly then verify
    await new Promise((r) => setTimeout(r, 2500));
  }

  const partition = `tor-${crypto.randomUUID()}`;
  const ses = session.fromPartition(partition);
  await ses.setProxy({
    mode: 'fixed_servers',
    proxyRules: proxyUrl,
    proxyBypassRules: '<-loopback>',
  });
  try {
    if (typeof ses.closeAllConnections === 'function') ses.closeAllConnections();
  } catch {
    /* */
  }
  hardenTorSession(ses);

  let check = null;
  let lastErr = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      check = await verifyCircuit(partition);
      if (check.IsTor) break;
      lastErr = `IsTor=false (próba ${attempt}/4)`;
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    } catch (err) {
      lastErr = String(err.message || err);
      await new Promise((r) => setTimeout(r, 1200 * attempt));
    }
  }

  if (!check || !check.IsTor) {
    await wipeSession(ses);
    state.error = lastErr || 'Nowa tożsamość: weryfikacja Tor nieudana';
    state.active = false;
    state.partition = null;
    state.isTor = false;
    return { ...status(), ok: false, error: state.error, newnym };
  }

  state = {
    active: true,
    partition,
    proxyUrl,
    exitIp: check.IP,
    exitCountry: check.Country,
    lastCheck: Date.now(),
    error: null,
    isTor: true,
    embedded: wasEmbedded,
  };
  return { ...status(), ok: true, newnym, note: 'SOCKS-per-request isolation niedostępne w Electron — tylko pełna Nowa tożsamość.' };
}

async function circuitInfo() {
  if (!state.active || !state.partition) {
    return { ok: false, error: 'Tryb Tor nieaktywny', exitIp: null, circuits: [] };
  }
  let circuits = [];
  if (state.embedded) {
    const r = await torDaemon.getCircuitStatus();
    circuits = r.circuits || [];
  }
  return {
    ok: true,
    exitIp: state.exitIp,
    exitCountry: state.exitCountry,
    circuits,
    limitation:
      'Izolacja SOCKS Auth per domena (jak Tor Browser „Nowy obwód”) nie jest wspierana przez Electron session.setProxy — dostępna jest tylko Nowa tożsamość.',
  };
}

async function refresh() {
  if (!state.active || !state.partition) {
    return { ...status(), ok: false, error: 'Tryb Tor nieaktywny' };
  }
  try {
    const check = await verifyCircuit(state.partition);
    state.exitIp = check.IP;
    state.exitCountry = check.Country;
    state.lastCheck = Date.now();
    state.isTor = Boolean(check.IsTor);
    state.error = check.IsTor ? null : 'IsTor=false';
    return status();
  } catch (err) {
    state.error = String(err.message || err);
    return { ...status(), ok: false, error: state.error };
  }
}

/**
 * @param {import('electron').WebContents} wc
 */
function isTorWebContents(wc) {
  if (!state.active || !state.partition || !wc || wc.isDestroyed()) return false;
  try {
    return wc.session === session.fromPartition(state.partition);
  } catch {
    return false;
  }
}

/**
 * @param {import('electron').WebContents} wc
 */
function hardenGuestWebContents(wc) {
  try {
    wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  } catch {
    /* */
  }
  try {
    wc.setUserAgent(TOR_UA);
  } catch {
    /* */
  }
  const inject = () => {
    wc.executeJavaScript(WEBRTC_AND_TZ_KILL, true).catch(() => {});
  };
  wc.on('dom-ready', inject);
  wc.on('did-finish-load', inject);
}

async function selftest(proxyUrl) {
  const parsed = parseProxy(proxyUrl || state.proxyUrl);
  const open = await probePort(parsed.host, parsed.port);
  return {
    ok: open,
    host: parsed.host,
    port: parsed.port,
    rules: parsed.rules,
    dnsMode: 'remote-via-socks5',
    note: open
      ? 'Port SOCKS otwarty. Pełny test DNS leak: Wireshark / browserleaks podczas sesji Tor.'
      : 'Port zamknięty — uruchom Tor.',
  };
}

module.exports = {
  start,
  stop,
  status,
  refresh,
  newIdentity,
  circuitInfo,
  selftest,
  isTorPartition,
  isTorWebContents,
  hardenGuestWebContents,
  setAdblockAttach,
  setMainWindowGetter,
  parseProxy,
  probePort,
  wipeSession,
  TOR_UA,
  WEBRTC_AND_TZ_KILL,
  ACCEPT_LANG,
};
