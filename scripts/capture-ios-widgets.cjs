'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'tmp-verify');
const DEV = process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
  try {
    if (win.isMinimized()) win.restore();
    win.focus();
    await sleep(200);
    const img = await win.webContents.capturePage();
    const buf = img.toPNG();
    fs.writeFileSync(path.join(OUT, `${name}.png`), buf);
    console.log('saved', name, img.getSize(), buf.length);
  } catch (err) {
    console.error('shot failed', name, err && err.message);
  }
}

async function js(win, code) {
  return win.webContents.executeJavaScript(code, true);
}

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    const win = new BrowserWindow({
      width: 1360,
      height: 900,
      show: true,
      backgroundColor: '#F3F3F7',
      webPreferences: {
        preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: true,
      },
    });
    await win.loadURL(DEV);
    await sleep(3500);

    await js(
      win,
      `(() => {
        const key = Object.keys(localStorage).find((k) => k.includes('moja-przegladarka')) || 'moja-przegladarka-v8';
        let raw = {};
        try { raw = JSON.parse(localStorage.getItem(key) || '{}'); } catch { raw = {}; }
        if (!raw.state) raw.state = {};
        if (!raw.state.settings) raw.state.settings = {};
        raw.state.settings = {
          ...raw.state.settings,
          theme: 'paper',
          uiGlass: true,
          uiMotion: true,
          sidebarMode: 'on',
          showSidebar: true,
          sidePanelOpen: false,
          homeLayoutLock: false,
          bgStyle: 'soft',
          homeWidgets: [
            { id: 'w-wx', type: 'weather', size: 'M', anchor: 'nw', x: 24, y: 80, settings: { location: 'Warszawa', lat: 52.23, lon: 21.01 } },
            { id: 'w-res', type: 'resources', size: 'M', anchor: 'ne', x: 24, y: 80, settings: {} },
            { id: 'w-sp', type: 'spotify', size: 'M', anchor: 'sw', x: 24, y: 24, settings: {} },
            { id: 'w-td', type: 'todo', size: 'M', anchor: 'se', x: 24, y: 24, settings: {} },
          ],
          homeTodos: [
            { id: 't1', text: 'Sprawdzić Vio', done: false },
            { id: 't2', text: 'Kupić kawę', done: true },
          ],
        };
        localStorage.setItem(key, JSON.stringify(raw));
        return true;
      })()`,
    );
    await win.reload();
    await sleep(3500);

    await js(
      win,
      `(() => {
        const st = window.__DJXXR_STORE__;
        const s = st?.getState?.();
        if (!s) return 'no';
        s.patchSettings({
          theme: 'paper',
          uiGlass: true,
          homeLayoutLock: false,
          homeWidgets: [
            { id: 'w-wx', type: 'weather', size: 'M', anchor: 'nw', x: 24, y: 90, settings: { location: 'Warszawa', lat: 52.23, lon: 21.01 } },
            { id: 'w-res', type: 'resources', size: 'M', anchor: 'ne', x: 24, y: 90, settings: {} },
            { id: 'w-sp', type: 'spotify', size: 'M', anchor: 'sw', x: 24, y: 28, settings: {} },
            { id: 'w-td', type: 'todo', size: 'M', anchor: 'se', x: 24, y: 28, settings: {} },
          ],
        });
        if (s.activeId) s.updateTab(s.activeId, { url: 'about:home', title: 'Nowa karta' });
        return 'ok';
      })()`,
    );
    await sleep(2000);

    await js(
      win,
      `(() => {
        document.querySelector('.home-fab')?.click();
        return !!document.querySelector('.is-editing-widgets, .hw-ios-edit-capsule');
      })()`,
    );
    await sleep(1000);
    await shot(win, 'ios-widgets-edit');

    await js(
      win,
      `(() => {
        document.querySelector('.hw-ios-edit-add')?.click();
        return !!document.querySelector('.hw-gallery-ios');
      })()`,
    );
    await sleep(1000);
    await shot(win, 'ios-widgets-gallery');

    await js(
      win,
      `(() => {
        document.querySelector('.hw-gallery-scrim')?.click();
        document.querySelector('.hw-ios-edit-done')?.click();
        return true;
      })()`,
    );
    await sleep(1200);
    await shot(win, 'ios-widgets-home');
  } catch (e) {
    console.error(e);
  } finally {
    app.quit();
  }
});
