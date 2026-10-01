/**
 * Make navigator.userAgent / userAgentData / sec-ch-ua look like desktop Google Chrome
 * (same major as process.versions.chrome). Tor guests are skipped — Tor keeps its own UA.
 *
 * Uses CDP Emulation.setUserAgentOverride (userAgentMetadata). If DevTools holds the
 * debugger, we fall back to session/webContents.setUserAgent + HTTP Client Hints only
 * and retry when DevTools closes.
 */
'use strict';

const { app } = require('electron');

function chromeFull() {
  try {
    return String(process.versions.chrome || '134.0.0.0');
  } catch {
    return '134.0.0.0';
  }
}

function chromeMajor() {
  return chromeFull().split('.')[0] || '134';
}

function buildChromeUa() {
  const full = chromeFull();
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${full} Safari/537.36`;
}

function brandList(full) {
  const major = String(full).split('.')[0];
  // Match current Chromium Client Hints brand order (grease Not.A/Brand)
  return [
    { brand: 'Not.A/Brand', version: '99' },
    { brand: 'Google Chrome', version: major },
    { brand: 'Chromium', version: major },
  ];
}

function fullVersionList(full) {
  return [
    { brand: 'Not.A/Brand', version: '10.0.0.0' },
    { brand: 'Google Chrome', version: full },
    { brand: 'Chromium', version: full },
  ];
}

function userAgentMetadata() {
  const full = chromeFull();
  return {
    brands: brandList(full),
    fullVersion: full,
    fullVersionList: fullVersionList(full),
    platform: 'Windows',
    platformVersion: '15.0.0',
    architecture: 'x86',
    model: '',
    mobile: false,
    bitness: '64',
    wow64: false,
  };
}

function clientHintHeaders() {
  const full = chromeFull();
  const major = chromeMajor();
  const brands = `"Not.A/Brand";v="99", "Google Chrome";v="${major}", "Chromium";v="${major}"`;
  return {
    'sec-ch-ua': brands,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-ch-ua-platform-version': '"15.0.0"',
    'sec-ch-ua-arch': '"x86"',
    'sec-ch-ua-bitness': '"64"',
    'sec-ch-ua-full-version-list': `"Not.A/Brand";v="10.0.0.0", "Google Chrome";v="${full}", "Chromium";v="${full}"`,
  };
}

function applyBootFallback() {
  try {
    app.userAgentFallback = buildChromeUa();
  } catch (err) {
    console.warn('[ua-chrome] userAgentFallback', err);
  }
}

/** @type {WeakSet<import('electron').WebContents>} */
const wired = new WeakSet();

/**
 * @param {import('electron').WebContents} wc
 * @param {{ tor?: boolean }} [opts]
 */
async function applyToWebContents(wc, opts = {}) {
  if (!wc || wc.isDestroyed() || opts.tor) return;
  const ua = buildChromeUa();
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
    try {
      if (!wc.debugger.isAttached()) {
        wc.debugger.attach('1.3');
      }
      await wc.debugger.sendCommand('Emulation.setUserAgentOverride', {
        userAgent: ua,
        acceptLanguage: 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
        platform: 'Windows',
        userAgentMetadata: userAgentMetadata(),
      });
      return true;
    } catch (err) {
      // DevTools owns the debugger — HTTP UA still applied; retry on close
      return false;
    }
  };

  await tryCdp();

  if (wired.has(wc)) return;
  wired.add(wc);

  wc.on('devtools-closed', () => {
    void tryCdp();
  });
  wc.on('dom-ready', () => {
    void tryCdp();
  });
  wc.on('did-finish-load', () => {
    void tryCdp();
  });
}

module.exports = {
  buildChromeUa,
  chromeFull,
  chromeMajor,
  clientHintHeaders,
  userAgentMetadata,
  applyBootFallback,
  applyToWebContents,
  CHROME_UA: buildChromeUa,
};
