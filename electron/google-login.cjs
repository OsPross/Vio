/**
 * Google account login in a dedicated BrowserWindow.
 *
 * Uses an isolated clean session (no Ghostery preload, no adblock, no extensions,
 * no CDP). After leaving accounts.google.com, copies Google cookies into the
 * opener's session (persist:main) and reloads the tab.
 */
'use strict';

const path = require('node:path');
const { BrowserWindow, session } = require('electron');

const LOGIN_PARTITION = 'persist:google-login';

/** @type {WeakMap<import('electron').WebContents, import('electron').BrowserWindow>} */
const openByOpener = new WeakMap();
/** @type {import('electron').BrowserWindow | null} */
let activeLoginWin = null;
/** @type {WeakSet<import('electron').Session>} */
const uaWiredSessions = new WeakSet();

function isGoogleAccountsUrl(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return h === 'accounts.google.com' || h.endsWith('.accounts.google.com');
  } catch {
    return false;
  }
}

function isGoogleCookieDomain(domain) {
  const d = String(domain || '')
    .toLowerCase()
    .replace(/^\./, '');
  return (
    d === 'google.com' ||
    d.endsWith('.google.com') ||
    d === 'youtube.com' ||
    d.endsWith('.youtube.com') ||
    d === 'gmail.com' ||
    d.endsWith('.gmail.com') ||
    d === 'googlemail.com' ||
    d.endsWith('.googlemail.com') ||
    d === 'gstatic.com' ||
    d.endsWith('.gstatic.com') ||
    d === 'googleapis.com' ||
    d.endsWith('.googleapis.com') ||
    d === 'googleusercontent.com' ||
    d.endsWith('.googleusercontent.com')
  );
}

/**
 * Chrome UA + Client Hints on the clean login session (no adblock / Ghostery).
 * @param {import('electron').Session} ses
 */
function wireCleanLoginSession(ses) {
  if (!ses || uaWiredSessions.has(ses)) return;
  uaWiredSessions.add(ses);
  const uaChrome = require('./ua-chrome.cjs');
  const ua = uaChrome.buildChromeUa();
  try {
    ses.setUserAgent(ua);
  } catch {
    /* */
  }
  try {
    ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      const headers = { ...details.requestHeaders };
      headers['User-Agent'] = uaChrome.buildChromeUa();
      Object.assign(headers, uaChrome.clientHintHeaders());
      delete headers['Sec-GPC'];
      delete headers['sec-gpc'];
      delete headers.DNT;
      delete headers.dnt;
      callback({ requestHeaders: headers });
    });
  } catch (err) {
    console.warn('[google-login] clean session CH', err);
  }
}

/**
 * Apply Chrome UA metadata once via CDP, register a persistent new-document
 * brands shim, then DETACH. Do not leave the debugger attached.
 * @param {import('electron').WebContents} wc
 */
async function applyStealthBrands(wc) {
  if (!wc || wc.isDestroyed()) return;
  const uaChrome = require('./ua-chrome.cjs');
  const ua = uaChrome.buildChromeUa();
  const meta = uaChrome.userAgentMetadata();
  try {
    wc.setUserAgent(ua);
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
      userAgentMetadata: meta,
    });
    // Survives debugger detach — patches page JS brands before any script runs
    await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: buildBrandsShimSource(meta, ua),
    });
  } catch (err) {
    console.warn('[google-login] stealth brands', err && err.message);
  } finally {
    if (attachedHere) {
      try {
        if (wc.debugger.isAttached()) wc.debugger.detach();
      } catch {
        /* */
      }
    }
  }
}

/**
 * @param {ReturnType<typeof import('./ua-chrome.cjs').userAgentMetadata>} meta
 * @param {string} ua
 */
