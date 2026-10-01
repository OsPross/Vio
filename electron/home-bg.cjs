/**
 * Home wallpaper — pick image, copy into userData/home-bg.
 * Served via vio-bg: so Vite (http) and packaged (file) can both paint it.
 */
const { app, dialog, BrowserWindow, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SCHEME = 'vio-bg';

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

/** Public CSS/URL for a stored absolute path (or already-vio-bg / file URL). */
function toDisplayUrl(stored) {
  if (!stored || typeof stored !== 'string') return null;
  if (stored.startsWith('data:')) return null;
  if (stored.startsWith(`${SCHEME}:`)) return stored;
  if (stored.startsWith('file:')) return stored;
  const name = path.basename(stored.replace(/\\/g, '/'));
  if (!name || name === '.' || name === '..') return null;
  return `${SCHEME}://home/${encodeURIComponent(name)}`;
}

function registerPrivilegedScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        bypassCSP: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
}

function registerProtocol() {
  const attach = () => {
    try {
      if (typeof protocol.isProtocolHandled === 'function' && protocol.isProtocolHandled(SCHEME)) {
        return;
      }
      protocol.handle(SCHEME, (request) => {
        try {
          const u = new URL(request.url);
          const name = path.basename(decodeURIComponent(u.pathname || ''));
          if (!name || name === '.' || name === '..') {
            return new Response('Not found', { status: 404 });
          }
          const filePath = path.join(bgDir(), name);
          if (!fs.existsSync(filePath)) {
            return new Response('Not found', { status: 404 });
          }
          return net.fetch(pathToFileURL(filePath).href);
        } catch {
          return new Response('Bad request', { status: 400 });
        }
      });
    } catch (err) {
      console.warn('[home-bg] protocol', err && err.message);
    }
  };
  // protocol.handle requires app ready — register-misc runs at require-time before whenReady.
  if (app.isReady()) attach();
  else void app.whenReady().then(attach);
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
  const displayUrl = toDisplayUrl(dest);
  return { ok: true, path: dest, url: displayUrl || toFileUrl(dest) };
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
  registerProtocol();
  ipcMain.handle('shell:home-bg-pick', wrapApp(async () => pickAndCopy()));
  ipcMain.handle('shell:home-bg-clear', wrapApp(() => clear()));
}

module.exports = {
  register,
  pickAndCopy,
  clear,
  registerPrivilegedScheme,
  registerProtocol,
  toDisplayUrl,
  SCHEME,
};
