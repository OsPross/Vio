'use strict';

/**
 * Ghostery (@ghostery/adblocker-electron) adblock engine.
 * Filter lists cached under userData/adblock-lists (daily refresh).
 * Fallback: cosmetic CSS + YouTube page script only when Ghostery init fails (no legacy network hooks).
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, net } = require('electron');

/**
 * @typedef {{
 *   enabled: boolean,
 *   network: boolean,
 *   cosmetic: boolean,
 *   trackers: boolean,
 *   customRules: string[],
 *   level: 'standard' | 'strict',
 *   exceptions: string[],
 *   builtinDisabled: string[],
 *   listsEnabled: Record<string, boolean>,
 * }} AdblockConfig
 */

const FILTER_LISTS = [
  {
    id: 'easylist',
    name: 'EasyList',
    url: 'https://easylist.to/easylist/easylist.txt',
  },
  {
    id: 'easyprivacy',
    name: 'EasyPrivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
  },
  {
    id: 'ublock',
    name: 'uBlock filters',
    url: 'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
  },
  {
    id: 'peterlowe',
    name: "Peter Lowe's list",
    url: 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext',
  },
];

const LIST_URLS = FILTER_LISTS.map((l) => l.url);

/**
 * Built-in allowlist: adblock skips network blocks to these hosts.
 * Privacy (cookies/strip/HTTPS…) still applies. Toggleable, not removable.
 *
 * EasyPrivacy `||google.com^/gen_204?` and `||google.com…/log…` match first-party
 * on google.com (consent loop). Standard level skips same-eTLD+1; builtins cover
 * SSO / captcha / payments across sites.
 */
const BUILTIN_EXCEPTIONS = [
  { id: 'consent.google.com', pattern: 'consent.google.com' },
  { id: 'accounts.google.com', pattern: 'accounts.google.com' },
  { id: '*.gstatic.com', pattern: '*.gstatic.com' },
  { id: '*.googleapis.com', pattern: '*.googleapis.com' },
  { id: 'login.microsoftonline.com', pattern: 'login.microsoftonline.com' },
  { id: 'login.live.com', pattern: 'login.live.com' },
  { id: 'appleid.apple.com', pattern: 'appleid.apple.com' },
  { id: 'github.com/login', pattern: 'github.com', pathPrefix: '/login' },
  { id: 'challenges.cloudflare.com', pattern: 'challenges.cloudflare.com' },
  { id: 'hcaptcha.com', pattern: '*.hcaptcha.com' },
  { id: '*.recaptcha.net', pattern: '*.recaptcha.net' },
  { id: 'google.com/recaptcha', pattern: '*.google.com', pathPrefix: '/recaptcha' },
  { id: '*.paypal.com', pattern: '*.paypal.com' },
  { id: '*.stripe.com', pattern: '*.stripe.com' },
  { id: '*.przelewy24.pl', pattern: '*.przelewy24.pl' },
  { id: '*.payu.com', pattern: '*.payu.com' },
  { id: '*.blik.com', pattern: '*.blik.com' },
];

/** @type {AdblockConfig} */
let config = {
  enabled: true,
  network: true,
  cosmetic: true,
  trackers: true,
  customRules: [],
  level: 'standard',
  exceptions: [],
  builtinDisabled: [],
  listsEnabled: Object.fromEntries(FILTER_LISTS.map((l) => [l.id, true])),
};

let blockedCount = 0;
let blockedToday = 0;
let dayKey = new Date().toISOString().slice(0, 10);
/** @type {((n: number) => void) | null} */
let onBlocked = null;

/** @type {import('@ghostery/adblocker-electron').ElectronBlocker | null} */
let blocker = null;
/** @type {Set<import('electron').Session>} */
const attached = new Set();
/** @type {WeakSet<import('electron').Session>} */
const ghosteryOn = new WeakSet();
/** @type {Map<string, { url: string, host: string, at: number }[]>} */
const recentBlocked = new Map();
let updateLists = true;
let lastInitError = null;
/** @type {Promise<{ ok: boolean, engine?: string, fromCache?: boolean, error?: string }> | null} */
let initPromise = null;
/** @type {((v: boolean) => void) | null} */
let readyResolve = null;
/** @type {Promise<boolean>} */
let readyPromise = new Promise((resolve) => {
  readyResolve = resolve;
});
let engineReadyAt = 0;
let firstGuestRequestAt = 0;
let firstGuestRequestUrl = '';
let bootGateInstalled = false;

/** @type {import('@ghostery/adblocker').NetworkFilter[]} */
let appliedCustomNetwork = [];
/** @type {import('@ghostery/adblocker').CosmeticFilter[]} */
let appliedCustomCosmetic = [];

