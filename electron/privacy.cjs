'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const uaChrome = require('./ua-chrome.cjs');
const googleAuth = require('./lib/google-auth.cjs');

function chromeVersion() {
  return uaChrome.chromeMajor();
}

function buildChromeUa() {
  return uaChrome.buildChromeUa();
}

let CHROME_UA = buildChromeUa();

function clientHintHeaders() {
  return uaChrome.clientHintHeaders();
}
const TRACKING_PARAMS = new Set([
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','utm_name',
  'fbclid','gclid','gclsrc','dclid','gbraid','wbraid','mc_eid','mc_cid','igshid','igsh',
  'mibextid','twclid','msclkid','yclid','_hsenc','_hsmi','vero_id','ref_src','ref_url','si','spm',
]);

const SENSITIVE_HOST_RE =
  /(^|\.)(consent\.google|accounts\.google|login\.microsoftonline|login\.live|appleid\.apple|id\.apple|discord\.com|stripe\.com|paypal\.com|braintree|adyen|checkout\.|3dsecure|secure\.|bank|pkobp|mbank|ing\.pl|santander|alior|millennium|recaptcha|hcaptcha|challenges\.cloudflare|turnstile)/i;

let cfg = {
  enabled: true,
  stripTracking: true,
  secGpc: true,
  dnt: false,
  referrerPolicy: true,
  thirdPartyCookies: 'trackers',
  httpsOnly: 'upgrade',
  chromeUa: true,
  webRtc: 'public_only',
  fingerprint: false,
  siteExceptions: [],
  clearOnQuit: false,
  clearOnQuitKeep: [],
};

let trackerHosts = new Set();
const storePath = () => path.join(app.getPath('userData'), 'djxxr-privacy.json');

function loadSiteExceptions() {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    if (Array.isArray(raw.siteExceptions)) cfg.siteExceptions = raw.siteExceptions.map(String);
  } catch {}
}