function buildBrandsShimSource(meta, ua) {
  const brands = JSON.stringify(meta.brands);
  const fullVersionList = JSON.stringify(meta.fullVersionList);
  const full = JSON.stringify(meta.fullVersion);
  const uaLit = JSON.stringify(ua);
  return `(() => {
  try {
    const brands = ${brands};
    const fullVersionList = ${fullVersionList};
    const full = ${full};
    const ua = ${uaLit};
    try {
      Object.defineProperty(Navigator.prototype, 'webdriver', {
        get: () => undefined,
        configurable: true,
      });
    } catch (e) {}
    try {
      Object.defineProperty(Navigator.prototype, 'userAgent', {
        get: () => ua,
        configurable: true,
      });
    } catch (e) {}
    const fake = {
      brands,
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues: async (hints) => {
        const out = { brands, mobile: false, platform: 'Windows' };
        for (const h of hints || []) {
          if (h === 'fullVersionList') out.fullVersionList = fullVersionList;
          if (h === 'uaFullVersion' || h === 'fullVersion') out.uaFullVersion = full;
          if (h === 'platformVersion') out.platformVersion = '15.0.0';
          if (h === 'architecture') out.architecture = 'x86';
          if (h === 'bitness') out.bitness = '64';
          if (h === 'model') out.model = '';
          if (h === 'wow64') out.wow64 = false;
          if (h === 'platform') out.platform = 'Windows';
        }
        return out;
      },
      toJSON() {
        return { brands, mobile: false, platform: 'Windows' };
      },
    };
    try {
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: () => fake,
        configurable: true,
      });
    } catch (e) {}
    try {
      if (!window.chrome) window.chrome = {};
      if (!window.chrome.runtime) window.chrome.runtime = {};
    } catch (e) {}
  } catch (e) {}
})();`;
}

/**
 * @param {import('electron').Session} fromSes
 * @param {import('electron').Session} toSes
 */
async function copyGoogleCookies(fromSes, toSes) {
  if (!fromSes || !toSes) return 0;
  let cookies = [];
  try {
    cookies = await fromSes.cookies.get({});
  } catch (err) {
    console.warn('[google-login] cookies.get', err);
    return 0;
  }
  let n = 0;
  for (const c of cookies) {
    if (!isGoogleCookieDomain(c.domain)) continue;
    const host = String(c.domain || '').replace(/^\./, '');
    if (!host) continue;
    const url = `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`;
    try {
      /** @type {Electron.CookiesSetDetails} */
      const details = {
        url,
        name: c.name,
        value: c.value,
        path: c.path || '/',
        secure: Boolean(c.secure),
        httpOnly: Boolean(c.httpOnly),
        sameSite: c.sameSite || 'unspecified',
      };
      if (c.domain) details.domain = c.domain;
      if (typeof c.expirationDate === 'number') details.expirationDate = c.expirationDate;
      await toSes.cookies.set(details);
      n += 1;
    } catch (err) {
      console.warn('[google-login] cookies.set', c.name, err && err.message);
    }
  }
  try {
    await toSes.cookies.flushStore();
  } catch {
    /* */
  }
  return n;
}

function chromeUa() {
  try {
    return require('./ua-chrome.cjs').buildChromeUa();
  } catch {
    return undefined;
  }
}

/**
 * @param {{
 *   url: string,
 *   openerWc: import('electron').WebContents,
 *   hostWindow?: import('electron').BrowserWindow | null,
 * }} opts
 */
