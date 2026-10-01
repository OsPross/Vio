/**
 * Autorski silnik adblocka — lekkie reguły sieciowe + CSS kosmetyczny.
 * Działa na session Electron (webview partition persist:main).
 */

'use strict';

/** @typedef {{ enabled: boolean, network: boolean, cosmetic: boolean, trackers: boolean, customRules: string[] }} AdblockConfig */

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

/** Hosty reklam / skryptów reklamowych (autorska lista bazowa). */
const AD_HOSTS = new Set(
  [
    'doubleclick.net',
    'googleadservices.com',
    'googlesyndication.com',
    'pagead2.googlesyndication.com',
    'adservice.google.com',
    'adservice.google.pl',
    'ad.doubleclick.net',
    'static.doubleclick.net',
    'partner.googleadservices.com',
    'googleads.g.doubleclick.net',
    'tpc.googlesyndication.com',
    'fundingchoicesmessages.google.com',
    'pagead2.googleadservices.com',
    'ads.youtube.com',
    'ads.yahoo.com',
    'adtechus.com',
    'advertising.com',
    'adnxs.com',
    'adsrvr.org',
    'adform.net',
    'adsafeprotected.com',
    'adsymptotic.com',
    'adcolony.com',
    'admob.com',
    'ads-twitter.com',
    'ads.linkedin.com',
    'ads.facebook.com',
    'an.facebook.com',
    'pixel.facebook.com',
    'tr.outbrain.com',
    'widgets.outbrain.com',
    'taboola.com',
    'cdn.taboola.com',
    'trc.taboola.com',
    'revcontent.com',
    'mgid.com',
    'criteo.com',
    'criteo.net',
    'casalemedia.com',
    'openx.net',
    'pubmatic.com',
    'rubiconproject.com',
    'smartadserver.com',
    'lijit.com',
    'sovrn.com',
    'indexww.com',
    'bidswitch.net',
    'rlcdn.com',
    'contextweb.com',
    'media.net',
    'yieldmo.com',
    'sharethrough.com',
    '3lift.com',
    'amazon-adsystem.com',
    'aax.amazon-adsystem.com',
    'c.amazon-adsystem.com',
    'advertising.amazon.com',
    'moatads.com',
    'moatpixel.com',
    'scorecardresearch.com',
    'imrworldwide.com',
    'quantserve.com',
    'quantcount.com',
    'exelator.com',
    'bluekai.com',
    'krxd.net',
    'mathtag.com',
    'agkn.com',
    'demdex.net',
    'everesttech.net',
    'omtrdc.net',
    '2mdn.net',
    'adition.com',
    'adscale.de',
    'adtech.de',
    'adbrite.com',
    'advertisespace.com',
    'adzerk.net',
    'carbonads.com',
    'carbonads.net',
    'buysellads.com',
    'servedby.buysellads.com',
    'propellerads.com',
    'propellerclick.com',
    'popads.net',
    'popcash.net',
    'clickadu.com',
    'hilltopads.com',
    'exoclick.com',
    'juicyads.com',
    'trafficjunky.net',
    'tsyndicate.com',
    'adnxs.com',
    'spoofbox.com',
    'zedo.com',
    'yieldlab.net',
    'stickyadstv.com',
    'teads.tv',
    'outbrainimg.com',
    'perfectaudience.com',
    'retargeter.com',
    'rfihub.com',
    'mookie1.com',
    'tapad.com',
    'bidr.io',
    '1rx.io',
    'ads.avct.cloud',
    'ads.stickyadstv.com',
  ].map((h) => h.toLowerCase()),
);

/** Trackery / analytics (osobna warstwa). */
const TRACKER_HOSTS = new Set(
  [
    'google-analytics.com',
    'ssl.google-analytics.com',
    'www.google-analytics.com',
    'googletagmanager.com',
    'www.googletagmanager.com',
    'googletagservices.com',
    'googleoptimize.com',
    'hotjar.com',
    'static.hotjar.com',
    'script.hotjar.com',
    'clarity.ms',
    'www.clarity.ms',
    'mouseflow.com',
    'fullstory.com',
    'mixpanel.com',
    'cdn.mxpnl.com',
    'segment.com',
    'segment.io',
    'cdn.segment.com',
    'amplitude.com',
    'api.amplitude.com',
    'heapanalytics.com',
    'kissmetrics.com',
    'newrelic.com',
    'nr-data.net',
    'sentry-cdn.com',
    'browser.sentry-cdn.com',
    'bat.bing.com',
    'analytics.twitter.com',
    'static.ads-twitter.com',
    'connect.facebook.net',
    'pixel.wp.com',
    'stats.wp.com',
    'mc.yandex.ru',
    'yandex.ru/metrika',
    'cdn.mouseflow.com',
    'snap.licdn.com',
    'px.ads.linkedin.com',
    'analytics.tiktok.com',
    'business-api.tiktok.com',
    'sc-static.net',
    'static.chartbeat.com',
    'ping.chartbeat.net',
    'cdn.branch.io',
    'app.link',
    'api.segment.io',
    'rum.hlx.page',
    'beacon.kr',
  ].map((h) => h.toLowerCase()),
);

