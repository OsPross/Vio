const { app, BrowserWindow, ipcMain, shell, session, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');

/** Perf bench wall-clock (measurement only). */
global.__DJXXR_PERF_T0 = Date.now();
global.__DJXXR_REQUIRE_TIMES__ = {};

function timedRequire(label, id) {
  const t0 = Date.now();
  const mod = require(id);
  const ms = Date.now() - t0;
  global.__DJXXR_REQUIRE_TIMES__[label] = (global.__DJXXR_REQUIRE_TIMES__[label] || 0) + ms;
  return mod;
}

const adblock = timedRequire('adblock-plus', './adblock-plus.cjs');
const perf = timedRequire('perf', './perf.cjs');
const passwords = timedRequire('passwords', './passwords.cjs');
const metrics = timedRequire('metrics', './metrics.cjs');
const security = timedRequire('security', './security.cjs');
const tor = timedRequire('tor', './tor.cjs');
const torDaemon = timedRequire('tor-daemon', './tor-daemon.cjs');
const privacy = timedRequire('privacy', './privacy.cjs');
const faviconCache = timedRequire('favicon-cache', './favicon-cache.cjs');
const history = timedRequire('history', './history.cjs');
const notes = timedRequire('notes', './notes.cjs');
const appSession = timedRequire('session', './session.cjs');
const downloads = timedRequire('downloads', './downloads.cjs');
const homeBg = timedRequire('home-bg', './home-bg.cjs');
const contextMenu = timedRequire('context-menu', './context-menu.cjs');
const windowMode = timedRequire('window-mode', './window-mode.cjs');
const certificate = timedRequire('certificate', './certificate.cjs');
const shortcutsGuest = timedRequire('shortcuts-guest', './shortcuts-guest.cjs');
const pip = timedRequire('pip', './pip.cjs');
const bookmarksImport = timedRequire('bookmarks-import', './bookmarks-import.cjs');
const extensions = timedRequire('extensions', './extensions.cjs');
const uaChrome = timedRequire('ua-chrome', './ua-chrome.cjs');
const mouseNav = timedRequire('mouse-nav', './mouse-nav.cjs');
const spellcheck = timedRequire('spellcheck', './spellcheck.cjs');
const { webContents: electronWebContents } = require('electron');
const { getLogger } = require('./lib/logger.cjs');
const { createWireGuest } = require('./windows/wire-guest.cjs');
const { createCreateWindow } = require('./windows/create-window.cjs');

const log = getLogger('main');

process.on('uncaughtException', (err) => {
  log.error('uncaughtException', err);
});

process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', reason);
});

/** Boot switches MUST run before ready */
privacy.applyBootSwitches();
uaChrome.applyBootFallback();
const boot = perf.applyBootSwitches();
// Light inits only — heavy Ghostery lists / chrome-extensions / openpgp stay lazy
history.init();
notes.init();
void extensions.init();
downloads.init();

if (!app.isPackaged && process.env.PERF_BENCH === '1') {
  console.log('[boot] require times', JSON.stringify(global.__DJXXR_REQUIRE_TIMES__));
}

/** @type {ReturnType<typeof createWindow> | null} */
let mainWindow = null;
/** @type {Set<BrowserWindow>} */
const appWindows = new Set();
let isAppQuitting = false;

function isAppWebContents(wc) {
  if (!wc) return false;
  for (const win of appWindows) {
    if (!win.isDestroyed() && win.webContents.id === wc.id) return true;
  }
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents.id === wc.id);
}

function assertFromApp(event) {
  const wc = event?.sender;
  if (!isAppWebContents(wc)) {
    throw new Error('Odrzucono IPC spoza okna aplikacji');
  }
}

function isGuestWebview(wc) {
  try {
    return Boolean(wc && !wc.isDestroyed() && typeof wc.getType === 'function' && wc.getType() === 'webview');
  } catch {
    return false;
  }
}

function wrapAppOrGuest(fn) {
  return async (event, ...args) => {
    const wc = event?.sender;
    if (!isAppWebContents(wc) && !isGuestWebview(wc)) {
      throw new Error('Odrzucono IPC spoza okna aplikacji');
    }
    return fn(event, ...args);
  };
}

const isDev = Boolean(process.env.VITE_DEV_SERVER);
const wvPreloadPath = path.join(__dirname, 'webview-preload.cjs');

