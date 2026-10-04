/**
 * Google accounts hardening for normal in-tab / same-session login.
 *
 * Like Electron browsers that work (e.g. oculo): stay on persist:main, clean
 * session UA, do NOT open a separate login window (that crashed YT and still
 * got blocked). Only pause Ghostery session preloads while on accounts.google.com
 * so cosmetics scripts are not injected into the login page.
 */
'use strict';

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
      if (!p || !p.id || !p.filePath) continue;
      pausedPreloads.push({
        id: p.id,
        type: p.type || 'frame',
        filePath: p.filePath,
      });
      try {
        ses.unregisterPreloadScript(p.id);
      } catch (err) {
        console.warn('[google-login] unregister preload', err && err.message);
      }
    }
    if (pausedPreloads.length) {
      console.log('[google-login] paused session preloads', pausedPreloads.length);
    }
  } catch (err) {
    console.warn('[google-login] pause preloads', err && err.message);
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
    try {
      ses.registerPreloadScript({
        type: /** @type {'frame'|'service-worker'} */ (p.type || 'frame'),
        filePath: p.filePath,
        id: p.id,
      });
    } catch (err) {
      console.warn('[google-login] restore preload', err && err.message);
    }
  }
  if (toRestore.length) {
    console.log('[google-login] restored session preloads', toRestore.length);
  }
}

/**
 * Pause Ghostery cosmetics before accounts.google.com documents load; resume after.
 * Does not cancel navigation and does not open extra windows.
 *
 * @param {import('electron').WebContents} guestWc
 * @param {{ torMode?: boolean }} [opts]
 */
function attachGoogleAccountsHardening(guestWc, opts = {}) {
  if (!guestWc || guestWc.isDestroyed() || guestWc.__djxxrGoogleHardened) return;
  guestWc.__djxxrGoogleHardened = true;
  if (opts.torMode) return;

  let onAccounts = false;

  const enterAccounts = () => {
    if (onAccounts) return;
    onAccounts = true;
    try {
      pauseSessionPreloads(guestWc.session);
    } catch {
      /* */
    }
  };

  const leaveAccounts = () => {
    if (!onAccounts) return;
    onAccounts = false;
    try {
      resumeSessionPreloads(guestWc.session);
    } catch {
      /* */
    }
  };

  const onUrl = (url) => {
    if (isGoogleAccountsUrl(url)) enterAccounts();
    else leaveAccounts();
  };

  // Pause as early as possible so the next document does not get Ghostery preload
  guestWc.on('will-navigate', (_e, url) => {
    if (isGoogleAccountsUrl(url)) enterAccounts();
  });
  guestWc.on('will-redirect', (_e, url) => {
    if (isGoogleAccountsUrl(url)) enterAccounts();
  });
  guestWc.on('did-start-navigation', (_e, url, _inPlace, isMainFrame) => {
    if (isMainFrame === false) return;
    if (isGoogleAccountsUrl(url)) enterAccounts();
  });
  guestWc.on('did-navigate', (_e, url) => onUrl(url));
  guestWc.on('did-redirect-navigation', (_e, url) => onUrl(url));
  guestWc.on('did-navigate-in-page', (_e, url) => onUrl(url));
  guestWc.on('destroyed', () => {
    leaveAccounts();
  });

  try {
    onUrl(guestWc.getURL());
  } catch {
    /* */
  }
}

// --- deprecated API stubs (callers cleaned up; keep exports stable) ---
function openGoogleLoginWindow() {
  console.warn('[google-login] openGoogleLoginWindow removed — login stays in-tab');
  return null;
}
function attachGoogleLoginIntercept(guestWc, opts) {
  attachGoogleAccountsHardening(guestWc, opts);
}

module.exports = {
  isGoogleAccountsUrl,
  pauseSessionPreloads,
  resumeSessionPreloads,
  attachGoogleAccountsHardening,
  // compat
  openGoogleLoginWindow,
  attachGoogleLoginIntercept,
};