/** @type {Set<string>} */
let customHosts = new Set();

/** @type {import('@ghostery/adblocker').NetworkFilter[]} */
let appliedBuiltinNetwork = [];

/**
 * Normalize host / wildcard pattern to comparable form.
 * @param {string} host
 */
function normalizeHost(host) {
  return String(host || '')
    .toLowerCase()
    .replace(/^\*\./, '')
    .replace(/^www\./, '')
    .trim();
}

/**
 * Cheap eTLD+1 hint (2 labels). Good enough for google.com / youtube.com / co.uk edge cases
 * are rare for our allowlist / first-party gate.
 * @param {string} host
 */
function etld1(host) {
  const h = normalizeHost(host);
  if (!h) return '';
  const parts = h.split('.').filter(Boolean);
  if (parts.length <= 2) return h;
  return parts.slice(-2).join('.');
}

/**
 * @param {string} host
 * @param {string} pattern  e.g. `*.gstatic.com`, `accounts.google.com`
 */
function hostMatchesPattern(host, pattern) {
  const h = normalizeHost(host);
  const raw = String(pattern || '').toLowerCase().trim();
  if (!h || !raw) return false;
  if (raw.startsWith('*.')) {
    const base = normalizeHost(raw.slice(2));
    return h === base || h.endsWith('.' + base);
  }
  const p = normalizeHost(raw);
  return h === p || h.endsWith('.' + p);
}

/**
 * @param {string} url
 */
function isAllowlistedUrl(url) {
  let host = '';
  let pathname = '/';
  try {
    const u = new URL(url);
    host = u.hostname;
    pathname = u.pathname || '/';
  } catch {
    return false;
  }
  const disabled = new Set((config.builtinDisabled || []).map(String));
  for (const row of BUILTIN_EXCEPTIONS) {
    if (disabled.has(row.id)) continue;
    if (!hostMatchesPattern(host, row.pattern)) continue;
    if (row.pathPrefix && !pathname.startsWith(row.pathPrefix)) continue;
    return true;
  }
  for (const ex of config.exceptions || []) {
    const e = String(ex || '').trim().toLowerCase();
    if (!e) continue;
    if (e.includes('/')) {
      try {
        const u = new URL(e.includes('://') ? e : 'https://' + e);
        if (hostMatchesPattern(host, u.hostname) && pathname.startsWith(u.pathname || '/')) {
          return true;
        }
      } catch {
        /* */
      }
      continue;
    }
    if (hostMatchesPattern(host, e)) return true;
  }
  return false;
}

/**
 * Build @@ network exception rules for active builtins + user exceptions.
 */
function buildAllowlistRules() {
  /** @type {string[]} */
  const rules = [];
  const disabled = new Set((config.builtinDisabled || []).map(String));
  for (const row of BUILTIN_EXCEPTIONS) {
    if (disabled.has(row.id)) continue;
    const pat = row.pattern.startsWith('*.') ? row.pattern.slice(2) : row.pattern;
    if (row.pathPrefix) {
      rules.push(`@@||${pat}${row.pathPrefix}^`);
    } else if (row.pattern.startsWith('*.')) {
      rules.push(`@@||${pat}^`);
    } else {
      rules.push(`@@||${pat}^`);
    }
  }
  // Always keep consent hosts (consent loop) even if somehow missing above
  rules.push('@@||consent.google.com^', '@@||consent.youtube.com^', '@@||consent.google.pl^');
  for (const ex of config.exceptions || []) {
    const e = String(ex || '').trim().toLowerCase();
    if (!e) continue;
    if (e.includes('/')) {
      try {
        const u = new URL(e.includes('://') ? e : 'https://' + e);
        rules.push(`@@||${u.hostname}${u.pathname}^`);
      } catch {
        /* */
      }
    } else {
      const host = e.replace(/^\*\./, '');
      rules.push(`@@||${host}^`);
    }
  }
  return [...new Set(rules)];
}

/**
 * True when request shares eTLD+1 with the document (first-party / same-site).
 * @param {import('@ghostery/adblocker').Request} request
 */
function isSameSiteRequest(request) {
  if (request.isThirdParty === false) return true;
  if (request.isThirdParty === true) return false;
  const reqDomain = String(request.domain || '').toLowerCase();
  const srcDomain = String(request.sourceDomain || '').toLowerCase();
  if (reqDomain && srcDomain && reqDomain === srcDomain) return true;
  const reqHost = String(request.hostname || '').toLowerCase();
  const srcHost = String(request.sourceHostname || '').toLowerCase();
  if (reqHost && srcHost && etld1(reqHost) === etld1(srcHost)) return true;
  return false;
}