tor.setAdblockAttach((ses) => adblock.attachToSession(ses));
tor.setMainWindowGetter(() => mainWindow);
torDaemon.setProgressHandler((ev) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('shell:tor-progress', ev);
  }
});

function wrapApp(fn) {
  return async (event, ...args) => {
    assertFromApp(event);
    return fn(event, ...args);
  };
}

function wrapPw(fn) {
  return async (event, ...args) => {
    assertFromApp(event);
    try {
      passwords.touchActivity();
      return await fn(...args);
    } catch (err) {
      return { ok: false, error: String(err?.message || err), code: err?.code };
    }
  };
}

async function askExternalProtocol(url) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Anuluj', 'Otwórz'],
    defaultId: 0,
    cancelId: 0,
    title: 'Zewnętrzny protokół',
    message: 'Otworzyć link poza przeglądarką?',
    detail: String(url).slice(0, 400),
  });
  if (result.response === 1) {
    try {
      await shell.openExternal(url);
    } catch {
      /* */
    }
  }
}

const { wireGuestNavigation } = createWireGuest({
  session,
  BrowserWindow,
  security,
  adblock,
  downloads,
  privacy,
  spellcheck,
  tor,
  windowMode,
  uaChrome,
  askExternalProtocol,
  contextMenu,
  getMainWindow: () => mainWindow,
  certificate,
  history,
  mouseNav,
  shortcutsGuest,
});

const createWindow = createCreateWindow({
  BrowserWindow,
  path,
  session,
  electronDir: __dirname,
  isDev,
  boot,
  appSession,
  windowMode,
  extensions,
  mouseNav,
  metrics,
  security,
  tor,
  contextMenu,
  askExternalProtocol,
  wireGuestNavigation,
  wvPreloadPath,
  getMainWindow: () => mainWindow,
  setMainWindow: (w) => {
    mainWindow = w;
  },
  appWindows,
  getIsAppQuitting: () => isAppQuitting,
});

function guestWebContentsById(id) {
  const wc = electronWebContents.fromId(Number(id));
  if (!wc || wc.isDestroyed() || isAppWebContents(wc)) return null;
  return wc;
}

