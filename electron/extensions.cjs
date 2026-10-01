/**
 * Chrome extension loading via session.loadExtension (MV3 where Electron supports it).
 *
 * Scope:
 * - persist:main always (when enabled)
 * - private ephemeral partitions: only if allowPrivate
 * - Tor: NEVER
 *
 * Trade-off vs electron-chrome-extensions:
 * - Native loadExtension: simple install/enable, no chrome.tabs / action popup host
 * - electron-chrome-extensions: chrome.* + toolbar actions/popups, heavier maintenance
 *   and Electron version coupling — deferred; UI exposes pin flag for future chrome.action.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { app, session, dialog, net } = require('electron');

const storeFile = () => path.join(app.getPath('userData'), 'djxxr-extensions.json');
const unpackedRoot = () => path.join(app.getPath('userData'), 'extensions');
const stagingRoot = () => path.join(app.getPath('userData'), 'extensions-staging');

/** @typedef {{ id: string, name: string, version: string, path: string, enabled: boolean, allowPrivate: boolean, pinned: boolean, permissions: string[], manifestVersion?: number, source?: string }} ExtRecord */

/** @type {ExtRecord[]} */
let records = [];
/** @type {Map<string, import('electron').Extension>} */
const loadedMain = new Map();
/** @type {WeakMap<object, Map<string, import('electron').Extension>>} */
const loadedPrivate = new WeakMap();

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    records = Array.isArray(raw?.extensions)
      ? raw.extensions.map((r) => ({
          ...r,
          pinned: Boolean(r.pinned),
          permissions: Array.isArray(r.permissions) ? r.permissions : [],
          allowPrivate: Boolean(r.allowPrivate),
          enabled: r.enabled !== false,
        }))
      : [];
  } catch {
    records = [];
  }
}

function saveStore() {
  try {
    fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
    fs.writeFileSync(storeFile(), JSON.stringify({ extensions: records }, null, 2), { mode: 0o600 });
  } catch (err) {
    console.warn('[ext] save', err);
  }
}

function readManifest(dir) {
  const mf = path.join(dir, 'manifest.json');
  const raw = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const perms = [
    ...(Array.isArray(raw.permissions) ? raw.permissions : []),
    ...(Array.isArray(raw.host_permissions) ? raw.host_permissions : []),
    ...(Array.isArray(raw.optional_permissions) ? raw.optional_permissions : []),
  ].map(String);
  return {
    name: String(raw.name || path.basename(dir)),
    version: String(raw.version || '0'),
    manifestVersion: Number(raw.manifest_version) || 2,
    permissions: [...new Set(perms)],
  };
}

function mainSession() {
  return session.fromPartition('persist:main');
}

function isTorSession(ses) {
  try {
    const name = String(ses?.partitionName || '');
    if (/^tor-/i.test(name) || /tor/i.test(name)) return true;
  } catch {
    /* */
  }
  return false;
}

async function loadIntoSession(ses, rec, map) {
  if (!rec.enabled || map.has(rec.id)) return;
  if (!fs.existsSync(rec.path)) {
    console.warn('[ext] missing path', rec.path);
    return;
  }
  if (isTorSession(ses)) {
    console.warn('[ext] refused Tor session');
    return;
  }
  try {
    const ext = await ses.loadExtension(rec.path, { allowFileAccess: true });
    map.set(rec.id, ext);
    console.log('[ext] loaded', rec.name, ext.id);
  } catch (err) {
    console.warn('[ext] load failed', rec.name, err && err.message);
  }
}

async function unloadFromSession(ses, rec, map) {
  const ext = map.get(rec.id);
  if (!ext) return;
  try {
    ses.removeExtension(ext.id);
  } catch (err) {
    console.warn('[ext] unload', err);
  }
  map.delete(rec.id);
}

async function loadOneMain(rec) {
  await loadIntoSession(mainSession(), rec, loadedMain);
}

async function unloadOneMain(rec) {
  await unloadFromSession(mainSession(), rec, loadedMain);
}

/** Call when a private ephemeral session is created — only allowPrivate extensions. */
async function attachToPrivateSession(ses) {
  if (!ses || isTorSession(ses)) return;
  let map = loadedPrivate.get(ses);
  if (!map) {
    map = new Map();
    loadedPrivate.set(ses, map);
  }
  for (const rec of records) {
    if (rec.enabled && rec.allowPrivate) {
      await loadIntoSession(ses, rec, map);
    }
  }
}

