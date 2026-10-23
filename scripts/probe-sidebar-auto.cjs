'use strict';
// Dev-only: sidebar docked ("on") + auto (closed / edge hover) in light + dark. Needs Vite on :5173.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'tmp-verify');
const DEV = process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
  win.webContents.invalidate();
  await sleep(400);
  await win.webContents.capturePage().catch(() => null);
  win.webContents.invalidate();
  await sleep(300);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
  console.log('saved', name);
}

const js = (win, code) => win.webContents.executeJavaScript(code, true);
const geo = `(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; };
  return JSON.stringify({ host: r('.sidebar-ctx-host'), shell: r('.sidebar-ctx-host > .side-shell'), stage: r('.stage'), tabs: r('.tabs') });
})()`;

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    const win = new BrowserWindow({
      width: 1360,
      height: 900,
      show: true,
      webPreferences: {
        preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
        contextIsolation: true,
        sandbox: true,
        webviewTag: true,
        backgroundThrottling: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    await win.loadURL(DEV);
    await sleep(3500);
    for (const theme of (process.env.THEMES || 'paper,midnight').split(',')) {
      await js(win, `window.__DJXXR_STORE__.getState().patchSettings({ sidebarMode: 'on', sidePanelOpen: false, theme: '${theme}' }); true`);
      await sleep(1200);
      console.log(theme, 'docked', await js(win, geo));
      await shot(win, `sidebar-docked-${theme}`);

      await js(win, `window.__DJXXR_STORE__.getState().patchSettings({ sidebarMode: 'auto' }); true`);
      await sleep(900);
      console.log(theme, 'auto-closed', await js(win, geo));
      await shot(win, `sidebar-auto-closed-${theme}`);
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 600, y: 400 });
      await sleep(100);
      for (let x = 40; x >= 2; x -= 6) {
        win.webContents.sendInputEvent({ type: 'mouseMove', x, y: 400 });
        await sleep(40);
      }
      await sleep(900);
      console.log(theme, 'auto-open', await js(win, geo));
      await shot(win, `sidebar-auto-open-${theme}`);
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 700, y: 400 });
      await sleep(900);
    }
    app.quit();
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