app.whenReady().then(async () => {
  global.__DJXXR_PERF_READY_AT = Date.now();

  // FIRST: purge legacy Partitions/private before any session.fromPartition
  try {
    windowMode.purgeLegacyPrivatePartitionSync();
  } catch (err) {
    console.warn('[window-mode] purge boot', err);
  }

  security.init();
  certificate.init();

  // Backup: patch fanout BEFORE any guest listeners; then wire navigation
  app.on('web-contents-created', (_e, contents) => {
    try {
      require('./webcontents-events.cjs').patchWebContents(contents);
    } catch (err) {
      console.warn('[webcontents-events] patch', err && err.message);
    }
    try {
      if (typeof contents.getType === 'function' && contents.getType() === 'webview') {
        console.log('[ctx-menu] web-contents-created webview', contents.id);
        wireGuestNavigation(contents);
      }
    } catch (err) {
      console.warn('[ctx-menu] web-contents-created', err);
    }
  });

  const ses = session.fromPartition('persist:main');
  security.attachCsp(session.defaultSession, isDev);
  security.attachCsp(ses, false);
  security.attachPermissionHandlers(ses);

  security.setPermissionAskHandler((req) => {
    mainWindow?.webContents.send('shell:permission-ask', req);
  });

  // Fast path: deserialize engine cache (ms), attach sessions, show window.
  // Heavy list refresh / chrome-extensions stay after show; guests gated until engine ready.
  const cacheLoad = adblock.loadCachedEngineSync();
  console.log('[adblock+] cache load', cacheLoad);
  adblock.attachToSession(ses);
  downloads.attachToSession(ses, { tor: false });
  downloads.setPushHandler((list) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shell:downloads-changed', list);
    }
  });
  privacy.attachToSession(ses, {
    isTracker: (url) => {
      try {
        return adblock.shouldBlock(url);
      } catch {
        return false;
      }
    },
  });
  spellcheck.applyToSession(ses, { tor: false });
  adblock.setBlockedListener((n) => {
    mainWindow?.webContents.send('shell:adblock-blocked', n);
  });

  metrics.init({
    onPush: (payload) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shell:metrics', payload);
      }
    },
  });
  metrics.attachNetwork(ses);

  createWindow();
  try {
    require('./updater.cjs').scheduleStartupCheck();
  } catch (err) {
    console.warn('[updater] schedule', err && err.message);
  }
  global.__DJXXR_PERF_WINDOW_CREATED_AT = Date.now();

  // Deferred: list refresh, chrome-extensions, passwords — then unlock guests if needed
  setImmediate(() => {
    try {
      torDaemon.removeAutostartShortcuts();
    } catch (e) {
      console.warn('[tor] autostart migrate', e);
    }
    const heavyStart = Date.now();
    try {
      extensions.initChromeApi({
        getMainWindow: () => mainWindow,
        onOpenUrl: (url, extra = {}) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('shell:open-url', {
              url,
              background: Boolean(extra.background),
            });
          }
        },
        createWindow: () => createWindow({ secondary: true }),
      });
    } catch (err) {
      console.warn('[ext] initChromeApi', err);
    }
    passwords.init({
      onLock: () => {
        mainWindow?.webContents.send('shell:passwords-locked');
      },
    });
    const ensureEngine = adblock.isReady()
      ? Promise.resolve({ ok: true, fromCache: true })
      : Promise.race([
          adblock.init({ updateLists: true }),
          new Promise((resolve) =>
            setTimeout(() => resolve({ ok: adblock.isReady(), timedOut: true }), 1500),
          ),
        ]);
    void ensureEngine.then((r) => {
      console.log('[adblock+] ensureEngine', r, 'ms', Date.now() - heavyStart);
      if (adblock.isReady()) {
        // Avoid double-resident engines: only re-parse lists when meta is stale.
        // Warm engine.bin already covers first guest request; refresh later if needed.
        if (cacheLoad && cacheLoad.ok) {
          if (adblock.listsNeedRefresh()) {
            setTimeout(() => {
              void adblock
                .init({ updateLists: true, force: true })
                .then((rr) => console.log('[adblock+] deferred refresh', rr));
            }, 60_000);
            console.log('[adblock+] scheduled list refresh in 60s (meta stale)');
          } else {
            console.log('[adblock+] skip list rebuild (engine.bin + lists fresh)');
          }
        }
      } else {
        void adblock.init({ updateLists: true }).then((rr) => console.log('[adblock+]', rr));
      }
      try {
        mainWindow?.webContents.send('shell:services-ready', {
          adblock: adblock.getStatus(),
          boot: adblock.getBootTiming(),
          at: Date.now(),
        });
      } catch {
        /* */
      }
    });
    void perf.applySessionPerf(ses, { cacheMb: boot.cacheMb }).then(() => {
      spellcheck.applyToSession(ses, { tor: false });
    });
    global.__DJXXR_PERF_HEAVY_DONE_AT = Date.now();
  });

  // Perf bench: env-gated (safe off by default). Allowed in --dir builds for startup compare.
  if (process.env.PERF_BENCH === '1') {
    try {
      const bench = require('../scripts/perf-bench.cjs');
      void bench.run(() => mainWindow);
    } catch (err) {
      console.error('[perf-bench] failed to start', err);
    }
  } else if (!app.isPackaged && process.env.PERF_PROBE_LISTENERS === '1') {
    try {
      const probe = require('../scripts/probe-listeners.cjs');
      void probe.run(() => mainWindow);
    } catch (err) {
      console.error('[probe-listeners] failed to start', err);
    }
  } else if (!app.isPackaged && process.env.PERF_PROBE_HEAP === '1') {
    try {
      const probe = require('../scripts/probe-main-heap.cjs');
      void probe.run(() => mainWindow);
    } catch (err) {
      console.error('[probe-heap] failed to start', err);
    }
  } else if (!app.isPackaged && process.env.PERF_VERIFY_TABS === '1') {
    try {
      const probe = require('../scripts/probe-perf-verify-tabs.cjs');
      void probe.run(() => mainWindow).then((r) => {
        if (process.env.PERF_VERIFY_QUIT === '1') {
          setTimeout(() => app.quit(), r?.ok ? 500 : 2000);
        }
      });
    } catch (err) {
      console.error('[perf-verify-tabs] failed to start', err);
    }
  } else if (!app.isPackaged && process.env.PERF_VERIFY_ADBLOCK === '1') {
    try {
      const probe = require('../scripts/probe-perf-verify-adblock.cjs');
      void probe.run(() => mainWindow).then((r) => {
        if (process.env.PERF_VERIFY_QUIT === '1') {
          setTimeout(() => app.quit(), r?.ok ? 500 : 2000);
        }
      });
    } catch (err) {
      console.error('[perf-verify-adblock] failed to start', err);
    }
  } else if (!app.isPackaged && process.env.CAPTURE_NOTES === '1') {
    try {
      const cap = require('../scripts/capture-notes-layout.cjs');
      void cap.run(() => mainWindow);
    } catch (err) {
      console.error('[capture-notes] failed', err);
    }
  } else if (!app.isPackaged && process.env.SMOKE_MOUSE === '1') {
    try {
      const smoke = require('../scripts/smoke-mouse-xbutton.cjs');
      void smoke.run(() => mainWindow);
    } catch (err) {
      console.error('[smoke-mouse] failed to start', err);
    }
  } else if (!app.isPackaged && process.env.SMOKE_ROUND7 === '1') {
    try {
      const smoke = require('../scripts/smoke-round7-live.cjs');
      void smoke.run(() => mainWindow);
    } catch (err) {
      console.error('[smoke7] failed to start', err);
    }
  } else if (!app.isPackaged && process.env.SMOKE_ROUND5 === '1') {
    try {
      const smoke = require('../scripts/smoke-round5-live.cjs');
      void smoke.run(() => mainWindow);
    } catch (err) {
      console.error('[smoke5] failed to start', err);
    }
  } else if (!app.isPackaged && process.env.SMOKE_ROUND4 === '1') {
    try {
      const smoke = require('../scripts/smoke-round4-live.cjs');
      void smoke.run(() => mainWindow);
    } catch (err) {
      console.error('[smoke4] failed to start', err);
    }
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  isAppQuitting = true;
  try {
    notes.flushNow();
  } catch (err) {
    console.warn('[notes] flush on quit', err);
  }
  try {
    appSession.markCleanExit();
  } catch (err) {
    console.warn('[session] clean exit', err);
  }
  try {
    const ses = session.fromPartition('persist:main');
    void privacy.clearOnQuitIfNeeded(ses);
  } catch {
    /* */
  }
  void tor.stop();
  void torDaemon.stop();
});

