'use strict';
// Dev-only DOM probe: measures home chrome / widget boxes in a bare Electron window.
const { app, BrowserWindow } = require('electron');
const path = require('path');

const DEV = process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    show: true,
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
  await win.webContents.executeJavaScript(`(() => {
    const s = window.__DJXXR_STORE__?.getState?.();
    s?.patchSettings({
      theme: 'paper',
      homeShowSearch: true,
      homeShowApps: true,
      homeWidgets: [
        { id: 'w-wx', type: 'weather', size: 'M', anchor: 'left', x: 0, y: 6, settings: { location: 'Warszawa' } },
        { id: 'w-res', type: 'resources', size: 'M', anchor: 'right', x: 0, y: 6, settings: {} },
        { id: 'w-sp', type: 'spotify', size: 'M', anchor: 'left', x: 0, y: 40, settings: {} },
        { id: 'w-td', type: 'todo', size: 'M', anchor: 'right', x: 0, y: 40, settings: {} },
      ],
    });
    if (s?.activeId) s.updateTab(s.activeId, { url: 'about:home' });
  })()`);
  await sleep(2500);
  const out = await win.webContents.executeJavaScript(`(() => {
    const box = (sel) => [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { sel, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top),
        maxW: cs.maxWidth, width: cs.width, display: cs.display, jc: cs.justifyContent, ov: cs.overflow };
    });
    return [
      ...box('.hw-chrome-search'),
      ...box('.hw-chrome-search .hw-bare'),
      ...box('.hw-chrome-search .home-search'),
      ...box('.hw-chrome-search .home-search-inner'),
      ...box('.hw-chrome-shortcuts'),
      ...box('.hw-chrome-shortcuts .home-dock'),
      ...box('.home-dock-item'),
      ...box('.hw-type-resources .hw-frame-body'),
      ...box('.hw-resources'),
      ...box('.hw-resources-inner'),
      ...box('.hw-type-spotify'),
      ...box('.hw-canvas'),
    ];
  })()`);
  console.log(JSON.stringify(out, null, 1));
  app.quit();
});
