'use strict';

const path = require('node:path');
const fs = require('node:fs');
const C = require('./channels.cjs');

/**
 * Platform, Tor, privacy, favicon, search/weather, home-bg, perf, permissions, misc.
 * Tor daemon / bridges / fail-closed behavior unchanged — only IPC registration moved.
 */
function register(deps) {
  const {
    ipcMain,
    wrapApp,
    app,
    shell,
    session,
    security,
    askExternalProtocol,
    getMainWindow,
    tor,
    torDaemon,
    privacy,
    adblock,
    faviconCache,
    homeBg,
    perf,
    spellcheck,
  } = deps;

  ipcMain.handle(
    C.OPEN_EXTERNAL,
    wrapApp(async (_e, url) => {
      if (typeof url !== 'string') return;
      const r = security.isAllowedNavigation(url);
      if (r.ok === true && /^https?:/i.test(url)) await shell.openExternal(url);
      else if (r.ok === 'prompt') await askExternalProtocol(url);
    }),
  );

  ipcMain.handle(C.PLATFORM, wrapApp(() => process.platform));
  ipcMain.handle(
    C.APP_INFO,
    wrapApp(() => ({
      appVersion: app.getVersion(),
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      v8: process.versions.v8,
      platform: process.platform,
      userData: app.getPath('userData'),
    })),
  );
  ipcMain.handle(
    C.OPEN_USER_DATA,
    wrapApp(async () => {
      await shell.openPath(app.getPath('userData'));
      return { ok: true };
    }),
  );
  ipcMain.handle(
    C.OPEN_LOGS_FOLDER,
    wrapApp(async () => {
      const logs = path.join(app.getPath('userData'), 'logs');
      try {
        fs.mkdirSync(logs, { recursive: true });
      } catch {
        /* */
      }
      await shell.openPath(logs);
      return { ok: true };
    }),
  );

  ipcMain.handle(
    C.SET_DEVTOOLS_ENABLED,
    wrapApp((_e, enabled) => {
      global.__djxxrAllowInspect = Boolean(enabled);
      return { ok: true, enabled: Boolean(global.__djxxrAllowInspect) };
    }),
  );
  ipcMain.handle(
    C.SET_SHORTCUT_TRAP,
    wrapApp((_e, enabled) => {
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.__djxxrShortcutTrap = Boolean(enabled);
      return { ok: true, enabled: Boolean(mainWindow?.__djxxrShortcutTrap) };
    }),
  );

  ipcMain.handle(
    C.TOR_START,
    wrapApp(async (_e, opts) => {
      const proxyUrl = typeof opts?.proxyUrl === 'string' ? opts.proxyUrl : undefined;
      return tor.start({ proxyUrl });
    }),
  );
  ipcMain.handle(C.TOR_STOP, wrapApp(async () => tor.stop()));
  ipcMain.handle(C.TOR_STATUS, wrapApp(() => tor.status()));
  ipcMain.handle(C.TOR_REFRESH, wrapApp(async () => tor.refresh()));
  ipcMain.handle(C.TOR_NEW_IDENTITY, wrapApp(async () => tor.newIdentity()));
  ipcMain.handle(C.TOR_CIRCUIT, wrapApp(async () => tor.circuitInfo()));
  ipcMain.handle(
    C.TOR_BRIDGES,
    wrapApp(async (_e, next) => {
      if (next && typeof next === 'object') {
        return torDaemon.applyBridges(next);
      }
      return { ok: true, ...torDaemon.loadBridgeConfig(), builtin: torDaemon.builtinBridges };
    }),
  );
  ipcMain.handle(
    C.TOR_SELFTEST,
    wrapApp(async (_e, proxyUrl) =>
      tor.selftest(typeof proxyUrl === 'string' ? proxyUrl : undefined),
    ),
  );
  ipcMain.handle(
    C.TOR_DAEMON_AUTOSTART,
    wrapApp((_e, enabled) => torDaemon.setAutostart(Boolean(enabled))),
  );
  ipcMain.handle(C.TOR_DAEMON_STATUS, wrapApp(() => torDaemon.status()));

  ipcMain.handle(
    C.PRIVACY_CONFIG,
    wrapApp((_e, next) => {
      if (next && typeof next === 'object') {
        const mapped = {
          enabled: next.enabled !== false,
          stripTracking: next.stripTracking !== false,
          secGpc: Boolean(next.secGpc),
          dnt: Boolean(next.dnt),
          referrerPolicy: next.referrerPolicy !== false,
          thirdPartyCookies: next.thirdPartyCookies || 'trackers',
          httpsOnly: next.httpsOnly || 'upgrade',
          chromeUa: next.chromeUa !== false,
          webRtc: next.webRtc || 'public_only',
          fingerprint: Boolean(next.fingerprint),
          siteExceptions: Array.isArray(next.siteExceptions) ? next.siteExceptions : undefined,
          clearOnQuit: Boolean(next.clearOnQuit),
          clearOnQuitKeep: Array.isArray(next.clearOnQuitKeep)
            ? next.clearOnQuitKeep.map(String)
            : undefined,
        };
        privacy.setConfig(mapped);
        if (typeof next.doh === 'string') privacy.applyDoh(next.doh, next.dohCustom || '');
        if (typeof next.adblockUpdateLists === 'boolean') {
          void adblock.init({ updateLists: next.adblockUpdateLists });
        }
      }
      return { ...privacy.getConfig(), adblock: adblock.getStatus() };
    }),
  );

  ipcMain.handle(
    C.PRIVACY_STATUS,
    wrapApp(() => ({ ...privacy.getConfig(), adblock: adblock.getStatus() })),
  );
  ipcMain.handle(
    C.PRIVACY_EXCEPTION_ADD,
    wrapApp((_e, host) => privacy.addException(String(host || ''))),
  );
  ipcMain.handle(
    C.PRIVACY_EXCEPTION_REMOVE,
    wrapApp((_e, host) => privacy.removeException(String(host || ''))),
  );
  ipcMain.handle(
    C.PRIVACY_FORGET_SITE,
    wrapApp(async (_e, origin) => {
      const ses = session.fromPartition('persist:main');
      return privacy.forgetSite(ses, String(origin || ''));
    }),
  );
  ipcMain.handle(
    C.PRIVACY_BLOCKED,
    wrapApp((_e, tabKey) => adblock.getRecentBlocked(tabKey ? String(tabKey) : 'global')),
  );

  ipcMain.handle(
    C.FAVICON_CACHE_GET,
    wrapApp((_e, pageUrl) => faviconCache.getCached(String(pageUrl || ''))),
  );
  ipcMain.handle(
    C.FAVICON_CACHE_PUT,
    wrapApp(async (_e, pageUrl, faviconUrl, opts) => {
      if (opts && opts.tor) return null;
      if (/\.onion\b/i.test(String(pageUrl || '')) || /\.onion\b/i.test(String(faviconUrl || ''))) {
        return null;
      }
      return faviconCache.storeFromUrl(String(pageUrl || ''), String(faviconUrl || ''));
    }),
  );

  homeBg.register(ipcMain, wrapApp);

  ipcMain.handle(
    C.SEARCH_SUGGEST,
    wrapApp(async (_e, query) => {
      const q = String(query || '').trim();
      if (q.length < 2 || q.length > 80) return [];
      try {
        const { net } = require('electron');
        const url = `https://duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`;
        const res = await net.fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data
          .slice(0, 6)
          .map((row) =>
            Array.isArray(row) ? String(row[0] || '') : String(row?.phrase || row || ''),
          )
          .filter(Boolean);
      } catch {
        return [];
      }
    }),
  );

  ipcMain.handle(
    C.WEATHER_SUGGEST,
    wrapApp(async (_e, opts) => {
      const q = String(opts?.q || '')
        .trim()
        .slice(0, 80);
      if (q.length < 2) return { ok: true, places: [] };
      try {
        const { net } = require('electron');
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=pl&format=json`;
        const geoRes = await net.fetch(geoUrl);
        if (!geoRes.ok) return { ok: false, error: 'geo', places: [] };
        const geo = await geoRes.json();
        const places = Array.isArray(geo?.results)
          ? geo.results.map((p) => ({
              name: String(p.name || ''),
              country: String(p.country || ''),
              admin1: String(p.admin1 || ''),
              lat: Number(p.latitude),
              lon: Number(p.longitude),
              label: [p.name, p.admin1, p.country].filter(Boolean).join(', '),
            }))
          : [];
        return { ok: true, places };
      } catch (err) {
        return { ok: false, error: String(err?.message || err || 'fail'), places: [] };
      }
    }),
  );

  ipcMain.handle(
    C.WEATHER_FETCH,
    wrapApp(async (_e, opts) => {
      const location = String(opts?.location || '')
        .trim()
        .slice(0, 80);
      const latOpt = typeof opts?.lat === 'number' ? opts.lat : null;
      const lonOpt = typeof opts?.lon === 'number' ? opts.lon : null;
      if (location.length < 2 && (latOpt == null || lonOpt == null)) {
        return { ok: false, error: 'empty' };
      }
      try {
        const { net } = require('electron');
        let place = null;
        let lat = latOpt;
        let lon = lonOpt;
        if (lat == null || lon == null) {
          const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=pl&format=json`;
          const geoRes = await net.fetch(geoUrl);
          if (!geoRes.ok) return { ok: false, error: 'geo' };
          const geo = await geoRes.json();
          place = Array.isArray(geo?.results) ? geo.results[0] : null;
          if (!place) return { ok: false, error: 'not_found' };
          lat = place.latitude;
          lon = place.longitude;
        } else {
          place = { name: location, country: '', admin1: '', latitude: lat, longitude: lon };
        }
        const wxUrl =
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
          `&hourly=temperature_2m,weather_code&forecast_hours=12` +
          `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=5`;
        const wxRes = await net.fetch(wxUrl);
        if (!wxRes.ok) return { ok: false, error: 'forecast' };
        const wx = await wxRes.json();
        return {
          ok: true,
          place: {
            name: place.name,
            country: place.country || '',
            admin1: place.admin1 || '',
            lat,
            lon,
          },
          current: wx.current || null,
          hourly: wx.hourly || null,
          daily: wx.daily || null,
        };
      } catch (err) {
        return { ok: false, error: String(err?.message || err || 'fail') };
      }
    }),
  );

  ipcMain.handle(
    C.PERF_BOOT,
    wrapApp((_e, next) => {
      if (next && typeof next === 'object') {
        const saved = perf.saveBoot(next);
        return { ...saved, needsRestart: true };
      }
      return { ...perf.loadBoot(), needsRestart: false };
    }),
  );

  ipcMain.handle(
    C.PERF_APPLY_SESSION,
    wrapApp(async (_e, opts) => {
      const ses = session.fromPartition('persist:main');
      await perf.applySessionPerf(ses, opts && typeof opts === 'object' ? opts : {});
      if (opts && typeof opts.spellcheck === 'boolean') {
        spellcheck.setUserEnabled(opts.spellcheck);
      }
      spellcheck.applyToSession(ses, { tor: false });
      const mainWindow = getMainWindow();
      if (mainWindow && opts && typeof opts.backgroundThrottling === 'boolean') {
        try {
          mainWindow.webContents.setBackgroundThrottling(opts.backgroundThrottling);
        } catch {
          /* */
        }
      }
      return { ok: true, spellcheck: spellcheck.getUserEnabled() };
    }),
  );

  ipcMain.handle(
    C.SPELLCHECK_CONFIG,
    wrapApp((_e, next) => {
      if (next && typeof next.enabled === 'boolean') {
        spellcheck.setUserEnabled(next.enabled);
      }
      const ses = session.fromPartition('persist:main');
      spellcheck.applyToSession(ses, { tor: false });
      return { ok: true, enabled: spellcheck.getUserEnabled(), langs: spellcheck.LANGS };
    }),
  );

  ipcMain.handle(C.PERF_CLEAR_CACHE, wrapApp(async () => perf.clearBrowsingCache()));
  ipcMain.handle(C.PERF_MEMORY, wrapApp(async () => perf.getMemoryInfo()));

  ipcMain.handle(C.PERMISSIONS_LIST, wrapApp(() => security.listPermissions()));
  ipcMain.handle(
    C.PERMISSIONS_REVOKE,
    wrapApp((_e, origin, permission) =>
      security.revokePermission(
        String(origin || ''),
        permission ? String(permission) : undefined,
      ),
    ),
  );
  ipcMain.handle(
    C.PERMISSIONS_RESPOND,
    wrapApp((_e, askId, allow, remember, origin, permission) =>
      security.respondPermission(
        String(askId || ''),
        Boolean(allow),
        Boolean(remember),
        String(origin || ''),
        String(permission || ''),
      ),
    ),
  );
}

module.exports = { register };
