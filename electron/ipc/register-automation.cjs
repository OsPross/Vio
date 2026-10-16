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
    windowMode,
  } = deps;

  /** @type {Map<string, {resolve:Function, reject:Function, timer:NodeJS.Timeout}>} */
  const pending = new Map();

  function normalMainWindow() {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return null;
    return windowMode.getWindowMeta(win).mode === 'normal' ? win : null;
  }

  function rendererRequest(cmd, args = {}) {
    const win = normalMainWindow();
    if (!win) return Promise.resolve({ tabs: [], activeId: '' });
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

  /** Fail-closed: only a webview hosted by the normal main window, on the persist:main session. */
  function getGuest(wcId) {
    const win = normalMainWindow();
    const wc = guestWebContentsById(wcId);
    if (!win || !wc || wc.getType() !== 'webview') return null;
    if (!wc.hostWebContents || wc.hostWebContents.id !== win.webContents.id) return null;
    if (wc.session !== session.fromPartition('persist:main')) return null;
    return wc;
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

  const automation = createAutomation({
    userDataDir: app.getPath('userData'),
    rendererRequest,
    getGuest,
    askConsent,
    onStatus: (connected) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed())
        win.webContents.send(C.AUTOMATION_STATUS_CHANGED, { connected });
    },
  });

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