async function init() {
  loadStore();
  fs.mkdirSync(unpackedRoot(), { recursive: true });
  fs.mkdirSync(stagingRoot(), { recursive: true });
  for (const rec of records) {
    if (rec.enabled) await loadOneMain(rec);
  }
}

function list() {
  return records.map((r) => ({
    ...r,
    loaded: loadedMain.has(r.id),
    electronId: loadedMain.get(r.id)?.id || null,
  }));
}

function findManifestDir(root) {
  const direct = path.join(root, 'manifest.json');
  if (fs.existsSync(direct)) return root;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const sub = path.join(root, ent.name);
    if (fs.existsSync(path.join(sub, 'manifest.json'))) return sub;
  }
  return null;
}

function expandArchive(archivePath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${String(archivePath).replace(/'/g, "''")}' -DestinationPath '${String(destDir).replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'pipe', windowsHide: true },
    );
    return;
  }
  execFileSync('unzip', ['-o', archivePath, '-d', destDir], { stdio: 'pipe' });
}

/** CRX2/CRX3 → zip bytes on disk */
function crxToZip(crxPath, zipOut) {
  const buf = fs.readFileSync(crxPath);
  if (buf.length < 16 || buf.toString('utf8', 0, 4) !== 'Cr24') {
    // maybe already a zip
    fs.copyFileSync(crxPath, zipOut);
    return;
  }
  const version = buf.readUInt32LE(4);
  let zipStart = 0;
  if (version === 2) {
    const pubkeyLen = buf.readUInt32LE(8);
    const sigLen = buf.readUInt32LE(12);
    zipStart = 16 + pubkeyLen + sigLen;
  } else if (version === 3) {
    const headerLen = buf.readUInt32LE(8);
    zipStart = 12 + headerLen;
  } else {
    throw new Error(`Nieobsługiwana wersja CRX: ${version}`);
  }
  fs.writeFileSync(zipOut, buf.subarray(zipStart));
}

async function installFromUnpacked(srcDir, sourceLabel) {
  const manifestDir = findManifestDir(srcDir);
  if (!manifestDir) {
    return { ok: false, error: 'Brak manifest.json w katalogu / archiwum' };
  }
  const meta = readManifest(manifestDir);
  const id = `ext-${crypto.createHash('sha1').update(manifestDir + meta.name + meta.version).digest('hex').slice(0, 16)}`;
  const dest = path.join(unpackedRoot(), id);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(manifestDir, dest, { recursive: true });
  const rec = {
    id,
    name: meta.name,
    version: meta.version,
    path: dest,
    enabled: true,
    allowPrivate: false,
    pinned: false,
    permissions: meta.permissions,
    manifestVersion: meta.manifestVersion,
    source: sourceLabel || 'folder',
  };
  // replace same name+path hash collisions
  records = records.filter((r) => r.id !== id && !(r.name === rec.name && r.version === rec.version));
  records.push(rec);
  saveStore();
  await loadOneMain(rec);
  return { ok: true, extension: list().find((x) => x.id === id) };
}

async function installFromFolder(sourcePath) {
  const src = String(sourcePath || '');
  if (!src || !fs.existsSync(src)) {
    return { ok: false, error: 'Ścieżka nie istnieje' };
  }
  return installFromUnpacked(src, 'folder');
}