/**
 * Generic list rule: no hostname anchor, or broad regex — must not kill first-party.
 * Explicit hostname filters from lists may still apply in Strict.
 * @param {import('@ghostery/adblocker').NetworkFilter | undefined} filter
 */
function isGenericNetworkFilter(filter) {
  if (!filter) return true;
  try {
    if (typeof filter.isHostnameAnchor === 'function' && !filter.isHostnameAnchor()) return true;
    if (typeof filter.isFullRegex === 'function' && filter.isFullRegex()) return true;
    // EasyPrivacy `||google.com^^\/log…` — hostname-anchored regex on the site's own eTLD+1
    if (typeof filter.isRegex === 'function' && filter.isRegex()) return true;
  } catch {
    return true;
  }
  return false;
}

/**
 * Decide whether a Ghostery match should actually cancel the request.
 * @param {import('@ghostery/adblocker').Request} request
 * @param {{ match: boolean, filter?: import('@ghostery/adblocker').NetworkFilter, exception?: import('@ghostery/adblocker').NetworkFilter }} result
 */
function shouldCancelMatch(request, result) {
  if (!result || !result.match || result.exception) return false;
  if (isAllowlistedUrl(request.url)) return false;
  const sameSite = isSameSiteRequest(request);
  if (sameSite) {
    // Never apply generic / regex rules to same-domain requests (Google consent loop).
    if (isGenericNetworkFilter(result.filter)) return false;
    // Standard: same eTLD+1 only blocked by nothing here — explicit 1p ads need Strict.
    if (config.level !== 'strict') return false;
  }
  return true;
}

/**
 * Resolve document URL for partyness when Electron `referrer` is empty.
 * @param {Electron.OnBeforeRequestListenerDetails} details
 */
function resolveSourceUrl(details) {
  if (details && details.referrer) return String(details.referrer);
  try {
    const { webContents } = require('electron');
    const id = details && details.webContentsId;
    if (typeof id === 'number') {
      const wc = webContents.fromId(id);
      const u = wc && typeof wc.getURL === 'function' ? wc.getURL() : '';
      if (u) return u;
    }
  } catch {
    /* */
  }
  return '';
}

/**
 * Patch Ghostery's onBeforeRequest so first-party / allowlist gates apply.
 * Root cause (Google loop): EasyPrivacy `||google.com^/gen_204?` and
 * `||google.com…/log…` match first-party www/play.google.com with no same-site check
 * (see enableBlockingInSession → ElectronBlocker.onBeforeRequest).
 * @param {import('@ghostery/adblocker-electron').ElectronBlocker} b
 */
function installRequestGate(b) {
  if (!b || b.__djxxrGate) return;
  b.__djxxrGate = true;
  const { Request } = require('@ghostery/adblocker');
  b.onBeforeRequest = (details, callback) => {
    try {
      if (!config.enabled || !config.network) {
        callback({});
        return;
      }
      const sourceUrl = resolveSourceUrl(details);
      const request = Request.fromRawDetails({
        _originalRequestDetails: details,
        requestId: `${details.id}`,
        sourceUrl,
        tabId: details.webContentsId,
        type: details.resourceType || 'other',
        url: details.url,
      });
      if (b.config && b.config.guessRequestTypeFromUrl === true && request.type === 'other') {
        request.guessTypeOfRequest();
      }
      if (typeof request.isMainFrame === 'function' && request.isMainFrame()) {
        callback({});
        return;
      }
      if (isAllowlistedUrl(details.url)) {
        callback({});
        return;
      }
      const result = b.match(request);
      if (result.redirect) {
        callback({ redirectURL: result.redirect.dataUrl });
        return;
      }
      if (shouldCancelMatch(request, result)) {
        noteFirstGuestRequest(details.url);
        pushBlocked(String(details.webContentsId ?? 'global'), details.url);
        callback({ cancel: true });
        return;
      }
      callback({});
    } catch (err) {
      console.warn('[adblock+] request gate', err && err.message ? err.message : err);
      try {
        callback({});
      } catch {
        /* */
      }
    }
  };
}

