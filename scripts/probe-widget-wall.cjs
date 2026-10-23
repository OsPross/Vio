'use strict';
// Dev-only: "center all" + window resize — widgets must stay off clock/search/shortcuts. Needs Vite on :5173.
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
const overlaps = `(() => {
  const box = (e) => e.getBoundingClientRect();
  const chrome = [...document.querySelectorAll('.hw-canvas > .hw-chrome')].map(box);
  const cards = [...document.querySelectorAll('.hw-canvas > .hw-card:not(.hw-chrome)')].map(box);
  const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  let bad = 0;
  cards.forEach((c, i) => { chrome.forEach((w) => { if (hit(c, w)) bad++; }); cards.slice(0, i).forEach((o) => { if (hit(c, o)) bad++; }); });
  return JSON.stringify({ mode: document.querySelector('.hw-strip') ? 'strip' : 'canvas', cards: cards.length, overlaps: bad,
    pos: cards.map((c) => [Math.round(c.left), Math.round(c.top)]) });
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
    // Same coords as "Wyśrodkuj wszystkie elementy" (layoutWidgetsInCenteredRow for 3 × M)
    await js(
      win,
      `window.__DJXXR_STORE__.getState().patchSettings({
        sidebarMode: 'on', theme: 'paper', homeShowClock: true, homeShowSearch: true, homeShowApps: true,
        homeLayoutPreset: 'centered', homeAlign: 'center', homeLayout: 'dashboard',
        homeChrome: [{ id: 'clock', anchor: 'center', x: 0, y: 8 }, { id: 'search', anchor: 'center', x: 0, y: 31 }, { id: 'shortcuts', anchor: 'center', x: 0, y: 44 }],
        homeWidgets: [
          { id: 'w-wx', type: 'weather', size: 'M', anchor: 'center', x: -41, y: 60, settings: { location: 'Warszawa', lat: 52.23, lon: 21.01 } },
          { id: 'w-res', type: 'resources', size: 'M', anchor: 'center', x: 0, y: 60, settings: {} },
          { id: 'w-td', type: 'todo', size: 'M', anchor: 'center', x: 41, y: 60, settings: {} },
        ],
      }); true`,
    );
    for (const [w, h] of [
      [1360, 900],
      [1360, 720],
      [1180, 700],
      [1000, 700],
      [1360, 900],
    ]) {
      win.setSize(w, h);
      await sleep(1100);
      console.log(`${w}x${h}`, await js(win, overlaps));
      await shot(win, `wall-${w}x${h}`);
    }
    app.quit();
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
