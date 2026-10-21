'use strict';

/**
 * BrowserWindow factory (moved from main.cjs).
 * @param {object} deps
 */
function createCreateWindow(deps) {
  const {
    BrowserWindow,
    path,
    session,
    electronDir,
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
    getMainWindow,
    setMainWindow,
    appWindows,
    getIsAppQuitting,
  } = deps;

  /** Pending tab restore for a newly created secondary window */
  let pendingRestoreTabs = null;

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
      title: bootMode === 'private' ? 'Prywatne — Vio' : bootMode === 'tor' ? 'Tor — Vio' : 'Vio',
      icon: path.join(electronDir, '..', 'build', 'icon.ico'),
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: bootMode === 'private' ? '#0e1016' : '#12151c',
        symbolColor: bootMode === 'private' ? '#8b919c' : '#c8cdd6',
        height: 32,
      },
      backgroundThrottling: boot.backgroundThrottling !== false,
      webPreferences: {
        preload: path.join(electronDir, 'preload.cjs'),
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
    try {
      require('../window-events.cjs').patchWindow(bw);
      require('../webcontents-events.cjs').patchWebContents(bw.webContents);
    } catch (err) {
      console.warn('[window-events] patch', err && err.message);
    }
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
      try {
        pushMetricsVisibility();
      } catch {
        /* */
      }
      if (privatePartition) {
        void windowMode.wipePrivatePartition(privatePartition);
      }
      if (getMainWindow() === bw) {
        setMainWindow([...appWindows].find((w) => !w.isDestroyed()) || null);
      }
    });

    bw.on('close', (e) => {
      if (bootMode !== 'normal') return;
      const alive = [...appWindows].filter((w) => !w.isDestroyed());
      // Last normal window: persist clean exit *before* destroy so the crash
      // banner does not false-trigger when before-quit is skipped (dev kill / X).
      if (alive.length <= 1) {
        try {
          appSession.markCleanExit();
        } catch (err) {
          console.warn('[session] clean exit on last-window close', err);
        }
        return;
      }
      if (getIsAppQuitting()) return;
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

    if (!getMainWindow() || getMainWindow().isDestroyed()) {
      setMainWindow(bw);
    }

    // X1/X2: before-mouse-event is primary (app-command does not fire on this stack).
    mouseNav.attachAppCommandFallback(bw);
    mouseNav.attachSideButtons(bw.webContents, { host: bw, label: `host:${bw.id}` });

    // OR across all app windows — a hidden secondary must not pause metrics for the main UI.
    // Do not probe before first show: create uses show:false and would stick windowVisible=false.
    const pushMetricsVisibility = () => {
      try {
        let visible = false;
        for (const w of appWindows) {
          if (!w.isDestroyed() && w.isVisible() && !w.isMinimized()) {
            visible = true;
            break;
          }
        }
        metrics.setWindowVisible(visible);
      } catch {
        /* */
      }
    };
    bw.on('show', pushMetricsVisibility);
    bw.on('hide', pushMetricsVisibility);
    bw.on('minimize', pushMetricsVisibility);
    bw.on('restore', pushMetricsVisibility);

    if (!secondary && win.isMaximized) {
      try {
        bw.maximize();
      } catch {
        /* */
      }
    }

    const persistBounds = () => {
      if (bw !== getMainWindow() || bw.isDestroyed() || bootMode !== 'normal') return;
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
      bw.loadFile(path.join(electronDir, '..', 'dist', 'index.html'));
    }

    if (!secondary && bootMode === 'normal') appSession.markDirtyOnBoot();
    return bw;
  }

  return createWindow;
}

module.exports = { createCreateWindow };
