/**
 * window.open / target=_blank policy for guest webContents.
 *
 * Paths:
 * 1. target=_blank / disposition foreground|background-tab → new tab (deny + onOpenUrl)
 * 2. window.open with width/height/popup features OR about:blank OAuth → real BrowserWindow,
 *    SAME session as opener (cookies + window.opener / postMessage)
 * 3. window.open without recent user gesture → deny + shell:popup-blocked
 * 4. Tor: never create chrome popup windows — open as Tor tab in same partition instead
 */
'use strict';

const { BrowserWindow } = require('electron');

const GESTURE_MS = 5000;
const OAUTH_HOST_RE =
  /(?:^|\.)((accounts|login|signin|oauth|auth|sso)\.)|(google\.com|googleapis\.com|gstatic\.com|microsoftonline\.com|live\.com|login\.microsoftonline\.com|github\.com|discord\.com|discordapp\.com|apple\.com|facebook\.com|twitter\.com|x\.com|okta\.com|auth0\.com)/i;

/** @type {WeakMap<import('electron').WebContents, number>} */
const lastGestureAt = new WeakMap();

/** origin → allow popups without gesture */
const allowedPopupOrigins = new Set();

function noteGesture(wc) {
  if (!wc || wc.isDestroyed()) return;
  lastGestureAt.set(wc, Date.now());
}

function hasRecentGesture(wc) {
  const t = lastGestureAt.get(wc) || 0;
  return Date.now() - t < GESTURE_MS;
}

function parseFeatureSize(features, key, fallback) {
  const m = String(features || '').match(new RegExp(`(?:^|[,;\\s])${key}=(\\d+)`, 'i'));
  if (!m) return fallback;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? Math.min(1600, Math.max(200, n)) : fallback;
}

function looksLikePopupFeatures(features) {
  const feat = String(features || '');
  return /(?:^|[,;\s])(width|height|popup)=/i.test(feat);
}

function looksLikeOauthUrl(url) {
  try {
    const u = new URL(url);
    if (OAUTH_HOST_RE.test(u.hostname)) return true;
    if (/\/(oauth|authorize|signin|login|sso)\b/i.test(u.pathname)) return true;
  } catch {
    /* */
  }
  return false;
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
 * Track clicks / keys so we can approximate Chromium's user-activation for popups.
 * @param {import('electron').WebContents} wc
 */
function attachGestureTracker(wc) {
  if (!wc || wc.isDestroyed() || wc.__djxxrPopupGesture) return;
  wc.__djxxrPopupGesture = true;
  wc.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' || input.type === 'mouseDown') noteGesture(wc);
  });
  // Mouse clicks in page don't always hit before-input; also watch DOM via preload-less IPC-free poll:
  wc.on('dom-ready', () => {
    noteGesture(wc); // soft: navigation interaction
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

  // --- Regular _blank / tab dispositions → new tab
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

  // --- Tor: never spawn chrome BrowserWindow popups (keep traffic in Tor partition tabs)
  if (torMode) {
    if (r.ok === true && (/^https?:/i.test(url) || blank)) {
      if (!blank && ctx.onOpenUrl) ctx.onOpenUrl(url, { background: false });
      return { action: 'deny' };
    }
    return { action: 'deny' };
  }

  // --- Decide if this should be a real popup window
  const wantsRealPopup =
    disposition === 'new-window' && (popupFeatures || oauth || blank);

  // window.open(url) with features empty — treat as tab when gestured; else may be spam
  if (disposition === 'new-window' && !wantsRealPopup) {
    if (r.ok === true && /^https?:/i.test(url)) {
      if (ctx.onOpenUrl) ctx.onOpenUrl(url, { background: false });
      return { action: 'deny' };
    }
    return { action: 'deny' };
  }

  if (wantsRealPopup && (blank || (r.ok === true && /^https?:/i.test(url)))) {
    // OAuth/SSO hosts + about:blank: allow without gesture (click often misses before-input).
    // Ungated spam usually isn't on accounts.google.com / github.com/login.
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
    });

    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width,
        height,
        autoHideMenuBar: true,
        title: 'djxxr',
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
 * After allow, wire child for close + optional nav logging.
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
    // window.close() from page works on BrowserWindow; ensure navigation stays http(s)
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
  allowPopupsForOrigin,
  isPopupAllowedForOrigin,
  looksLikeOauthUrl,
  GESTURE_MS,
};
