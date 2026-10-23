'use strict';
// Dev-only: screenshots of home widgets / personalize / edit mode / YouTube light.
// Needs Vite on 127.0.0.1:5173. Stubs weather + metrics IPC so cards render real data.
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
  daily: {
    time: ['2026-10-23', '2026-10-24', '2026-10-25'],
    temperature_2m_max: [16, 13, 12],
    temperature_2m_min: [7, 6, 5],
    weather_code: [2, 3, 61],
  },
};

async function shot(win, name) {
  try {
    win.focus();
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
    nativeTheme.themeSource = 'light';
    let win;
    ipcMain.handle('shell:weather-fetch', () => WEATHER);
    const pushMetrics = () =>
      win?.webContents.send('shell:metrics', {
        system: { cpu: 23, memPercent: 61 },
        tabs: [],
        processes: [],
        ts: Date.now(),
      });
    let timer = null;
    ipcMain.handle('shell:metrics-subscribe-live', () => {
      pushMetrics();
      if (!timer) timer = setInterval(pushMetrics, 1000);
      return { ok: true };
    });
    ipcMain.handle('shell:metrics-subscribe', () => {
      pushMetrics();
      return { ok: true };
    });

    win = new BrowserWindow({
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
        backgroundThrottling: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    await win.loadURL(DEV);
    await sleep(3500);

    await js(
      win,
      `(() => {
        const s = window.__DJXXR_STORE__?.getState?.();
        if (!s) return 'no-store';
        s.patchSettings({
          theme: 'paper',
          pageColorScheme: 'system',
          homeShowClock: true,
          homeShowSearch: true,
          homeShowApps: true,
          homeLayoutLock: false,
          privacyAllowAppNetwork: true,
          homeWidgets: [
            { id: 'w-wx', type: 'weather', size: 'M', anchor: 'left', x: 0, y: 8, settings: { location: 'Warszawa', lat: 52.23, lon: 21.01 } },
            { id: 'w-res', type: 'resources', size: 'M', anchor: 'right', x: 0, y: 8, settings: {} },
            { id: 'w-sp', type: 'spotify', size: 'M', anchor: 'left', x: 0, y: 60, settings: {} },
            { id: 'w-td', type: 'todo', size: 'M', anchor: 'right', x: 0, y: 60, settings: {} },
          ],
        });
        if (s.activeId) s.updateTab(s.activeId, { url: 'about:home', title: 'Nowa karta' });
        return 'ok';
      })()`,
    );
    await sleep(2200);

    const tab = (re) =>
      js(
        win,
        `(() => {
          const btns = [...document.querySelectorAll('.pz-sheet-tabs button, .ui-seg button, .pz-sheet button')];
          const b = btns.find((x) => ${re}.test(x.textContent || ''));
          b?.click();
          return b?.textContent || 'no-tab';
        })()`,
      );

    await js(win, `document.querySelector('.home-fab')?.click(); true`);
    await sleep(1800);
    console.log('widgets tab', await tab('/^\\s*(Widżety|Widgets)\\s*$/i'));
    await sleep(1200);
    await shot(win, 'ui-personalize-widgets');
    console.log('sounds tab', await tab('/^\\s*(Dźwięki|Sounds)\\s*$/i'));
    await sleep(700);
    await shot(win, 'ui-personalize-sounds');

    await js(win, `document.querySelector('.pz-done')?.click(); true`);
    await sleep(1500);
    await shot(win, 'ui-home');

    const layout = await js(
      win,
      `(() => [...document.querySelectorAll('.hw-canvas > .hw-card, .home-dock-item, .home-dock-add')].map((el) => {
        const r = el.getBoundingClientRect();
        return [el.className.split(' ').find((c) => c.startsWith('hw-type-') || c.startsWith('home-dock')) || el.className, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      }))()`,
    );
    console.log('layout', JSON.stringify(layout));

    // Edit mode via Personalize → Widgets → edit on page
    await js(win, `document.querySelector('.home-fab')?.click(); true`);
    await sleep(1800);
    await tab('/^\\s*(Widżety|Widgets)\\s*$/i');
    await sleep(1000);
    console.log('edit btn', await js(win, `(() => { const b = [...document.querySelectorAll('.pz-secondary-btn')].find((x) => /stronie|page/i.test(x.textContent || '')); b?.click(); return b?.textContent || 'none'; })()`));
    await sleep(1800);
    console.log('editing', await js(win, `!!document.querySelector('.home.is-editing-widgets')`));
    await shot(win, 'ui-edit-mode');
    const minus = await js(
      win,
      `(() => [...document.querySelectorAll('.hw-ios-minus')].map((el) => {
        const r = el.getBoundingClientRect();
        const card = el.closest('.hw-card')?.getBoundingClientRect();
        return { l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), cardL: card && Math.round(card.left), cardT: card && Math.round(card.top) };
      }))()`,
    );
    console.log('minus', JSON.stringify(minus));
    await js(win, `document.querySelector('.hw-ios-edit-done')?.click(); true`);
    await sleep(600);

    await js(
      win,
      `(() => {
        const s = window.__DJXXR_STORE__?.getState?.();
        if (s?.activeId) s.updateTab(s.activeId, { url: 'https://www.youtube.com/', title: 'YouTube' });
        return 'ok';
      })()`,
    );
    await sleep(8000);
    const scheme = await js(
      win,
      `(() => {
        const wv = document.querySelector('webview');
        if (!wv) return { err: 'no-webview' };
        return wv.executeJavaScript('matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"', true)
          .catch((e) => String(e));
      })()`,
    );
    console.log('youtube scheme', scheme);
    await shot(win, 'ui-youtube-light');

    if (timer) clearInterval(timer);
    app.quit();
  } catch (err) {
    console.error(err);
    app.exit(1);
  }
});