const COSMETIC_CSS = `
/* Blokada — warstwa kosmetyczna */
iframe[id*="google_ads" i],
iframe[id*="ad_" i],
iframe[src*="doubleclick" i],
iframe[src*="googlesyndication" i],
iframe[src*="adnxs" i],
iframe[src*="taboola" i],
iframe[src*="outbrain" i],
ins.adsbygoogle,
div[id^="div-gpt-ad"],
div[id*="google_ads" i],
div[class*="ad-container" i],
div[class*="ad-wrapper" i],
div[class*="ad-slot" i],
div[class*="adsbox" i],
div[data-ad],
div[data-ad-slot],
div[data-google-query-id],
aside[class*="advert" i],
section[class*="advert" i],
[aria-label="Ads" i],
[aria-label="Advertisement" i],
[id*="taboola" i],
[class*="taboola" i],
[id*="outbrain" i],
[class*="outbrain" i],
[class*="sponsored-content" i],
[class*="rc-cta" i],
.adsbygoogle,
#ad,
#ads,
.ad-banner,
.ad-unit,
.advertisement,
.sponsored,
[data-testid="ad"],
/* YouTube */
ytd-ad-slot-renderer,
ytd-promoted-sparkles-web-renderer,
ytd-promoted-sparkles-text-search-renderer,
ytd-in-feed-ad-layout-renderer,
ytd-banner-promo-renderer,
ytd-statement-banner-renderer,
ytd-player-legacy-desktop-watch-ads-renderer,
ytd-action-companion-ad-renderer,
ytd-display-ad-renderer,
ytd-promoted-video-renderer,
ytd-ad-slot-renderer,
#masthead-ad,
#player-ads,
#offer-module,
.ytp-ad-module,
.ytp-ad-overlay-container,
.ytp-ad-progress-list,
.ytp-ad-message-container,
.video-ads,
.ytp-ad-player-overlay,
.ytp-ad-player-overlay-layout,
tp-yt-paper-dialog.ytd-popup-container,
ytd-mealbar-promo-renderer,
ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
ytm-promoted-sparkles-text-search-renderer,
ytm-companion-ad-renderer {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
  max-height: 0 !important;
  overflow: hidden !important;
  opacity: 0 !important;
}
`.trim();

const YOUTUBE_PAGE_SCRIPT = `
(function () {
  if (window.__mojaYtBlock) return;
  window.__mojaYtBlock = true;
  var wasAd = false;

  function killNodes(sel) {
    document.querySelectorAll(sel).forEach(function (el) {
      try { el.remove(); } catch (e) {}
    });
  }

  function tick() {
    killNodes([
      'ytd-ad-slot-renderer',
      'ytd-promoted-sparkles-web-renderer',
      'ytd-promoted-sparkles-text-search-renderer',
      'ytd-in-feed-ad-layout-renderer',
      'ytd-banner-promo-renderer',
      'ytd-statement-banner-renderer',
      'ytd-action-companion-ad-renderer',
      'ytd-display-ad-renderer',
      'ytd-promoted-video-renderer',
      'ytd-mealbar-promo-renderer',
      '#masthead-ad',
      '#player-ads'
    ].join(','));

    var skip = document.querySelector(
      '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container button'
    );
    if (skip) {
      try { skip.click(); } catch (e) {}
    }
    var closeOv = document.querySelector('.ytp-ad-overlay-close-button');
    if (closeOv) {
      try { closeOv.click(); } catch (e) {}
    }

    var player = document.querySelector('.html5-video-player');
    var video = document.querySelector('video.html5-main-video, video');
    var showing = player && player.classList.contains('ad-showing');

    if (showing && video) {
      wasAd = true;
      try {
        video.muted = true;
        video.playbackRate = 16;
        if (video.duration && isFinite(video.duration) && video.duration > 0) {
          video.currentTime = Math.max(0, video.duration - 0.15);
        }
      } catch (e) {}
    } else if (wasAd && video) {
      wasAd = false;
      try {
        video.playbackRate = 1;
      } catch (e) {}
    }
  }

  setInterval(tick, 400);
  try {
    new MutationObserver(tick).observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}
  tick();
})();
`.trim();

function refreshCustom() {
  customHosts = new Set();
  for (const raw of config.customRules) {
    const line = String(raw || '')
      .trim()
      .toLowerCase();
    if (!line || line.startsWith('!') || line.startsWith('#')) continue;
    if (line.startsWith('||')) {
      const host = line
        .slice(2)
        .replace(/\^.*$/, '')
        .replace(/\/.*$/, '')
        .replace(/^\*\./, '');
      if (host) customHosts.add(host);
      continue;
    }
    customHosts.add(line.replace(/^\*\./, ''));
  }
}

function rollDay() {
  const k = new Date().toISOString().slice(0, 10);
  if (k !== dayKey) {
    dayKey = k;
    blockedToday = 0;
  }
}

function bump() {
  rollDay();
  blockedCount += 1;
  blockedToday += 1;
  if (onBlocked) onBlocked(blockedToday);
}

function cacheDir() {
  return path.join(app.getPath('userData'), 'adblock-lists');
}

function cacheMetaPath() {
  return path.join(cacheDir(), 'meta.json');
}

/** True when filter-list meta is missing or older than 24h. */
function listsNeedRefresh() {
  try {
    const meta = JSON.parse(fs.readFileSync(cacheMetaPath(), 'utf8'));
    return Date.now() - (Number(meta.at) || 0) >= 24 * 60 * 60 * 1000;
  } catch {
    return true;
  }
}

