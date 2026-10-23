'use strict';
const { app, BrowserWindow, nativeTheme } = require('electron');
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
    nativeTheme.themeSource = 'light';

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
    await sleep(3200);

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
          pageColorScheme: 'system',
          uiGlass: true,
          homeShowClock: true,
          homeShowSearch: true,
          homeShowApps: true,
          homeLayoutLock: false,
          sidePanelOpen: false,
          homeWidgets: [
            { id: 'w-wx', type: 'weather', size: 'M', anchor: 'nw', x: 24, y: 90, settings: { location: 'Warszawa', lat: 52.23, lon: 21.01 } },
            { id: 'w-res', type: 'resources', size: 'M', anchor: 'ne', x: 24, y: 90, settings: {} },
            { id: 'w-sp', type: 'spotify', size: 'M', anchor: 'sw', x: 24, y: 28, settings: {} },
            { id: 'w-td', type: 'todo', size: 'M', anchor: 'se', x: 24, y: 28, settings: {} },
          ],
          uiSoundsEnabled: true,
          soundProfile: 'ios',
          soundVolume: 55,
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
        const s = window.__DJXXR_STORE__?.getState?.();
        if (!s) return 'no';
        s.patchSettings({
          theme: 'paper',
          pageColorScheme: 'system',
          homeShowSearch: true,
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
    await sleep(1800);

    // Full personalize sheet → Sounds tab (home shot after Done — avoids early capture race)
    await js(win, `document.querySelector('.home-fab')?.click(); true`);
    await sleep(900);
    const sheetOpen = await js(win, `!!document.querySelector('.pz-sheet')`);
    console.log('sheet open', sheetOpen);
    await js(
      win,
      `(() => {
        const btns = [...document.querySelectorAll('.pz-sheet-tabs button, .ui-seg button')];
        const sounds = btns.find((b) => /Dźwięki|Sounds/i.test(b.textContent || ''));
        sounds?.click();
        return sounds?.textContent || 'no-tab';
      })()`,
    );
    await sleep(700);
    await shot(win, 'fix-personalize-sounds');

    await js(win, `document.querySelector('.pz-done')?.click(); true`);
    await sleep(800);
    await shot(win, 'fix-home');

    // YouTube light
    await js(
      win,
      `(() => {
        const s = window.__DJXXR_STORE__?.getState?.();
        s?.patchSettings({ theme: 'paper', pageColorScheme: 'system' });
        if (s?.activeId) s.updateTab(s.activeId, { url: 'https://www.youtube.com/', title: 'YouTube' });
        return 'ok';
      })()`,
    );
    await sleep(7500);
    const scheme = await js(
      win,
      `(() => {
        const wv = document.querySelector('webview');
        if (!wv) return { err: 'no-webview' };
        return wv.executeJavaScript(
          '({ scheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" })',
          true,
        ).catch((e) => ({ err: String(e) }));
      })()`,
    );
    console.log('youtube scheme', scheme);
    await shot(win, 'fix-youtube-light');

    app.quit();
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
