/**
 * window.open / target=_blank policy for guest webContents.
 *
 * Paths:
 * 1. target=_blank / disposition foreground|background-tab → new tab (deny + onOpenUrl)
 * 2. window.open with width/height/popup features OR about:blank OAuth → real BrowserWindow,
 *    SAME session as opener (cookies + window.opener / postMessage) + thin URL chrome
 * 3. window.open without recent user gesture → deny + shell:popup-blocked
 * 4. Tor: never create chrome popup windows — open as Tor tab in same partition instead
 */
'use strict';

const path = require('node:path');
const { BrowserWindow, WebContentsView, ipcMain } = require('electron');
const {
  OAUTH_HOST_RE,
  parseFeatureSize,
  looksLikePopupFeatures,
  looksLikeOauthUrl,
} = require('./lib/popup-policy.cjs');

const GESTURE_MS = 5000;
const TOOLBAR_H = 36;

/** Multi-part public suffixes (fallback when tldts unavailable). */
const MULTI_TLD = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'co.jp',
  'com.au',
  'com.br',
  'co.nz',
  'com.pl',
  'net.pl',
  'org.pl',
  'com.tr',
]);

/** @type {WeakMap<import('electron').WebContents, number>} */
const lastGestureAt = new WeakMap();

/** origin → allow popups without gesture */
const allowedPopupOrigins = new Set();

/** @type {WeakMap<import('electron').BrowserWindow, Set<import('electron').BrowserWindow>>} */
const popupsByHostWindow = new WeakMap();

const DARK_SCROLLBAR_CSS = `
html, body {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, #f2f3f5 22%, transparent) transparent;
}
html::-webkit-scrollbar, body::-webkit-scrollbar { width: 8px; height: 8px; }
html::-webkit-scrollbar-button, body::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
html::-webkit-scrollbar-track, body::-webkit-scrollbar-track { background: transparent; }
html::-webkit-scrollbar-thumb, body::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, #f2f3f5 18%, transparent);
  border-radius: 999px;
}
html::-webkit-scrollbar-thumb:hover, body::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, #f2f3f5 30%, transparent);
}
html::-webkit-scrollbar-corner, body::-webkit-scrollbar-corner { background: transparent; }
`.trim();

let chromeIpcWired = false;

function noteGesture(wc) {
  if (!wc || wc.isDestroyed()) return;
  lastGestureAt.set(wc, Date.now());
}

function hasRecentGesture(wc) {
  const t = lastGestureAt.get(wc) || 0;
  return Date.now() - t < GESTURE_MS;
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

function allowPopupsForOrigin(origin) {
  if (origin) allowedPopupOrigins.add(origin);
}

function isPopupAllowedForOrigin(origin) {
  return Boolean(origin && allowedPopupOrigins.has(origin));
}

/**
 * Registrable domain (eTLD+1) for Chrome-style host highlighting.
 * @param {string} hostname
 */
function registrableDomain(hostname) {
  const host = String(hostname || '')
    .replace(/\.$/, '')
    .toLowerCase();
  if (!host || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':')) return host;
  try {
    const tldts = require('tldts-experimental');
    const d = tldts.getDomain(host);
    if (d) return d;
  } catch {
    /* */
  }
  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join('.');
  if (MULTI_TLD.has(last2) && parts.length >= 3) return parts.slice(-3).join('.');
  return last2;
}

function hostWindowForWebContents(wc) {
  if (!wc || wc.isDestroyed()) return null;
  try {
    const direct = BrowserWindow.fromWebContents(wc);
    if (direct && !direct.isDestroyed()) return direct;
  } catch {
    /* */
  }
  try {
    if (wc.hostWebContents && !wc.hostWebContents.isDestroyed()) {
      const host = BrowserWindow.fromWebContents(wc.hostWebContents);
      if (host && !host.isDestroyed()) return host;
    }
  } catch {
    /* */
  }
  try {
    if (typeof wc.getOwnerBrowserWindow === 'function') {
      const owner = wc.getOwnerBrowserWindow();
      if (owner && !owner.isDestroyed()) return owner;
    }
  } catch {
    /* */
  }
  return null;
}

