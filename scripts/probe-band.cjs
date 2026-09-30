const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
    },
  });
  await win.loadURL(process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173');
  await sleep(2500);
  const info = await win.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('.home-widgets-band');
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    const p = el.parentElement;
    return {
      width: cs.width,
      maxWidth: cs.maxWidth,
      flex: cs.flex,
      alignSelf: cs.alignSelf,
      display: cs.display,
      parent: p?.className,
      parentW: p ? getComputedStyle(p).width : null,
      parentDisplay: p ? getComputedStyle(p).display : null,
      parentAlign: p ? getComputedStyle(p).alignItems : null,
      rect: el.getBoundingClientRect(),
    };
  })()`);
  console.log(JSON.stringify(info, null, 2));
  fs.writeFileSync(path.join(__dirname, '..', 'tmp-verify', 'band.json'), JSON.stringify(info, null, 2));
  app.quit();
});
