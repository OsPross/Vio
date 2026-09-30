/**
 * Expanded home verification captures for Midnight/Paper, sizes, presets, edit, suggest, sheet tabs.
 * Requires Vite on VITE_DEV_SERVER (default http://127.0.0.1:5173).
 *
 * node scripts/capture-home-verify.cjs
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'tmp-verify');
const DEV = process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, img.toPNG());
  console.log('saved', name, img.getSize());
  return file;
}

async function js(win, code) {
  return win.webContents.executeJavaScript(code, true);
}

async function setTheme(win, theme) {
  await js(
    win,
    `(${function (theme) {
      const st = window.__ZUSTAND_STORE__;
      // patch via localStorage + reload is heavy; use React store if exposed
      const root = document.documentElement;
      // Drive theme through UI: open FAB → look tab → theme card
      document.querySelector('.home-fab')?.click();
      return theme;
    }.toString()})(${JSON.stringify(theme)})`,
  );
}

async function patchSettings(win, patch) {
  return js(
    win,
    `(${function (patch) {
      // Find zustand persist key and patch via event on window
      const key = Object.keys(localStorage).find((k) => k.includes('moja-przegladarka'));
      if (!key) return { ok: false, reason: 'no-persist' };
      const raw = JSON.parse(localStorage.getItem(key) || '{}');
      if (!raw.state || !raw.state.settings) return { ok: false, reason: 'no-settings' };
      raw.state.settings = { ...raw.state.settings, ...patch };
      localStorage.setItem(key, JSON.stringify(raw));
      // Soft-apply CSS tokens when theme changes
      if (patch.theme) {
        document.documentElement.dataset.theme = patch.theme;
      }
      // Force store rehydrate if available
      window.dispatchEvent(new Event('storage'));
      return { ok: true, theme: patch.theme || raw.state.settings.theme };
    }.toString()})(${JSON.stringify(patch)})`,
  );
}

async function applyViaStore(win, patch) {
  // Prefer direct store access if any global; else click UI / localStorage + location reload
  const r = await js(
    win,
    `(${function (patch) {
      try {
        // Vite HMR modules sometimes leave store on window in tests — fallback: FAB + DOM
        const buttons = [...document.querySelectorAll('button')];
        return { ok: true, patch };
      } catch (e) {
        return { ok: false, err: String(e) };
      }
    }.toString()})(${JSON.stringify(patch)})`,
  );
  return r;
}

async function openSheetTab(win, idx) {
  await js(win, `document.querySelector('.home-fab')?.click()`);
  await sleep(400);
  await js(
    win,
    `([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][${idx}])?.click()`,
  );
  await sleep(450);
}

async function closeSheet(win) {
  await js(win, `document.querySelector('.pz-sheet-close, .pz-scrim, .pz-sheet-scrim')?.click()`);
  await sleep(300);
  await js(
    win,
    `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`,
  );
  await sleep(200);
}

async function seedTestHistory(win) {
  return js(
    win,
    `(${function () {
      const key = Object.keys(localStorage).find((k) => k.includes('moja-przegladarka'));
      if (!key) return { ok: false };
      const raw = JSON.parse(localStorage.getItem(key) || '{}');
      if (!raw.state) return { ok: false };
      raw.state.history = [
        { q: 'verify-alpha', at: Date.now() },
        { q: 'verify-beta', at: Date.now() - 1000 },
        { q: 'verify-gamma', at: Date.now() - 2000 },
      ];
      const s = raw.state.settings || {};
      s.suggestHistory = true;
      s.theme = 'midnight';
      s.homeShowClock = true;
      s.homeShowDate = true;
      s.homeShowApps = true;
      s.homeShowGreeting = true;
      s.homeLayoutPreset = 'centered';
      s.homeAlign = 'center';
      s.homeLayout = 'dashboard';
      s.homeWidgetStyle = 'glass';
      s.homeChrome = [
        { id: 'clock', anchor: 'center', x: 0, y: 8 },
        { id: 'search', anchor: 'center', x: 0, y: 31 },
        { id: 'shortcuts', anchor: 'center', x: 0, y: 44 },
      ];
      s.homeWidgets = [
        {
          id: 'w-weather-verify',
          type: 'weather',
          size: 'M',
          anchor: 'center',
          x: 0,
          y: 60,
          settings: {},
        },
      ];
      raw.state.settings = s;
      localStorage.setItem(key, JSON.stringify(raw));
      return { ok: true };
    }.toString()})()`,
  );
}

async function reloadHome(win) {
  await win.webContents.reload();
  await waitForHome(win);
  await sleep(400);
}

async function measureChromeCenters(win) {
  return js(
    win,
    `(${function () {
      const canvas = document.querySelector('.hw-canvas');
      if (!canvas) return { ok: false, reason: 'no-canvas' };
      const cw = canvas.offsetWidth;
      const cards = [...document.querySelectorAll('.hw-card.hw-place-center')];
      const items = cards.map((el) => {
        const r = el.getBoundingClientRect();
        const cr = canvas.getBoundingClientRect();
        const left = r.left - cr.left;
        const width = r.width;
        return {
          cls: el.className,
          center: left + width / 2,
          canvasMid: cw / 2,
          delta: Math.abs(left + width / 2 - cw / 2),
        };
      });
      return { ok: true, cw, items };
    }.toString()})()`,
  );
}

async function waitForHome(win) {
  for (let i = 0; i < 50; i++) {
    try {
      const ready = await js(win, `!!document.querySelector('.home .hw-canvas, .home .hw-strip')`);
      if (ready) return true;
    } catch {
      /* navigating */
    }
    await sleep(200);
  }
  return false;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const report = { shots: [], probes: {} };

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#08090c',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
    },
  });

  await win.loadURL(DEV);
  await waitForHome(win);
  await seedTestHistory(win);
  await reloadHome(win);
  win.showInactive();
  await sleep(400);

  // --- First paint vs +500ms (no jump) ---
  const first = await measureChromeCenters(win);
  report.shots.push(await shot(win, '10-first-frame-1280-midnight'));
  await sleep(500);
  const after500 = await measureChromeCenters(win);
  report.probes.firstPaint = { first, after500 };
  report.shots.push(await shot(win, '11-after-500ms-1280-midnight'));

  // Greeting off / clock off
  await patchSettings(win, { homeShowGreeting: false });
  await reloadHome(win);
  report.shots.push(await shot(win, '12-greeting-off'));

  await patchSettings(win, { homeShowClock: false, homeShowDate: false, homeShowGreeting: false });
  await reloadHome(win);
  report.shots.push(await shot(win, '13-clock-off'));

  // Restore chrome
  await seedTestHistory(win);
  await reloadHome(win);

  // Presets via localStorage
  for (const [preset, name] of [
    ['centered', '20-preset-centered'],
    ['top', '21-preset-top'],
    ['left', '22-preset-left'],
    ['custom', '23-preset-custom'],
  ]) {
    await js(
      win,
      `(${function (preset) {
        const key = Object.keys(localStorage).find((k) => k.includes('moja-przegladarka'));
        const raw = JSON.parse(localStorage.getItem(key) || '{}');
        const s = raw.state.settings;
        if (preset === 'centered') {
          s.homeLayoutPreset = 'centered';
          s.homeAlign = 'center';
          s.homeLayout = 'dashboard';
          s.homeShowClock = true;
          s.homeShowApps = true;
          s.homeShowGreeting = true;
          s.homeChrome = [
            { id: 'clock', anchor: 'center', x: 0, y: 8 },
            { id: 'search', anchor: 'center', x: 0, y: 31 },
            { id: 'shortcuts', anchor: 'center', x: 0, y: 44 },
          ];
        } else if (preset === 'top') {
          s.homeLayoutPreset = 'top';
          s.homeLayout = 'minimal';
          s.homeShowClock = false;
          s.homeShowApps = false;
          s.homeShowGreeting = false;
          s.homeChrome = [
            { id: 'clock', anchor: 'center', x: 0, y: 8 },
            { id: 'search', anchor: 'center', x: 0, y: 6 },
            { id: 'shortcuts', anchor: 'center', x: 0, y: 20 },
          ];
        } else if (preset === 'left') {
          s.homeLayoutPreset = 'left';
          s.homeAlign = 'left';
          s.homeLayout = 'stack';
          s.homeShowClock = true;
          s.homeShowApps = true;
          s.homeChrome = [
            { id: 'clock', anchor: 'left', x: 35, y: 8 },
            { id: 'search', anchor: 'left', x: 40, y: 31 },
            { id: 'shortcuts', anchor: 'left', x: 40, y: 44 },
          ];
        } else {
          s.homeLayoutPreset = 'custom';
        }
        localStorage.setItem(key, JSON.stringify(raw));
        return true;
      }.toString()})(${JSON.stringify(preset)})`,
    );
    await reloadHome(win);
    report.shots.push(await shot(win, name));
  }

  // Edit mode + gear
  await seedTestHistory(win);
  await reloadHome(win);
  await openSheetTab(win, 2);
  await js(
    win,
    `([...document.querySelectorAll('button')].find(b=>(b.textContent||'').includes('Edytuj układ')))?.click()`,
  );
  await sleep(800);
  report.shots.push(await shot(win, '30-edit-mode'));
  await js(
    win,
    `document.querySelector('.hw-card.editable .hw-icon-btn')?.click()`,
  );
  await sleep(400);
  report.shots.push(await shot(win, '31-gear-popover'));

  // Suggest with test history
  await js(win, `document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(200);
  await js(
    win,
    `(${function () {
      const key = Object.keys(localStorage).find((k) => k.includes('moja-przegladarka'));
      const raw = JSON.parse(localStorage.getItem(key) || '{}');
      if (raw.state) {
        raw.state.history = [
          { q: 'verify-alpha', at: Date.now() },
          { q: 'verify-beta', at: Date.now() - 1 },
        ];
        raw.state.settings.suggestHistory = true;
        localStorage.setItem(key, JSON.stringify(raw));
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    }.toString()})()`,
  );
  await reloadHome(win);
  win.showInactive();
  await js(
    win,
    `(() => {
      const input = document.querySelector('.home-search input');
      if (!input) return false;
      input.click();
      input.focus();
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      return true;
    })()`,
  );
  await sleep(500);
  report.shots.push(await shot(win, '40-suggest-history'));
  report.probes.suggest = await js(win, `!!document.querySelector('.home-suggest-portal')`);

  // Sheet tabs
  for (const [idx, name] of [
    [0, '50-sheet-look'],
    [1, '51-sheet-layout'],
    [2, '52-sheet-widgets'],
    [3, '53-sheet-clock'],
  ]) {
    await openSheetTab(win, idx);
    report.shots.push(await shot(win, name));
  }
  await closeSheet(win);

  // Resize jump check: 1280 → sidebar-ish width via setSize
  const beforeSidebar = await measureChromeCenters(win);
  report.shots.push(await shot(win, '60-sidebar-closed'));
  win.setSize(1100, 800);
  await sleep(400);
  const afterSidebar = await measureChromeCenters(win);
  report.shots.push(await shot(win, '61-sidebar-open-narrow'));
  report.probes.sidebar = { beforeSidebar, afterSidebar };
  win.setSize(1280, 800);
  await sleep(400);

  // 1920×1080
  win.setSize(1920, 1080);
  await sleep(500);
  report.shots.push(await shot(win, '70-1920-midnight'));

  // Paper theme
  await patchSettings(win, { theme: 'paper' });
  await reloadHome(win);
  win.setSize(1280, 800);
  await sleep(300);
  report.shots.push(await shot(win, '80-1280-paper'));
  win.setSize(1920, 1080);
  await sleep(400);
  report.shots.push(await shot(win, '81-1920-paper'));

  // Clock styles in sheet
  await openSheetTab(win, 3);
  report.shots.push(await shot(win, '90-clock-style-cards'));

  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('report', path.join(OUT, 'report.json'));
  console.log('probes', JSON.stringify(report.probes, null, 2));

  app.quit();
});