function trackPopupChild(openerWc, childWin) {
  const host = hostWindowForWebContents(openerWc);
  if (!host || !childWin || childWin.isDestroyed()) return;
  let set = popupsByHostWindow.get(host);
  if (!set) {
    set = new Set();
    popupsByHostWindow.set(host, set);
    host.once('closed', () => {
      const kids = popupsByHostWindow.get(host);
      if (!kids) return;
      for (const child of kids) {
        try {
          if (child && !child.isDestroyed()) child.close();
        } catch {
          /* */
        }
      }
      kids.clear();
    });
  }
  set.add(childWin);
  childWin.once('closed', () => {
    try {
      set.delete(childWin);
    } catch {
      /* */
    }
  });
}

function ensureChromeIpc() {
  if (chromeIpcWired) return;
  chromeIpcWired = true;
  ipcMain.on('djxxr-popup-chrome-ready', (event) => {
    try {
      const chromeWc = event.sender;
      const win = BrowserWindow.fromWebContents(chromeWc);
      const pageWc = win && !win.isDestroyed() ? win.__djxxrPopupPageWc : null;
      if (pageWc && !pageWc.isDestroyed()) {
        pushChromeUpdate(win, pageWc);
      }
    } catch (err) {
      console.warn('[popup] chrome-ready', err);
    }
  });
}

/**
 * @param {import('electron').BrowserWindow} win
 * @param {import('electron').WebContents} pageWc
 */
async function readCertSummary(pageWc) {
  try {
    const url = pageWc.getURL();
    if (!/^https:/i.test(url)) return null;
    const origin = new URL(url).origin;
    const dbg = pageWc.debugger;
    if (!dbg.isAttached()) {
      try {
        dbg.attach('1.3');
        pageWc.__djxxrDbgAttached = true;
      } catch {
        return null;
      }
    }
    try {
      await dbg.sendCommand('Network.enable');
    } catch {
      /* */
    }
    try {
      const r = await dbg.sendCommand('Network.getCertificate', { origin });
      const table = r && (r.tableNames || r.certificates);
      // Electron/CDP variants: { certificates: Certificate[] } or encoded
      const certs = Array.isArray(r?.certificates) ? r.certificates : null;
      if (certs && certs[0]) {
        const c = certs[0];
        return {
          subjectName: c.subjectName || c.subject?.CN || '',
          issuerName: c.issuerName || c.issuer?.CN || '',
          validExpiry: c.validExpiry || c.validTo || '',
        };
      }
      void table;
    } catch {
      /* Network.getCertificate may be missing — fall through */
    }
    try {
      const st = await dbg.sendCommand('Security.getDisplayedSecureOriginCertificateChain');
      const chain = st?.certificates || st?.certificateChain;
      if (Array.isArray(chain) && chain[0]) {
        const c = chain[0];
        return {
          subjectName: c.subjectName || '',
          issuerName: c.issuerName || '',
          validExpiry: c.validExpiry || '',
        };
      }
    } catch {
      /* */
    }
  } catch {
    /* */
  }
  return null;
}

function chromePayloadFromUrl(url, cert) {
  let host = '';
  let secure = false;
  try {
    const u = new URL(url);
    host = u.host || u.hostname || '';
    secure = u.protocol === 'https:';
  } catch {
    host = '';
    secure = false;
  }
  return {
    url: String(url || ''),
    host,
    registrable: registrableDomain(host.split(':')[0]),
    secure,
    cert: cert || null,
  };
}

function pushChromeUpdate(win, pageWc) {
  if (!win || win.isDestroyed() || !pageWc || pageWc.isDestroyed()) return;
  const chromeView = win.__djxxrPopupChromeView;
  if (!chromeView || chromeView.webContents.isDestroyed()) return;
  const url = (() => {
    try {
      return pageWc.getURL();
    } catch {
      return '';
    }
  })();
  const payload = chromePayloadFromUrl(url, win.__djxxrPopupCert || null);
  try {
    const titleHost = payload.host || 'Vio';
    win.setTitle(titleHost);
  } catch {
    /* */
  }
  try {
    chromeView.webContents.send('djxxr-popup-chrome-update', payload);
  } catch {
    /* */
  }
  void readCertSummary(pageWc).then((cert) => {
    if (!cert || win.isDestroyed()) return;
    win.__djxxrPopupCert = cert;
    const next = chromePayloadFromUrl(url, cert);
    try {
      chromeView.webContents.send('djxxr-popup-chrome-update', next);
    } catch {
      /* */
    }
  });
}

/**
 * Thin read-only URL bar above the guest page (WebContentsView).
 * @param {import('electron').BrowserWindow} childWin
 */
