const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'tmp-verify');
const DEV = process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#08090c',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      offscreen: false,
    },
  });

  const logs = [];
  win.webContents.on('console-message', (_e, level, message) => {
    logs.push({ level, message: String(message).slice(0, 300) });
    console.log('CON', level, String(message).slice(0, 200));
  });
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    console.log('FAIL', code, desc);
  });

  await win.loadURL(DEV);
  await sleep(5000);
  win.show();
  await sleep(800);

  const info = await win.webContents.executeJavaScript(`({
    home: !!document.querySelector('.home'),
    canvas: !!document.querySelector('.hw-canvas'),
    strip: !!document.querySelector('.hw-strip'),
    cards: document.querySelectorAll('.hw-card').length,
    clock: !!document.querySelector('.home-clock, .hw-clock'),
    search: !!document.querySelector('.home-search'),
    rootKids: document.querySelector('#root')?.children?.length || 0,
    err: [...document.querySelectorAll('body *')].slice(0,3).map(e=>e.tagName+'.'+e.className).join('|'),
    text: (document.body.innerText||'').slice(0,200)
  })`);
  console.log('INFO', JSON.stringify(info, null, 2));
  fs.writeFileSync(path.join(OUT, 'debug-info.json'), JSON.stringify({ info, logs: logs.slice(0, 40) }, null, 2));

  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, 'debug-home.png'), img.toPNG());
  console.log('saved', img.getSize());
  app.quit();
});
