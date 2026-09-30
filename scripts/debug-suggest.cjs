const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
    },
  });
  await win.loadURL(process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173');
  await sleep(3500);
  // ensure history
  await win.webContents.executeJavaScript(`(() => {
    const key = Object.keys(localStorage).find(k => k.includes('moja-przegladarka'));
    const raw = JSON.parse(localStorage.getItem(key) || '{}');
    raw.state.history = [{ q: 'verify-alpha', at: Date.now() }, { q: 'verify-beta', at: Date.now()-1 }];
    raw.state.settings.suggestHistory = true;
    localStorage.setItem(key, JSON.stringify(raw));
    location.reload();
  })()`);
  await sleep(3500);
  win.showInactive();
  const before = await win.webContents.executeJavaScript(`(() => {
    const key = Object.keys(localStorage).find(k => k.includes('moja-przegladarka'));
    const raw = JSON.parse(localStorage.getItem(key) || '{}');
    return { hist: raw.state.history, suggestHistory: raw.state.settings.suggestHistory };
  })()`);
  console.log('before', JSON.stringify(before));
  await win.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('.home-search input');
    if (!input) return false;
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    input.click();
    input.focus();
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    return true;
  })()`);
  await sleep(700);
  const after = await win.webContents.executeJavaScript(`({
    portal: !!document.querySelector('.home-suggest-portal'),
    suggest: !!document.querySelector('.home-suggest'),
    active: document.activeElement && document.activeElement.className,
    formFocus: !!document.querySelector('.home-search.is-focus'),
  })`);
  console.log('after', JSON.stringify(after));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, '..', 'tmp-verify', 'fix-suggest2.png'), img.toPNG());
  app.quit();
});