function engineCachePath() {
  return path.join(cacheDir(), 'engine.bin');
}

function markReady(fromCache) {
  if (!engineReadyAt) {
    engineReadyAt = Date.now();
    console.log(
      `[adblock+] engine ready at t=${engineReadyAt} fromCache=${Boolean(fromCache)}` +
        (firstGuestRequestAt
          ? ` (firstGuestRequest was ${firstGuestRequestAt - engineReadyAt}ms earlier!)`
          : ''),
    );
  }
  if (readyResolve) {
    readyResolve(true);
    readyResolve = null;
  }
}

function isReady() {
  return Boolean(blocker);
}

/**
 * Wait until Ghostery engine is ready, or timeoutMs elapses.
 * @param {number} [timeoutMs=1500]
 */
function whenReady(timeoutMs = 1500) {
  if (blocker) return Promise.resolve(true);
  const ms = Math.max(0, Number(timeoutMs) || 1500);
  return Promise.race([
    readyPromise.then(() => Boolean(blocker)),
    new Promise((resolve) => {
      setTimeout(() => {
        if (!blocker) {
          console.warn(`[adblock+] whenReady timed out after ${ms}ms — guest may load before engine`);
        }
        resolve(Boolean(blocker));
      }, ms);
    }),
  ]);
}

/**
 * Sync deserialize of last serialized engine (ms). Call before first guest navigation.
 * @returns {{ ok: boolean, ms?: number, error?: string }}
 */
function loadCachedEngineSync() {
  if (blocker) {
    markReady(true);
    return { ok: true, ms: 0 };
  }
  const file = engineCachePath();
  if (!fs.existsSync(file)) {
    console.log('[adblock+] no engine.bin cache');
    return { ok: false, error: 'no-cache' };
  }
  const t0 = Date.now();
  try {
    const { ElectronBlocker } = require('@ghostery/adblocker-electron');
    const buf = fs.readFileSync(file);
    blocker = ElectronBlocker.deserialize(buf);
    wireBlockerEvents();
    appliedCustomNetwork = [];
    appliedCustomCosmetic = [];
    appliedBuiltinNetwork = [];
    refreshCustom();
    applyCustomRulesToBlocker();
    lastInitError = null;
    const ms = Date.now() - t0;
    markReady(true);
    syncBlockingOnSessions();
    console.log(`[adblock+] deserialized engine.bin in ${ms}ms (${buf.length} bytes)`);
    return { ok: true, ms };
  } catch (err) {
    lastInitError = String(err.message || err);
    console.warn('[adblock+] deserialize failed', lastInitError);
    blocker = null;
    return { ok: false, error: lastInitError };
  }
}

function saveEngineCache() {
  if (!blocker || typeof blocker.serialize !== 'function') return;
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    const buf = blocker.serialize();
    fs.writeFileSync(engineCachePath(), Buffer.from(buf));
    console.log(`[adblock+] wrote engine.bin (${buf.byteLength || buf.length} bytes)`);
  } catch (err) {
    console.warn('[adblock+] serialize failed', err.message || err);
  }
}

function wireBlockerEvents() {
  if (!blocker || blocker.__djxxrWired) return;
  blocker.__djxxrWired = true;
  installRequestGate(blocker);
  // Stats recorded in request gate (Ghostery emits request-blocked even when we allow).
}

/**
 * Install a one-shot boot gate: first guest http(s) request waits for engine (≤1.5s).
 * Only used when engine.bin cache miss. Ghostery enableBlockingInSession replaces this hook.
 * @param {import('electron').Session} ses
 */
function installBootGate(ses) {
  if (!ses || bootGateInstalled || blocker) return;
  bootGateInstalled = true;
  try {
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      if (blocker) {
        noteFirstGuestRequest(details.url);
        callback({});
        return;
      }
      const t0 = Date.now();
      whenReady(1500).then((ok) => {
        noteFirstGuestRequest(details.url);
        console.log(
          `[adblock+] boot-gate released after ${Date.now() - t0}ms ready=${ok} url=${String(details.url).slice(0, 100)}`,
        );
        try {
          if (ok) enableGhostery(ses);
        } catch {
          /* */
        }
        try {
          callback({});
        } catch {
          /* */
        }
      });
    });
    console.log('[adblock+] boot-gate installed (no engine cache)');
  } catch (err) {
    console.warn('[adblock+] boot gate', err.message || err);
  }
}

