/**
 * Google account login in a dedicated BrowserWindow (not <webview>).
 * Same partition/session as the opener tab; no preload; cookies shared.
 * After navigation leaves accounts.google.com → close and reload opener.
 */
'use strict';

const { BrowserWindow } = require('electron');

/** @type {WeakMap<import('electron').WebContents, import('electron').BrowserWindow>} */
const openByOpener = new WeakMap();
/** @type {import('electron').BrowserWindow | null} */
let activeLoginWin = null;

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

  try {
    const existing = openByOpener.get(openerWc);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      void existing.loadURL(url);
      return existing;
    }
  } catch {
    /* */
  }

  if (activeLoginWin && !activeLoginWin.isDestroyed()) {
    try {
      activeLoginWin.focus();
      void activeLoginWin.loadURL(url);
      return activeLoginWin;
    } catch {
      /* */
    }
  }

  const parent = opts.hostWindow && !opts.hostWindow.isDestroyed() ? opts.hostWindow : null;
  const ses = openerWc.session;

  const win = new BrowserWindow({
    width: 520,
    height: 720,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    title: 'Zaloguj się — Google',
    parent: parent || undefined,
    modal: false,
    show: true,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
      // no preload — Google detects guest preload / Electron webview
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
  try {
    const uaChrome = require('./ua-chrome.cjs');
    // Keep CDP attached so userAgentData.brands includes Google Chrome
    void uaChrome.applyToWebContents(pageWc, { tor: false, persistDebugger: true });
  } catch (err) {
    console.warn('[google-login] ua', err);
  }

  let finishing = false;
  const finish = (reason) => {
    if (finishing) return;
    finishing = true;
    console.log('[google-login] finish', reason);
    try {
      if (!openerWc.isDestroyed()) {
        if (typeof openerWc.reload === 'function') openerWc.reload();
      }
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
      finish('left-accounts:' + u.slice(0, 80));
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

  void win.loadURL(url);
  console.log('[google-login] open', url.slice(0, 120));
  return win;
}

/**
 * Intercept main-frame navigations to accounts.google.com from a guest webview.
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

module.exports = {
  isGoogleAccountsUrl,
  openGoogleLoginWindow,
  attachGoogleLoginIntercept,
};