async function installFromArchive(filePath) {
  const src = String(filePath || '');
  if (!src || !fs.existsSync(src)) return { ok: false, error: 'Plik nie istnieje' };
  const lower = src.toLowerCase();
  const stage = path.join(stagingRoot(), `pack-${Date.now()}`);
  fs.mkdirSync(stage, { recursive: true });
  try {
    let zipPath = src;
    if (lower.endsWith('.crx')) {
      zipPath = path.join(stage, 'ext.zip');
      crxToZip(src, zipPath);
    } else if (!lower.endsWith('.zip')) {
      return { ok: false, error: 'Obsługiwane: folder, .zip, .crx' };
    }
    const extractTo = path.join(stage, 'out');
    expandArchive(zipPath, extractTo);
    return installFromUnpacked(extractTo, lower.endsWith('.crx') ? 'crx' : 'zip');
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    try {
      fs.rmSync(stage, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
}

function parseChromeStoreId(input) {
  const s = String(input || '').trim();
  const m =
    s.match(/chrome\.google\.com\/webstore\/detail\/[^/]+\/([a-p]{32})/i) ||
    s.match(/chromewebstore\.google\.com\/detail\/[^/]+\/([a-p]{32})/i) ||
    s.match(/\b([a-p]{32})\b/i);
  return m ? m[1] : null;
}

async function downloadCrx(extensionId) {
  const url =
    `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=131.0.0.0` +
    `&acceptformat=crx3&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`;
  const res = await net.fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Pobieranie CRX: HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  const out = path.join(stagingRoot(), `${extensionId}.crx`);
  fs.mkdirSync(stagingRoot(), { recursive: true });
  fs.writeFileSync(out, Buffer.from(ab));
  return out;
}

async function installFromStore(input) {
  const id = parseChromeStoreId(input);
  if (!id) return { ok: false, error: 'Podaj ID lub link Chrome Web Store' };
  try {
    const crx = await downloadCrx(id);
    const result = await installFromArchive(crx);
    try {
      fs.unlinkSync(crx);
    } catch {
      /* */
    }
    if (result.ok && result.extension) {
      const rec = records.find((r) => r.id === result.extension.id);
      if (rec) {
        rec.source = `cws:${id}`;
        saveStore();
      }
    }
    return result;
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

async function pickAndInstall(parent) {
  const { canceled, filePaths } = await dialog.showOpenDialog(parent || undefined, {
    title: 'Zainstaluj rozszerzenie',
    properties: ['openDirectory', 'openFile'],
    filters: [
      { name: 'Rozszerzenia Chrome', extensions: ['crx', 'zip'] },
      { name: 'Wszystkie', extensions: ['*'] },
    ],
  });
  if (canceled || !filePaths?.[0]) return { ok: false, canceled: true };
  const p = filePaths[0];
  const st = fs.statSync(p);
  if (st.isDirectory()) return installFromFolder(p);
  return installFromArchive(p);
}

async function setEnabled(id, enabled) {
  const rec = records.find((r) => r.id === id);
  if (!rec) return { ok: false, error: 'not_found' };
  rec.enabled = Boolean(enabled);
  saveStore();
  if (rec.enabled) await loadOneMain(rec);
  else await unloadOneMain(rec);
  return { ok: true, extension: list().find((x) => x.id === id) };
}

async function setAllowPrivate(id, allow) {
  const rec = records.find((r) => r.id === id);
  if (!rec) return { ok: false, error: 'not_found' };
  rec.allowPrivate = Boolean(allow);
  saveStore();
  return { ok: true, extension: list().find((x) => x.id === id) };
}

async function setPinned(id, pinned) {
  const rec = records.find((r) => r.id === id);
  if (!rec) return { ok: false, error: 'not_found' };
  rec.pinned = Boolean(pinned);
  saveStore();
  return { ok: true, extension: list().find((x) => x.id === id) };
}

async function remove(id) {
  const rec = records.find((r) => r.id === id);
  if (!rec) return { ok: false, error: 'not_found' };
  await unloadOneMain(rec);
  records = records.filter((r) => r.id !== id);
  saveStore();
  try {
    if (rec.path.startsWith(unpackedRoot())) fs.rmSync(rec.path, { recursive: true, force: true });
  } catch {
    /* */
  }
  return { ok: true };
}

function register(ipcMain, wrapApp) {
  ipcMain.handle('shell:extensions-list', wrapApp(() => ({ ok: true, extensions: list() })));
  ipcMain.handle('shell:extensions-install-folder', wrapApp(async (e) => {
    const { BrowserWindow } = require('electron');
    const parent = BrowserWindow.fromWebContents(e.sender);
    return pickAndInstall(parent);
  }));
  ipcMain.handle('shell:extensions-install-store', wrapApp((_e, input) => installFromStore(input)));
  ipcMain.handle('shell:extensions-set-enabled', wrapApp((_e, id, enabled) => setEnabled(String(id || ''), enabled)));
  ipcMain.handle(
    'shell:extensions-set-private',
    wrapApp((_e, id, allow) => setAllowPrivate(String(id || ''), allow)),
  );
  ipcMain.handle('shell:extensions-set-pinned', wrapApp((_e, id, pinned) => setPinned(String(id || ''), pinned)));
  ipcMain.handle('shell:extensions-remove', wrapApp((_e, id) => remove(String(id || ''))));
}

module.exports = {
  init,
  list,
  installFromFolder,
  installFromArchive,
  installFromStore,
  pickAndInstall,
  setEnabled,
  setAllowPrivate,
  setPinned,
  remove,
  register,
  attachToPrivateSession,
  unpackedRoot,
};