function noteFirstGuestRequest(url) {
  if (firstGuestRequestAt) return;
  firstGuestRequestAt = Date.now();
  firstGuestRequestUrl = String(url || '');
  console.log(
    `[adblock+] first guest request at t=${firstGuestRequestAt} readyAt=${engineReadyAt || 0}` +
      ` deltaMs=${engineReadyAt ? firstGuestRequestAt - engineReadyAt : 'n/a'} url=${firstGuestRequestUrl.slice(0, 120)}`,
  );
}

function getBootTiming() {
  return {
    engineReadyAt,
    firstGuestRequestAt,
    firstGuestRequestUrl,
    readyBeforeFirstRequest:
      engineReadyAt > 0 && firstGuestRequestAt > 0 ? engineReadyAt <= firstGuestRequestAt : null,
    deltaMs:
      engineReadyAt && firstGuestRequestAt ? firstGuestRequestAt - engineReadyAt : null,
  };
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = net.fetch(url);
    req
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        resolve(await res.text());
      })
      .catch(reject);
  });
}

function pushBlocked(tabKey, url) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = url;
  }
  const list = recentBlocked.get(tabKey) || [];
  list.unshift({ url, host, at: Date.now() });
  recentBlocked.set(tabKey, list.slice(0, 80));
  bump();
}

function getRecentBlocked(tabKey) {
  if (tabKey && tabKey !== 'global') return recentBlocked.get(String(tabKey)) || [];
  // Aggregate all tabs for global view
  const all = [];
  for (const list of recentBlocked.values()) {
    for (const row of list) all.push(row);
  }
  return all.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 80);
}

function clearRecentBlocked(tabKey) {
  if (tabKey) recentBlocked.delete(tabKey);
  else recentBlocked.clear();
}

function cryptoHash(s) {
  return require('node:crypto').createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
}

function ghosteryBlockingWanted() {
  return Boolean(blocker && config.enabled && config.network);
}

function applyBuiltinAllowlist() {
  if (!blocker) return;
  try {
    const { parseFilters } = require('@ghostery/adblocker');
    const { networkFilters } = parseFilters(buildAllowlistRules().join('\n'));
    blocker.update({
      newNetworkFilters: networkFilters,
      removedNetworkFilters: appliedBuiltinNetwork,
    });
    appliedBuiltinNetwork = networkFilters;
  } catch (err) {
    console.warn('[adblock+] builtin allowlist', err.message || err);
  }
}

function applyCustomRulesToBlocker() {
  if (!blocker) return;
  try {
    const { parseFilters } = require('@ghostery/adblocker');
    const text = config.customRules.map((r) => String(r || '').trim()).filter(Boolean).join('\n');
    const { networkFilters, cosmeticFilters } = parseFilters(text);
    blocker.update({
      newNetworkFilters: networkFilters,
      newCosmeticFilters: cosmeticFilters,
      removedNetworkFilters: appliedCustomNetwork,
      removedCosmeticFilters: appliedCustomCosmetic,
    });
    appliedCustomNetwork = networkFilters;
    appliedCustomCosmetic = cosmeticFilters;
  } catch (err) {
    console.warn('[adblock+] custom rules update', err.message || err);
  }
  applyBuiltinAllowlist();
}

function disableGhostery(ses) {
  if (!blocker || !ses) return;
  if (!ghosteryOn.has(ses)) return;
  try {
    if (typeof blocker.disableBlockingInSession === 'function') {
      blocker.disableBlockingInSession(ses);
    }
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (!/not enabled/i.test(msg)) {
      console.warn('[adblock+] disableBlockingInSession', e);
    }
  }
  ghosteryOn.delete(ses);
}

function enableGhostery(ses) {
  if (!blocker || !ses) return;
  if (!ghosteryBlockingWanted()) {
    disableGhostery(ses);
    return;
  }
  if (ghosteryOn.has(ses)) return;
  try {
    installRequestGate(blocker);
    if (typeof blocker.disableBlockingInSession === 'function') {
      try {
        blocker.disableBlockingInSession(ses);
      } catch {
        /* not previously enabled */
      }
    }
    blocker.enableBlockingInSession(ses);
    // First-request timing (Ghostery owns onBeforeRequest)
    if (!ses.__djxxrFirstReqHook) {
      ses.__djxxrFirstReqHook = true;
      try {
        ses.webRequest.onCompleted({ urls: ['http://*/*', 'https://*/*'] }, (details) => {
          noteFirstGuestRequest(details.url);
        });
      } catch {
        /* */
      }
    }
    ghosteryOn.add(ses);
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('second handler')) {
      ghosteryOn.add(ses);
      return;
    }
    console.warn('[adblock+] enableBlockingInSession', e);
  }
}

