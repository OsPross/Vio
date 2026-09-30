/**
 * Home wallpaper — pick image, copy into userData/home-bg.
 */
const { app, dialog, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

function bgDir() {
  const dir = path.join(app.getPath('userData'), 'home-bg');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function toFileUrl(filePath) {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(normalized)) {
    return `file:///${normalized}`;
  }
  return `file://${normalized}`;
}

async function pickAndCopy() {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win || undefined, {
    title: 'Wybierz tło strony startowej',
    properties: ['openFile'],
    filters: [{ name: 'Obrazy', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  if (result.canceled || !result.filePaths?.length) {
    return { ok: false, canceled: true };
  }
  const src = result.filePaths[0];
  const ext = path.extname(src).toLowerCase() || '.jpg';
  const dest = path.join(bgDir(), `wallpaper${ext}`);
  fs.copyFileSync(src, dest);
  return { ok: true, path: dest, url: toFileUrl(dest) };
}

function clear() {
  const dir = bgDir();
  for (const name of fs.readdirSync(dir)) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      /* ignore */
    }
  }
  return { ok: true };
}

function register(ipcMain, wrapApp) {
  ipcMain.handle('shell:home-bg-pick', wrapApp(async () => pickAndCopy()));
  ipcMain.handle('shell:home-bg-clear', wrapApp(() => clear()));
}

module.exports = { register, pickAndCopy, clear };
