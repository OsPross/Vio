'use strict';

const C = require('./channels.cjs');

/**
 * Window / tab / session / page chrome IPC.
 * @param {object} deps
 */
function register(deps) {
  const {
    ipcMain,
    wrapApp,
    app,
    BrowserWindow,
    nativeTheme,
    dialog,
    createWindow,
    getMainWindow,
    windowMode,
    appSession,
    guestWebContentsById,
    pip,
    certificate,
    suggestedSaveName,
    wvPreloadPath,
  } = deps;

  ipcMain.handle(
    C.NEW_WINDOW,
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
    C.WINDOW_BOOT_GET,
    wrapApp((event) => {
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
    C.WINDOW_CLOSING_ACK,
    wrapApp((event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.__djxxrClosingAck = true;
        win.destroy();
      }
      return { ok: true };
    }),
  );

  ipcMain.handle(
    C.QUIT,
    wrapApp(() => {
      app.quit();
      return { ok: true };
    }),
  );

  ipcMain.handle(
    C.WINDOW_TOGGLE_FULLSCREEN,
    wrapApp((event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win || win.isDestroyed()) return { ok: false };
      win.setFullScreen(!win.isFullScreen());
      return { ok: true, fullScreen: win.isFullScreen() };
    }),
  );

  ipcMain.handle(C.SESSION_LOAD, wrapApp(() => appSession.load()));
  ipcMain.handle(C.SESSION_STATUS, wrapApp(() => appSession.getStatus()));
  ipcMain.handle(
    C.SESSION_SAVE,
    wrapApp((_e, snapshot) =>
      appSession.saveSnapshot(snapshot && typeof snapshot === 'object' ? snapshot : {}),
    ),
  );
  ipcMain.handle(C.SESSION_CLEAR, wrapApp(() => appSession.clearSession()));
  ipcMain.handle(C.SESSION_DISMISS_CRASH, wrapApp(() => appSession.dismissCrashOffer()));
  ipcMain.handle(C.SESSION_MARK_CLEAN, wrapApp(() => appSession.markCleanExit()));
  ipcMain.handle(
    C.SESSION_PUSH_CLOSED_WINDOW,
    wrapApp((_e, tabs) => appSession.pushClosedWindow(tabs)),
  );
  ipcMain.handle(C.SESSION_POP_CLOSED_WINDOW, wrapApp(() => appSession.popClosedWindow()));
  ipcMain.handle(
    C.SESSION_NAV_HISTORY,
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
    C.SET_NATIVE_THEME,
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
    C.SET_TITLEBAR,
    wrapApp((_e, opts) => {
      const mainWindow = getMainWindow();
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

  ipcMain.handle(
    C.WEBVIEW_PRELOAD,
    wrapApp(() => wvPreloadPath),
  );

  ipcMain.handle(
    C.PICTURE_IN_PICTURE,
    wrapApp(async (_event, webContentsId, opts) => {
      const wc = guestWebContentsById(webContentsId);
      if (!wc) return { ok: false, error: 'no-guest' };
      return pip.runPictureInPicture(wc, {
        enterOnly: Boolean(opts && opts.enterOnly),
      });
    }),
  );

  ipcMain.handle(
    C.PRINT,
    wrapApp(async (_event, webContentsId, opts) => {
      const wc = guestWebContentsById(webContentsId);
      if (!wc) return { ok: false, error: 'no-guest' };
      const silent = Boolean(opts && opts.silent);
      try {
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
    C.SAVE_PAGE,
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
    C.PRINT_TO_PDF,
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
    C.CERTIFICATE_RESPOND,
    wrapApp((_e, webContentsId, proceed, rememberHost) => {
      const id = Number(webContentsId);
      const res = certificate.respond(id, Boolean(proceed), Boolean(rememberHost));
      certificate.clearPendingHost(id);
      return res;
    }),
  );
}

module.exports = { register };
