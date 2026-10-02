/**
 * Google account login in a dedicated BrowserWindow.
 *
 * Isolated clean session (no Ghostery/adblock/extensions/CDP). After leaving
 * accounts.google.com, copies Google cookies into the opener session and reloads.
 *
 * CDP stealth was removed — on this machine debugger attach hung / Google still
 * blocked; the working smoke path was clean session + Chrome UA only.
 */
'use strict';

const path = require('node:path');
const { BrowserWindow, session } = require('electron');

const LOGIN_PARTITION = 'persist:google-login-v3';

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
 * @param {import('electron').Session} ses
 */
function wireCleanLoginSession(ses) {
  if (!ses || uaWiredSessions.has(ses)) return;
  uaWiredSessions.add(ses);
  const uaChrome = require('./ua-chrome.cjs');
  try {
    ses.setUserAgent(uaChrome.buildChromeUa());
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

function destroyLoginWin(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.removeAllListeners('closed');
  } catch {
    /* */
  }
  try {
    win.destroy();
  } catch {
    /* */
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

  // Never reuse a previous login window (may already be on Google's block page)
  try {
    const existing = openByOpener.get(openerWc);
    if (existing && !existing.isDestroyed()) destroyLoginWin(existing);
  } catch {
    /* */
  }
  if (activeLoginWin && !activeLoginWin.isDestroyed()) {
    destroyLoginWin(activeLoginWin);
    activeLoginWin = null;
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
  pageWc.on('did-fail-load', (_e, code, desc, validatedURL, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    console.warn('[google-login] did-fail-load', code, desc, String(validatedURL || '').slice(0, 120));
  });

  win.on('closed', () => {
    if (activeLoginWin === win) activeLoginWin = null;
    try {
      openByOpener.delete(openerWc);
    } catch {
      /* */
    }
  });

  // No CDP — load immediately (CDP stealth caused blank window / still blocked)
  void win.loadURL(url, loadOpts).catch((err) => {
    console.warn('[google-login] loadURL', err && err.message);
  });
  console.log('[google-login] open clean-session', LOGIN_PARTITION, url.slice(0, 100));
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
    try {
      if (typeof guestWc.stop === 'function') guestWc.stop();
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

  // First paint via <webview src> sometimes skips will-navigate — catch main-frame start
  guestWc.on('did-start-navigation', (event, url, _isInPlace, isMainFrame) => {
    if (isMainFrame === false) return;
    if (!isGoogleAccountsUrl(url)) return;
    try {
      if (typeof guestWc.stop === 'function') guestWc.stop();
    } catch {
      /* */
    }
    openGoogleLoginWindow({
      url,
      openerWc: guestWc,
      hostWindow: typeof opts.getHostWindow === 'function' ? opts.getHostWindow() : null,
    });
  });
}

function pauseSessionPreloads() {}
function resumeSessionPreloads() {}

module.exports = {
  isGoogleAccountsUrl,
  openGoogleLoginWindow,
  attachGoogleLoginIntercept,
  pauseSessionPreloads,
  resumeSessionPreloads,
  copyGoogleCookies,
  LOGIN_PARTITION,
};
