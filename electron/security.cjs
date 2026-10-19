'use strict';

/**
 * Security hardening: CSP, webview attach, permissions, navigation.
 */
const fs = require('node:fs');
const path = require('node:path');
const { session, app } = require('electron');

const ALLOWED_PARTITIONS = new Set(['persist:main', 'persist:side']);
/** Ephemeral Tor sessions: tor-<uuid> (no persist: prefix) */
const TOR_PARTITION_RE = /^tor-[0-9a-f-]{8,}$/i;
/** Ephemeral private windows: private-<uuid> — never persist:private */
const PRIVATE_PARTITION_RE = /^private-[0-9a-f-]{8,}$/i;
const NAV_OK = /^(https?:|about:home$)/i;
const NAV_EXTERNAL_PROMPT = /^(mailto:|tel:|sms:|zoommtg:|slack:|spotify:|discord:|steam:|ms-)/i;

function isAllowedPartition(partition) {
  if (!partition) return true;
  if (ALLOWED_PARTITIONS.has(partition)) return true;
  if (partition.startsWith('persist:side')) return true;
  if (TOR_PARTITION_RE.test(partition)) return true;
  if (PRIVATE_PARTITION_RE.test(partition)) return true;
  return false;
}

/** @type {Map<string, Record<string, 'allow'|'deny'>>} origin → permission → decision */
let permissionStore = new Map();
const storePath = () => path.join(app.getPath('userData'), 'djxxr-permissions.json');

/** @type {((req: object) => void) | null} */
let onPermissionAsk = null;
/** @type {Map<string, { resolve: Function, timer: NodeJS.Timeout }>} */
const pendingAsks = new Map();

function loadPermissions() {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    permissionStore = new Map(Object.entries(raw || {}));
  } catch {
    permissionStore = new Map();
  }
}

function savePermissions() {
  const obj = Object.fromEntries(permissionStore);
  try {
    fs.writeFileSync(storePath(), JSON.stringify(obj, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn('[security] save permissions', e);
  }
}

function setPermissionAskHandler(fn) {
  onPermissionAsk = fn;
}

function respondPermission(askId, allow, remember, origin, permission) {
  const p = pendingAsks.get(askId);
  if (!p) return { ok: false };
  clearTimeout(p.timer);
  pendingAsks.delete(askId);
  if (remember && origin && permission) {
    const cur = permissionStore.get(origin) || {};
    cur[permission] = allow ? 'allow' : 'deny';
    permissionStore.set(origin, cur);
    savePermissions();
  }
  p.resolve(Boolean(allow));
  return { ok: true };
}

function listPermissions() {
  return Object.fromEntries(permissionStore);
}

function revokePermission(origin, permission) {
  const cur = permissionStore.get(origin);
  if (!cur) return { ok: true };
  if (permission) {
    delete cur[permission];
    if (!Object.keys(cur).length) permissionStore.delete(origin);
    else permissionStore.set(origin, cur);
  } else {
    permissionStore.delete(origin);
  }
  savePermissions();
  return { ok: true };
}

function isWebAuthnPermission(perm) {
  return /^publickey-credentials-(get|create)$/i.test(String(perm || ''));
}

function mapPermission(perm) {
  const p = String(perm || '');
  // Exact / anchored matches — avoid substring traps (e.g. /media/ vs publickey-…)
  if (isWebAuthnPermission(p)) return 'webauthn';
  if (/^(media|microphone|audioCapture)$/i.test(p)) return 'microphone';
  if (/^(video|camera|videoCapture)$/i.test(p)) return 'camera';
  if (/^geolocation$/i.test(p)) return 'geolocation';
  if (/^notifications$/i.test(p)) return 'notifications';
  if (/^clipboard/i.test(p)) return 'clipboard';
  if (/^(display-capture|desktopCapture)$/i.test(p) || /screen/i.test(p)) return 'display-capture';
  if (/^midi/i.test(p)) return 'midi';
  return p || 'unknown';
}

function askUser(origin, permission, details) {
  return new Promise((resolve) => {
    const askId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      pendingAsks.delete(askId);
      resolve(false);
    }, 60_000);
    pendingAsks.set(askId, { resolve, timer });
    if (onPermissionAsk) {
      onPermissionAsk({
        askId,
        origin,
        permission,
        details: details || {},
      });
    } else {
      clearTimeout(timer);
      pendingAsks.delete(askId);
      resolve(false);
    }
  });
}

