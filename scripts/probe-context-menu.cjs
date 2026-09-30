/**
 * Probe guest context-menu: load page, emit Electron context-menu with image/link/selection/editable params.
 * Usage: electron scripts/probe-context-menu.cjs
 */
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');

const LOG = path.join(__dirname, '..', 'tmp-verify', 'ctx-menu-probe.log');
fs.mkdirSync(path.dirname(LOG), { recursive: true });
const lines = [];
const log = (...a) => {
  const s = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  lines.push(s);
  console.log(s);
};

// Patch console from context-menu module
const origLog = console.log;
console.log = (...args) => {
  if (String(args[0] || '').includes('[ctx-menu]')) {
    lines.push(args.map(String).join(' '));
  }
  origLog.apply(console, args);
};

app.whenReady().then(async () => {
  // Load real main wiring by requiring after app ready is messy — instead open minimal window
  // and use the app's context-menu module directly + a webview via loadFile dist.
  const contextMenu = require('../electron/context-menu.cjs');
  const html = `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="padding:40px">
    <a id="l" href="https://example.com/page">link</a>
    <img id="i" src="https://via.placeholder.com/120.png" width="120" height="120"/>
    <p id="t">zaznaczony tekst do szukania</p>
    <input id="inp" value="pole tekstowe"/>
  </body></html>`)}`;

  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  // Minimal host that embeds webview
  await win.loadURL(
    `data:text/html,${encodeURIComponent(`<!doctype html><webview id="wv" src="${html}" style="width:100%;height:100%" partition="persist:main" allowpopups></webview>`)}`,
  );

  await new Promise((r) => setTimeout(r, 2500));

  const guests = win.webContents.getAllWebContents?.() || [];
  // Electron: find webview
  const { webContents } = require('electron');
  const all = webContents.getAllWebContents();
  const guest = all.find((wc) => {
    try {
      return wc.getType() === 'webview';
    } catch {
      return false;
    }
  });

  if (!guest) {
    log('FAIL no guest webview');
    fs.writeFileSync(LOG, lines.join('\n'));
    app.quit();
    return;
  }

  log('guest id', guest.id, 'url', guest.getURL());

  const deps = {
    getMainWindow: () => win,
    isTor: () => false,
    isPrivate: () => false,
    openUrl: (u, o) => log('openUrl', u, o),
    askRenderer: (a, p) => log('askRenderer', a, p),
    canInspect: () => false,
  };

  // Clear flag so attach runs
  guest.__djxxrCtxMenu = false;
  contextMenu.attachContextMenu(guest, deps);

  const cases = [
    {
      name: 'link',
      params: { x: 50, y: 50, linkURL: 'https://example.com/page', mediaType: 'none', selectionText: '', isEditable: false },
    },
    {
      name: 'image',
      params: {
        x: 80,
        y: 80,
        mediaType: 'image',
        srcURL: 'https://via.placeholder.com/120.png',
        hasImageContents: true,
        selectionText: '',
        isEditable: false,
      },
    },
    {
      name: 'selection',
      params: {
        x: 40,
        y: 140,
        mediaType: 'none',
        selectionText: 'zaznaczony tekst do szukania',
        isEditable: false,
      },
    },
    {
      name: 'editable',
      params: {
        x: 40,
        y: 180,
        mediaType: 'none',
        selectionText: 'pole',
        isEditable: true,
        misspelledWord: '',
        dictionarySuggestions: ['pole', 'pola'],
      },
    },
  ];

  for (const c of cases) {
    log('--- case', c.name);
    const fakeEvent = { preventDefault() { log('preventDefault', c.name); } };
    guest.emit('context-menu', fakeEvent, c.params);
    await new Promise((r) => setTimeout(r, 400));
  }

  fs.writeFileSync(LOG, lines.join('\n'), 'utf8');
  log('wrote', LOG);
  await new Promise((r) => setTimeout(r, 800));
  app.quit();
});
