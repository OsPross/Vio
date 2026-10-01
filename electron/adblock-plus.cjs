'use strict';

/**
 * Ghostery (@ghostery/adblocker-electron) adblock engine.
 * Filter lists cached under userData/adblock-lists (daily refresh).
 * Fallback: cosmetic CSS + YouTube page script only when Ghostery init fails (no legacy network hooks).
 */

const fs = require('node:fs');
const path = require('node:path');
const { app, net } = require('electron');

/** @typedef {{ enabled: boolean, network: boolean, cosmetic: boolean, trackers: boolean, customRules: string[] }} AdblockConfig */

const LIST_URLS = [
  'https://easylist.to/easylist/easylist.txt',
  'https://easylist.to/easylist/easyprivacy.txt',
  'https://raw.githubusercontent.com/uBlockOrigin/uAssets/master/filters/filters.txt',
  'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&showintro=0&mimetype=plaintext',
];

/** @type {AdblockConfig} */
let config = {
  enabled: true,
  network: true,
  cosmetic: true,
  trackers: true,
  customRules: [],
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

/**
 * EasyPrivacy blocks `||google.com^…/log…` which also matches consent.google.com/log —
 * Google's EU consent save beacon. Without this exception the "Sprawdź ustawienia"
 * dialog loops because the accept/save request never lands.
 */
const BUILTIN_ALLOWLIST = [
  '@@||consent.google.com^',
  '@@||consent.youtube.com^',
  '@@||consent.google.pl^',
];

/** @type {import('@ghostery/adblocker').NetworkFilter[]} */
let appliedBuiltinNetwork = [];

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
  blocker.on('request-blocked', (request) => {
    try {
      const url = request.url;
      noteFirstGuestRequest(url);
      pushBlocked(String(request.tabId ?? 'global'), url);
    } catch {
      /* */
    }
  });
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
    const { networkFilters } = parseFilters(BUILTIN_ALLOWLIST.join('\n'));
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
    return { ok: true, engine: 'ghostery', lists: LIST_URLS.length, fromCache: true, skipped: true };
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

      const next = await ElectronBlocker.fromLists(cachedFetch, LIST_URLS, {
        enableCompression: true,
      });
      blocker = next;
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
      return { ok: true, engine: 'ghostery', lists: LIST_URLS.length, fromCache: false };
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
 * @param {Partial<AdblockConfig> & { updateLists?: boolean }} next
 */
function setConfig(next) {
  if (next && typeof next.updateLists === 'boolean') updateLists = next.updateLists;
  if (next && typeof next === 'object') {
    config = { ...config, ...next };
    if (Array.isArray(next.customRules)) refreshCustom();
  }
  if (blocker) {
    if (Array.isArray(next?.customRules)) applyCustomRulesToBlocker();
    syncBlockingOnSessions();
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
 */
function shouldBlock(url) {
  if (!config.enabled || !config.network) return false;
  if (!blocker) return false;
  try {
    const { Request } = require('@ghostery/adblocker');
    let hostname = '';
    try {
      hostname = new URL(url).hostname;
    } catch {
      return false;
    }
    const { match } = blocker.match(
      Request.fromRawDetails({
        url,
        type: 'other',
        sourceUrl: url,
        sourceHostname: hostname,
      }),
    );
    return Boolean(match);
  } catch {
    return false;
  }
}

function getStatus() {
  rollDay();
  return {
    ...config,
    blockedCount,
    blockedToday,
    ruleHosts: customHosts.size + (blocker ? LIST_URLS.length : 0),
    engine: blocker ? 'ghostery' : 'fallback-cosmetic',
    updateLists,
    lastInitError,
    ready: Boolean(blocker),
    boot: getBootTiming(),
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
  getBootTiming,
  LIST_URLS,
  COSMETIC_CSS,
};

