'use strict';
// Dev-only: widget card styles (transparent / glass / solid) + Personalize tiles + auto sidebar vs widgets.
// Needs Vite on :5173.
const { app, BrowserWindow, ipcMain } = require('electron');
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
const sidebarHits = `(() => {
  const s = document.querySelector('.sidebar-ctx-host > .side-shell')?.getBoundingClientRect();
  const cards = [...document.querySelectorAll('.hw-canvas > .hw-card:not(.hw-chrome)')].map((e) => e.getBoundingClientRect());
  if (!s || s.width < 2) return 'sidebar closed';
  return JSON.stringify({ shellRight: Math.round(s.right), cardLefts: cards.map((c) => Math.round(c.left)), hits: cards.filter((c) => c.left < s.right && c.top < s.bottom && c.bottom > s.top).length });
})()`;

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    ipcMain.handle('shell:weather-fetch', () => ({
      ok: true,
      place: { name: 'Warszawa', country: 'Polska', lat: 52.23, lon: 21.01 },
      current: { temperature_2m: 14, weather_code: 2, wind_speed_10m: 10, relative_humidity_2m: 60 },
      daily: { time: ['2026-10-23'], temperature_2m_max: [16], temperature_2m_min: [7], weather_code: [2] },
    }));
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
    await js(
      win,
      `window.__DJXXR_STORE__.getState().patchSettings({
        theme: 'paper', sidebarMode: 'auto', bgStyle: 'mesh',
        homeWidgets: [
          { id: 'w-wx', type: 'weather', size: 'M', anchor: 'left', x: 0, y: 8, settings: { location: 'Warszawa', lat: 52.23, lon: 21.01 } },
          { id: 'w-res', type: 'resources', size: 'M', anchor: 'right', x: 0, y: 8, settings: {} },
          { id: 'w-td', type: 'todo', size: 'M', anchor: 'left', x: 0, y: 60, settings: {} },
        ],
      }); true`,
    );
    await sleep(1200);
    for (const style of ['transparent', 'glass', 'solid']) {
      await js(win, `window.__DJXXR_STORE__.getState().patchSettings({ homeWidgetStyle: '${style}' }); true`);
      await sleep(700);
      await shot(win, `wstyle-${style}`);
    }
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 600, y: 400 });
    await sleep(150);
    for (let x = 40; x >= 2; x -= 6) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x, y: 400 });
      await sleep(40);
    }
    await sleep(1000);
    console.log('auto sidebar vs widgets', await js(win, sidebarHits));
    await shot(win, 'wstyle-auto-sidebar');
    win.webContents.sendInputEvent({ type: 'mouseMove', x: 700, y: 400 });
    await sleep(800);

    await js(win, `document.querySelector('.home-fab')?.click(); true`);
    await sleep(1200);
    await js(win, `[...document.querySelectorAll('.pz-studio-tabs button')].find((b) => b.textContent.trim() === 'Widżety')?.click(); true`);
    await sleep(900);
    await shot(win, 'wstyle-panel');
    app.quit();
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
