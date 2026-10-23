'use strict';
// Dev-only: screenshots of the floating Personalize panel (4 tabs × light/dark) over the real home.
// Needs Vite on 127.0.0.1:5173. Stubs weather + metrics IPC so widgets render real content.
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'tmp-verify');
const DEV = process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WEATHER = {
  ok: true,
  place: { name: 'Warszawa', country: 'Polska', admin1: 'Mazowieckie', lat: 52.23, lon: 21.01 },
  current: { temperature_2m: 14, weather_code: 2, wind_speed_10m: 10, relative_humidity_2m: 60 },
  daily: { time: ['2026-10-23'], temperature_2m_max: [16], temperature_2m_min: [7], weather_code: [2] },
};

async function shot(win, name) {
  try {
    win.webContents.invalidate();
    await sleep(500);
    await win.webContents.capturePage().catch(() => null);
    win.webContents.invalidate();
    await sleep(400);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
    console.log('saved', name);
  } catch (err) {
    console.error('shot failed', name, err && err.message);
  }
}

const js = (win, code) => win.webContents.executeJavaScript(code, true);

app.whenReady().then(async () => {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    let win;
    ipcMain.handle('shell:weather-fetch', () => WEATHER);
    ipcMain.handle('shell:set-native-theme', (_e, src) => {
      nativeTheme.themeSource = src;
      return { ok: true };
    });
    const pushMetrics = () =>
      win?.webContents.send('shell:metrics', { system: { cpu: 23, memPercent: 61 }, tabs: [], processes: [], ts: Date.now() });
    let timer = null;
    ipcMain.handle('shell:metrics-subscribe-live', () => {
      pushMetrics();
      if (!timer) timer = setInterval(pushMetrics, 1000);
      return { ok: true };
    });

    win = new BrowserWindow({
      width: 1360,
      height: 900,
      show: true,
      webPreferences: {
        preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: true,
        backgroundThrottling: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    await win.loadURL(DEV);
    await sleep(3500);

    const setup = (theme) =>
      js(
        win,
        `(() => {
          const s = window.__DJXXR_STORE__?.getState?.();
          if (!s) return 'no-store';
          s.patchSettings({
            theme: '${theme}',
            useThemeAccent: true,
            pageColorScheme: 'system',
            bgStyle: 'soft',
            homeShowClock: true,
            homeShowSearch: true,
            homeShowApps: true,
            privacyAllowAppNetwork: true,
            uiSoundsEnabled: true,
            homeWidgets: [
              { id: 'w-wx', type: 'weather', size: 'M', anchor: 'left', x: 0, y: 8, settings: { location: 'Warszawa', lat: 52.23, lon: 21.01 } },
              { id: 'w-res', type: 'resources', size: 'M', anchor: 'right', x: 0, y: 8, settings: {} },
              { id: 'w-td', type: 'todo', size: 'M', anchor: 'left', x: 0, y: 60, settings: {} },
            ],
          });
          if (s.activeId) s.updateTab(s.activeId, { url: 'about:home', title: 'Nowa karta' });
          return 'ok';
        })()`,
      );

    const tab = (label) =>
      js(
        win,
        `(() => {
          const b = [...document.querySelectorAll('.pz-studio-tabs button')].find((x) => x.textContent.trim() === '${label}');
          b?.click();
          return b ? 'ok' : 'no-tab';
        })()`,
      );

    for (const [theme, suffix] of [
      ['paper', 'light'],
      ['midnight', 'dark'],
    ]) {
      await setup(theme);
      await sleep(1800);
      if (!(await js(win, `!!document.querySelector('.pz-studio')`))) {
        await js(win, `document.querySelector('.home-fab')?.click(); true`);
        await sleep(1200);
      }
      const geo = await js(
        win,
        `(() => { const r = document.querySelector('.pz-studio')?.getBoundingClientRect(); return r && [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.bottom)]; })()`,
      );
      console.log('panel', suffix, JSON.stringify(geo));
      for (const [label, id] of [
        ['Wygląd', 'look'],
        ['Widżety', 'widgets'],
        ['Układ', 'layout'],
        ['Dźwięki', 'sounds'],
      ]) {
        console.log('tab', label, await tab(label));
        await sleep(900);
        await shot(win, `pz-${suffix}-${id}`);
      }
    }

    if (timer) clearInterval(timer);
    app.quit();
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