/** @type {WeakSet<import('electron').Session>} */
const webauthnWired = new WeakSet();

function attachWebAuthnAccountPicker(ses) {
  if (!ses || webauthnWired.has(ses)) return;
  webauthnWired.add(ses);
  // Without this listener Electron cancels multi-credential WebAuthn with NotAllowedError
  // → Google shows /signin/challenge/pk/error
  ses.on('select-webauthn-account', (_event, details, callback) => {
    try {
      const accounts = Array.isArray(details?.accounts) ? details.accounts : [];
      if (!accounts.length) {
        callback();
        return;
      }
      const pick = accounts[0];
      const id = pick && pick.credentialId;
      if (!id) {
        callback();
        return;
      }
      if (accounts.length > 1) {
        console.log(
          '[security] webauthn multi-account → first',
          accounts.map((a) => a.name || a.username || a.displayName || '?'),
        );
      }
      callback(id);
    } catch (err) {
      console.warn('[security] select-webauthn-account', err && err.message);
      try {
        callback();
      } catch {
        /* */
      }
    }
  });
}

function attachPermissionHandlers(ses) {
  attachWebAuthnAccountPicker(ses);

  ses.setPermissionRequestHandler(async (webContents, permission, callback, details) => {
    try {
      let origin = '';
      try {
        origin = new URL(webContents.getURL()).origin;
      } catch {
        origin = details?.requestingUrl ? new URL(details.requestingUrl).origin : '';
      }
      // Installed Chrome extensions (chrome-extension://) — allow like Chrome after install
      if (/^chrome-extension:/i.test(origin)) {
        callback(true);
        return;
      }
      if (!/^https:/i.test(origin)) {
        callback(false);
        return;
      }
      // Passkeys / security keys: Chrome-like auto-allow on HTTPS; OS (Win Hello) prompts
      if (isWebAuthnPermission(permission)) {
        callback(true);
        return;
      }
      // YouTube / site PiP + miniplayer probes
      if (/^picture-in-picture$/i.test(String(permission || ''))) {
        callback(true);
        return;
      }
      const key = mapPermission(permission);
      const saved = permissionStore.get(origin)?.[key];
      if (saved === 'allow') {
        callback(true);
        return;
      }
      if (saved === 'deny') {
        callback(false);
        return;
      }
      // Sensitive permissions need prompt; others deny by default
      const promptable = new Set([
        'microphone',
        'camera',
        'geolocation',
        'notifications',
        'clipboard',
        'display-capture',
        'media',
        'webauthn',
      ]);
      if (!promptable.has(key) && key !== 'media') {
        callback(false);
        return;
      }
      const allow = await askUser(origin, key, { permission, ...details });
      callback(allow);
    } catch {
      callback(false);
    }
  });

  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    try {
      const origin = requestingOrigin || '';
      if (/^chrome-extension:/i.test(origin)) return true;
      if (!/^https:/i.test(origin)) return false;
      // Must allow check — Chromium denies WebAuthn before Request if check is false
      if (isWebAuthnPermission(permission)) return true;
      if (/^picture-in-picture$/i.test(String(permission || ''))) return true;
      const key = mapPermission(permission);
      const saved = permissionStore.get(origin)?.[key];
      if (saved === 'allow') return true;
      if (saved === 'deny') return false;
      return false;
    } catch {
      return false;
    }
  });
}

function cspForSession(isDev) {
  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:5173 http://localhost:5173",
      "style-src 'self' 'unsafe-inline' http://127.0.0.1:5173 http://localhost:5173",
      "font-src 'self' data: http://127.0.0.1:5173 http://localhost:5173",
      "img-src 'self' data: blob: https: http: file: vio-bg:",
      "connect-src 'self' ws://127.0.0.1:5173 ws://localhost:5173 http://127.0.0.1:5173 http://localhost:5173",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      // Spotify home widget embed
      "frame-src https://open.spotify.com https://embed.spotify.com",
    ].join('; ');
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https: file: vio-bg:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-src https://open.spotify.com https://embed.spotify.com",
    "form-action 'self'",
  ].join('; ');
}

function attachCsp(ses, isDev) {
  const csp = cspForSession(isDev);
  ses.webRequest.onHeadersReceived((details, callback) => {
    // Only harden the app chrome (file:// or Vite), not guest websites
    const url = details.url || '';
    const isApp =
      url.startsWith('file://') ||
      url.startsWith('http://127.0.0.1:5173/') ||
      url.startsWith('http://localhost:5173/');
    if (!isApp) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = [csp];
    callback({ responseHeaders: headers });
  });
}

