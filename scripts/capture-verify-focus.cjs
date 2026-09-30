/**
 * Quick re-capture: about, private banner, menu more-tools submenu
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'tmp-verify');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let bootOverride = { mode: 'normal', partition: null };
function stub(ch, fn) {
  try { ipcMain.removeHandler(ch); } catch { /* */ }
  ipcMain.handle(ch, fn);
}
[
  'shell:perf-boot','shell:perf-apply-session','shell:passwords-idle','shell:adblock-config',
  'shell:privacy-config','shell:history-config','shell:downloads-config','shell:set-devtools-enabled',
  'shell:set-shortcut-trap','shell:favicon-cache-put','shell:set-titlebar','shell:set-native-theme',
  'shell:history-suggest','shell:passwords-activity','shell:passwords-status','shell:metrics-subscribe',
  'shell:new-window','shell:tor-bridges','shell:tor-refresh','shell:session-nav-history',
].forEach((ch) => stub(ch, () => ({ ok: true })));
stub('shell:window-boot-get', () => bootOverride);
stub('shell:session-status', () => ({ dirtyExit: false }));
stub('shell:session-load', () => null);
stub('shell:session-save', () => ({ ok: true }));
stub('shell:app-info', () => ({
  appVersion: '0.1.0', electron: process.versions.electron, chrome: process.versions.chrome,
  node: process.versions.node, v8: process.versions.v8, platform: process.platform,
  userData: app.getPath('userData'),
}));
stub('shell:favicon-cache-get', () => null);
stub('shell:downloads-list', () => []);
stub('shell:history-list', () => []);
stub('shell:bookmarks-discover-profiles', () => []);
stub('shell:adblock-stats', () => ({ today: 0 }));
stub('shell:tor-status', () => ({ ok: false, active: false }));
stub('shell:tor-start', () => ({ ok: true, active: true, partition: 'tor-capture-test-uuid' }));
stub('shell:open-user-data', () => ({ ok: true }));
stub('shell:open-logs-folder', () => ({ ok: true }));

async function shot(win, name) {
  win.show(); win.focus();
  await sleep(100);
  const img = await win.webContents.capturePage();
  fs.writeFileSync(path.join(OUT, name), img.toPNG());
  console.log('saved', name);
}
async function evalIn(win, code) {
  return win.webContents.executeJavaScript(code, true);
}
async function closeMenu(win) {
  await evalIn(win, `(() => {
    document.body.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    document.querySelector('.app-menu.open')?.classList.remove('open');
    document.querySelector('.app-menu-pop')?.remove();
    return true;
  })()`);
  await sleep(200);
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  bootOverride = { mode: 'normal', partition: null };
  const win = new BrowserWindow({
    width: 1360, height: 860, show: true, backgroundColor: '#12151c',
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true,
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await sleep(2000);
  win.webContents.send('shell:window-boot', bootOverride);
  await sleep(400);

  await evalIn(win, `window.__DJXXR_STORE__.getState().patchSettings({ theme: 'midnight', sidebarMode: 'off', showSidebar: false }); true`);
  await closeMenu(win);

  // About — use about:about alias too
  await evalIn(win, `(() => {
    const st = window.__DJXXR_STORE__;
    const id = st.getState().activeId || st.getState().tabs[0]?.id;
    st.getState().updateTab(id, { url: 'djxxr://about', title: 'O djxxr' });
    return st.getState().tabs.find(t => t.id === st.getState().activeId)?.url;
  })()`);
  await sleep(700);
  const aboutUrl = await evalIn(win, `window.__DJXXR_STORE__.getState().tabs.find(t=>t.id===window.__DJXXR_STORE__.getState().activeId)?.url`);
  const aboutDom = await evalIn(win, `!!document.querySelector('.about-page, .internal-page')`);
  console.log('about url/dom', aboutUrl, aboutDom);
  await shot(win, 'about-midnight.png');

  // Menu more tools
  await evalIn(win, `document.querySelector('.app-menu-trigger')?.click(); true`);
  await sleep(300);
  await evalIn(win, `(() => {
    const sub = [...document.querySelectorAll('.app-menu-item')].find(el => /Więcej narzędzi/.test(el.textContent||''));
    if (sub) { sub.scrollIntoView(); sub.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); sub.click(); }
    return sub?.textContent;
  })()`);
  await sleep(400);
  await shot(win, 'menu-more-tools-midnight.png');
  await closeMenu(win);

  win.close();

  // Private
  bootOverride = { mode: 'private', partition: 'private-capture-test-uuid' };
  const priv = new BrowserWindow({
    width: 1360, height: 860, show: true, backgroundColor: '#0e1016',
    title: 'Prywatne — djxxr',
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true,
      additionalArguments: ['--djxxr-boot=private', '--djxxr-partition=private-capture-test-uuid'],
    },
  });
  await priv.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await sleep(1800);
  priv.webContents.send('shell:window-boot', bootOverride);
  await sleep(1000);
  await evalIn(priv, `window.__DJXXR_STORE__?.getState().patchSettings({ theme: 'midnight' }); true`);
  await sleep(300);
  const banner = await evalIn(priv, `!!document.querySelector('.window-mode-banner')`);
  const mode = await evalIn(priv, `document.title + ' | ' + (document.querySelector('.window-mode-banner')?.textContent||'')`);
  console.log('private banner', banner, mode);
  await shot(priv, 'window-private.png');
  priv.close();

  // Tor
  bootOverride = { mode: 'tor', partition: null };
  const tor = new BrowserWindow({
    width: 1360, height: 860, show: true, backgroundColor: '#12151c',
    title: 'Tor — djxxr',
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true,
      additionalArguments: ['--djxxr-boot=tor'],
    },
  });
  await tor.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await sleep(1800);
  tor.webContents.send('shell:window-boot', bootOverride);
  await sleep(1500);
  await evalIn(tor, `window.__DJXXR_STORE__?.getState().patchSettings({ theme: 'midnight' }); true`);
  await sleep(400);
  await shot(tor, 'window-tor.png');
  tor.close();

  console.log('done');
  app.quit();
});
