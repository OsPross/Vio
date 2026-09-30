/**
 * Capture UI polish: menu ≡, history, omnibox (focused/blurred).
 * Usage: electron scripts/capture-ui-polish.cjs
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'tmp-verify');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.disableHardwareAcceleration();

async function shot(win, name) {
  const img = await win.webContents.capturePage();
  const file = path.join(OUT, name);
  fs.writeFileSync(file, img.toPNG());
  console.log('saved', name, img.getSize());
  return file;
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  async function runAt(size, suffix) {
    const win = new BrowserWindow({
      width: size.w,
      height: size.h,
      show: true,
      backgroundColor: '#12151c',
      webPreferences: {
        preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: true,
      },
    });
    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    await sleep(2500);

    // Open app menu
    await win.webContents.executeJavaScript(`
      (() => {
        const btn = document.querySelector('.app-menu-trigger');
        if (btn) btn.click();
        return !!btn;
      })()
    `);
    await sleep(400);
    await shot(win, `menu-${suffix}.png`);

    // Open submenu
    await win.webContents.executeJavaScript(`
      (() => {
        const sub = document.querySelector('.app-menu-item.has-sub');
        if (sub) {
          sub.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          sub.click();
        }
        return !!sub;
      })()
    `);
    await sleep(350);
    await shot(win, `menu-sub-${suffix}.png`);

    // Close menu, open history
    await win.webContents.executeJavaScript(`
      (() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const st = window.__ZUSTAND__ ;
        return true;
      })()
    `);
    await sleep(200);
    await win.webContents.executeJavaScript(`
      (() => {
        // navigate via clicking won't work easily — use store if exposed
        const input = document.getElementById('omnibox-input');
        if (input) {
          const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          native.set.call(input, 'about:history');
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.form?.requestSubmit?.();
          // fallback: press Enter
          input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
        return true;
      })()
    `);
    await sleep(800);
    await shot(win, `history-${suffix}.png`);

    // Omnibox blur vs focus
    await win.webContents.executeJavaScript(`
      (() => {
        const input = document.getElementById('omnibox-input');
        if (!input) return false;
        input.blur();
        return true;
      })()
    `);
    await sleep(300);
    await shot(win, `omnibox-blur-${suffix}.png`);
    await win.webContents.executeJavaScript(`
      (() => {
        const input = document.getElementById('omnibox-input');
        if (!input) return false;
        input.focus();
        return true;
      })()
    `);
    await sleep(300);
    await shot(win, `omnibox-focus-${suffix}.png`);

    win.close();
  }

  await runAt({ w: 1280, h: 800 }, '1280x800');
  await runAt({ w: 1920, h: 1080 }, '1920x1080');
  app.quit();
});
