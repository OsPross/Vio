const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1360,
    height: 920,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
    },
  });
  await win.loadURL(process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173');
  await sleep(2500);
  await win.webContents.executeJavaScript(`document.querySelector('.home-fab')?.click()`);
  await sleep(600);
  await win.webContents.executeJavaScript(
    `([...document.querySelectorAll('.pz-sheet-tabs .ui-seg button')][2])?.click()`,
  );
  await sleep(400);
  await win.webContents.executeJavaScript(`
    (() => {
      const add = [...document.querySelectorAll('.pz-rec-add')][0];
      if (add) add.click();
    })()
  `);
  await sleep(500);
  await win.webContents.executeJavaScript(`
    ([...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes('Edytuj układ')))?.click()
  `);
  await sleep(1200);

  const info = await win.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector('.hw-canvas');
      const card = document.querySelector('.hw-card');
      const bar = document.querySelector('.hw-edit-bar');
      const r = canvas?.getBoundingClientRect();
      const cs = card ? getComputedStyle(card) : null;
      const band = document.querySelector('.home-widgets-band')?.getBoundingClientRect();
      const home = document.querySelector('.home')?.getBoundingClientRect();
      return {
        editing: document.querySelector('.home')?.classList.contains('is-editing-widgets'),
        hasBar: !!bar,
        canvasW: r?.width,
        canvasH: r?.height,
        bandW: band?.width,
        homeW: home?.width,
        cardPos: cs?.position,
        cardTransform: cs?.transform,
        styleAttr: card?.getAttribute('style'),
        className: card?.className,
        editable: card?.classList.contains('editable'),
      };
    })()
  `);
  console.log(JSON.stringify(info, null, 2));
  fs.writeFileSync(path.join(__dirname, '..', 'tmp-verify', 'metrics-probe.json'), JSON.stringify(info, null, 2));
  app.quit();
});
