const { app, BrowserWindow, ipcMain, shell, session, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const adblock = require('./adblock-plus.cjs');
const perf = require('./perf.cjs');
const passwords = require('./passwords.cjs');
const metrics = require('./metrics.cjs');
const security = require('./security.cjs');
const tor = require('./tor.cjs');
const torDaemon = require('./tor-daemon.cjs');
const privacy = require('./privacy.cjs');
const faviconCache = require('./favicon-cache.cjs');
const history = require('./history.cjs');
const appSession = require('./session.cjs');
const downloads = require('./downloads.cjs');
const homeBg = require('./home-bg.cjs');
const contextMenu = require('./context-menu.cjs');
const windowMode = require('./window-mode.cjs');
const certificate = require('./certificate.cjs');
const shortcutsGuest = require('./shortcuts-guest.cjs');
const bookmarksImport = require('./bookmarks-import.cjs');
const { webContents: electronWebContents } = require('electron');

/** Boot switches MUST run before ready */
privacy.applyBootSwitches();
const boot = perf.applyBootSwitches();
history.init();
downloads.init();

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Set<BrowserWindow>} */
const appWindows = new Set();

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
    if (typeof ses.setSpellCheckerEnabled === 'function') ses.setSpellCheckerEnabled(true);
    if (typeof ses.setSpellCheckerLanguages === 'function') ses.setSpellCheckerLanguages(['pl', 'en-US']);
  } catch (err) {
    console.warn('[private] ensurePrivateSession', err);
  }
}

function wireGuestNavigation(guestWc) {
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
    privateMode = !torMode && guestWc.session === session.fromPartition('persist:private');
  } catch {
    /* */
  }
  security.attachNavigationGuards(guestWc, {
    askExternal: torMode ? null : askExternalProtocol,
    torMode,
    onOpenUrl: (url, extra = {}) => {
      mainWindow?.webContents.send('shell:open-url', {
        url,
        tor: torMode,
        private: privateMode,
        background: Boolean(extra.background),
      });
    },
  });
  certificate.attachCertificateHandler(guestWc, {
    getMainWindow: () => mainWindow,
    torMode,
  });
  if (torMode) {
    tor.hardenGuestWebContents(guestWc);
  } else {
    privacy.hardenGuest(guestWc);
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
  const opts = {
    width: secondary ? 1200 : win.width || 1360,
    height: secondary ? 800 : win.height || 900,
    minWidth: 720,
    minHeight: 480,
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
      spellcheck: false,
      v8CacheOptions: 'code',
      additionalArguments: [
        `--djxxr-boot=${bootMode}`,
        privatePartition ? `--djxxr-partition=${privatePartition}` : '',
      ].filter(Boolean),
    },
  };
  if (!secondary && typeof win.x === 'number' && typeof win.y === 'number') {
    opts.x = win.x;
    opts.y = win.y;
  }
  const bw = new BrowserWindow(opts);
  appWindows.add(bw);
  windowMode.setWindowMeta(bw, {
    mode: bootMode,
    partition: privatePartition,
  });
  if (privatePartition) {
    try {
      windowMode.ensurePrivateSession(session.fromPartition(privatePartition));
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
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = bw;
  }
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

  // Migration: never leave Tor daemon in Windows Startup by default
  try {
    torDaemon.removeAutostartShortcuts();
  } catch (e) {
    console.warn('[tor] autostart migrate', e);
  }

  // Purge legacy persist:private if it ever existed on disk
  try {
    const legacy = session.fromPartition('persist:private');
    await legacy.clearStorageData();
    await legacy.clearCache();
    const partDir = path.join(app.getPath('userData'), 'Partitions', 'private');
    if (fs.existsSync(partDir)) {
      fs.rmSync(partDir, { recursive: true, force: true });
      console.log('[window-mode] removed legacy Partitions/private');
    }
  } catch (err) {
    console.warn('[window-mode] purge persist:private', err);
  }

  const ses = session.fromPartition('persist:main');
  security.attachCsp(session.defaultSession, isDev);
  security.attachCsp(ses, false);
  security.attachPermissionHandlers(ses);

  security.setPermissionAskHandler((req) => {
    mainWindow?.webContents.send('shell:permission-ask', req);
  });

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
  // Page editing spellcheck (baseline browser). Privacy fingerprinting stays untouched.
  try {
    if (typeof ses.setSpellCheckerEnabled === 'function') ses.setSpellCheckerEnabled(true);
    if (typeof ses.setSpellCheckerLanguages === 'function') ses.setSpellCheckerLanguages(['pl', 'en-US']);
  } catch {
    /* */
  }
  adblock.setBlockedListener((n) => {
    mainWindow?.webContents.send('shell:adblock-blocked', n);
  });
  void adblock.init({ updateLists: true }).then((r) => {
    console.log('[adblock+]', r);
  });
  await perf.applySessionPerf(ses, { cacheMb: boot.cacheMb });

  try {
    if (typeof ses.registerPreloadScript === 'function') {
      ses.registerPreloadScript({ type: 'frame', filePath: wvPreloadPath });
    }
  } catch (err) {
    console.warn('[security] webview preload:', err);
  }

  passwords.init({
    onLock: () => {
      mainWindow?.webContents.send('shell:passwords-locked');
    },
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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
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
    createWindow({
      secondary: true,
      boot: boot === 'private' || boot === 'tor' ? boot : undefined,
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
    return { mode: meta.mode || 'normal', partition: meta.partition || null };
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

/** @deprecated Global proxy on persist:main removed — Tor uses isolated partition via shell:tor-* */
ipcMain.handle(
  'shell:set-proxy',
  wrapApp(async () => {
    const ses = session.fromPartition('persist:main');
    await ses.setProxy({ mode: 'system' });
    return {
      ok: true,
      mode: 'system',
      note: 'Globalny proxy Tor usunięty. Użyj shell:tor-start / kart Tor.',
    };
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
ipcMain.handle('shell:adblock-cosmetic', wrapApp(() => adblock.getCosmeticCss()));
ipcMain.handle(
  'shell:adblock-page-script',
  wrapApp((_e, pageUrl) => adblock.getPageScript(typeof pageUrl === 'string' ? pageUrl : '')),
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
    if (mainWindow && opts && typeof opts.backgroundThrottling === 'boolean') {
      try {
        mainWindow.webContents.setBackgroundThrottling(opts.backgroundThrottling);
      } catch {
        /* */
      }
    }
    return { ok: true };
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

ipcMain.handle(
  'shell:save-page',
  wrapApp(async (event, webContentsId) => {
    const wc = guestWebContentsById(webContentsId);
    if (!wc) return { ok: false, error: 'no-guest' };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(parent || undefined, {
      title: 'Zapisz stronę',
      defaultPath: 'page.html',
      filters: [
        { name: 'Strona WWW', extensions: ['html', 'htm'] },
        { name: 'Wszystkie pliki', extensions: ['*'] },
      ],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
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
  wrapApp(async (event, webContentsId) => {
    const wc = guestWebContentsById(webContentsId);
    if (!wc) return { ok: false, error: 'no-guest' };
    const parent = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = await dialog.showSaveDialog(parent || undefined, {
      title: 'Zapisz jako PDF',
      defaultPath: 'page.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    try {
      const data = await wc.printToPDF({ printBackground: true });
      const fs = require('node:fs');
      fs.writeFileSync(filePath, data);
      return { ok: true, filePath };
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
