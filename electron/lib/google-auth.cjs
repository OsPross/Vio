/**
 * Google auth helpers — synthesized from current open-source Electron browsers:
 *
 * - Wexond (browser-base): strip Chrome/* (+ Electron/*) on accounts.google.com
 *   https://github.com/wexond/browser-base/blob/master/src/main/user-agent.ts
 * - Ferdium: chromeless UA for Google; never SetUserAgent during will-navigate
 *   (cancels POST/SAML → ERR_ABORTED) — apply only after did-navigate
 *   https://github.com/ferdium/ferdium-app/pull/2396
 * - Tandem: strip forged Sec-CH-UA on Google auth (CookieMismatch), skip stealth
 *   preload; elsewhere inject Google Chrome brand with lowercase HTTP/2 keys
 *   https://github.com/hydro13/tandem-browser
 */
'use strict';

const CHROME_COMPONENT = /\sChrome\/[\d.]+/g;
const ELECTRON_COMPONENT = /\sElectron\/[\d.]+/g;
const APP_COMPONENT = /\s(?:Vio|moja-przegladarka|Electron)\/[\d.]+/gi;

/**
 * @param {string} url
 * @returns {boolean}
 */
function isGoogleAuthUrl(url) {
  try {
    const u = new URL(String(url || ''));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'accounts.google.com' || h.endsWith('.accounts.google.com')) return true;
    if (h === 'account.google.com') return true;
    if (h === 'accounts.youtube.com') return true;
    if (/^accounts\.google\./.test(h)) return true;
    if (
      (h === 'www.google.com' || h === 'google.com') &&
      /\/(?:accounts|o\/oauth2|signin|AccountChooser)/i.test(u.pathname)
    ) {
      return true;
    }
    if (h.endsWith('.google.com') && /\/(?:o\/oauth2|ServiceLogin|signin\/oauth)/i.test(u.pathname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Alias used by older call sites. */
function isGoogleAccountsUrl(url) {
  return isGoogleAuthUrl(url);
}

/**
 * Wexond/Ferdium chromeless UA for Google login pages.
 * Removes Electron and Chrome tokens so Google skips Electron Chromium gates.
 *
 * @param {string} [baseUa]
 * @returns {string}
 */
function buildGoogleAuthUa(baseUa) {
  let ua = String(baseUa || '').trim();
  if (!ua) {
    ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36';
  }
  ua = ua.replace(ELECTRON_COMPONENT, '');
  ua = ua.replace(CHROME_COMPONENT, '');
  ua = ua.replace(APP_COMPONENT, '');
  ua = ua.replace(/\s{2,}/g, ' ').trim();
  // Ensure Safari token remains (Wexond result shape)
  if (!/Safari\//i.test(ua)) {
    ua = `${ua} Safari/537.36`.replace(/\s{2,}/g, ' ').trim();
  }
  return ua;
}

/**
 * Delete Sec-CH-UA* regardless of HTTP/2 key casing (Chromium uses lowercase).
 * @param {Record<string, string>} headers
 */
function stripSecChUaHeaders(headers) {
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase().startsWith('sec-ch-ua')) delete headers[key];
  }
}

/**
 * Set a request header with case-insensitive replace (HTTP/2 lowercase keys).
 * @param {Record<string, string>} headers
 * @param {string} name
 * @param {string} value
 */
function setRequestHeader(headers, name, value) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === lower) delete headers[key];
  }
  headers[lower === 'user-agent' ? 'User-Agent' : name] = value;
}

/**
 * Tandem-style: append "Google Chrome" to Chromium's natural brands, keep GREASE.
 * @param {string} brands
 * @param {string} version major
 */
function withGoogleChromeBrand(brands, version) {
  const v = String(version || '134');
  const b = String(brands || '');
  if (b.includes('Google Chrome')) return b;
  if (!b) {
    return `"Chromium";v="${v}", "Google Chrome";v="${v}", "Not(A:Brand";v="8"`;
  }
  return `${b}, "Google Chrome";v="${v}"`;
}

module.exports = {
  isGoogleAuthUrl,
  isGoogleAccountsUrl,
  buildGoogleAuthUa,
  stripSecChUaHeaders,
  setRequestHeader,
  withGoogleChromeBrand,
};