function saveSiteExceptions() {
  try {
    fs.writeFileSync(storePath(), JSON.stringify({ siteExceptions: cfg.siteExceptions }, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn('[privacy] save', e);
  }
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function registrableHint(host) {
  const p = String(host || '').toLowerCase().replace(/^www\./, '');
  const parts = p.split('.').filter(Boolean);
  if (parts.length <= 2) return p;
  return parts.slice(-2).join('.');
}

function isException(urlOrHost) {
  const h = urlOrHost.includes('://') ? hostOf(urlOrHost) : String(urlOrHost || '').toLowerCase();
  if (!h) return false;
  const base = registrableHint(h);
  return cfg.siteExceptions.some((ex) => {
    const e = String(ex).toLowerCase().replace(/^www\./, '');
    return h === e || h.endsWith('.' + e) || base === e;
  });
}

function isSensitive(url) {
  return SENSITIVE_HOST_RE.test(hostOf(url));
}

function isGoogleAuthUrl(url) {
  return googleAuth.isGoogleAuthUrl(url);
}

function stripSecChUaHeaders(headers) {
  googleAuth.stripSecChUaHeaders(headers);
}

function setRequestHeader(headers, name, value) {
  googleAuth.setRequestHeader(headers, name, value);
}

/** Case-insensitive header get (Chromium HTTP/2 lowercase keys). */
function getRequestHeader(headers, name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === lower) return String(headers[key] || '');
  }
  return '';
}

/**
 * Tandem-style Client Hints: strip duplicates, keep Chromium GREASE, add Google Chrome,
 * write lowercase keys only (capitalized keys do not overwrite HTTP/2).
 */
function applyChromeClientHints(headers) {
  const major = chromeVersion();
  const full = uaChrome.chromeFull();
  const chromiumBrands = getRequestHeader(headers, 'sec-ch-ua');
  const chromiumFullList = getRequestHeader(headers, 'sec-ch-ua-full-version-list');
  stripSecChUaHeaders(headers);
  headers['sec-ch-ua'] = googleAuth.withGoogleChromeBrand(chromiumBrands, major);
  headers['sec-ch-ua-mobile'] = '?0';
  headers['sec-ch-ua-platform'] = '"Windows"';
  headers['sec-ch-ua-platform-version'] = '"15.0.0"';
  headers['sec-ch-ua-arch'] = '"x86"';
  headers['sec-ch-ua-bitness'] = '"64"';
  headers['sec-ch-ua-full-version-list'] = googleAuth.withGoogleChromeBrand(
    chromiumFullList || `"Not?A_Brand";v="24.0.0.0", "Chromium";v="${full}"`,
    full,
  );
}

function setTrackerHosts(hosts) {
  trackerHosts = new Set((hosts || []).map((h) => String(h).toLowerCase()));
}

function isTrackerHost(host) {
  const h = String(host || '').toLowerCase();
  if (!h) return false;
  if (trackerHosts.has(h)) return true;
  for (const t of trackerHosts) {
    if (h === t || h.endsWith('.' + t)) return true;
  }
  return false;
}

function setConfig(next) {
  const { siteExceptions, clearOnQuitKeep, ...rest } = next || {};
  cfg = { ...cfg, ...rest };
  if (Array.isArray(siteExceptions)) {
    cfg.siteExceptions = siteExceptions.map(String);
    saveSiteExceptions();
  }
  if (Array.isArray(clearOnQuitKeep)) {
    cfg.clearOnQuitKeep = clearOnQuitKeep.map(String);
  }
  return getConfig();
}

function getConfig() {
  return {
    ...cfg,
    siteExceptions: [...cfg.siteExceptions],
    clearOnQuitKeep: [...(cfg.clearOnQuitKeep || [])],
  };
}

function addException(host) {
  const h = registrableHint(hostOf(host.includes('://') ? host : 'https://' + host) || host);
  if (!h) return getConfig();
  if (!cfg.siteExceptions.includes(h)) {
    cfg.siteExceptions.push(h);
    saveSiteExceptions();
  }
  return getConfig();
}

function removeException(host) {
  const h = registrableHint(hostOf(host.includes('://') ? host : 'https://' + host) || host);
  cfg.siteExceptions = cfg.siteExceptions.filter((x) => x !== h);
  saveSiteExceptions();
  return getConfig();
}

function stripTrackingParams(url) {
  if (!cfg.stripTracking || !url || isException(url) || isSensitive(url)) return url;
  try {
    const u = new URL(url);
    if (!/^https?:$/i.test(u.protocol)) return url;
    let changed = false;
    for (const key of [...u.searchParams.keys()]) {
      const low = key.toLowerCase();
      if (TRACKING_PARAMS.has(low) || low.startsWith('utm_')) {
        u.searchParams.delete(key);
        changed = true;
      }
    }
    return changed ? u.toString() : url;
  } catch {
    return url;
  }
}

function applyBootSwitches() {
  try {
    app.commandLine.appendSwitch(
      'disable-features',
      [
        'NetworkPrediction',
        'AutofillServerCommunication',
        'InterestFeedContentSuggestions',
        'SafeBrowsingEnhancedProtection',
        'DestroyProfileOnBrowserClose',
      ].join(','),
    );
    app.commandLine.appendSwitch('disable-client-side-phishing-detection');
    app.commandLine.appendSwitch('disable-breakpad');
    app.commandLine.appendSwitch('disable-crash-reporter');
    app.commandLine.appendSwitch('disable-domain-reliability');
    // Note: disable-component-update can block Widevine CDM updates — left for privacy; Netflix may fail.
    app.commandLine.appendSwitch('disable-component-update');
  } catch (e) {
    console.warn('[privacy] boot switches', e);
  }
}

function attachToSession(ses, opts) {
  opts = opts || {};
  loadSiteExceptions();
  const isTrackerUrl = (url) => {
    if (typeof opts.isTracker === 'function') return opts.isTracker(url);
    return isTrackerHost(hostOf(url));
  };

  ses.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    try {
      const headers = { ...(details.requestHeaders || {}) };
      if (cfg.enabled && !isException(details.url)) {
        const sensitive = isSensitive(details.url);
        const googleAuthReq = isGoogleAuthUrl(details.url);
        if (cfg.chromeUa) {
          if (googleAuthReq) {
            // Wexond/Ferdium chromeless UA + Tandem: no forged Sec-CH-UA (CookieMismatch).
            CHROME_UA = buildChromeUa();
            setRequestHeader(headers, 'User-Agent', googleAuth.buildGoogleAuthUa(CHROME_UA));
            stripSecChUaHeaders(headers);
          } else {
            CHROME_UA = buildChromeUa();
            setRequestHeader(headers, 'User-Agent', CHROME_UA);
            applyChromeClientHints(headers);
          }
        }
        // Sec-GPC/DNT on accounts.google.com looks non-stock Chrome and trips login checks
        if (cfg.secGpc && !sensitive) headers['Sec-GPC'] = '1';
        if (cfg.dnt && !sensitive) headers['DNT'] = '1';
        if (cfg.referrerPolicy && !sensitive) {
          try {
            const page = details.referrer || headers.Referer || headers.referer;
            if (page) {
              const from = new URL(page);
              const to = new URL(details.url);
              if (from.origin !== to.origin) headers.Referer = from.origin + '/';
            }
          } catch {
            /* */
          }
        }
      }
      callback({ requestHeaders: headers });
    } catch (err) {
      console.warn('[privacy] onBeforeSendHeaders', err && err.message);
      try {
        callback({ requestHeaders: details.requestHeaders });
      } catch {
        /* */
      }
    }
  });

  ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (!cfg.enabled || cfg.thirdPartyCookies === 'allow' || isException(details.url)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    try {
      if (details.resourceType === 'mainFrame') {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      const reqHost = hostOf(details.url);
      const firstParty = hostOf(details.referrer || '');
      const thirdParty = firstParty && reqHost && registrableHint(firstParty) !== registrableHint(reqHost);
      if (!thirdParty) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      const blockAll = cfg.thirdPartyCookies === 'all';
      const blockTrackers = cfg.thirdPartyCookies === 'trackers' && isTrackerUrl(details.url);
      if ((!blockAll && !blockTrackers) || isSensitive(details.url) || isSensitive(details.referrer || '')) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
      const headers = { ...details.responseHeaders };
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === 'set-cookie') delete headers[k];
      }
      callback({ responseHeaders: headers });
    } catch {
      callback({ responseHeaders: details.responseHeaders });
    }
  });

  try {
    if (cfg.chromeUa) {
      CHROME_UA = buildChromeUa();
      ses.setUserAgent(CHROME_UA);
    }
  } catch {}
  // Spellcheck is NOT disabled here — owned by electron/spellcheck.cjs + perfSpellcheck.
}

