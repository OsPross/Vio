'use strict';

/**
 * Guest webview / popup navigation wiring (moved from main.cjs).
 * @param {object} deps
 */
function createWireGuest(deps) {
  const {
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
    getMainWindow,
    certificate,
    history,
    mouseNav,
    shortcutsGuest,
  } = deps;

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

  function wireGuestChromeShortcuts(guestWc) {
    guestWc.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const payload = shortcutsGuest.normalizeInput(input);
      const mainWindow = getMainWindow();

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
      let isWebview = false;
      try {
        isWebview = typeof guestWc.getType === 'function' && guestWc.getType() === 'webview';
      } catch {
        isWebview = false;
      }
      if (isWebview) {
        try {
          const googleLogin = require('../google-login.cjs');
          googleLogin.attachGoogleAccountsHardening(guestWc, { torMode: false });
        } catch (err) {
          console.warn('[google-login] attach', err);
        }
      }
    }
    security.attachNavigationGuards(guestWc, {
      askExternal: torMode ? null : askExternalProtocol,
      torMode,
      getHostWindow: () => {
        try {
          return contextMenu.hostWindowForGuest(guestWc) || getMainWindow();
        } catch {
          return getMainWindow();
        }
      },
      onOpenUrl: (url, extra = {}) => {
        const host = contextMenu.hostWindowForGuest(guestWc) || getMainWindow();
        host?.webContents.send('shell:open-url', {
          url,
          tor: torMode,
          private: privateMode || windowMode.getWindowMeta(host).mode === 'private',
          background: Boolean(extra.background),
        });
      },
      onPopupBlocked: (info) => {
        const host = contextMenu.hostWindowForGuest(guestWc) || getMainWindow();
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
      getMainWindow,
      torMode,
    });
    if (torMode) {
      tor.hardenGuestWebContents(guestWc);
      spellcheck.applyToWebContents(guestWc, { tor: true });
    } else {
      privacy.hardenGuest(guestWc);
      spellcheck.applyToWebContents(guestWc, { tor: false });
      guestWc.__djxxrHttpsUpgrade = null;

      const linkPreviewGuests = require('../lib/link-preview-guests.cjs');
      const recordGuestVisit = (url, title, soft) => {
        try {
          // Shift+hover preview webviews must not pollute browsing history
          if (linkPreviewGuests.has(guestWc.id)) return;
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
          getMainWindow()?.webContents.send('shell:https-warn', {
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
          return contextMenu.hostWindowForGuest(guestWc) || getMainWindow();
        } catch {
          return getMainWindow();
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
        const win = contextMenu.hostWindowForGuest(guestWc) || getMainWindow();
        win?.webContents.send('shell:open-url', {
          url,
          tor: Boolean(opts.tor),
          private: Boolean(opts.private),
          background: Boolean(opts.background),
        });
      },
      askRenderer: (action, payload = {}) => {
        const win = contextMenu.hostWindowForGuest(guestWc) || getMainWindow();
        win?.webContents.send('shell:context-action', { action, ...payload });
      },
      canInspect: () => Boolean(global.__djxxrAllowInspect),
    });

    wireGuestChromeShortcuts(guestWc);
    try {
      const host =
        BrowserWindow.fromWebContents(guestWc) ||
        (typeof guestWc.getOwnerBrowserWindow === 'function' ? guestWc.getOwnerBrowserWindow() : null);
      mouseNav.attachSideButtons(guestWc, {
        host: host && !host.isDestroyed() ? host : undefined,
        label: `guest:${guestWc.id}`,
      });
    } catch (err) {
      mouseNav.log('attach guest fail', err && err.message);
    }
  }

  return { wireGuestNavigation, ensurePrivateSession };
}

module.exports = { createWireGuest };