function sanitizeDownloadBase(title, fallback) {
  const raw = String(title || '').trim() || String(fallback || 'page');
  const cleaned = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return cleaned || 'page';
}

function suggestedSaveName(wc, ext) {
  let title = '';
  let url = '';
  try {
    title = wc.getTitle() || '';
    url = wc.getURL() || '';
  } catch {
    /* */
  }
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    /* */
  }
  const base = sanitizeDownloadBase(title, host || 'page');
  return `${base}.${ext}`;
}

const ipcDeps = {
  ipcMain,
  wrapApp,
  wrapAppOrGuest,
  wrapPw,
  app,
  shell,
  session,
  dialog,
  BrowserWindow,
  nativeTheme,
  electronWebContents,
  createWindow,
  getMainWindow: () => mainWindow,
  guestWebContentsById,
  askExternalProtocol,
  suggestedSaveName,
  wvPreloadPath,
  windowMode,
  appSession,
  history,
  notes,
  downloads,
  bookmarksImport,
  passwords,
  extensions,
  adblock,
  metrics,
  pip,
  certificate,
  security,
  tor,
  torDaemon,
  privacy,
  faviconCache,
  homeBg,
  perf,
  spellcheck,
};

require('./ipc/register-tabs.cjs').register(ipcDeps);
require('./ipc/register-popups.cjs').register(ipcDeps);
require('./ipc/register-misc.cjs').register(ipcDeps);
require('./ipc/register-downloads.cjs').register(ipcDeps);
require('./ipc/register-bookmarks.cjs').register(ipcDeps);
require('./ipc/register-notes.cjs').register(ipcDeps);
require('./ipc/register-extensions.cjs').register(ipcDeps);
require('./ipc/register-history.cjs').register(ipcDeps);
require('./ipc/register-adblock.cjs').register(ipcDeps);
require('./ipc/register-passwords.cjs').register(ipcDeps);
require('./ipc/register-metrics.cjs').register(ipcDeps);
require('./ipc/register-dev-sync.cjs').register(ipcDeps);
require('./ipc/register-updater.cjs').register(ipcDeps);