function attachPopupUrlChrome(childWin) {
  if (!childWin || childWin.isDestroyed() || childWin.__djxxrPopupChrome) return;
  childWin.__djxxrPopupChrome = true;
  ensureChromeIpc();

  const pageWc = childWin.webContents;
  childWin.__djxxrPopupPageWc = pageWc;

  let chromeView;
  try {
    chromeView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'popup-chrome-preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    chromeView.setBackgroundColor('#10131a');
    childWin.contentView.addChildView(chromeView);
    childWin.__djxxrPopupChromeView = chromeView;
    chromeView.webContents.loadFile(path.join(__dirname, 'popup-chrome.html'));
  } catch (err) {
    console.warn('[popup] chrome view', err);
    return;
  }

  const layout = () => {
    if (childWin.isDestroyed()) return;
    try {
      const [cw, ch] = childWin.getContentSize();
      const root = childWin.contentView;
      chromeView.setBounds({ x: 0, y: 0, width: cw, height: TOOLBAR_H });
      for (const v of root.children) {
        if (v !== chromeView) {
          v.setBounds({ x: 0, y: TOOLBAR_H, width: cw, height: Math.max(50, ch - TOOLBAR_H) });
        }
      }
    } catch (err) {
      console.warn('[popup] layout', err);
    }
  };

  layout();
  childWin.on('resize', layout);
  // First paint sometimes before children settle
  setTimeout(layout, 0);
  setTimeout(layout, 50);

  const refresh = () => pushChromeUpdate(childWin, pageWc);
  pageWc.on('did-navigate', refresh);
  pageWc.on('did-navigate-in-page', refresh);
  pageWc.on('did-redirect-navigation', refresh);
  pageWc.on('page-title-updated', refresh);
  pageWc.on('dom-ready', () => {
    refresh();
    try {
      void pageWc.insertCSS(DARK_SCROLLBAR_CSS);
    } catch {
      /* */
    }
  });
  pageWc.on('did-finish-load', refresh);
  refresh();
}

/**
 * Track clicks / keys so we can approximate Chromium's user-activation for popups.
 * @param {import('electron').WebContents} wc
 */
function attachGestureTracker(wc) {
  if (!wc || wc.isDestroyed() || wc.__djxxrPopupGesture) return;
  wc.__djxxrPopupGesture = true;
  wc.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' || input.type === 'mouseDown') noteGesture(wc);
  });
  wc.on('dom-ready', () => {
    noteGesture(wc);
  });
  wc.on('input-event', (_e, input) => {
    try {
      if (input?.type === 'mouseDown' || input?.type === 'rawKeyDown') noteGesture(wc);
    } catch {
      /* */
    }
  });
}

/**
 * @param {import('electron').WebContents} openerWc
 * @param {{
 *   url: string,
 *   disposition: string,
 *   features: string,
 *   torMode?: boolean,
 *   isAllowedNav: (url: string) => { ok: boolean|string },
 *   onOpenUrl?: (url: string, extra?: object) => void,
 *   onPopupBlocked?: (info: { url: string, origin: string, webContentsId: number }) => void,
 *   askExternal?: (url: string) => void,
 *   hostWindow?: import('electron').BrowserWindow | null,
 * }} ctx
 */
