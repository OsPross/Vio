'use strict';
const { app, BrowserWindow } = require('electron');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: true,
    webPreferences: { sandbox: true },
  });
  win.webContents.on('before-mouse-event', (_e, m) => {
    console.log('[dump] before-mouse', JSON.stringify(m));
  });
  win.on('app-command', (_e, cmd) => {
    console.log('[dump] app-command', cmd);
  });
  await win.loadURL('data:text/html,<h1 id=t>xbutton dump</h1><script>\
document.addEventListener("mouseup",e=>console.log("DOM mouseup",e.button),true);\
document.addEventListener("mousedown",e=>console.log("DOM mousedown",e.button),true);\
document.addEventListener("auxclick",e=>console.log("DOM auxclick",e.button),true);\
document.addEventListener("pointerdown",e=>console.log("DOM pointerdown",e.button),true);\
</script>');
  win.webContents.on('console-message', (_e, _l, msg) => console.log('[dump:dom]', msg));
  win.focus();
  await sleep(600);
  const b = win.getBounds();
  const x = b.x + Math.floor(b.width / 2);
  const y = b.y + Math.floor(b.height / 2);
  console.log('[dump] sending XBUTTON1 @', x, y);
  spawnSync(process.execPath, [path.join(__dirname, 'send-mouse-xbutton.cjs'), 'back', String(x), String(y)], {
    encoding: 'utf8',
    windowsHide: true,
  });
  await sleep(600);
  console.log('[dump] sending XBUTTON2 @', x, y);
  spawnSync(process.execPath, [path.join(__dirname, 'send-mouse-xbutton.cjs'), 'forward', String(x), String(y)], {
    encoding: 'utf8',
    windowsHide: true,
  });
  await sleep(800);
  app.quit();
});