function openGoogleLoginWindow(opts) {
  const url = String(opts.url || '');
  const openerWc = opts.openerWc;
  if (!openerWc || openerWc.isDestroyed() || !isGoogleAccountsUrl(url)) {
    return null;
  }

  const ua = chromeUa();
  const loadOpts = ua ? { userAgent: ua } : {};

  try {
    const existing = openByOpener.get(openerWc);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      void existing.loadURL(url, loadOpts);
      return existing;
    }
  } catch {
    /* */
  }

  if (activeLoginWin && !activeLoginWin.isDestroyed()) {
    try {
      activeLoginWin.focus();
      void activeLoginWin.loadURL(url, loadOpts);
      return activeLoginWin;
    } catch {
      /* */
    }
  }

  const parent = opts.hostWindow && !opts.hostWindow.isDestroyed() ? opts.hostWindow : null;
  const openerSes = openerWc.session;
  const loginSes = session.fromPartition(LOGIN_PARTITION);
  wireCleanLoginSession(loginSes);

  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  const win = new BrowserWindow({
    width: 520,
    height: 720,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    title: 'Zaloguj się — Google',
    icon: iconPath,
    parent: parent || undefined,
    modal: false,
    show: true,
    webPreferences: {
      session: loginSes,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
      // no preload — clean session, no Ghostery / passwords / extensions
    },
  });

  activeLoginWin = win;
  try {
    openByOpener.set(openerWc, win);
  } catch {
    /* */
  }

  try {
    win.setMenuBarVisibility(false);
  } catch {
    /* */
  }

  const pageWc = win.webContents;
  if (ua) {
    try {
      pageWc.setUserAgent(ua);
    } catch {
      /* */
    }
  }

  let finishing = false;
  const finish = async (reason) => {
    if (finishing) return;
    finishing = true;
    console.log('[google-login] finish', reason);
    try {
      const copied = await copyGoogleCookies(loginSes, openerSes);
      console.log('[google-login] cookies copied', copied);
    } catch (err) {
      console.warn('[google-login] cookie sync', err);
    }
    try {
      if (!openerWc.isDestroyed() && typeof openerWc.reload === 'function') openerWc.reload();
    } catch (err) {
      console.warn('[google-login] reload opener', err);
    }
    try {
      if (!win.isDestroyed()) win.close();
    } catch {
      /* */
    }
  };

  const onNav = (_e, navUrl) => {
    const u = String(navUrl || '');
    if (!u || u === 'about:blank' || /^chrome-error:/i.test(u) || /^devtools:/i.test(u)) return;
    if (!isGoogleAccountsUrl(u)) {
      void finish('left-accounts:' + u.slice(0, 80));
    }
  };

  pageWc.on('did-navigate', onNav);
  pageWc.on('did-redirect-navigation', onNav);
  pageWc.on('did-navigate-in-page', onNav);

  win.on('closed', () => {
    if (activeLoginWin === win) activeLoginWin = null;
    try {
      openByOpener.delete(openerWc);
    } catch {
      /* */
    }
  });

  // Stealth BEFORE first navigation so brands shim is registered early
  void applyStealthBrands(pageWc).then(() => {
    if (win.isDestroyed()) return;
    void win.loadURL(url, loadOpts);
  });
  console.log('[google-login] open clean-session', url.slice(0, 120));
  return win;
}

/**
 * @param {import('electron').WebContents} guestWc
 * @param {{ getHostWindow?: () => import('electron').BrowserWindow | null, torMode?: boolean }} [opts]
 */
function attachGoogleLoginIntercept(guestWc, opts = {}) {
  if (!guestWc || guestWc.isDestroyed() || guestWc.__djxxrGoogleLogin) return;
  guestWc.__djxxrGoogleLogin = true;
  if (opts.torMode) return;

  const intercept = (url, event) => {
    if (!isGoogleAccountsUrl(url)) return false;
    try {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
    } catch {
      /* */
    }
    openGoogleLoginWindow({
      url,
      openerWc: guestWc,
      hostWindow: typeof opts.getHostWindow === 'function' ? opts.getHostWindow() : null,
    });
    return true;
  };

  guestWc.on('will-navigate', (event, url) => {
    intercept(url, event);
  });

  guestWc.on('will-redirect', (event, url) => {
    intercept(url, event);
  });
}

// Keep exports used by popups (no-ops / soft wrappers for API compat)
function pauseSessionPreloads() {
  /* clean-session path — nothing to pause on persist:main */
}
function resumeSessionPreloads() {
  /* */
}

module.exports = {
  isGoogleAccountsUrl,
  openGoogleLoginWindow,
  attachGoogleLoginIntercept,
  pauseSessionPreloads,
  resumeSessionPreloads,
  copyGoogleCookies,
  LOGIN_PARTITION,
};