function handleWindowOpen(openerWc, ctx) {
  const url = String(ctx.url || '');
  const disposition = String(ctx.disposition || 'default');
  const features = String(ctx.features || '');
  const torMode = Boolean(ctx.torMode);
  const r = ctx.isAllowedNav(url);
  const background = disposition === 'background-tab';
  const openerOrigin = (() => {
    try {
      return originOf(openerWc.getURL());
    } catch {
      return '';
    }
  })();

  const blank = !url || url === 'about:blank';
  const popupFeatures = looksLikePopupFeatures(features);
  const oauth = blank || looksLikeOauthUrl(url);
  const tabDisposition =
    disposition === 'foreground-tab' ||
    disposition === 'background-tab' ||
    disposition === 'default';

  if (tabDisposition && !popupFeatures) {
    if (r.ok === true && (/^https?:/i.test(url) || /^file:\/\//i.test(url))) {
      if (ctx.onOpenUrl) ctx.onOpenUrl(url, { background });
      return { action: 'deny' };
    }
    if (!torMode && r.ok === 'prompt' && ctx.askExternal) {
      void ctx.askExternal(url);
    }
    return { action: 'deny' };
  }

  if (torMode) {
    if (r.ok === true && (/^https?:/i.test(url) || blank)) {
      if (!blank && ctx.onOpenUrl) ctx.onOpenUrl(url, { background: false });
      return { action: 'deny' };
    }
    return { action: 'deny' };
  }

  const wantsRealPopup = disposition === 'new-window' && (popupFeatures || oauth || blank);

  if (disposition === 'new-window' && !wantsRealPopup) {
    if (r.ok === true && /^https?:/i.test(url)) {
      if (ctx.onOpenUrl) ctx.onOpenUrl(url, { background: false });
      return { action: 'deny' };
    }
    return { action: 'deny' };
  }

  if (wantsRealPopup && (blank || (r.ok === true && /^https?:/i.test(url)))) {
    const gestured =
      hasRecentGesture(openerWc) ||
      isPopupAllowedForOrigin(openerOrigin) ||
      blank ||
      oauth;
    if (!gestured) {
      console.log('[popup] blocked (no gesture)', { url: url.slice(0, 120), openerOrigin });
      if (ctx.onPopupBlocked) {
        ctx.onPopupBlocked({
          url,
          origin: openerOrigin,
          webContentsId: openerWc.id,
        });
      }
      return { action: 'deny' };
    }

    const width = parseFeatureSize(features, 'width', oauth || blank ? 520 : 900);
    const height = parseFeatureSize(features, 'height', oauth || blank ? 680 : 700);

    console.log('[popup] allow BrowserWindow', {
      url: url.slice(0, 120),
      width,
      height,
      openerId: openerWc.id,
      sessionSame: true,
      chrome: true,
    });

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width,
        height: height + TOOLBAR_H,
        autoHideMenuBar: true,
        backgroundColor: '#08090c',
        title: 'Vio',
        webPreferences: {
          session: openerWc.session,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: false,
          spellcheck: true,
          nativeWindowOpen: true,
        },
      },
    };
  }

  if (r.ok === true && (/^https?:/i.test(url) || /^file:\/\//i.test(url))) {
    if (ctx.onOpenUrl) ctx.onOpenUrl(url, { background });
    return { action: 'deny' };
  }
  if (!torMode && r.ok === 'prompt' && ctx.askExternal) {
    void ctx.askExternal(url);
  }
  return { action: 'deny' };
}

/**
 * After allow, wire child for chrome + close + optional nav logging.
 * @param {import('electron').WebContents} openerWc
 * @param {(child: import('electron').BrowserWindow) => void} [onChild]
 */
function attachDidCreateWindow(openerWc, onChild) {
  if (!openerWc || openerWc.isDestroyed() || openerWc.__djxxrDidCreateWin) return;
  openerWc.__djxxrDidCreateWin = true;
  openerWc.on('did-create-window', (childWin, details) => {
    console.log('[popup] did-create-window', {
      url: String(details?.url || '').slice(0, 120),
      frameName: details?.frameName,
      childId: childWin?.webContents?.id,
    });
    try {
      childWin.setMenuBarVisibility(false);
    } catch {
      /* */
    }

    trackPopupChild(openerWc, childWin);
    attachPopupUrlChrome(childWin);
    try {
      const uaChrome = require('./ua-chrome.cjs');
      void uaChrome.applyToWebContents(childWin.webContents, { tor: false });
    } catch (err) {
      console.warn('[popup] ua-chrome', err);
    }
    try {
      const googleLogin = require('./google-login.cjs');
      googleLogin.attachGoogleAccountsHardening(childWin.webContents, { torMode: false });
    } catch (err) {
      console.warn('[popup] google-login harden', err);
    }

    childWin.webContents.setWindowOpenHandler((d) =>
      handleWindowOpen(childWin.webContents, {
        url: d.url,
        disposition: d.disposition,
        features: d.features,
        torMode: false,
        isAllowedNav: (u) => {
          try {
            return require('./security.cjs').isAllowedNavigation(u);
          } catch {
            return { ok: false };
          }
        },
        onOpenUrl: (u) => {
          try {
            childWin.loadURL(u);
          } catch {
            /* */
          }
        },
        hostWindow: childWin,
      }),
    );
    if (typeof onChild === 'function') onChild(childWin);
  });
}

module.exports = {
  noteGesture,
  hasRecentGesture,
  attachGestureTracker,
  handleWindowOpen,
  attachDidCreateWindow,
  attachPopupUrlChrome,
  allowPopupsForOrigin,
  isPopupAllowedForOrigin,
  looksLikeOauthUrl,
  looksLikePopupFeatures,
  parseFeatureSize,
  registrableDomain,
  GESTURE_MS,
  TOOLBAR_H,
  DARK_SCROLLBAR_CSS,
  OAUTH_HOST_RE,
};
