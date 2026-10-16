'use strict';

const crypto = require('node:crypto');
const C = require('./channels.cjs');
const { createAutomation } = require('../lib/automation.cjs');

const RENDERER_TIMEOUT_MS = 5000;

/**
 * Soul automation API wiring (WebSocket server lives in lib/automation.cjs).
 * @param {object} deps
 */
function register(deps) {
  const {
    ipcMain,
    wrapApp,
    app,
    session,
    dialog,
    getMainWindow,
    guestWebContentsById,
    electronWebContents,
    appWindows,
    windowMode,
    BrowserWindow,
    history,
  } = deps;

  /** @type {Map<string, {resolve:Function, reject:Function, timer:NodeJS.Timeout}>} */
  const pending = new Map();
  /** tabId → owning normal window, refreshed by every 'tabs' fan-out (tabFor() always runs one first). */
  const tabWindow = new Map();

  const isNormal = (win) =>
    Boolean(win) && !win.isDestroyed() && windowMode.getWindowMeta(win).mode === 'normal';

  function normalMainWindow() {
    const win = getMainWindow();
    return isNormal(win) ? win : null;
  }

  /** All normal Vio windows — private / Tor windows are never asked. */
  function normalWindows() {
    return [...appWindows].filter(isNormal);
  }

  async function rendererRequest(cmd, args = {}) {
    if (cmd === 'tabs') {
      const wins = normalWindows();
      const results = await Promise.allSettled(wins.map((w) => askWindow(w, 'tabs')));
      tabWindow.clear();
      const tabs = [];
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled' || !r.value || !Array.isArray(r.value.tabs)) return;
        for (const t of r.value.tabs) {
          if (!t || typeof t.tabId !== 'string' || tabWindow.has(t.tabId)) continue;
          tabWindow.set(t.tabId, wins[i]);
          tabs.push(t);
        }
      });
      return { tabs };
    }
    const win =
      typeof args.tabId === 'string'
        ? tabWindow.get(args.tabId)
        : normalMainWindow() || normalWindows()[0];
    if (!isNormal(win)) throw new Error('forbidden');
    if (cmd === 'activate') win.show();
    return askWindow(win, cmd, args);
  }

  function askWindow(win, cmd, args = {}) {
    const reqId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(reqId);
        reject(new Error('browser UI did not respond'));
      }, RENDERER_TIMEOUT_MS);
      pending.set(reqId, { resolve, reject, timer, wcId: win.webContents.id });
      win.webContents.send(C.AUTOMATION_REQUEST, { reqId, cmd, args });
    });
  }

  /** Fail-closed: only a webview hosted by a normal Vio window, on the persist:main session. */
  function getGuest(wcId) {
    const wc = guestWebContentsById(wcId);
    if (!wc || wc.getType() !== 'webview' || !wc.hostWebContents) return null;
    const hostId = wc.hostWebContents.id;
    if (!normalWindows().some((w) => w.webContents.id === hostId)) return null;
    if (wc.session !== session.fromPartition('persist:main')) return null;
    return wc;
  }

  function webContentsExists(wcId) {
    const wc = electronWebContents.fromId(Number(wcId));
    return Boolean(wc && !wc.isDestroyed());
  }

  async function askConsent() {
    const win = normalMainWindow();
    if (!win) return false;
    const r = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Odmów', 'Zezwól'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: 'Soul',
      message: 'Soul chce sterować przeglądarką',
      detail:
        'Soul będzie mógł czytać i klikać strony w zwykłych kartach (bez kart Tor, prywatnych i stron wewnętrznych). Zgoda obowiązuje do ponownego uruchomienia Vio.',
    });
    return r.response === 1;
  }

  /** Soul icon / panel live in every normal window; private / Tor windows never hear about Soul. */
  const toNormalWindows = (channel, payload) => {
    for (const w of normalWindows()) w.webContents.send(channel, payload);
  };

  function isGuestVisible(wc) {
    const win = wc.hostWebContents && BrowserWindow.fromWebContents(wc.hostWebContents);
    return isNormal(win) && win.isVisible() && !win.isMinimized();
  }

  const normalFocused = () => {
    const win = BrowserWindow.getFocusedWindow();
    return appWindows.has(win) && isNormal(win);
  };

  const automation = createAutomation({
    userDataDir: app.getPath('userData'),
    rendererRequest,
    getGuest,
    webContentsExists,
    askConsent,
    vioVersion: app.getVersion(),
    history,
    isGuestVisible,
    getWindowFocus: normalFocused,
    onStatus: (connected) => toNormalWindows(C.AUTOMATION_STATUS_CHANGED, { connected }),
    onSoulState: (s) => toNormalWindows(C.AUTOMATION_SOUL_STATE, s),
    onPanel: (p) => toNormalWindows(C.AUTOMATION_PANEL, p),
  });

  // Guest page events → automation (it drops everything that is not a listed persist:main tab).
  app.on('web-contents-created', (_e, wc) => {
    if (wc.getType() !== 'webview') return;
    wc.on('did-finish-load', () => void automation.guestEvent(wc, 'load'));
    wc.on('media-started-playing', () => void automation.guestEvent(wc, 'media-start'));
    wc.on('media-paused', () => void automation.guestEvent(wc, 'media-stop'));
    wc.on('found-in-page', (_ev, result) => void automation.guestEvent(wc, 'found', result));
  });
  const onFocusChange = () => setImmediate(() => automation.windowFocus(normalFocused()));
  app.on('browser-window-focus', onFocusChange);
  app.on('browser-window-blur', onFocusChange);

  ipcMain.handle(
    C.AUTOMATION_UI_EVENT,
    wrapApp((event, name, data) => {
      // tab / panel events only from normal windows
      if (!isNormal(BrowserWindow.fromWebContents(event.sender))) return { ok: false };
      const n = String(name || '');
      if (n === 'tabActivated' || n === 'tabClosed') automation.tabEvent(n, data);
      else automation.uiEvent(n, data);
      return { ok: true };
    }),
  );
  ipcMain.handle(
    C.AUTOMATION_LOG,
    wrapApp(() => automation.getLog()),
  );

  ipcMain.handle(
    C.AUTOMATION_SET_ENABLED,
    wrapApp(async (_e, enabled) => {
      try {
        return { ok: true, ...(await automation.setEnabled(enabled === true)) };
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err), ...automation.status() };
      }
    }),
  );
  ipcMain.handle(
    C.AUTOMATION_DISCONNECT,
    wrapApp(() => {
      automation.disconnectAll();
      return { ok: true };
    }),
  );
  ipcMain.handle(
    C.AUTOMATION_REPLY,
    wrapApp((event, reqId, result) => {
      const p = pending.get(String(reqId));
      // Only the window we asked may answer.
      if (!p || p.wcId !== event.sender.id) return { ok: false };
      pending.delete(String(reqId));
      clearTimeout(p.timer);
      p.resolve(result);
      return { ok: true };
    }),
  );

  app.on('before-quit', () => {
    void automation.stop();
  });
}

module.exports = { register };
