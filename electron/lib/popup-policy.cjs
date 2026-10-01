/**
 * Pure popup / window.open policy helpers (no Electron).
 * Shared by electron/popups.cjs and unit tests — keep in sync with handleWindowOpen.
 */
'use strict';

const OAUTH_HOST_RE =
  /(?:^|\.)((accounts|login|signin|oauth|auth|sso)\.)|(google\.com|googleapis\.com|gstatic\.com|microsoftonline\.com|live\.com|login\.microsoftonline\.com|github\.com|discord\.com|discordapp\.com|apple\.com|facebook\.com|twitter\.com|x\.com|okta\.com|auth0\.com)/i;

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

/**
 * Pure decision mirror of handleWindowOpen (no BrowserWindow).
 * @param {{
 *   url?: string,
 *   disposition?: string,
 *   features?: string,
 *   torMode?: boolean,
 *   navOk?: boolean | 'prompt',
 *   hasGesture?: boolean,
 *   originAllowed?: boolean,
 * }} opts
 * @returns {'open-tab'|'allow-popup'|'block'|'deny'}
 */
function decideWindowOpen(opts = {}) {
  const url = String(opts.url || '');
  const disposition = String(opts.disposition || 'default');
  const features = String(opts.features || '');
  const torMode = Boolean(opts.torMode);
  const navOk = opts.navOk === undefined ? true : opts.navOk;
  const background = disposition === 'background-tab';
  void background;

  const blank = !url || url === 'about:blank';
  const popupFeatures = looksLikePopupFeatures(features);
  const oauth = blank || looksLikeOauthUrl(url);
  const tabDisposition =
    disposition === 'foreground-tab' ||
    disposition === 'background-tab' ||
    disposition === 'default';

  if (tabDisposition && !popupFeatures) {
    if (navOk === true && (/^https?:/i.test(url) || /^file:\/\//i.test(url))) return 'open-tab';
    return 'deny';
  }

  if (torMode) {
    if (navOk === true && (/^https?:/i.test(url) || blank)) return 'open-tab';
    return 'deny';
  }

  const wantsRealPopup = disposition === 'new-window' && (popupFeatures || oauth || blank);

  if (disposition === 'new-window' && !wantsRealPopup) {
    if (navOk === true && /^https?:/i.test(url)) return 'open-tab';
    return 'deny';
  }

  if (wantsRealPopup && (blank || (navOk === true && /^https?:/i.test(url)))) {
    const gestured = Boolean(opts.hasGesture) || Boolean(opts.originAllowed) || blank || oauth;
    if (!gestured) return 'block';
    return 'allow-popup';
  }

  if (navOk === true && (/^https?:/i.test(url) || /^file:\/\//i.test(url))) return 'open-tab';
  return 'deny';
}

module.exports = {
  OAUTH_HOST_RE,
  parseFeatureSize,
  looksLikePopupFeatures,
  looksLikeOauthUrl,
  decideWindowOpen,
};
