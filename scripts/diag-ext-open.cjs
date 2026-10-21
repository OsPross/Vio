'use strict';
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

// Use the real Vio profile so we open the user's installed extensions
app.setPath('userData', path.join(process.env.APPDATA || '', 'moja-przegladarka'));

app.whenReady().then(async () => {
  const extensions = require(path.join(__dirname, '..', 'electron', 'extensions.cjs'));
  await extensions.init();
  extensions.initChromeApi({
    getMainWindow: () => BrowserWindow.getAllWindows()[0] || null,
  });
  const win = new BrowserWindow({
    width: 900,
    height: 600,
    show: true,
    webPreferences: {
      session: require('electron').session.fromPartition('persist:main'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  await win.loadURL('about:blank');
  for (const e of extensions.list()) {
    console.log('trying', e.name, e.id, 'loaded', e.loaded);
    const res = await extensions.openAction(e.id, {
      anchorRect: { x: 700, y: 40, width: 28, height: 28 },
    });
    console.log(JSON.stringify(res));
    await new Promise((r) => setTimeout(r, 1500));
  }
  setTimeout(() => app.exit(0), 500);
}).catch((err) => {
  console.error(err);
  app.exit(1);
});