const FINGERPRINT_NOISE = "(function(){try{Object.defineProperty(navigator,'hardwareConcurrency',{get:function(){return 4}});Object.defineProperty(navigator,'deviceMemory',{get:function(){return 8}});}catch(e){}try{var toDataURL=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(){try{var ctx=this.getContext('2d');if(ctx){var img=ctx.getImageData(0,0,Math.min(this.width,8),Math.min(this.height,8));for(var i=0;i<img.data.length;i+=4){img.data[i]=Math.max(0,Math.min(255,img.data[i]+((Math.random()*2)|0)-1));}ctx.putImageData(img,0,0);}}catch(e){}return toDataURL.apply(this,arguments);};}catch(e){}})();";

function hardenGuest(wc) {
  if (!wc || wc.isDestroyed()) return;
  try {
    if (cfg.webRtc === 'public_only') wc.setWebRTCIPHandlingPolicy('default_public_interface_only');
    else if (cfg.webRtc === 'disable_udp') wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
  } catch {}
  try {
    if (cfg.chromeUa) {
      CHROME_UA = buildChromeUa();
      wc.setUserAgent(CHROME_UA);
    }
  } catch {}
  let url = '';
  try { url = wc.getURL(); } catch {}
  if (cfg.fingerprint && !isException(url) && !isSensitive(url)) {
    wc.executeJavaScript(FINGERPRINT_NOISE, true).catch(function () {});
  }
}

async function forgetSite(ses, originOrUrl) {
  let origin = originOrUrl;
  try {
    origin = new URL(originOrUrl.includes('://') ? originOrUrl : 'https://' + originOrUrl).origin;
  } catch {}
  await ses.clearStorageData({ origin });
  try {
    const cookies = await ses.cookies.get({ url: origin });
    for (const c of cookies) {
      const url = (c.secure ? 'https' : 'http') + '://' + String(c.domain || '').replace(/^\./, '') + (c.path || '/');
      await ses.cookies.remove(url, c.name);
    }
  } catch {}
  return { ok: true, origin };
}

function keepHostMatch(host, keepList) {
  const h = String(host || '').toLowerCase().replace(/^www\./, '');
  const base = registrableHint(h);
  return (keepList || []).some((ex) => {
    const e = String(ex).toLowerCase().replace(/^www\./, '');
    return h === e || h.endsWith('.' + e) || base === e;
  });
}

async function clearOnQuitIfNeeded(ses) {
  if (!cfg.clearOnQuit || !ses) return { ok: true, skipped: true };
  const keep = Array.isArray(cfg.clearOnQuitKeep) ? cfg.clearOnQuitKeep : [];
  try {
    const cookies = await ses.cookies.get({});
    const origins = new Set();
    for (const c of cookies) {
      const host = String(c.domain || '').replace(/^\./, '').toLowerCase();
      if (!host || keepHostMatch(host, keep)) continue;
      origins.add('https://' + host);
      origins.add('http://' + host);
    }
    for (const origin of origins) {
      try {
        await ses.clearStorageData({ origin });
      } catch {}
    }
    try {
      await ses.clearCache();
    } catch {}
    return { ok: true, cleared: origins.size / 2 };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

function applyDoh(mode, custom) {
  try {
    if (mode === 'off') {
      app.configureHostResolver({ enableBuiltInAlternateRouting: true });
      return { ok: true, mode: 'off' };
    }
    const servers = {
      automatic: ['https://dns.quad9.net/dns-query', 'https://cloudflare-dns.com/dns-query'],
      quad9: ['https://dns.quad9.net/dns-query'],
      cloudflare: ['https://cloudflare-dns.com/dns-query'],
      mullvad: ['https://doh.mullvad.net/dns-query'],
      nextdns: ['https://dns.nextdns.io'],
      custom: custom ? [custom] : ['https://dns.quad9.net/dns-query'],
    };
    const list = servers[mode] || servers.automatic;
    app.configureHostResolver({
      secureDnsMode: mode === 'automatic' ? 'automatic' : 'secure',
      secureDnsServers: list,
      enableBuiltInAlternateRouting: true,
    });
    return { ok: true, mode: mode, servers: list };
  } catch (err) {
    return { ok: false, error: String(err.message || err) };
  }
}

module.exports = {
  applyBootSwitches,
  attachToSession,
  hardenGuest,
  setConfig,
  getConfig,
  addException,
  removeException,
  isException,
  stripTrackingParams,
  forgetSite,
  clearOnQuitIfNeeded,
  applyDoh,
  setTrackerHosts,
  chromeUa: function () { return CHROME_UA; },
  CHROME_UA,
};