/** Fragmenty ścieżek typowe dla reklam. */
const PATH_HINTS = [
  '/ads?',
  '/ads/',
  '/ad/',
  '/ad?',
  '/adserv',
  '/adserver',
  '/advert',
  '/banner',
  '/pagead',
  '/pagead2',
  '/sponsor',
  '/pixel.gif',
  '/pixel.png',
  '/1x1.gif',
  '/tracking.',
  '/beacon',
  '/collect?',
  '/g/collect',
  '/j/collect',
  '/gtag/js',
  '/gtm.js',
  'google-analytics.com/g/',
  'doubleclick.net',
  'googlesyndication',
  '/adservice',
  '/prebid',
  '/pbjs',
  'adsbygoogle',
  '/show_ads',
  '/adframe',
  '/adunit',
  // YouTube
  '/api/stats/ads',
  '/pagead/',
  '/pagead?',
  '/ptracking',
  '/get_midroll',
  '/youtubei/v1/player/ad_',
  '/youtubei/v1/log_event',
  'adunit=',
  'adformat=',
  'ad_type=',
  '&oad=',
  'ctir=0',
];

const YOUTUBE_PATH_BLOCK = [
  '/api/stats/ads',
  '/pagead/',
  '/ptracking',
  '/get_midroll_info',
  '/youtubei/v1/player/ad_',
  '/pcs/activeview',
  '/pagead/adview',
  '/pagead/conversion',
  '/generate_204?s2s',
];

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

/** Skrypt auto-skip / usuwanie reklam na YouTube. */
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

/** @type {Set<string>} */
let customHosts = new Set();
/** @type {string[]} */
let customHints = [];

function refreshCustom() {
  customHosts = new Set();
  customHints = [];
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
    if (line.startsWith('/') || line.includes('/')) {
      customHints.push(line);
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

/**
 * @param {string} hostname
 * @param {Set<string>} set
 */
function hostMatch(hostname, set) {
  const h = hostname.toLowerCase();
  if (set.has(h)) return true;
  for (const d of set) {
    if (h === d || h.endsWith('.' + d)) return true;
  }
  return false;
}

/**
 * @param {string} host
 * @param {string} pathq
 * @param {string} full
 */
function isYouTubeAdRequest(host, pathq, full) {
  const yt =
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtu.be' ||
    host.endsWith('.youtu.be') ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com') ||
    host === 'googlevideo.com' ||
    host.endsWith('.googlevideo.com');

  if (!yt && !full.includes('youtube.com')) {
    // still block google ads used on YT pages
    if (host.includes('doubleclick') || host.includes('googlesyndication') || host.includes('googleadservices')) {
      return true;
    }
    return false;
  }

  for (const p of YOUTUBE_PATH_BLOCK) {
    if (pathq.includes(p) || full.includes(p)) return true;
  }

  // segmenty reklamowe googlevideo (ostrożnie: tylko wyraźne markery ad)
  if (host.endsWith('googlevideo.com')) {
    if (
      full.includes('&oad=') ||
      full.includes('ctier=') ||
      /[?&]ctir=/.test(full) ||
      (full.includes('/initplayback') && full.includes('ad')) ||
      /\/(ad|ads)\//.test(pathq)
    ) {
      return true;
    }
  }

  if (pathq.includes('adformat=') || pathq.includes('adunit=') || pathq.includes('ad_type=')) return true;
  return false;
}

/**
 * @param {string} url
 */
function shouldBlock(url) {
  if (!config.enabled || !config.network) return false;
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;

  const host = u.hostname.toLowerCase();
  const full = url.toLowerCase();
  const pathq = (u.pathname + u.search).toLowerCase();

  if (isYouTubeAdRequest(host, pathq, full)) return true;

  if (hostMatch(host, AD_HOSTS)) return true;
  if (config.trackers && hostMatch(host, TRACKER_HOSTS)) return true;
  if (hostMatch(host, customHosts)) return true;

  for (const hint of PATH_HINTS) {
    if (full.includes(hint) || pathq.includes(hint)) return true;
  }
  for (const hint of customHints) {
    if (full.includes(hint)) return true;
  }
  return false;
}

function bump() {
  rollDay();
  blockedCount += 1;
  blockedToday += 1;
  if (onBlocked) onBlocked(blockedToday);
}

/**
 * @param {import('electron').Session} ses
 */
function attachToSession(ses) {
  try {
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      if (shouldBlock(details.url)) {
        bump();
        callback({ cancel: true });
        return;
      }
      callback({});
    });
  } catch (e) {
    console.error('[adblock] attach failed', e);
  }
}

/**
 * @param {Partial<AdblockConfig>} next
 */
function setConfig(next) {
  config = { ...config, ...next };
  if (Array.isArray(next.customRules)) refreshCustom();
  return getStatus();
}

/** Injected once per document from electron/webview-preload.cjs (not renderer insertCSS). */
function getCosmeticCss() {
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

function getStatus() {
  rollDay();
  return {
    ...config,
    blockedCount,
    blockedToday,
    ruleHosts: AD_HOSTS.size + TRACKER_HOSTS.size + customHosts.size,
  };
}

function setBlockedListener(fn) {
  onBlocked = fn;
}

refreshCustom();

module.exports = {
  attachToSession,
  setConfig,
  getStatus,
  getCosmeticCss,
  getPageScript,
  shouldBlock,
  setBlockedListener,
  bump,
  COSMETIC_CSS,
};
