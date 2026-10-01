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
/** Pending tab restore for a newly created secondary window */
let pendingRestoreTabs = null;
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

/** Lazy-wire persist:private (incognito-like) — same guards as main, separate storage */
const wiredPrivateSessions = new WeakSet();
function ensurePrivateSession(ses) {
  if (!ses || wiredPrivateSessions.has(ses)) return;
  wiredPrivateSessions.add(ses);
  try {
    security.attachPermissionHandlers(ses);
    adblock.attachToSession(ses);
    downloads.attachToSession(ses, { tor: false });
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
  } catch (err) {
    console.warn('[private] ensurePrivateSession', err);
  }
}

function wireGuestNavigation(guestWc) {
  if (!guestWc || guestWc.isDestroyed?.()) return;
  if (guestWc.__djxxrGuestWired) return;
  guestWc.__djxxrGuestWired = true;
  try {
    if (guestWc.session === session.fromPartition('persist:private')) {
      ensurePrivateSession(guestWc.session);
    }
  } catch {
    /* */
  }
  const torMode = tor.isTorWebContents(guestWc);
  let privateMode = false;
  try {
    const partName =
      (typeof guestWc.session?.partitionName === 'string' && guestWc.session.partitionName) || '';
    privateMode =
      !torMode &&
      (windowMode.isPrivatePartition(partName) ||
        guestWc.session === session.fromPartition('persist:private'));
  } catch {
    /* */
  }
  if (!torMode) {
    void uaChrome.applyToWebContents(guestWc, { tor: false });
  }
  security.attachNavigationGuards(guestWc, {
    askExternal: torMode ? null : askExternalProtocol,
    torMode,
    getHostWindow: () => {
      try {
        return contextMenu.hostWindowForGuest(guestWc) || mainWindow;
      } catch {
        return mainWindow;
      }
    },
    onOpenUrl: (url, extra = {}) => {
      const host = contextMenu.hostWindowForGuest(guestWc) || mainWindow;
      host?.webContents.send('shell:open-url', {
        url,
        tor: torMode,
        private: privateMode || windowMode.getWindowMeta(host).mode === 'private',
        background: Boolean(extra.background),
      });
    },
    onPopupBlocked: (info) => {
      const host = contextMenu.hostWindowForGuest(guestWc) || mainWindow;
      host?.webContents.send('shell:popup-blocked', info || {});
    },
    onPopupWindow: (childWin) => {
      try {
        // Same guest wiring as a tab: nav guards, PPM, privacy harden, spellcheck, cert.
        // Adblock already applies via opener.session. No webview-preload (not a <webview>).
        wireGuestNavigation(childWin.webContents);
      } catch (err) {
        console.warn('[popup] wire guest', err);
        try {
          certificate.attachCertificateHandler(childWin.webContents, {
            getMainWindow: () => childWin,
            torMode: false,
          });
        } catch (e2) {
          console.warn('[popup] cert attach', e2);
        }
      }
    },
  });
  certificate.attachCertificateHandler(guestWc, {
    getMainWindow: () => mainWindow,
    torMode,
  });
  if (torMode) {
    tor.hardenGuestWebContents(guestWc);
    spellcheck.applyToWebContents(guestWc, { tor: true });
  } else {
    privacy.hardenGuest(guestWc);
    spellcheck.applyToWebContents(guestWc, { tor: false });
    guestWc.__djxxrHttpsUpgrade = null;

    const recordGuestVisit = (url, title, soft) => {
      try {
        history.recordVisit({
          url: String(url || ''),
          title: String(title || ''),
          soft: Boolean(soft),
          typed: false,
          tor: false,
        });
      } catch (err) {
        console.error('[history] recordVisit', err);
      }
    };

    // Strip tracking + HTTPS upgrade for normal guests
    guestWc.on('will-navigate', (event, url) => {
      if (privacy.isException(url)) return;
      let next = privacy.stripTrackingParams(url);
      const st = privacy.getConfig();
      let httpOriginal = null;
      if (
        /^http:\/\//i.test(next) &&
        !/^http:\/\/(localhost|127\.|\[::1\])/i.test(next) &&
        (st.httpsOnly === 'upgrade' || st.httpsOnly === 'block')
      ) {
        httpOriginal = next;
        next = next.replace(/^http:\/\//i, 'https://');
      }
      if (next !== url) {
        event.preventDefault();
        if (httpOriginal) guestWc.__djxxrHttpsUpgrade = httpOriginal;
        guestWc.loadURL(next);
      }
    });
    guestWc.on('did-fail-load', (_e, errorCode, _desc, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3) return;
      const httpOriginal = guestWc.__djxxrHttpsUpgrade;
      if (!httpOriginal || !validatedURL || !/^https:/i.test(validatedURL)) return;
      guestWc.__djxxrHttpsUpgrade = null;
      const st = privacy.getConfig();
      if (st.httpsOnly === 'upgrade') {
        guestWc.loadURL(httpOriginal).catch(() => {});
        return;
      }
      if (st.httpsOnly === 'block') {
        mainWindow?.webContents.send('shell:https-warn', {
          httpUrl: httpOriginal,
          httpsUrl: validatedURL,
          errorCode,
        });
      }
    });
    guestWc.on('did-navigate', (_e, url) => {
      privacy.hardenGuest(guestWc);
      if (/^https:/i.test(url || '')) guestWc.__djxxrHttpsUpgrade = null;
      recordGuestVisit(url, guestWc.getTitle() || '', false);
    });
    guestWc.on('did-finish-load', () => {
      privacy.hardenGuest(guestWc);
      try {
        recordGuestVisit(guestWc.getURL(), guestWc.getTitle() || '', true);
      } catch {
        /* */
      }
    });
    guestWc.on('page-title-updated', (_e, title) => {
      try {
        recordGuestVisit(guestWc.getURL(), title, true);
      } catch {
        /* */
      }
    });
  }

  contextMenu.attachContextMenu(guestWc, {
    getMainWindow: () => {
      try {
        return contextMenu.hostWindowForGuest(guestWc) || mainWindow;
      } catch {
        return mainWindow;
      }
    },
    isTor: (wc) => tor.isTorWebContents(wc),
    isPrivate: (wc) => {
      try {
        const name =
          (typeof wc.session?.partitionName === 'string' && wc.session.partitionName) ||
          (typeof wc.session?.getStoragePath === 'function' ? '' : '');
        // partitionName may be empty on some Electron builds — fall back to window meta
        if (windowMode.isPrivatePartition(name)) return true;
        const win = contextMenu.hostWindowForGuest(wc);
        const meta = windowMode.getWindowMeta(win);
        return meta.mode === 'private' || windowMode.isPrivatePartition(meta.partition);
      } catch {
        return false;
      }
    },
    openUrl: (url, opts = {}) => {
      const win = contextMenu.hostWindowForGuest(guestWc) || mainWindow;
      win?.webContents.send('shell:open-url', {
        url,
        tor: Boolean(opts.tor),
        private: Boolean(opts.private),
        background: Boolean(opts.background),
      });
    },
    askRenderer: (action, payload = {}) => {
      const win = contextMenu.hostWindowForGuest(guestWc) || mainWindow;
      win?.webContents.send('shell:context-action', { action, ...payload });
    },
    canInspect: () => Boolean(global.__djxxrAllowInspect),
  });

  wireGuestChromeShortcuts(guestWc);
  try {
    const host = require('electron').BrowserWindow.fromWebContents(guestWc) ||
      (typeof guestWc.getOwnerBrowserWindow === 'function' ? guestWc.getOwnerBrowserWindow() : null);
    mouseNav.attachSideButtons(guestWc, {
      host: host && !host.isDestroyed() ? host : undefined,
      label: `guest:${guestWc.id}`,
    });
  } catch (err) {
    mouseNav.log('attach guest fail', err && err.message);
  }
}

