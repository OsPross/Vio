/**
 * Google accounts hardening — in-tab / same-session (persist:main).
 *
 * HTTP layer (chromeless UA + strip Sec-CH-UA) lives in privacy.cjs via
 * electron/lib/google-auth.cjs. This module must NOT call webContents.setUserAgent
 * or unregister session preloads — both hard-crashed Electron on Windows when
 * the user clicked “Zaloguj się” (exit 0xFFFF7003).
 *
 * WebAuthn allow + select-webauthn-account: security.cjs.
 */
'use strict';

const googleAuth = require('./lib/google-auth.cjs');

function isGoogleAccountsUrl(url) {
  return googleAuth.isGoogleAuthUrl(url);
}

/** @deprecated no-op — unregistering preloads crashed Electron 44 */
function pauseSessionPreloads() {}

/** @deprecated no-op */
function resumeSessionPreloads() {}

/**
 * Kept for call-site compatibility. Intentionally empty: UA/CH handled in
 * privacy onBeforeSendHeaders; no setUserAgent / no preload mutation.
 *
 * @param {import('electron').WebContents} guestWc
 * @param {{ torMode?: boolean }} [opts]
 */
function attachGoogleAccountsHardening(guestWc, opts = {}) {
  if (!guestWc || guestWc.isDestroyed() || guestWc.__djxxrGoogleHardened) return;
  guestWc.__djxxrGoogleHardened = true;
  if (opts.torMode) return;
  // no-op (see file header)
}

function openGoogleLoginWindow() {
  console.warn('[google-login] openGoogleLoginWindow removed — login stays in-tab');
  return null;
}

function attachGoogleLoginIntercept(guestWc, opts) {
  attachGoogleAccountsHardening(guestWc, opts);
}

function googleAuthUa() {
  const uaChrome = require('./ua-chrome.cjs');
  return googleAuth.buildGoogleAuthUa(uaChrome.buildChromeUa());
}

module.exports = {
  isGoogleAccountsUrl,
  isGoogleAuthUrl: isGoogleAccountsUrl,
  pauseSessionPreloads,
  resumeSessionPreloads,
  attachGoogleAccountsHardening,
  buildGoogleAuthUa: googleAuthUa,
  openGoogleLoginWindow,
  attachGoogleLoginIntercept,
};
