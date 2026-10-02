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

function userAgentMetadata() {
  return brands.userAgentMetadataFromFull(chromeFull());
}

function clientHintHeaders() {
  const full = chromeFull();
  const major = chromeMajor();
  const list = `"Not?A_Brand";v="24", "Chromium";v="${major}", "Google Chrome";v="${major}"`;
  const fullList = `"Not?A_Brand";v="24.0.0.0", "Chromium";v="${full}", "Google Chrome";v="${full}"`;
  return {
    'sec-ch-ua': list,
    'Sec-CH-UA': list,
    'sec-ch-ua-mobile': '?0',
    'Sec-CH-UA-Mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-CH-UA-Platform': '"Windows"',
    'sec-ch-ua-platform-version': '"15.0.0"',
    'Sec-CH-UA-Platform-Version': '"15.0.0"',
    'sec-ch-ua-arch': '"x86"',
    'Sec-CH-UA-Arch': '"x86"',
    'sec-ch-ua-bitness': '"64"',
    'Sec-CH-UA-Bitness': '"64"',
    'sec-ch-ua-full-version-list': fullList,
    'Sec-CH-UA-Full-Version-List': fullList,
  };
}

function applyBootFallback() {
  try {
    app.userAgentFallback = buildChromeUa();
  } catch (err) {
    console.warn('[ua-chrome] userAgentFallback', err);
  }
}

/**
 * @param {import('electron').Session} ses
 */
function applyToSession(ses) {
  if (!ses) return;
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

  const tryCdp = async () => {
    if (wc.isDestroyed()) return false;
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
      // Keeping debugger attached is the only way brands include Google Chrome
      // after Emulation.setUserAgentOverride (detach reverts to Chromium-only).
      // Used for the dedicated Google login BrowserWindow.
      if (persistDebugger) return true;
      return true;
    } catch {
      // DevTools owns the debugger — HTTP UA still applied; retry on close
      return false;
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

  await tryCdp();

  if (wired.has(wc)) return;
  wired.add(wc);

  wc.on('devtools-closed', () => {
    void tryCdp();
  });
  // Apply before page scripts when possible
  wc.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => {
    if (isMainFrame === false) return;
    void tryCdp();
  });
  wc.on('dom-ready', () => {
    void tryCdp();
  });
  wc.on('did-finish-load', () => {
    void tryCdp();
  });
  wc.on('did-navigate', () => {
    void tryCdp();
  });
  wc.on('did-navigate-in-page', () => {
    void tryCdp();
  });
}

module.exports = {
  buildChromeUa,
  chromeFull,
  chromeMajor,
  clientHintHeaders,
  userAgentMetadata,
  brandList: brands.brandList,
  fullVersionList: brands.fullVersionList,
  applyBootFallback,
  applyToSession,
  applyToWebContents,
  CHROME_UA: buildChromeUa,
};
