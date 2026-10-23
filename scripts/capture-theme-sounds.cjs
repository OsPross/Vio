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
    // Light pages for YouTube / Google when Vio is Paper
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
          pageColorScheme: 'system',
          uiSoundsEnabled: true,
          soundProfile: 'ios',
          soundVolume: 60,
          soundTyping: true,
          soundTabs: true,
          soundUi: true,
          soundDownloads: true,
          sidePanelOpen: false,
        };
        localStorage.setItem(key, JSON.stringify(raw));
        return true;
      })()`,
    );
    await win.reload();
    await sleep(3500);

    // Settings → Wygląd (sounds section)
    await js(
      win,
      `(() => {
        const st = window.__DJXXR_STORE__;
        const s = st?.getState?.();
        if (s) {
          s.patchSettings({
            theme: 'paper',
            pageColorScheme: 'system',
            uiSoundsEnabled: true,
            soundProfile: 'ios',
            soundVolume: 60,
          });
          s.setView?.('settings');
          s.setSettingsTab?.('look');
        }
        return !!s;
      })()`,
    );
    await sleep(1500);
    await js(
      win,
      `(() => {
        const el = document.querySelector('.sg-label');
        const sounds = [...document.querySelectorAll('.sg-label')].find((n) =>
          /Dźwięki|Interface sounds|Sounds/i.test(n.textContent || ''),
        );
        sounds?.scrollIntoView({ block: 'center' });
        return sounds?.textContent || 'no-sounds-label';
      })()`,
    );
    await sleep(600);
    await shot(win, 'theme-sounds-settings');

    // YouTube in light scheme
    await js(
      win,
      `(() => {
        const st = window.__DJXXR_STORE__;
        const s = st?.getState?.();
        if (!s) return 'no-store';
        s.setView?.('browser');
        s.patchSettings({ theme: 'paper', pageColorScheme: 'system' });
        if (s.activeId) {
          s.updateTab(s.activeId, { url: 'https://www.youtube.com/', title: 'YouTube' });
        } else {
          s.newTab?.('https://www.youtube.com/');
        }
        return 'ok';
      })()`,
    );
    await sleep(8000);
    const scheme = await js(
      win,
      `(() => {
        const wv = document.querySelector('webview');
        if (!wv) return { err: 'no-webview' };
        return wv.executeJavaScript(
          '({ scheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light", bg: getComputedStyle(document.documentElement).backgroundColor })',
          true,
        ).catch((e) => ({ err: String(e) }));
      })()`,
    );
    console.log('youtube scheme', scheme);
    await shot(win, 'theme-youtube-light');

    app.quit();
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
