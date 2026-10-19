/**
 * Make navigator.userAgent / userAgentData / sec-ch-ua look like desktop Google Chrome
 * (major from process.versions.chrome). Tor guests are skipped — Tor keeps its own UA.
 *
 * CDP Emulation.setUserAgentOverride sets userAgentMetadata, then we detach so pages
 * do not see an attached debugger (Google login blocks Electron / open DevTools).
 * If DevTools holds the debugger, fall back to session/webContents.setUserAgent +
 * HTTP Client Hints and retry when DevTools closes.
 */
'use strict';

const { app } = require('electron');
const brands = require('./lib/ua-brands.cjs');

/** Electron's stock UA before we overwrite with Chrome (needed for Google auth). */
let originalElectronUa = '';

function buildStockElectronUa() {
  const chrome = String(process.versions.chrome || '134.0.0.0');
  const electron = String(process.versions.electron || '0.0.0');
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Electron/${electron} Safari/537.36`;
}

function captureOriginalElectronUa(candidate) {
  if (originalElectronUa) return;
  const s = String(candidate || '').trim();
  // Only keep a real Electron UA — never lock in our Chrome spoof
  if (!s || !/Electron\//i.test(s)) return;
  originalElectronUa = s;
}

function getOriginalElectronUa() {
  return originalElectronUa || buildStockElectronUa();
}

function chromeFull() {
  try {
    return String(process.versions.chrome || '134.0.0.0');
  } catch {
    return '134.0.0.0';
  }
}

function chromeMajor() {
  return brands.chromeMajor(chromeFull());
}

function buildChromeUa() {
  return brands.buildChromeUa(chromeFull());
}

/** Mobile Chrome UA — side-panel apps (Gmail) that need a narrow layout. */
function buildMobileChromeUa() {
  const chrome = chromeFull();
  return `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Mobile Safari/537.36`;
}

function userAgentMetadata() {
  return brands.userAgentMetadataFromFull(chromeFull());
}

function clientHintHeaders() {
  // Lowercase keys only — Chromium HTTP/2; capitalized duplicates do not overwrite (Tandem).
  const full = chromeFull();
  const major = chromeMajor();
  const list = `"Not?A_Brand";v="24", "Chromium";v="${major}", "Google Chrome";v="${major}"`;
  const fullList = `"Not?A_Brand";v="24.0.0.0", "Chromium";v="${full}", "Google Chrome";v="${full}"`;
  return {
    'sec-ch-ua': list,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-platform-version': '"15.0.0"',
    'sec-ch-ua-arch': '"x86"',
    'sec-ch-ua-bitness': '"64"',
    'sec-ch-ua-full-version-list': fullList,
  };
}

function applyBootFallback() {
  try {
    captureOriginalElectronUa(app.userAgentFallback);
  } catch {
    /* */
  }
  try {
    app.userAgentFallback = buildChromeUa();
  } catch (err) {
    console.warn('[ua-chrome] userAgentFallback', err);
  }
  // Hide Chromium automation flag (must run before app ready / first guest)
  try {
    app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
  } catch (err) {
    console.warn('[ua-chrome] AutomationControlled', err);
  }
}

/**
 * @param {import('electron').Session} ses
 */
function applyToSession(ses) {
  if (!ses) return;
  try {
    if (typeof ses.getUserAgent === 'function') {
      captureOriginalElectronUa(ses.getUserAgent());
    }
  } catch {
    /* */
  }
  const ua = buildChromeUa();
  try {
    if (typeof ses.setUserAgent === 'function') ses.setUserAgent(ua);
  } catch (err) {
    console.warn('[ua-chrome] session.setUserAgent', err);
  }
}

/** @type {WeakSet<import('electron').WebContents>} */
const wired = new WeakSet();

/**
 * @param {import('electron').WebContents} wc
 * @param {{ tor?: boolean, persistDebugger?: boolean }} [opts]
 */
async function applyToWebContents(wc, opts = {}) {
  if (!wc || wc.isDestroyed() || opts.tor) return;
  const ua = buildChromeUa();
  const persistDebugger = Boolean(opts.persistDebugger);
  try {
    wc.setUserAgent(ua);
  } catch {
    /* */
  }
  try {
    const ses = wc.session;
    if (ses && typeof ses.setUserAgent === 'function') ses.setUserAgent(ua);
  } catch {
    /* */
  }

  if (wired.has(wc)) return;
  wired.add(wc);

  // One-shot CDP for navigator.userAgentData brands (YouTube miniplayer / feature
  // detection). Re-attaching on every navigation crashed Electron on Windows —
  // never wire did-navigate / dom-ready loops here.
  const tryCdpOnce = async () => {
    if (wc.isDestroyed()) return;
    try {
      const cur = String(wc.getURL() || '');
      const host = (() => {
        try {
          return new URL(cur).hostname.toLowerCase();
        } catch {
          return '';
        }
      })();
      if (host === 'accounts.google.com' || host.endsWith('.accounts.google.com')) return;
    } catch {
      /* */
    }
    let attachedHere = false;
    try {
      if (!wc.debugger.isAttached()) {
        wc.debugger.attach('1.3');
        attachedHere = true;
      }
      await wc.debugger.sendCommand('Emulation.setUserAgentOverride', {
        userAgent: ua,
        acceptLanguage: 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        platform: 'Win32',
        userAgentMetadata: userAgentMetadata(),
      });
    } catch {
      /* */
    } finally {
      if (attachedHere && !persistDebugger) {
        try {
          if (wc.debugger.isAttached()) wc.debugger.detach();
        } catch {
          /* */
        }
      }
    }
  };

  void tryCdpOnce();
}

module.exports = {
  buildChromeUa,
  buildMobileChromeUa,
  chromeFull,
  chromeMajor,
  clientHintHeaders,
  userAgentMetadata,
  brandList: brands.brandList,
  fullVersionList: brands.fullVersionList,
  getOriginalElectronUa,
  applyBootFallback,
  applyToSession,
  applyToWebContents,
  CHROME_UA: buildChromeUa,
};
