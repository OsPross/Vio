/**
 * Spellcheck for guest sessions.
 *
 * Chain (historically broken):
 * 1. webPreferences.spellcheck on BrowserWindow / webview — enables Chromium underline UI
 * 2. session.setSpellCheckerEnabled — turns Hunspell on/off for that session
 * 3. session.setSpellCheckerLanguages(['pl','en-US']) — loads dictionaries
 * 4. Renderer setting perfSpellcheck — user toggle (must drive 2–3 via IPC)
 *
 * Tor: dictionaries download over the network; disable spellcheck entirely on tor-*
 * so Hunspell never fetches clearnet dictionaries outside the Tor circuit.
 */
'use strict';

const LANGS = ['pl', 'en-US'];

/** @type {boolean} */
let userEnabled = true;

function setUserEnabled(on) {
  userEnabled = Boolean(on);
  return userEnabled;
}

function getUserEnabled() {
  return userEnabled;
}

/**
 * @param {import('electron').Session} ses
 * @param {{ tor?: boolean }} [opts]
 */
function applyToSession(ses, opts = {}) {
  if (!ses) return { ok: false };
  const tor = Boolean(opts.tor);
  try {
    if (tor || !userEnabled) {
      if (typeof ses.setSpellCheckerEnabled === 'function') ses.setSpellCheckerEnabled(false);
      return { ok: true, enabled: false, tor, reason: tor ? 'tor' : 'user-off' };
    }
    if (typeof ses.setSpellCheckerEnabled === 'function') ses.setSpellCheckerEnabled(true);
    if (typeof ses.setSpellCheckerLanguages === 'function') ses.setSpellCheckerLanguages(LANGS);
    return { ok: true, enabled: true, tor: false, langs: LANGS };
  } catch (err) {
    console.warn('[spellcheck] applyToSession', err);
    return { ok: false, error: String(err && err.message) };
  }
}

/**
 * Apply to guest WebContents (session + per-contents preference when available).
 * @param {import('electron').WebContents} wc
 * @param {{ tor?: boolean }} [opts]
 */
function applyToWebContents(wc, opts = {}) {
  if (!wc || wc.isDestroyed()) return { ok: false };
  const tor = Boolean(opts.tor);
  const res = applyToSession(wc.session, { tor });
  try {
    // Electron WebContents may expose session-level only; keep guest preference aligned
    if (typeof wc.session?.setSpellCheckerEnabled === 'function') {
      /* already applied via session */
    }
  } catch {
    /* */
  }
  return res;
}

module.exports = {
  LANGS,
  setUserEnabled,
  getUserEnabled,
  applyToSession,
  applyToWebContents,
};
