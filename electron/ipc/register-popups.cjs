'use strict';

const C = require('./channels.cjs');

function register(deps) {
  const { ipcMain, wrapApp, electronWebContents, BrowserWindow } = deps;

  ipcMain.handle(
    C.POPUP_ALLOW,
    wrapApp((_e, origin) => {
      const popups = require('../popups.cjs');
      const o = String(origin || '');
      if (o) popups.allowPopupsForOrigin(o);
      return { ok: true, origin: o };
    }),
  );

  ipcMain.handle(
    C.POPUP_OPEN_ALLOWED,
    wrapApp((event, url, webContentsId) => {
      const popups = require('../popups.cjs');
      const u = String(url || '');
      if (!/^https?:/i.test(u) && u !== 'about:blank') return { ok: false, reason: 'url' };
      let opener = null;
      try {
        opener = electronWebContents.fromId(Number(webContentsId));
      } catch {
        opener = null;
      }
      if (!opener || opener.isDestroyed()) {
        event.sender.send(C.OPEN_URL, { url: u });
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
        const child = new BrowserWindow({
          width: 520,
          height: 680,
          autoHideMenuBar: true,
          title: 'Vio',
          webPreferences: {
            session: opener.session,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webviewTag: false,
            nativeWindowOpen: true,
          },
        });
        try {
          const uaChrome = require('../ua-chrome.cjs');
          void uaChrome.applyToWebContents(child.webContents, { tor: false });
          const googleLogin = require('../google-login.cjs');
          googleLogin.attachGoogleAccountsHardening(child.webContents, { torMode: false });
          if (googleLogin.isGoogleAccountsUrl(u)) {
            googleLogin.pauseSessionPreloads(child.webContents.session);
          }
        } catch (e) {
          console.warn('[popup] ua/google harden', e);
        }
        void child.loadURL(u);
        console.log('[popup] manual allow open', u.slice(0, 120));
        return { ok: true, via: 'window' };
      } catch (err) {
        console.warn('[popup] open-allowed', err);
        event.sender.send(C.OPEN_URL, { url: u });
        return { ok: true, via: 'tab-fallback' };
      }
    }),
  );
}

module.exports = { register };
