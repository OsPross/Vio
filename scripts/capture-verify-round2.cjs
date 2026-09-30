/**
 * Quality round 2 — screenshots. Build first: npm run build
 * Run: electron scripts/capture-verify-round2.cjs
 */
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'tmp-verify');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Keep GPU — capturePage fails with UnknownVizError when HWA is disabled on some Windows setups.

const MOCK_DOWNLOADS = [
  {
    id: '1',
    filename: 'report.pdf',
    url: 'https://cdn.example.com/report.pdf',
    state: 'completed',
    receivedBytes: 2400000,
    totalBytes: 2400000,
    startedAt: Date.now() - 86400000,
    endedAt: Date.now() - 86000000,
    fileMissing: false,
    speedBps: 0,
    tor: false,
  },
  {
    id: '2',
    filename: 'video.mp4',
    url: 'https://media.example.org/v.mp4',
    state: 'progressing',
    receivedBytes: 50000000,
    totalBytes: 120000000,
    startedAt: Date.now() - 60000,
    speedBps: 1200000,
    tor: false,
  },
  {
    id: '3',
    filename: 'archive.zip',
    url: 'https://dl.example.net/a.zip',
    state: 'paused',
    receivedBytes: 10000000,
    totalBytes: 40000000,
    startedAt: Date.now() - 120000,
    speedBps: 0,
    tor: false,
  },
  {
    id: '4',
    filename: 'gone.bin',
    url: 'https://files.example.com/gone.bin',
    state: 'completed',
    receivedBytes: 512,
    totalBytes: 512,
    startedAt: Date.now() - 172800000,
    endedAt: Date.now() - 172700000,
    fileMissing: true,
    speedBps: 0,
    tor: false,
  },
  {
    id: '5',
    filename: 'fail.iso',
    url: 'https://mirror.example.com/fail.iso',
    state: 'interrupted',
    receivedBytes: 0,
    totalBytes: 900000000,
    startedAt: Date.now() - 300000,
    speedBps: 0,
    error: 'NETWORK_FAILED',
    tor: false,
  },
];

let downloadsPayload = [];
let bootOverride = { mode: 'normal', partition: null };

function stub(ch, fn) {
  try {
    ipcMain.removeHandler(ch);
  } catch {
    /* */
  }
  ipcMain.handle(ch, fn);
}

const SOFT = [
  'shell:perf-boot',
  'shell:perf-apply-session',
  'shell:passwords-idle',
  'shell:adblock-config',
  'shell:privacy-config',
  'shell:history-config',
  'shell:downloads-config',
  'shell:set-devtools-enabled',
  'shell:set-shortcut-trap',
  'shell:favicon-cache-put',
  'shell:set-titlebar',
  'shell:set-native-theme',
  'shell:history-suggest',
  'shell:passwords-activity',
  'shell:passwords-status',
  'shell:metrics-subscribe',
  'shell:new-window',
];
for (const ch of SOFT) {
  stub(ch, () => ({ ok: true }));
}

stub('shell:window-boot-get', () => bootOverride);
stub('shell:session-status', () => ({ dirtyExit: false }));
stub('shell:session-load', () => null);
stub('shell:session-save', () => ({ ok: true }));
stub('shell:session-clear', () => ({ ok: true }));
stub('shell:app-info', () => ({
  appVersion: '0.1.0',
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  v8: process.versions.v8,
  platform: process.platform,
  userData: app.getPath('userData'),
}));
stub('shell:favicon-cache-get', () => null);
stub('shell:downloads-list', () => downloadsPayload);
stub('shell:history-list', () => []);
stub('shell:history-search', () => []);
stub('shell:bookmarks-discover-profiles', () => []);
stub('shell:adblock-stats', () => ({ today: 0 }));
stub('shell:tor-status', () => ({ ok: false, active: false }));
stub('shell:open-user-data', () => ({ ok: true }));
stub('shell:open-logs-folder', () => ({ ok: true }));