function wireGuestChromeShortcuts(guestWc) {
  guestWc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const payload = shortcutsGuest.normalizeInput(input);

    if (payload.key === 'Escape') {
      let trap = false;
      try {
        trap = Boolean(mainWindow?.__djxxrShortcutTrap);
      } catch {
        /* */
      }
      let loading = false;
      try {
        loading = typeof guestWc.isLoading === 'function' && guestWc.isLoading();
      } catch {
        /* */
      }
      if (!loading && !trap) return;
      event.preventDefault();
      if (loading) {
        try {
          guestWc.stop();
        } catch {
          /* */
        }
      }
      mainWindow?.webContents.send('shell:shortcut', payload);
      return;
    }

    if (!shortcutsGuest.isGuestChromeShortcut(input)) return;
    event.preventDefault();
    mainWindow?.webContents.send('shell:shortcut', payload);
  });
}

function createWindow(optsExtra = {}) {
  const saved = appSession.load();
  const win = saved.window || {};
  const secondary = Boolean(optsExtra.secondary);
  const bootMode = optsExtra.boot === 'private' || optsExtra.boot === 'tor' ? optsExtra.boot : 'normal';
  let privatePartition = null;
  if (bootMode === 'private') {
    privatePartition = windowMode.createPrivatePartition();
  }
  const restoreTabs = Array.isArray(optsExtra.restoreTabs)
    ? optsExtra.restoreTabs
    : pendingRestoreTabs;
  if (optsExtra.restoreTabs || pendingRestoreTabs) pendingRestoreTabs = null;

  const opts = {
    width: secondary ? 1200 : win.width || 1360,
    height: secondary ? 800 : win.height || 900,
    minWidth: 720,
    minHeight: 480,
    show: false,
    backgroundColor: bootMode === 'private' ? '#0e1016' : '#12151c',
    title:
      bootMode === 'private' ? 'Prywatne — djxxr' : bootMode === 'tor' ? 'Tor — djxxr' : 'djxxr',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: bootMode === 'private' ? '#0e1016' : '#12151c',
      symbolColor: bootMode === 'private' ? '#8b919c' : '#c8cdd6',
      height: 32,
    },
    backgroundThrottling: boot.backgroundThrottling !== false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      backgroundThrottling: boot.backgroundThrottling !== false,
      spellcheck: true,
      v8CacheOptions: 'code',
      additionalArguments: [
        `--djxxr-boot=${bootMode}`,
        privatePartition ? `--djxxr-partition=${privatePartition}` : '',
        process.env.PERF_BENCH === '1' ? '--djxxr-perf-bench=1' : '',
      ].filter(Boolean),
    },
  };
  if (!secondary && typeof win.x === 'number' && typeof win.y === 'number') {
    opts.x = win.x;
    opts.y = win.y;
  }
  const bw = new BrowserWindow(opts);
  bw.once('ready-to-show', () => {
    if (bw.isDestroyed()) return;
    global.__DJXXR_PERF_WINDOW_VISIBLE_AT = Date.now();
    try {
      bw.show();
    } catch {
      /* */
    }
  });
  appWindows.add(bw);
  windowMode.setWindowMeta(bw, {
    mode: bootMode,
    partition: privatePartition,
    restoreTabs: restoreTabs || null,
  });
  if (privatePartition) {
    try {
      const privSes = session.fromPartition(privatePartition);
      windowMode.ensurePrivateSession(privSes);
      void extensions.attachToPrivateSession(privSes);
    } catch (err) {
      console.warn('[window] private session', err);
    }
  }
  bw.on('closed', () => {
    appWindows.delete(bw);
    if (privatePartition) {
      void windowMode.wipePrivatePartition(privatePartition);
    }
    if (mainWindow === bw) {
      mainWindow = [...appWindows].find((w) => !w.isDestroyed()) || null;
    }
  });

  bw.on('close', (e) => {
    if (isAppQuitting || bootMode !== 'normal') return;
    const alive = [...appWindows].filter((w) => !w.isDestroyed());
    if (alive.length <= 1) return;
    // Secondary window: ask renderer to push closed-window stack, then destroy
    if (bw.__djxxrClosingAck) return;
    e.preventDefault();
    try {
      bw.webContents.send('shell:window-closing');
    } catch {
      bw.destroy();
      return;
    }
    const t = setTimeout(() => {
      try {
        if (!bw.isDestroyed()) bw.destroy();
      } catch {
        /* */
      }
    }, 400);
    bw.once('closed', () => clearTimeout(t));
  });

  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = bw;
  }

  // X1/X2: before-mouse-event is primary (app-command does not fire on this stack).
  mouseNav.attachAppCommandFallback(bw);
  mouseNav.attachSideButtons(bw.webContents, { host: bw, label: `host:${bw.id}` });

  const pushMetricsVisibility = () => {
    try {
      const visible = !bw.isDestroyed() && bw.isVisible() && !bw.isMinimized();
      metrics.setWindowVisible(visible);
    } catch {
      /* */
    }
  };
  bw.on('show', pushMetricsVisibility);
  bw.on('hide', pushMetricsVisibility);
  bw.on('minimize', pushMetricsVisibility);
  bw.on('restore', pushMetricsVisibility);
  pushMetricsVisibility();

  if (!secondary && win.isMaximized) {
    try {
      bw.maximize();
    } catch {
      /* */
    }
  }

  const persistBounds = () => {
    if (bw !== mainWindow || bw.isDestroyed() || bootMode !== 'normal') return;
    const isMaximized = bw.isMaximized();
    const b = isMaximized ? bw.getNormalBounds() : bw.getBounds();
    appSession.saveSnapshot({
      window: {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        isMaximized,
      },
    });
  };
  bw.on('resize', persistBounds);
  bw.on('move', persistBounds);
  bw.on('maximize', persistBounds);
  bw.on('unmaximize', persistBounds);

  const bindAttach = security.attachWebviewGuard(session.fromPartition('persist:main'), wvPreloadPath);
  bindAttach(bw.webContents);
  if (privatePartition) {
    try {
      security.attachWebviewGuard(session.fromPartition(privatePartition), wvPreloadPath)(bw.webContents);
    } catch {
      /* */
    }
  }

  bw.webContents.on('did-attach-webview', (_e, guestContents) => {
    try {
      const part = guestContents.session?.partitionName || '';
      void part;
      if (windowMode.isPrivatePartition(privatePartition) && guestContents.session) {
        windowMode.ensurePrivateSession(guestContents.session);
      }
    } catch {
      /* */
    }
    wireGuestNavigation(guestContents);
    try {
      const torGuest = tor.isTorWebContents(guestContents);
      if (!torGuest) {
        const host = BrowserWindow.fromWebContents(bw.webContents) || bw;
        extensions.trackGuestTab(guestContents, host, { tor: false });
      }
      // mouseNav already attached inside wireGuestNavigation (idempotent)
    } catch (err) {
      console.warn('[ext] trackGuestTab', err);
    }
  });

  contextMenu.attachChromeEditMenu(bw.webContents);

  security.attachNavigationGuards(bw.webContents, {
    askExternal: askExternalProtocol,
    onOpenUrl: (url) => {
      bw.webContents.send('shell:open-url', {
        url,
        private: bootMode === 'private',
        tor: bootMode === 'tor',
      });
    },
  });

  const sendBoot = () => {
    if (bw.isDestroyed()) return;
    bw.webContents.send('shell:window-boot', {
      mode: bootMode,
      partition: privatePartition,
      restoreTabs: restoreTabs || null,
    });
  };
  bw.webContents.on('did-finish-load', sendBoot);

  if (isDev) {
    const base = process.env.VITE_DEV_SERVER.replace(/\/$/, '');
    bw.loadURL(base);
  } else {
    bw.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  if (!secondary && bootMode === 'normal') appSession.markDirtyOnBoot();
  return bw;
}

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

  // Backup: any webview webContents gets context menu + navigation wiring
  app.on('web-contents-created', (_e, contents) => {
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

  // Fast path: attach session hooks then show window; heavy boot deferred
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
  global.__DJXXR_PERF_WINDOW_CREATED_AT = Date.now();

  // Deferred: Ghostery lists, chrome-extensions, passwords, Tor autostart cleanup, session perf
  setImmediate(() => {
    try {
      torDaemon.removeAutostartShortcuts();
    } catch (e) {
      console.warn('[tor] autostart migrate', e);
    }
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
    void adblock.init({ updateLists: true }).then((r) => {
      console.log('[adblock+]', r);
    });
    void perf.applySessionPerf(ses, { cacheMb: boot.cacheMb }).then(() => {
      spellcheck.applyToSession(ses, { tor: false });
    });
    passwords.init({
      onLock: () => {
        mainWindow?.webContents.send('shell:passwords-locked');
      },
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

ipcMain.handle(
  'shell:open-external',
  wrapApp(async (_e, url) => {
    if (typeof url !== 'string') return;
    const r = security.isAllowedNavigation(url);
    if (r.ok === true && /^https?:/i.test(url)) await shell.openExternal(url);
    else if (r.ok === 'prompt') await askExternalProtocol(url);
  }),
);

ipcMain.handle('shell:platform', wrapApp(() => process.platform));
ipcMain.handle(
  'shell:app-info',
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
  'shell:open-user-data',
  wrapApp(async () => {
    await shell.openPath(app.getPath('userData'));
    return { ok: true };
  }),
);
ipcMain.handle(
  'shell:open-logs-folder',
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
  'shell:new-window',
  wrapApp((_e, opts) => {
    const boot =
      opts && typeof opts === 'object' && typeof opts.boot === 'string' ? opts.boot : undefined;
    const restoreTabs =
      opts && typeof opts === 'object' && Array.isArray(opts.restoreTabs) ? opts.restoreTabs : null;
    createWindow({
      secondary: true,
      boot: boot === 'private' || boot === 'tor' ? boot : undefined,
      restoreTabs,
    });
    return { ok: true };
  }),
);
ipcMain.handle(
  'shell:window-boot-get',
  wrapApp((event) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    const meta = windowMode.getWindowMeta(win);
    return {
      mode: meta.mode || 'normal',
      partition: meta.partition || null,
      restoreTabs: meta.restoreTabs || null,
    };
  }),
);
ipcMain.handle(
  'shell:window-closing-ack',
  wrapApp((event) => {
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.__djxxrClosingAck = true;
      win.destroy();
    }
    return { ok: true };
  }),
);
ipcMain.handle(
  'shell:quit',
  wrapApp(() => {
    app.quit();
    return { ok: true };
  }),
);
ipcMain.handle(
  'shell:window-toggle-fullscreen',
  wrapApp((event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return { ok: false };
    win.setFullScreen(!win.isFullScreen());
    return { ok: true, fullScreen: win.isFullScreen() };
  }),
);
ipcMain.handle(
  'shell:popup-allow',
  wrapApp((_e, origin) => {
    const popups = require('./popups.cjs');
    const o = String(origin || '');
    if (o) popups.allowPopupsForOrigin(o);
    return { ok: true, origin: o };
  }),
);
ipcMain.handle(
  'shell:popup-open-allowed',
  wrapApp((event, url, webContentsId) => {
    const popups = require('./popups.cjs');
    const u = String(url || '');
    if (!/^https?:/i.test(u) && u !== 'about:blank') return { ok: false, reason: 'url' };
    let opener = null;
    try {
      opener = electronWebContents.fromId(Number(webContentsId));
    } catch {
      opener = null;
    }
    if (!opener || opener.isDestroyed()) {
      // fall back: open as tab in sender window
      event.sender.send('shell:open-url', { url: u });
      return { ok: true, via: 'tab' };
    }
    try {
      const origin = (() => {
        try {
          return new URL(opener.getURL()).origin;
        } catch {
          return '';
        }
      })();
      if (origin) popups.allowPopupsForOrigin(origin);
      popups.noteGesture(opener);
      const { BrowserWindow } = require('electron');
      const child = new BrowserWindow({
        width: 520,
        height: 680,
        autoHideMenuBar: true,
        title: 'djxxr',
        webPreferences: {
          session: opener.session,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: false,
          nativeWindowOpen: true,
        },
      });
      void child.loadURL(u);
      console.log('[popup] manual allow open', u.slice(0, 120));
      return { ok: true, via: 'window' };
    } catch (err) {
      console.warn('[popup] open-allowed', err);
      event.sender.send('shell:open-url', { url: u });
      return { ok: true, via: 'tab-fallback' };
    }
  }),
);
ipcMain.handle(
  'shell:set-devtools-enabled',
  wrapApp((_e, enabled) => {
    global.__djxxrAllowInspect = Boolean(enabled);
    return { ok: true, enabled: Boolean(global.__djxxrAllowInspect) };
  }),
);
ipcMain.handle(
  'shell:set-shortcut-trap',
  wrapApp((_e, enabled) => {
    if (mainWindow) mainWindow.__djxxrShortcutTrap = Boolean(enabled);
    return { ok: true, enabled: Boolean(mainWindow?.__djxxrShortcutTrap) };
  }),
);

ipcMain.handle(
  'shell:tor-start',
  wrapApp(async (_e, opts) => {
    const proxyUrl = typeof opts?.proxyUrl === 'string' ? opts.proxyUrl : undefined;
    return tor.start({ proxyUrl });
  }),
);

ipcMain.handle('shell:tor-stop', wrapApp(async () => tor.stop()));
ipcMain.handle('shell:tor-status', wrapApp(() => tor.status()));
ipcMain.handle('shell:tor-refresh', wrapApp(async () => tor.refresh()));
ipcMain.handle('shell:tor-new-identity', wrapApp(async () => tor.newIdentity()));
ipcMain.handle('shell:tor-circuit', wrapApp(async () => tor.circuitInfo()));
ipcMain.handle(
  'shell:tor-bridges',
  wrapApp(async (_e, next) => {
    if (next && typeof next === 'object') {
      return torDaemon.applyBridges(next);
    }
    return { ok: true, ...torDaemon.loadBridgeConfig(), builtin: torDaemon.builtinBridges };
  }),
);
ipcMain.handle(
  'shell:tor-selftest',
  wrapApp(async (_e, proxyUrl) => tor.selftest(typeof proxyUrl === 'string' ? proxyUrl : undefined)),
);
ipcMain.handle(
  'shell:tor-daemon-autostart',
  wrapApp((_e, enabled) => torDaemon.setAutostart(Boolean(enabled))),
);
ipcMain.handle('shell:tor-daemon-status', wrapApp(() => torDaemon.status()));

ipcMain.handle(
  'shell:privacy-config',
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
        clearOnQuitKeep: Array.isArray(next.clearOnQuitKeep) ? next.clearOnQuitKeep.map(String) : undefined,
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

ipcMain.handle('shell:privacy-status', wrapApp(() => ({ ...privacy.getConfig(), adblock: adblock.getStatus() })));
ipcMain.handle(
  'shell:privacy-exception-add',
  wrapApp((_e, host) => privacy.addException(String(host || ''))),
);
ipcMain.handle(
  'shell:privacy-exception-remove',
  wrapApp((_e, host) => privacy.removeException(String(host || ''))),
);
ipcMain.handle(
  'shell:privacy-forget-site',
  wrapApp(async (_e, origin) => {
    const ses = session.fromPartition('persist:main');
    return privacy.forgetSite(ses, String(origin || ''));
  }),
);
ipcMain.handle(
  'shell:privacy-blocked',
  wrapApp((_e, tabKey) => adblock.getRecentBlocked(tabKey ? String(tabKey) : 'global')),
);
ipcMain.handle(
  'shell:favicon-cache-get',
  wrapApp((_e, pageUrl) => faviconCache.getCached(String(pageUrl || ''))),
);
ipcMain.handle(
  'shell:favicon-cache-put',
  wrapApp(async (_e, pageUrl, faviconUrl, opts) => {
    // Tor tabs must never hit clearnet favicon cache / disk
    if (opts && opts.tor) return null;
    if (/\.onion\b/i.test(String(pageUrl || '')) || /\.onion\b/i.test(String(faviconUrl || ''))) {
      return null;
    }
    return faviconCache.storeFromUrl(String(pageUrl || ''), String(faviconUrl || ''));
  }),
);

ipcMain.handle('shell:downloads-list', wrapApp(() => downloads.list()));
ipcMain.handle('shell:downloads-config', wrapApp((_e, next) => {
  if (next && typeof next === 'object') return downloads.setConfig(next);
  return downloads.getConfig();
}));
ipcMain.handle('shell:downloads-pause', wrapApp((_e, id) => downloads.pause(String(id || ''))));
ipcMain.handle('shell:downloads-resume', wrapApp((_e, id) => downloads.resume(String(id || ''))));
ipcMain.handle('shell:downloads-cancel', wrapApp((_e, id) => downloads.cancel(String(id || ''))));
ipcMain.handle('shell:downloads-remove', wrapApp((_e, id) => downloads.remove(String(id || ''))));
ipcMain.handle('shell:downloads-clear', wrapApp(() => downloads.clearCompleted()));
ipcMain.handle('shell:downloads-open', wrapApp((_e, id) => downloads.openFile(String(id || ''))));
ipcMain.handle('shell:downloads-show', wrapApp((_e, id) => downloads.showInFolder(String(id || ''))));
ipcMain.handle('shell:downloads-drag', wrapApp((_e, id) => downloads.startDrag(String(id || ''))));

ipcMain.handle('shell:bookmarks-discover-profiles', wrapApp(() => bookmarksImport.discoverProfiles()));
ipcMain.handle('shell:bookmarks-read-profile', wrapApp((_e, profilePath) => {
  return bookmarksImport.readProfileBookmarks(profilePath);
}));

homeBg.register(ipcMain, wrapApp);
notes.register(ipcMain, wrapApp);
extensions.register(ipcMain, wrapApp);

ipcMain.handle('shell:session-load', wrapApp(() => appSession.load()));
ipcMain.handle('shell:session-status', wrapApp(() => appSession.getStatus()));
ipcMain.handle(
  'shell:session-save',
  wrapApp((_e, snapshot) => appSession.saveSnapshot(snapshot && typeof snapshot === 'object' ? snapshot : {})),
);
ipcMain.handle('shell:session-clear', wrapApp(() => appSession.clearSession()));
ipcMain.handle('shell:session-dismiss-crash', wrapApp(() => appSession.dismissCrashOffer()));
ipcMain.handle('shell:session-mark-clean', wrapApp(() => appSession.markCleanExit()));
ipcMain.handle(
  'shell:session-push-closed-window',
  wrapApp((_e, tabs) => appSession.pushClosedWindow(tabs)),
);
ipcMain.handle('shell:session-pop-closed-window', wrapApp(() => appSession.popClosedWindow()));
ipcMain.handle(
  'shell:session-nav-history',
  wrapApp((_e, webContentsId) => {
    try {
      const { webContents } = require('electron');
      const id = Number(webContentsId);
      if (!Number.isFinite(id)) return null;
      const wc = webContents.fromId(id);
      return appSession.readNavHistory(wc);
    } catch {
      return null;
    }
  }),
);

ipcMain.handle(

  'shell:history-config',

  wrapApp((_e, next) => history.setConfig(next && typeof next === 'object' ? next : {})),

);

ipcMain.handle('shell:history-status', wrapApp(() => history.getConfig()));

ipcMain.handle(

  'shell:history-record-visit',

  wrapApp((_e, opts) => {

    if (opts && opts.tor) return { ok: false, reason: 'tor' };

    return history.recordVisit(opts && typeof opts === 'object' ? opts : {});

  }),

);

ipcMain.handle(
  'shell:history-record-query',
  wrapApp((_e, q, opts) => {
    if (opts && opts.tor) return { ok: false, reason: 'tor' };
    return history.recordQuery(String(q || ''), opts && typeof opts === 'object' ? opts : {});
  }),
);
ipcMain.handle(
  'shell:history-import-queries',
  wrapApp((_e, items) => history.importQueries(Array.isArray(items) ? items : [])),
);

ipcMain.handle(

  'shell:history-suggest',

  wrapApp((_e, q, opts) => {

    if (opts && opts.tor) return { completion: null, groups: [] };

    const t0 = Date.now();

    const res = history.suggest(String(q || ''), opts && typeof opts === 'object' ? opts : {});

    res.tookMs = Date.now() - t0;

    return res;

  }),

);

ipcMain.handle(

  'shell:history-list',

  wrapApp((_e, opts) => history.list(opts && typeof opts === 'object' ? opts : {})),

);

ipcMain.handle(

  'shell:history-delete',

  wrapApp((_e, id) => history.deleteById(String(id || ''))),

);

ipcMain.handle(

  'shell:history-delete-url',

  wrapApp((_e, url) => history.deleteByUrl(String(url || ''))),

);

ipcMain.handle(

  'shell:history-delete-domain',

  wrapApp((_e, host) => history.deleteDomain(String(host || ''))),

);

ipcMain.handle(

  'shell:history-clear',

  wrapApp((_e, opts) => history.clear(opts && typeof opts === 'object' ? opts : { range: 'all' })),

);

ipcMain.handle(

  'shell:history-remove-query',

  wrapApp((_e, q) => history.removeQuery(String(q || ''))),

);



ipcMain.handle(
  'shell:search-suggest',
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
        .map((row) => (Array.isArray(row) ? String(row[0] || '') : String(row?.phrase || row || '')))
        .filter(Boolean);
    } catch {
      return [];
    }
  }),
);

/** Open-Meteo weather — clearnet only via main net.fetch (no API key). Location is typed by user. */
ipcMain.handle(
  'shell:weather-suggest',
  wrapApp(async (_e, opts) => {
    const q = String(opts?.q || '').trim().slice(0, 80);
    if (q.length < 2) return { ok: true, places: [] };
    try {
      const { net } = require('electron');
      const geoUrl =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=pl&format=json`;
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
  'shell:weather-fetch',
  wrapApp(async (_e, opts) => {
    const location = String(opts?.location || '').trim().slice(0, 80);
    const latOpt = typeof opts?.lat === 'number' ? opts.lat : null;
    const lonOpt = typeof opts?.lon === 'number' ? opts.lon : null;
    if (location.length < 2 && (latOpt == null || lonOpt == null)) return { ok: false, error: 'empty' };
    try {
      const { net } = require('electron');
      let place = null;
      let lat = latOpt;
      let lon = lonOpt;
      if (lat == null || lon == null) {
        const geoUrl =
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=pl&format=json`;
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
  'shell:adblock-config',
  wrapApp((_e, next) => {
    if (next && typeof next === 'object') return adblock.setConfig(next);
    return adblock.getStatus();
  }),
);

ipcMain.handle('shell:adblock-status', wrapApp(() => adblock.getStatus()));
ipcMain.handle('shell:adblock-cosmetic', wrapAppOrGuest(() => adblock.getCosmeticCss()));
ipcMain.handle(
  'shell:adblock-page-script',
  wrapAppOrGuest((_e, pageUrl) => adblock.getPageScript(typeof pageUrl === 'string' ? pageUrl : '')),
);

ipcMain.handle(
  'shell:perf-boot',
  wrapApp((_e, next) => {
    if (next && typeof next === 'object') {
      const saved = perf.saveBoot(next);
      return { ...saved, needsRestart: true };
    }
    return { ...perf.loadBoot(), needsRestart: false };
  }),
);

ipcMain.handle(
  'shell:perf-apply-session',
  wrapApp(async (_e, opts) => {
    const ses = session.fromPartition('persist:main');
    await perf.applySessionPerf(ses, opts && typeof opts === 'object' ? opts : {});
    if (opts && typeof opts.spellcheck === 'boolean') {
      spellcheck.setUserEnabled(opts.spellcheck);
    }
    spellcheck.applyToSession(ses, { tor: false });
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
  'shell:spellcheck-config',
  wrapApp((_e, next) => {
    if (next && typeof next.enabled === 'boolean') {
      spellcheck.setUserEnabled(next.enabled);
    }
    const ses = session.fromPartition('persist:main');
    spellcheck.applyToSession(ses, { tor: false });
    return { ok: true, enabled: spellcheck.getUserEnabled(), langs: spellcheck.LANGS };
  }),
);

ipcMain.handle('shell:perf-clear-cache', wrapApp(async () => perf.clearBrowsingCache()));
ipcMain.handle('shell:perf-memory', wrapApp(async () => perf.getMemoryInfo()));

ipcMain.handle(
  'shell:set-native-theme',
  wrapApp((_e, source) => {
    const src =
      source === 'light' || source === 'dark' || source === 'system' ? source : 'system';
    try {
      nativeTheme.themeSource = src;
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }),
);

ipcMain.handle(
  'shell:set-titlebar',
  wrapApp((_e, opts) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };
    const color = typeof opts?.color === 'string' ? opts.color : '#12151c';
    const symbolColor = typeof opts?.symbolColor === 'string' ? opts.symbolColor : '#c8cdd6';
    const height = typeof opts?.height === 'number' ? opts.height : 32;
    try {
      mainWindow.setTitleBarOverlay({ color, symbolColor, height });
      mainWindow.setBackgroundColor(color);
      return { ok: true, color, symbolColor, height };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }),
);

ipcMain.handle('shell:passwords-status', wrapPw(() => passwords.status()));
ipcMain.handle(
  'shell:passwords-setup',
  wrapPw((master, remember) => passwords.setup(String(master || ''), Boolean(remember))),
);
ipcMain.handle(
  'shell:passwords-unlock',
  wrapPw((master, remember) => passwords.unlock(String(master || ''), remember)),
);
ipcMain.handle('shell:passwords-lock', wrapPw(() => passwords.lock('manual')));
ipcMain.handle('shell:passwords-list', wrapPw((q) => passwords.list(typeof q === 'string' ? q : '')));
ipcMain.handle('shell:passwords-get', wrapPw((id) => passwords.get(String(id || ''))));
ipcMain.handle(
  'shell:passwords-find',
  wrapPw((pageUrl) => passwords.findForOrigin(String(pageUrl || ''))),
);
ipcMain.handle(
  'shell:passwords-autofill',
  wrapPw((id, pageUrl) => passwords.getPasswordForAutofill(String(id || ''), String(pageUrl || ''))),
);
ipcMain.handle('shell:passwords-add', wrapPw((entry) => passwords.add(entry && typeof entry === 'object' ? entry : {})));
ipcMain.handle(
  'shell:passwords-update',
  wrapPw((id, patch) => passwords.update(String(id || ''), patch && typeof patch === 'object' ? patch : {})),
);
ipcMain.handle('shell:passwords-remove', wrapPw((id) => passwords.remove(String(id || ''))));
ipcMain.handle('shell:passwords-never-add', wrapPw((origin) => passwords.neverSaveAdd(String(origin || ''))));
ipcMain.handle('shell:passwords-never-list', wrapPw(() => passwords.neverSaveList()));
ipcMain.handle('shell:passwords-never-remove', wrapPw((origin) => passwords.neverSaveRemove(String(origin || ''))));
ipcMain.handle(
  'shell:passwords-should-save',
  wrapPw((pageUrl, username, password) =>
    passwords.shouldOfferSave(String(pageUrl || ''), username, password),
  ),
);
ipcMain.handle('shell:passwords-confirm-save', wrapPw(() => passwords.confirmPendingSave()));
ipcMain.handle('shell:passwords-dismiss-save', wrapPw(() => passwords.dismissPendingSave()));
ipcMain.handle(
  'shell:passwords-generate',
  wrapPw((opts) => passwords.generate(opts && typeof opts === 'object' ? opts : {})),
);
ipcMain.handle('shell:passwords-strength', wrapPw((pw) => passwords.strength(String(pw || ''))));
ipcMain.handle('shell:passwords-totp', wrapPw((id) => passwords.getTotp(String(id || ''))));
ipcMain.handle('shell:passwords-copy', wrapPw((id) => passwords.copyPassword(String(id || ''))));
ipcMain.handle('shell:passwords-audit', wrapPw(() => passwords.audit()));
ipcMain.handle('shell:passwords-export', wrapPw((master) => passwords.exportCsv(String(master || ''))));
ipcMain.handle(
  'shell:passwords-import',
  wrapPw((csv, format) => passwords.importCsv(String(csv || ''), typeof format === 'string' ? format : 'chrome')),
);
ipcMain.handle(
  'shell:passwords-change-master',
  wrapPw((oldPw, newPw) => passwords.changeMaster(String(oldPw || ''), String(newPw || ''))),
);
ipcMain.handle('shell:passwords-idle', wrapPw((n) => passwords.setIdleMinutes(n)));
ipcMain.handle('shell:passwords-page-script', wrapPw(() => passwords.getPageScript()));
ipcMain.handle(
  'shell:passwords-activity',
  wrapPw(() => {
    passwords.touchActivity();
    return { ok: true };
  }),
);

ipcMain.handle(
  'shell:webview-preload',
  wrapApp(() => wvPreloadPath),
);

ipcMain.handle(
  'shell:metrics-subscribe',
  wrapApp(() => metrics.subscribe()),
);
ipcMain.handle(
  'shell:metrics-unsubscribe',
  wrapApp(() => metrics.unsubscribe()),
);
ipcMain.handle(
  'shell:metrics-subscribe-live',
  wrapApp(() => metrics.subscribeLive()),
);
ipcMain.handle(
  'shell:metrics-unsubscribe-live',
  wrapApp(() => metrics.unsubscribeLive()),
);
ipcMain.handle(
  'shell:metrics-subscribe-discard',
  wrapApp(() => metrics.subscribeDiscard()),
);
ipcMain.handle(
  'shell:metrics-unsubscribe-discard',
  wrapApp(() => metrics.unsubscribeDiscard()),
);
ipcMain.handle(
  'shell:metrics-set-guests',
  wrapApp((_e, list) => {
    metrics.setGuests(Array.isArray(list) ? list : []);
    return { ok: true };
  }),
);
ipcMain.handle(
  'shell:metrics-set-interval',
  wrapApp((_e, ms) => ({ ok: true, intervalMs: metrics.setIntervalMs(ms) })),
);
ipcMain.handle(
  'shell:metrics-low-power',
  wrapApp((_e, on) => ({ ok: true, intervalMs: metrics.setLowPower(Boolean(on)) })),
);
ipcMain.handle(
  'shell:metrics-snapshot',
  wrapApp(() => metrics.getSnapshot()),
);

ipcMain.handle(
  'shell:permissions-list',
  wrapApp(() => security.listPermissions()),
);
ipcMain.handle(
  'shell:permissions-revoke',
  wrapApp((_e, origin, permission) =>
    security.revokePermission(String(origin || ''), permission ? String(permission) : undefined),
  ),
);
ipcMain.handle(
  'shell:permissions-respond',
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

ipcMain.handle(
  'shell:picture-in-picture',
  wrapApp(async (_event, webContentsId, opts) => {
    const wc = guestWebContentsById(webContentsId);
    if (!wc) return { ok: false, error: 'no-guest' };
    return pip.runPictureInPicture(wc, {
      enterOnly: Boolean(opts && opts.enterOnly),
    });
  }),
);

ipcMain.handle(
  'shell:print',
  wrapApp(async (_event, webContentsId, opts) => {
    const wc = guestWebContentsById(webContentsId);
    if (!wc) return { ok: false, error: 'no-guest' };
    const silent = Boolean(opts && opts.silent);
    try {
      // Print via guest webContents (webview.print() often shows blank preview).
      await new Promise((resolve, reject) => {
        wc.print({ silent, printBackground: true }, (success, failureReason) => {
          if (success) resolve(true);
          else reject(new Error(failureReason || 'print-failed'));
        });
      });
      return { ok: true, silent };
    } catch (err) {
      try {
        wc.print({ silent, printBackground: true });
        return { ok: true, mode: 'fire', silent };
      } catch (e2) {
        return { ok: false, error: String(err?.message || e2?.message || err) };
      }
    }
  }),
);

ipcMain.handle(
  'shell:save-page',
  wrapApp(async (event, webContentsId, opts) => {
    const wc = guestWebContentsById(webContentsId);
    if (!wc) return { ok: false, error: 'no-guest' };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const suggested = suggestedSaveName(wc, 'html');
    let filePath = opts && typeof opts.forcePath === 'string' ? opts.forcePath : null;
    if (!filePath) {
      const dlg = await dialog.showSaveDialog(parent || undefined, {
        title: 'Zapisz stronę',
        defaultPath: suggested,
        filters: [
          { name: 'Strona WWW', extensions: ['html', 'htm'] },
          { name: 'Wszystkie pliki', extensions: ['*'] },
        ],
      });
      if (dlg.canceled || !dlg.filePath) return { ok: false, canceled: true };
      filePath = dlg.filePath;
    }
    try {
      await wc.savePage(filePath, 'HTMLComplete');
      return { ok: true, filePath };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  }),
);

ipcMain.handle(
  'shell:print-to-pdf',
  wrapApp(async (event, webContentsId, opts) => {
    const wc = guestWebContentsById(webContentsId);
    if (!wc) return { ok: false, error: 'no-guest' };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const suggested = suggestedSaveName(wc, 'pdf');
    let filePath = opts && typeof opts.forcePath === 'string' ? opts.forcePath : null;
    if (!filePath) {
      const dlg = await dialog.showSaveDialog(parent || undefined, {
        title: 'Zapisz jako PDF',
        defaultPath: suggested,
        filters: [{ name: 'PDF', extensions: ['pdf'] }],
      });
      if (dlg.canceled || !dlg.filePath) return { ok: false, canceled: true };
      filePath = dlg.filePath;
    }
    try {
      const data = await wc.printToPDF({ printBackground: true });
      const fs = require('node:fs');
      fs.writeFileSync(filePath, data);
      return { ok: true, filePath, bytes: data.length };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  }),
);

ipcMain.handle(
  'shell:certificate-respond',
  wrapApp((_e, webContentsId, proceed, rememberHost) => {
    const id = Number(webContentsId);
    const res = certificate.respond(id, Boolean(proceed), Boolean(rememberHost));
    certificate.clearPendingHost(id);
    return res;
  }),
);