function attachWebviewGuard(ses, preloadPath) {
  // Host BrowserWindow webContents — attach on each window
  void ses;
  return function bindWillAttach(wc) {
    wc.on('will-attach-webview', (event, webPreferences, params) => {
      try {
        const src = String(params.src || '');
        const okSrc =
          /^https?:\/\//i.test(src) ||
          /^file:\/\//i.test(src) ||
          src === 'about:blank' ||
          src.startsWith('data:text/html');
        // allow about:blank for init; block file/javascript primary navigations handled elsewhere
        if (!okSrc && src && !src.startsWith('about:')) {
          event.preventDefault();
          return;
        }
        const partition = params.partition || '';
        if (partition && !isAllowedPartition(partition)) {
          event.preventDefault();
          return;
        }
        webPreferences.nodeIntegration = false;
        webPreferences.nodeIntegrationInSubFrames = false;
        webPreferences.contextIsolation = true;
        webPreferences.sandbox = true;
        webPreferences.webSecurity = true;
        webPreferences.allowRunningInsecureContent = false;
        webPreferences.preload = preloadPath;
        delete webPreferences.preloadURL;
        // webview has its own UA — set before first navigation (session alone is not enough).
        // Marker from host <webview useragent="VioSideCompact"> → mobile Chrome for narrow panels.
        try {
          const uaChrome = require('./ua-chrome.cjs');
          const wantCompact = /VioSideCompact/i.test(String(params.useragent || ''));
          params.useragent = wantCompact
            ? uaChrome.buildMobileChromeUa()
            : uaChrome.buildChromeUa();
        } catch {
          /* */
        }
      } catch (err) {
        console.warn('[security] will-attach-webview', err);
        event.preventDefault();
      }
    });
  };
}

function isAllowedNavigation(url) {
  if (!url || typeof url !== 'string') return { ok: false, reason: 'empty' };
  if (url === 'about:blank' || url === 'about:home' || url === 'about:tor') return { ok: true };
  if (/^view-source:/i.test(url)) {
    const inner = url.replace(/^view-source:/i, '');
    return isAllowedNavigation(inner);
  }
  if (/^https?:\/\//i.test(url)) return { ok: true };
  if (/^file:\/\//i.test(url)) return { ok: true, reason: 'file' };
  if (NAV_EXTERNAL_PROMPT.test(url)) return { ok: 'prompt', reason: 'external-protocol' };
  if (/^(javascript:|data:|vbscript:)/i.test(url)) return { ok: false, reason: 'dangerous' };
  return { ok: false, reason: 'blocked-scheme' };
}

function attachNavigationGuards(wc, opts = {}) {
  const askExternal = opts.askExternal;
  const torMode = Boolean(opts.torMode);
  const popups = require('./popups.cjs');

  popups.attachGestureTracker(wc);
  popups.attachDidCreateWindow(wc, opts.onPopupWindow);

  wc.on('will-navigate', (event, url) => {
    const r = isAllowedNavigation(url);
    if (r.ok === true) return;
    event.preventDefault();
    // Tor: never open external protocols
    if (torMode) return;
    if (r.ok === 'prompt' && askExternal) {
      void askExternal(url);
    }
  });

  wc.setWindowOpenHandler((details) => {
    const hostWindow =
      typeof opts.getHostWindow === 'function' ? opts.getHostWindow() : opts.hostWindow || null;
    return popups.handleWindowOpen(wc, {
      url: details.url,
      disposition: details.disposition,
      features: details.features,
      torMode,
      isAllowedNav: isAllowedNavigation,
      onOpenUrl: opts.onOpenUrl,
      onPopupBlocked: opts.onPopupBlocked,
      askExternal,
      hostWindow,
    });
  });
}

function init() {
  loadPermissions();
}

module.exports = {
  init,
  attachCsp,
  attachWebviewGuard,
  attachPermissionHandlers,
  isWebAuthnPermission,
  attachNavigationGuards,
  isAllowedNavigation,
  isAllowedPartition,
  setPermissionAskHandler,
  respondPermission,
  listPermissions,
  revokePermission,
  mapPermission,
  ALLOWED_PARTITIONS,
  TOR_PARTITION_RE,
  PRIVATE_PARTITION_RE,
};