async function shot(win, name) {
  for (let i = 0; i < 4; i++) {
    try {
      if (win.isDestroyed()) throw new Error('window destroyed');
      if (!win.isVisible()) win.show();
      win.focus();
      await sleep(120);
      const img = await win.webContents.capturePage();
      const file = path.join(OUT, name);
      fs.writeFileSync(file, img.toPNG());
      console.log('saved', name, img.getSize());
      return file;
    } catch (err) {
      console.warn('shot retry', name, i, String(err && err.message ? err.message : err));
      await sleep(250);
    }
  }
  console.error('FAILED shot', name);
  return null;
}

async function evalIn(win, code) {
  return win.webContents.executeJavaScript(code, true);
}

async function makeWin({ boot = 'normal', partition = null, w = 1360, h = 860 } = {}) {
  bootOverride = { mode: boot, partition };
  const win = new BrowserWindow({
    width: w,
    height: h,
    show: true,
    backgroundColor: boot === 'private' ? '#0e1016' : '#12151c',
    title: boot === 'private' ? 'Prywatne — djxxr' : boot === 'tor' ? 'Tor — djxxr' : 'djxxr',
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      additionalArguments: [`--djxxr-boot=${boot}`, partition ? `--djxxr-partition=${partition}` : ''].filter(
        Boolean,
      ),
    },
  });
  await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  await sleep(2200);
  // Push boot again after load
  win.webContents.send('shell:window-boot', bootOverride);
  await sleep(600);
  return win;
}

