/**
 * Google account login in a dedicated BrowserWindow (not <webview>).
 * Same partition/session as the opener tab so cookies are shared.
 *
 * Critical anti-detection (Google “browser may not be secure”):
 * - No session preloads (Ghostery cosmetics inject scripts → blocked)
 * - No CDP debugger left attached (persistDebugger was detectable)
 * - Clean Chrome UA via setUserAgent + loadURL
 */
'use strict';

const path = require('node:path');
const { BrowserWindow } = require('electron');

/** @type {WeakMap<import('electron').WebContents, import('electron').BrowserWindow>} */
const openByOpener = new WeakMap();
/** @type {import('electron').BrowserWindow | null} */
let activeLoginWin = null;
/** @type {number} */
let preloadPauseDepth = 0;
/** @type {{ type: string, filePath: string, id?: string }[]} */
let pausedPreloads = [];

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
 * Temporarily remove session preload scripts (Ghostery cosmetics etc.).
 * Nested login windows share one pause stack.
 * @param {import('electron').Session} ses
 */
function pauseSessionPreloads(ses) {
  if (!ses) return;
  preloadPauseDepth += 1;
  if (preloadPauseDepth > 1) return;
  pausedPreloads = [];
  try {
    const list = typeof ses.getPreloadScripts === 'function' ? ses.getPreloadScripts() : [];
    for (const p of list || []) {
      if (!p || !p.id) continue;
      pausedPreloads.push({
        id: p.id,
        type: p.type || 'frame',
        filePath: p.filePath,
      });
      try {
        ses.unregisterPreloadScript(p.id);
      } catch (err) {
        console.warn('[google-login] unregister preload', err);
      }
    }
    console.log('[google-login] paused session preloads', pausedPreloads.length);
  } catch (err) {
    console.warn('[google-login] pause preloads', err);
  }
}

/**
 * @param {import('electron').Session} ses
 */
function resumeSessionPreloads(ses) {
  if (!ses) return;
  preloadPauseDepth = Math.max(0, preloadPauseDepth - 1);
  if (preloadPauseDepth > 0) return;
  const toRestore = pausedPreloads;
  pausedPreloads = [];
  for (const p of toRestore) {
    if (!p.filePath) continue;
    try {
      ses.registerPreloadScript({
        type: /** @type {'frame'|'service-worker'} */ (p.type || 'frame'),
        filePath: p.filePath,
        id: p.id,
      });
    } catch (err) {
      console.warn('[google-login] restore preload', err);
    }
  }
  console.log('[google-login] restored session preloads', toRestore.length);
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
      void existing.loadURL(url, loadOpts());
      return existing;
    }
  } catch {
    /* */
  }

  if (activeLoginWin && !activeLoginWin.isDestroyed()) {
    try {
      activeLoginWin.focus();
      void activeLoginWin.loadURL(url, loadOpts());
      return activeLoginWin;
    } catch {
      /* */
    }
  }

  const parent = opts.hostWindow && !opts.hostWindow.isDestroyed() ? opts.hostWindow : null;
  const ses = openerWc.session;
  pauseSessionPreloads(ses);

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
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: true,
      // Explicitly no preload — Ghostery session preloads are paused above
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
  const uaChrome = require('./ua-chrome.cjs');
  const ua = uaChrome.buildChromeUa();
  try {
    pageWc.setUserAgent(ua);
  } catch {
    /* */
  }
  // Apply reduced Chrome UA + Client Hints metadata once, then DETACH.
  // Do NOT leave debugger attached — Google treats that as automation.
  void uaChrome.applyToWebContents(pageWc, { tor: false, persistDebugger: false });

  let finishing = false;
  const finish = (reason) => {
    if (finishing) return;
    finishing = true;
    console.log('[google-login] finish', reason);
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
    resumeSessionPreloads(ses);
  });

  void win.loadURL(url, { userAgent: ua });
  console.log('[google-login] open', url.slice(0, 120));
  return win;
}

function loadOpts() {
  try {
    const uaChrome = require('./ua-chrome.cjs');
    return { userAgent: uaChrome.buildChromeUa() };
  } catch {
    return {};
  }
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
  pauseSessionPreloads,
  resumeSessionPreloads,
};