function syncBlockingOnSessions() {
  for (const ses of attached) {
    // Engine instance may have been replaced (cache → refresh) — force re-bind
    if (ghosteryOn.has(ses)) {
      try {
        disableGhostery(ses);
      } catch {
        ghosteryOn.delete(ses);
      }
    }
    if (ghosteryBlockingWanted()) enableGhostery(ses);
    else disableGhostery(ses);
  }
}

async function init(opts = {}) {
  if (typeof opts.updateLists === 'boolean') updateLists = opts.updateLists;
  // Warm engine.bin already resident — do not re-parse lists unless forced or stale.
  if (blocker && !opts.force && !listsNeedRefresh()) {
    return { ok: true, engine: 'ghostery', lists: activeListUrls().length, fromCache: true, skipped: true };
  }
  if (initPromise && !opts.force) {
    return initPromise;
  }
  initPromise = (async () => {
    try {
      const { ElectronBlocker } = require('@ghostery/adblocker-electron');
      const cachedFetch = async (url) => {
        fs.mkdirSync(cacheDir(), { recursive: true });
        const key = cryptoHash(url);
        const file = path.join(cacheDir(), `${key}.txt`);
        let meta = { at: 0 };
        try {
          meta = JSON.parse(fs.readFileSync(cacheMetaPath(), 'utf8'));
        } catch {
          /* */
        }
        const fresh = Date.now() - (meta.at || 0) < 24 * 60 * 60 * 1000;
        if (fresh && fs.existsSync(file)) {
          return new Response(fs.readFileSync(file, 'utf8'), { headers: { 'content-type': 'text/plain' } });
        }
        if (!updateLists && fs.existsSync(file)) {
          return new Response(fs.readFileSync(file, 'utf8'), { headers: { 'content-type': 'text/plain' } });
        }
        if (!updateLists) {
          throw new Error('List updates disabled and no cache');
        }
        const text = await fetchText(url);
        fs.writeFileSync(file, text, 'utf8');
        return new Response(text, { headers: { 'content-type': 'text/plain' } });
      };

      const next = await ElectronBlocker.fromLists(cachedFetch, activeListUrls(), {
        enableCompression: true,
      });
      blocker = next;
      // Fresh instance — re-wire gate
      blocker.__djxxrWired = false;
      blocker.__djxxrGate = false;
      wireBlockerEvents();
      fs.writeFileSync(cacheMetaPath(), JSON.stringify({ at: Date.now() }), 'utf8');
      saveEngineCache();

      appliedCustomNetwork = [];
      appliedCustomCosmetic = [];
      appliedBuiltinNetwork = [];
      refreshCustom();
      applyCustomRulesToBlocker();

      lastInitError = null;
      markReady(false);
      syncBlockingOnSessions();
      return { ok: true, engine: 'ghostery', lists: activeListUrls().length, fromCache: false };
    } catch (err) {
      lastInitError = String(err.message || err);
      console.warn('[adblock+] ghostery init failed (cosmetic fallback only)', lastInitError);
      if (!blocker) {
        blocker = null;
        if (readyResolve) {
          readyResolve(false);
          readyResolve = null;
        }
      }
      appliedCustomNetwork = [];
      appliedCustomCosmetic = [];
      appliedBuiltinNetwork = [];
      return { ok: Boolean(blocker), error: lastInitError, engine: blocker ? 'ghostery' : 'fallback-cosmetic' };
    }
  })();
  return initPromise;
}

/**
 * Ghostery session blocking when ready. Single engine — no parallel network hook.
 * Cosmetics: Ghostery session preload when active; else webview-preload via getCosmeticCss.
 */
function attachToSession(ses) {
  attached.add(ses);
  if (!blocker) installBootGate(ses);
  if (blocker) enableGhostery(ses);
}

/**
 * @param {Partial<AdblockConfig> & { updateLists?: boolean, forceLists?: boolean }} next
 */
function setConfig(next) {
  if (next && typeof next.updateLists === 'boolean') updateLists = next.updateLists;
  let listsChanged = false;
  if (next && typeof next === 'object') {
    if (next.listsEnabled && typeof next.listsEnabled === 'object') {
      const prev = JSON.stringify(config.listsEnabled || {});
      config.listsEnabled = { ...config.listsEnabled, ...next.listsEnabled };
      listsChanged = prev !== JSON.stringify(config.listsEnabled);
    }
    const { listsEnabled: _le, updateLists: _ul, forceLists: _fl, ...rest } = next;
    config = { ...config, ...rest };
    if (Array.isArray(next.customRules)) refreshCustom();
    if (Array.isArray(next.exceptions) || Array.isArray(next.builtinDisabled) || next.level) {
      /* allowlist / level applied below */
    }
  }
  if (blocker) {
    if (
      Array.isArray(next?.customRules) ||
      Array.isArray(next?.exceptions) ||
      Array.isArray(next?.builtinDisabled)
    ) {
      applyCustomRulesToBlocker();
    }
    syncBlockingOnSessions();
  }
  if (listsChanged || next?.forceLists) {
    void init({ force: true, updateLists: true });
  }
  return getStatus();
}