async function store(win, code) {
  return evalIn(
    win,
    `(() => { const st = window.__DJXXR_STORE__; if (!st) return { ok:false }; ${code} })()`,
  );
}

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // --- Normal window: sidebar + pages ---
  const win = await makeWin({ boot: 'normal' });
  const hasStore = await evalIn(win, `!!window.__DJXXR_STORE__`);
  console.log('store bridge', hasStore);

  for (const theme of ['midnight', 'paper']) {
    await store(
      win,
      `st.getState().patchSettings({ theme: '${theme}', sidebarMode: 'on', showSidebar: true, sidePanelOpen: false }); return true;`,
    );
    await sleep(400);
    await shot(win, `home-sidebar-on-${theme}.png`);

    await store(
      win,
      `st.getState().patchSettings({ sidebarMode: 'off', showSidebar: false }); return true;`,
    );
    await sleep(350);
    await shot(win, `home-sidebar-off-${theme}.png`);

    await store(
      win,
      `st.getState().patchSettings({ sidebarMode: 'auto', showSidebar: true }); return true;`,
    );
    await sleep(400);
    await shot(win, `home-sidebar-auto-${theme}.png`);

    // hover open auto
    await evalIn(
      win,
      `(() => {
        const a = document.querySelector('.app');
        a && a.classList.add('sidebar-auto-open');
        const edge = document.querySelector('.sidebar-edge-hit');
        edge && edge.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        return a && a.classList.contains('sidebar-auto-open');
      })()`,
    );
    await sleep(280);
    await shot(win, `home-sidebar-auto-hover-${theme}.png`);

    // menu more tools
    await evalIn(
      win,
      `(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        const btn = document.querySelector('.app-menu-trigger');
        btn && btn.click();
        return !!btn;
      })()`,
    );
    await sleep(280);
    await evalIn(
      win,
      `(() => {
        const sub = [...document.querySelectorAll('.app-menu-item')].find((el) =>
          /Więcej narzędzi/.test(el.textContent || ''),
        );
        if (sub) {
          sub.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
          sub.click();
        }
        return !!sub;
      })()`,
    );
    await sleep(350);
    await shot(win, `menu-more-tools-${theme}.png`);
    await evalIn(
      win,
      `document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`,
    );

    // about
    await store(
      win,
      `const s = st.getState(); const id = s.activeId; s.updateTab(id, { url: 'djxxr://about', title: 'O djxxr' }); return true;`,
    );
    await sleep(500);
    await shot(win, `about-${theme}.png`);

    // bookmarks empty
    await store(
      win,
      `const s = st.getState();
       for (const b of [...s.bookmarks]) s.removeBookmark?.(b.id) || s.deleteBookmark?.(b.id);
       // fallback clear
       if (s.bookmarks.length) st.setState({ bookmarks: [] });
       s.updateTab(s.activeId, { url: 'about:bookmarks', title: 'Zakładki' });
       return s.bookmarks.length;`,
    );
    await sleep(500);
    await shot(win, `bookmarks-empty-${theme}.png`);

    // bookmarks seeded
    await store(
      win,
      `const s = st.getState();
       st.setState({ bookmarks: [] });
       const f1 = (() => { st.getState().addBookmarkFolder({ title: 'Praca' }); return st.getState().bookmarkFolders.find((f) => f.title === 'Praca')?.id; })() || 'folder-other';
       const f2 = (() => { st.getState().addBookmarkFolder({ title: 'Nauka' }); return st.getState().bookmarkFolders.find((f) => f.title === 'Nauka')?.id; })() || 'folder-other';
       const f3 = (() => { st.getState().addBookmarkFolder({ title: 'Hobby' }); return st.getState().bookmarkFolders.find((f) => f.title === 'Hobby')?.id; })() || 'folder-other';
       const bar = 'folder-bar';
       for (let i = 0; i < 20; i++) {
         const folderId = i < 7 ? bar : i < 14 ? f1 : i < 17 ? f2 : f3;
         st.getState().addBookmark({ title: 'Zakładka ' + (i + 1), url: 'https://example.com/' + (i + 1), folderId });
       }
       st.getState().updateTab(st.getState().activeId, { url: 'about:bookmarks', title: 'Zakładki' });
       return st.getState().bookmarks.length;`,
    );
    await sleep(600);
    await shot(win, `bookmarks-seeded-${theme}.png`);

    // downloads empty
    downloadsPayload = [];
    await store(
      win,
      `st.getState().updateTab(st.getState().activeId, { url: 'about:downloads', title: 'Pobrane' }); return true;`,
    );
    await sleep(500);
    await shot(win, `downloads-empty-${theme}.png`);

    // downloads seeded — remount by toggling url
    downloadsPayload = MOCK_DOWNLOADS;
    await store(
      win,
      `st.getState().updateTab(st.getState().activeId, { url: 'about:home', title: 'Home' }); return true;`,
    );
    await sleep(200);
    await store(
      win,
      `st.getState().updateTab(st.getState().activeId, { url: 'about:downloads', title: 'Pobrane' }); return true;`,
    );
    await sleep(600);
    await shot(win, `downloads-seeded-${theme}.png`);

    // back to home for next theme loop
    await store(
      win,
      `st.getState().updateTab(st.getState().activeId, { url: 'about:home', title: 'Nowa karta' }); return true;`,
    );
    await sleep(300);
  }

  win.close();

  // --- Private window ---
  bootOverride = { mode: 'private', partition: 'private-capture-test-uuid' };
  const priv = await makeWin({ boot: 'private', partition: 'private-capture-test-uuid' });
  await sleep(800);
  await shot(priv, 'window-private.png');
  await store(
    priv,
    `st.getState().patchSettings({ theme: 'paper' }); return true;`,
  );
  await sleep(300);
  await shot(priv, 'window-private-paper.png');
  priv.close();

  // --- Tor window (chrome only; torStart stubbed so may show error — still capture chrome) ---
  bootOverride = { mode: 'tor', partition: null };
  stub('shell:tor-start', () => ({
    ok: true,
    active: true,
    partition: 'tor-capture-test-uuid',
  }));
  const tor = await makeWin({ boot: 'tor' });
  await sleep(1200);
  await shot(tor, 'window-tor.png');
  await store(tor, `st.getState().patchSettings({ theme: 'paper' }); return true;`);
  await sleep(300);
  await shot(tor, 'window-tor-paper.png');
  tor.close();

  console.log('all captures done →', OUT);
  app.quit();
});