function getCosmeticCss() {
  if (blocker) return '';
  if (!config.enabled || !config.cosmetic) return '';
  return COSMETIC_CSS;
}

/**
 * @param {string} [pageUrl]
 */
function getPageScript(pageUrl) {
  if (!config.enabled || !config.cosmetic) return '';
  if (!pageUrl) return '';
  try {
    const h = new URL(pageUrl).hostname.toLowerCase();
    if (
      h === 'youtube.com' ||
      h.endsWith('.youtube.com') ||
      h === 'youtu.be' ||
      h.endsWith('.youtu.be') ||
      h === 'youtube-nocookie.com' ||
      h.endsWith('.youtube-nocookie.com') ||
      h === 'm.youtube.com'
    ) {
      return YOUTUBE_PAGE_SCRIPT;
    }
  } catch {
    /* */
  }
  return '';
}

/**
 * @param {string} url
 * @param {string} [sourceUrl]
 */
function shouldBlock(url, sourceUrl) {
  if (!config.enabled || !config.network) return false;
  if (!blocker) return false;
  if (isAllowlistedUrl(url)) return false;
  try {
    const { Request } = require('@ghostery/adblocker');
    let hostname = '';
    try {
      hostname = new URL(url).hostname;
    } catch {
      return false;
    }
    const src = sourceUrl || url;
    const request = Request.fromRawDetails({
      url,
      type: 'other',
      sourceUrl: src,
      sourceHostname: (() => {
        try {
          return new URL(src).hostname;
        } catch {
          return hostname;
        }
      })(),
    });
    const result = blocker.match(request);
    return shouldCancelMatch(request, result);
  } catch {
    return false;
  }
}

function getListsStatus() {
  let metaAt = 0;
  try {
    metaAt = Number(JSON.parse(fs.readFileSync(cacheMetaPath(), 'utf8')).at) || 0;
  } catch {
    /* */
  }
  const enabledMap = config.listsEnabled || {};
  return FILTER_LISTS.map((l) => {
    const key = cryptoHash(l.url);
    const file = path.join(cacheDir(), `${key}.txt`);
    let fileAt = 0;
    try {
      fileAt = fs.statSync(file).mtimeMs;
    } catch {
      /* */
    }
    return {
      id: l.id,
      name: l.name,
      url: l.url,
      enabled: enabledMap[l.id] !== false,
      updatedAt: fileAt || metaAt || null,
    };
  });
}

function getBuiltinExceptions() {
  const disabled = new Set((config.builtinDisabled || []).map(String));
  return BUILTIN_EXCEPTIONS.map((row) => ({
    id: row.id,
    pattern: row.pattern,
    pathPrefix: row.pathPrefix || null,
    enabled: !disabled.has(row.id),
    builtin: true,
  }));
}

function clearStats() {
  blockedCount = 0;
  blockedToday = 0;
  dayKey = new Date().toISOString().slice(0, 10);
  recentBlocked.clear();
  if (onBlocked) onBlocked(0);
  return getStatus();
}

function activeListUrls() {
  const enabledMap = config.listsEnabled || {};
  return FILTER_LISTS.filter((l) => enabledMap[l.id] !== false).map((l) => l.url);
}

function getStatus() {
  rollDay();
  return {
    ...config,
    blockedCount,
    blockedToday,
    ruleHosts: customHosts.size + (blocker ? activeListUrls().length : 0),
    engine: blocker ? 'ghostery' : 'fallback-cosmetic',
    updateLists,
    lastInitError,
    ready: Boolean(blocker),
    boot: getBootTiming(),
    lists: getListsStatus(),
    builtinExceptions: getBuiltinExceptions(),
  };
}

function setBlockedListener(fn) {
  onBlocked = typeof fn === 'function' ? fn : null;
}

refreshCustom();

module.exports = {
  init,
  loadCachedEngineSync,
  listsNeedRefresh,
  whenReady,
  isReady,
  installBootGate,
  attachToSession,
  setConfig,
  getStatus,
  getCosmeticCss,
  getPageScript,
  shouldBlock,
  setBlockedListener,
  bump,
  getRecentBlocked,
  clearRecentBlocked,
  clearStats,
  getListsStatus,
  getBuiltinExceptions,
  getBootTiming,
  LIST_URLS,
  FILTER_LISTS,
  BUILTIN_EXCEPTIONS,
  COSMETIC_CSS,
};

