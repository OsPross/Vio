/**
 * Chrome extension loading via session.loadExtension (MV3 where Electron supports it)
 * + electron-chrome-extensions for chrome.tabs / action popups / contextMenus / badges.
 *
 * Scope:
 * - persist:main always (when enabled)
 * - private ephemeral partitions: only if allowPrivate
 * - Tor: NEVER (no loadExtension, no chrome API tracking)
 *
 * Legitimate-browser behavior:
 * - Stable Chrome IDs (a–p×32) from CRX public key / manifest.key
 * - webview sandbox (host will-attach + attribute)
 * - Ghostery network suspended when an enabled extension uses chrome.webRequest
 * - chrome.permissions.request auto-granted after install (Chrome-like for installed add-ons)
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { app, session, dialog, net } = require('electron');
const {
  publicKeyDerToExtensionId,
  decodeManifestKey,
  extractPublicKeyFromCrx,
  ensureManifestKey,
  generateDevPublicKey,
  isChromeExtensionId,
  isChromeWebStoreUrl,
} = require('./lib/chrome-extension-id.cjs');

const storeFile = () => path.join(app.getPath('userData'), 'djxxr-extensions.json');
const unpackedRoot = () => path.join(app.getPath('userData'), 'extensions');
const stagingRoot = () => path.join(app.getPath('userData'), 'extensions-staging');

/** @typedef {{ id: string, name: string, version: string, path: string, enabled: boolean, allowPrivate: boolean, pinned: boolean, permissions: string[], manifestVersion?: number, source?: string, chromeId?: string }} ExtRecord */

/** @type {ExtRecord[]} */
let records = [];
/** @type {Map<string, import('electron').Extension>} */
const loadedMain = new Map();
/** @type {WeakMap<object, Map<string, import('electron').Extension>>} */
const loadedPrivate = new WeakMap();
/** @type {Set<import('electron').Session>} */
const privateSessions = new Set();

let initPromise = null;

/** @type {Map<string, { resolve: (v: boolean) => void, timer: ReturnType<typeof setTimeout> }>} */
const pendingInstallAsks = new Map();
/** @type {((req: { askId: string, extensionId: string, sourceUrl?: string }) => void) | null} */
let onInstallAsk = null;

function setInstallAskHandler(fn) {
  onInstallAsk = typeof fn === 'function' ? fn : null;
}

function respondInstallAsk(askId, allow) {
  const id = String(askId || '');
  const p = pendingInstallAsks.get(id);
  if (!p) return { ok: false };
  clearTimeout(p.timer);
  pendingInstallAsks.delete(id);
  p.resolve(Boolean(allow));
  return { ok: true };
}

/**
 * In-chrome confirm (not OS dialog) — used when install is triggered from the Web Store guest.
 * @param {{ extensionId: string, sourceUrl?: string }} opts
 * @returns {Promise<boolean>}
 */
function askInstallConfirm(opts) {
  const extensionId = String(opts?.extensionId || '');
  return new Promise((resolve) => {
    // Fail closed: a guest-triggered install without a consent UI must not proceed.
    if (!onInstallAsk || !extensionId) {
      resolve(false);
      return;
    }
    const askId = `ext-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timer = setTimeout(() => {
      pendingInstallAsks.delete(askId);
      resolve(false);
    }, 120_000);
    pendingInstallAsks.set(askId, { resolve, timer });
    try {
      onInstallAsk({
        askId,
        extensionId,
        sourceUrl: typeof opts.sourceUrl === 'string' ? opts.sourceUrl : '',
      });
    } catch (err) {
      console.warn('[ext] install ask', err && err.message);
      clearTimeout(timer);
      pendingInstallAsks.delete(askId);
      resolve(false);
    }
  });
}

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
          chromeId: typeof r.chromeId === 'string' ? r.chromeId : undefined,
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
    ...(Array.isArray(raw.optional_host_permissions) ? raw.optional_host_permissions : []),
  ].map(String);
  return {
    name: String(raw.name || path.basename(dir)),
    version: String(raw.version || '0'),
    manifestVersion: Number(raw.manifest_version) || 2,
    permissions: [...new Set(perms)],
    key: typeof raw.key === 'string' ? raw.key : null,
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

/** Permissions that own session.webRequest in Chromium — conflict with Ghostery. */
function wantsChromeWebRequest(rec) {
  return (rec.permissions || []).some((p) => {
    const s = String(p).toLowerCase();
    return (
      s === 'webrequest' ||
      s === 'webrequestblocking' ||
      s.startsWith('webrequest.') ||
      s === 'declarativenetrequest' ||
      s === 'declarativenetrequestwithhostaccess' ||
      s === 'declarativenetrequestfeedback'
    );
  });
}

/**
 * Only real adblockers should displace Ghostery. Helpers that merely declare
 * webRequest (e.g. Steam Inventory Helper) used to force networkActive=false → 0 blocks.
 */
function looksLikeAdblocker(rec) {
  const blob = `${rec.name || ''} ${rec.id || ''} ${rec.description || ''}`.toLowerCase();
  return /ublock|adguard|adblock|ghostery|privacy.?badger|noscript|adlocker|adblocker/.test(blob);
}

function syncAdblockForExtensions() {
  try {
    const adblock = require('./adblock-plus.cjs');
    const need = records.some(
      (r) => r.enabled && wantsChromeWebRequest(r) && looksLikeAdblocker(r),
    );
    if (typeof adblock.setExtensionWebRequestPriority === 'function') {
      adblock.setExtensionWebRequestPriority(need);
    }
  } catch (err) {
    console.warn('[ext] adblock sync', err && err.message);
  }
}

/**
 * Resolve Chrome ID + ensure manifest.key in dest directory.
 * @param {string} destDir
 * @param {{ preferredId?: string|null, publicKeyDer?: Buffer|null }} [opts]
 */
function pinChromeIdentity(destDir, opts = {}) {
  const meta = readManifest(destDir);
  const preferred =
    opts.preferredId && isChromeExtensionId(opts.preferredId) ? opts.preferredId.toLowerCase() : null;
  let keyDer = opts.publicKeyDer || null;

  if (keyDer) {
    const fromKey = publicKeyDerToExtensionId(keyDer);
    if (preferred && preferred !== fromKey) {
      console.warn('[ext] ignoring CRX key (id', fromKey, '≠ store', preferred, ')');
      keyDer = null;
    }
  }

  if (!keyDer && meta.key) {
    const existing = decodeManifestKey(meta.key);
    if (existing) {
      const fromExisting = publicKeyDerToExtensionId(existing);
      if (!preferred || preferred === fromExisting) keyDer = existing;
    }
  }

  if (!keyDer) {
    if (preferred) {
      throw new Error(
        `Nie udało się odczytać klucza CRX dla ${preferred}. Usuń rozszerzenie i zainstaluj ponownie ze sklepu.`,
      );
    }
    const gen = generateDevPublicKey();
    keyDer = gen.der;
  }

  const { id } = ensureManifestKey(destDir, keyDer);
  if (preferred && id !== preferred) {
    throw new Error(`ID rozszerzenia ${id} ≠ oczekiwane ${preferred}`);
  }
  return { id, keyDer };
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
    // Re-pin key on every load so Chromium keeps the Chrome Web Store ID
    try {
      const meta = readManifest(rec.path);
      if (meta.key) {
        const der = decodeManifestKey(meta.key);
        if (der) ensureManifestKey(rec.path, der);
      }
    } catch {
      /* */
    }
    const ext = await ses.loadExtension(rec.path, { allowFileAccess: true });
    map.set(rec.id, ext);
    if (ext?.id && isChromeExtensionId(ext.id)) {
      rec.chromeId = ext.id;
      if (rec.id !== ext.id && !isChromeExtensionId(rec.id)) {
        // Legacy store id (ext-…) — keep folder, update chromeId field only
      } else if (rec.id !== ext.id) {
        rec.id = ext.id;
      }
    }
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

async function unloadFromAllPrivate(rec) {
  for (const ses of [...privateSessions]) {
    const map = loadedPrivate.get(ses);
    if (!map) continue;
    await unloadFromSession(ses, rec, map);
  }
}

async function unloadEverywhere(rec) {
  await unloadOneMain(rec);
  await unloadFromAllPrivate(rec);
}

/** Call when a private ephemeral session is created — only allowPrivate extensions. */
async function attachToPrivateSession(ses) {
  if (!ses || isTorSession(ses)) return;
  privateSessions.add(ses);
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

async function loadAllEnabled() {
  for (const rec of records) {
    if (rec.enabled) await loadOneMain(rec);
  }
  syncAdblockForExtensions();
}

/**
 * Migrate legacy ext-* folder installs: if manifest has key, rename record/folder to Chrome ID.
 */
function migrateLegacyIds() {
  let changed = false;
  for (const rec of records) {
    try {
      if (!fs.existsSync(rec.path)) continue;
      const meta = readManifest(rec.path);
      if (!meta.key) continue;
      const der = decodeManifestKey(meta.key);
      if (!der) continue;
      const chromeId = publicKeyDerToExtensionId(der);
      if (rec.id === chromeId) {
        rec.chromeId = chromeId;
        continue;
      }
      const newPath = path.join(unpackedRoot(), chromeId);
      if (rec.path !== newPath) {
        if (fs.existsSync(newPath)) {
          // Prefer existing chrome-id folder
          try {
            fs.rmSync(rec.path, { recursive: true, force: true });
          } catch {
            /* */
          }
          rec.path = newPath;
        } else {
          try {
            fs.renameSync(rec.path, newPath);
            rec.path = newPath;
          } catch {
            try {
              fs.cpSync(rec.path, newPath, { recursive: true });
              fs.rmSync(rec.path, { recursive: true, force: true });
              rec.path = newPath;
            } catch (err) {
              console.warn('[ext] migrate path', err && err.message);
              continue;
            }
          }
        }
      }
      ensureManifestKey(rec.path, der);
      // Drop duplicate if another record already owns this chrome id
      const dup = records.find((r) => r !== rec && r.id === chromeId);
      if (dup) {
        records = records.filter((r) => r !== rec);
        changed = true;
        continue;
      }
      rec.id = chromeId;
      rec.chromeId = chromeId;
      changed = true;
      console.log('[ext] migrated id →', chromeId, rec.name);
    } catch (err) {
      console.warn('[ext] migrate', err && err.message);
    }
  }
  if (changed) saveStore();
}

async function init() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await app.whenReady();
    loadStore();
    fs.mkdirSync(unpackedRoot(), { recursive: true });
    fs.mkdirSync(stagingRoot(), { recursive: true });
    migrateLegacyIds();
    await loadAllEnabled();
  })();
  return initPromise;
}

function list() {
  return records.map((r) => ({
    ...r,
    loaded: loadedMain.has(r.id),
    electronId: loadedMain.get(r.id)?.id || r.chromeId || null,
    usesWebRequest: wantsChromeWebRequest(r),
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

/** CRX2/CRX3 → zip bytes on disk; returns public key DER when present */
function crxToZip(crxPath, zipOut, preferredId) {
  const buf = fs.readFileSync(crxPath);
  if (buf.length < 16 || buf.toString('utf8', 0, 4) !== 'Cr24') {
    fs.copyFileSync(crxPath, zipOut);
    return null;
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
  return extractPublicKeyFromCrx(buf, preferredId);
}

/**
 * @param {string} srcDir
 * @param {string} [sourceLabel]
 * @param {{ preferredId?: string|null, publicKeyDer?: Buffer|null }} [identity]
 */
async function installFromUnpacked(srcDir, sourceLabel, identity = {}) {
  const manifestDir = findManifestDir(srcDir);
  if (!manifestDir) {
    return { ok: false, error: 'Brak manifest.json w katalogu / archiwum' };
  }
  const meta = readManifest(manifestDir);
  const stagePin = path.join(stagingRoot(), `pin-${Date.now()}`);
  fs.mkdirSync(stagePin, { recursive: true });
  try {
    fs.cpSync(manifestDir, stagePin, { recursive: true });
    const { id } = pinChromeIdentity(stagePin, identity);
    const dest = path.join(unpackedRoot(), id);
    if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(stagePin, dest, { recursive: true });
    const pinnedMeta = readManifest(dest);
    const rec = {
      id,
      chromeId: id,
      name: pinnedMeta.name || meta.name,
      version: pinnedMeta.version || meta.version,
      path: dest,
      enabled: true,
      allowPrivate: false,
      pinned: false,
      permissions: pinnedMeta.permissions,
      manifestVersion: pinnedMeta.manifestVersion,
      source: sourceLabel || 'folder',
    };
    // Replace same Chrome id or same name+version
    records = records.filter(
      (r) => r.id !== id && !(r.name === rec.name && r.version === rec.version && r.source === rec.source),
    );
    records.push(rec);
    saveStore();
    await loadOneMain(rec);
    syncAdblockForExtensions();
    return { ok: true, extension: list().find((x) => x.id === id) };
  } finally {
    try {
      fs.rmSync(stagePin, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
}

async function installFromFolder(sourcePath) {
  const src = String(sourcePath || '');
  if (!src || !fs.existsSync(src)) {
    return { ok: false, error: 'Ścieżka nie istnieje' };
  }
  return installFromUnpacked(src, 'folder');
}

async function installFromArchive(filePath, identity = {}) {
  const src = String(filePath || '');
  if (!src || !fs.existsSync(src)) return { ok: false, error: 'Plik nie istnieje' };
  const lower = src.toLowerCase();
  const stage = path.join(stagingRoot(), `pack-${Date.now()}`);
  fs.mkdirSync(stage, { recursive: true });
  try {
    let zipPath = src;
    let publicKeyDer = identity.publicKeyDer || null;
    const preferredId = identity.preferredId || null;
    if (lower.endsWith('.crx')) {
      zipPath = path.join(stage, 'ext.zip');
      publicKeyDer = crxToZip(src, zipPath, preferredId) || publicKeyDer;
    } else if (!lower.endsWith('.zip')) {
      return { ok: false, error: 'Obsługiwane: folder, .zip, .crx' };
    }
    const extractTo = path.join(stage, 'out');
    expandArchive(zipPath, extractTo);
    return installFromUnpacked(extractTo, lower.endsWith('.crx') ? 'crx' : 'zip', {
      preferredId,
      publicKeyDer,
    });
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
  return m ? m[1].toLowerCase() : null;
}

function chromeProdVersion() {
  const v = String(process.versions.chrome || process.versions.electron || '131.0.0.0');
  // Google update endpoint expects Chrome-like major.minor.build.patch
  if (/^\d+\.\d+\.\d+\.\d+/.test(v)) return v.split(' ')[0];
  if (/^\d+\.\d+\.\d+/.test(v)) return `${v}.0`;
  return '131.0.0.0';
}

async function downloadCrx(extensionId) {
  const prod = chromeProdVersion();
  const urls = [
    `https://clients2.google.com/service/update2/crx?response=redirect&prod=chromiumcrx&prodchannel=&prodversion=${encodeURIComponent(prod)}&acceptformat=crx3&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`,
    `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${encodeURIComponent(prod)}&acceptformat=crx3&x=id%3D${extensionId}%26installsource%3Dondemand%26uc`,
  ];
  let lastErr = null;
  for (const url of urls) {
    try {
      const res = await net.fetch(url, { redirect: 'follow' });
      if (!res.ok) {
        lastErr = new Error(`Pobieranie CRX: HTTP ${res.status}`);
        continue;
      }
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length < 16) {
        lastErr = new Error('Pusty CRX');
        continue;
      }
      const out = path.join(stagingRoot(), `${extensionId}.crx`);
      fs.mkdirSync(stagingRoot(), { recursive: true });
      fs.writeFileSync(out, buf);
      return out;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Pobieranie CRX nieudane');
}

async function installFromStore(input) {
  const id = parseChromeStoreId(input);
  if (!id) return { ok: false, error: 'Podaj ID lub link Chrome Web Store' };
  try {
    const crx = await downloadCrx(id);
    const result = await installFromArchive(crx, { preferredId: id });
    try {
      fs.unlinkSync(crx);
    } catch {
      /* */
    }
    if (result.ok && result.extension) {
      const rec = records.find((r) => r.id === result.extension.id);
      if (rec) {
        rec.source = `cws:${id}`;
        rec.chromeId = rec.chromeId || id;
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
  if (rec.enabled) {
    await loadOneMain(rec);
    if (rec.allowPrivate) {
      for (const ses of [...privateSessions]) {
        const map = loadedPrivate.get(ses) || new Map();
        loadedPrivate.set(ses, map);
        await loadIntoSession(ses, rec, map);
      }
    }
  } else {
    await unloadEverywhere(rec);
  }
  syncAdblockForExtensions();
  return { ok: true, extension: list().find((x) => x.id === id) };
}

async function setAllowPrivate(id, allow) {
  const rec = records.find((r) => r.id === id);
  if (!rec) return { ok: false, error: 'not_found' };
  rec.allowPrivate = Boolean(allow);
  saveStore();
  if (!rec.allowPrivate) {
    await unloadFromAllPrivate(rec);
  } else if (rec.enabled) {
    for (const ses of [...privateSessions]) {
      const map = loadedPrivate.get(ses) || new Map();
      loadedPrivate.set(ses, map);
      await loadIntoSession(ses, rec, map);
    }
  }
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
  await unloadEverywhere(rec);
  records = records.filter((r) => r.id !== id);
  saveStore();
  try {
    if (rec.path.startsWith(unpackedRoot())) fs.rmSync(rec.path, { recursive: true, force: true });
  } catch {
    /* */
  }
  syncAdblockForExtensions();
  return { ok: true };
}

function register(ipcMain, wrapApp, wrapAppOrGuest) {
  const wrapAnyGuest = typeof wrapAppOrGuest === 'function' ? wrapAppOrGuest : wrapApp;
  // Guests may only call from the Web Store page (preload gates too; this is the main-side check).
  const wrapGuestOk = (fn) =>
    wrapAnyGuest((e, ...args) => {
      const wc = e?.sender;
      if (wc?.getType?.() === 'webview' && !isChromeWebStoreUrl(wc.getURL())) {
        throw new Error('Odrzucono IPC spoza Chrome Web Store');
      }
      return fn(e, ...args);
    });

  ipcMain.handle(
    'shell:extensions-list',
    wrapGuestOk(() => ({ ok: true, extensions: list() })),
  );
  ipcMain.handle('shell:extensions-install-folder', wrapApp(async (e) => {
    const { BrowserWindow } = require('electron');
    const parent = BrowserWindow.fromWebContents(e.sender);
    return pickAndInstall(parent);
  }));
  ipcMain.handle(
    'shell:extensions-install-store',
    wrapGuestOk(async (e, input) => {
      const id = parseChromeStoreId(input);
      if (!id) return { ok: false, error: 'Podaj ID lub link Chrome Web Store' };
      // Guest (Chrome Web Store): in-chrome bar confirm — not an OS dialog
      try {
        const wc = e?.sender;
        const isGuest =
          wc && !wc.isDestroyed() && typeof wc.getType === 'function' && wc.getType() === 'webview';
        if (isGuest) {
          let sourceUrl = '';
          try {
            sourceUrl = typeof wc.getURL === 'function' ? wc.getURL() : '';
          } catch {
            /* */
          }
          const allowed = await askInstallConfirm({ extensionId: id, sourceUrl });
          if (!allowed) return { ok: false, canceled: true };
        }
      } catch (err) {
        console.warn('[ext] install confirm', err && err.message);
        return { ok: false, error: 'Nie udało się potwierdzić instalacji' };
      }
      return installFromStore(id);
    }),
  );
  ipcMain.handle(
    'shell:extensions-install-respond',
    wrapApp((_e, askId, allow) => respondInstallAsk(String(askId || ''), Boolean(allow))),
  );
  ipcMain.handle('shell:extensions-set-enabled', wrapApp((_e, id, enabled) => setEnabled(String(id || ''), enabled)));
  ipcMain.handle(
    'shell:extensions-set-private',
    wrapApp((_e, id, allow) => setAllowPrivate(String(id || ''), allow)),
  );
  ipcMain.handle('shell:extensions-set-pinned', wrapApp((_e, id, pinned) => setPinned(String(id || ''), pinned)));
  ipcMain.handle('shell:extensions-remove', wrapApp((_e, id) => remove(String(id || ''))));
  ipcMain.handle(
    'shell:extensions-select-tab',
    wrapApp((_e, webContentsId) => {
      try {
        const { webContents } = require('electron');
        const wc = webContents.fromId(Number(webContentsId));
        if (wc && !wc.isDestroyed() && chromeExtApi) {
          chromeExtApi.selectTab(wc);
          return { ok: true };
        }
      } catch (err) {
        console.warn('[ext] selectTab', err);
      }
      return { ok: false };
    }),
  );
}

/** @type {import('electron-chrome-extensions').ElectronChromeExtensions | null} */
let chromeExtApi = null;
/** @type {((url: string, opts?: object) => void) | null} */
let openUrlHandler = null;
/** @type {(() => import('electron').BrowserWindow | null) | null} */
let getMainWindow = null;

/**
 * Wire electron-chrome-extensions (chrome.tabs / action popups / contextMenus).
 * Tor sessions never get this API.
 */
function initChromeApi(opts = {}) {
  openUrlHandler = typeof opts.onOpenUrl === 'function' ? opts.onOpenUrl : null;
  getMainWindow = typeof opts.getMainWindow === 'function' ? opts.getMainWindow : null;
  if (chromeExtApi) return chromeExtApi;
  try {
    const { ElectronChromeExtensions } = require('electron-chrome-extensions');
    const ses = mainSession();
    try {
      ElectronChromeExtensions.handleCRXProtocol(ses);
    } catch (err) {
      console.warn('[ext] handleCRXProtocol main', err && err.message);
    }
    try {
      ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);
    } catch (err) {
      console.warn('[ext] handleCRXProtocol default', err && err.message);
    }
    chromeExtApi = new ElectronChromeExtensions({
      license: 'GPL-3.0',
      session: ses,
      createTab: async (details) => {
        const win = getMainWindow?.() || null;
        const url = details?.url || 'about:blank';
        if (openUrlHandler) openUrlHandler(url, { background: !details?.active });
        // Library expects [webContents, BrowserWindow] — return host chrome WC as placeholder;
        // real guest arrives via addTab when the renderer opens the tab.
        if (win && !win.isDestroyed()) return [win.webContents, win];
        throw new Error('no window');
      },
      selectTab: (tab /*, browserWindow */) => {
        try {
          const win = getMainWindow?.() || null;
          if (win && !win.isDestroyed() && tab && !tab.isDestroyed()) {
            win.webContents.send('shell:extensions-activate-tab', { webContentsId: tab.id });
          }
        } catch {
          /* */
        }
      },
      removeTab: (tab /*, browserWindow */) => {
        try {
          const win = getMainWindow?.() || null;
          if (win && !win.isDestroyed() && tab && !tab.isDestroyed()) {
            win.webContents.send('shell:extensions-close-tab', { webContentsId: tab.id });
          }
        } catch {
          /* */
        }
      },
      createWindow: async (details) => {
        const { BrowserWindow } = require('electron');
        if (typeof opts.createWindow === 'function') {
          const w = await opts.createWindow(details);
          if (w) return w;
        }
        return new BrowserWindow({
          width: details?.width || 1200,
          height: details?.height || 800,
          webPreferences: {
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
            session: ses,
          },
        });
      },
      removeWindow: (bw) => {
        try {
          if (bw && !bw.isDestroyed()) bw.close();
        } catch {
          /* */
        }
      },
      // Installed extensions: grant optional permission prompts (Chrome prompts once; we auto-allow).
      requestPermissions: async (_extension, _permissions) => true,
    });
    try {
      chromeExtApi.on('browser-action-popup-created', (popup) => {
        try {
          if (popup?.browserWindow && !popup.browserWindow.isDestroyed()) {
            popup.browserWindow.setBackgroundColor('#1e1f24');
          }
        } catch {
          /* */
        }
      });
    } catch {
      /* */
    }
    console.log('[ext] electron-chrome-extensions ready');
  } catch (err) {
    console.warn('[ext] electron-chrome-extensions unavailable', err && err.message);
    chromeExtApi = null;
  }
  return chromeExtApi;
}

/**
 * Register a guest webContents as a chrome.tabs tab (never Tor).
 * @param {import('electron').WebContents} guestWc
 * @param {import('electron').BrowserWindow} hostWin
 * @param {{ tor?: boolean }} [opts]
 */
function trackGuestTab(guestWc, hostWin, opts = {}) {
  if (!chromeExtApi || !guestWc || guestWc.isDestroyed()) return;
  if (opts.tor) return;
  if (guestWc.__djxxrExtTab) return;
  try {
    if (hostWin && !hostWin.isDestroyed()) {
      require('./window-events.cjs').patchWindow(hostWin);
      try {
        require('./webcontents-events.cjs').patchWebContents(hostWin.webContents);
      } catch {
        /* */
      }
    }
    require('./webcontents-events.cjs').patchWebContents(guestWc);
    chromeExtApi.addTab(guestWc, hostWin);
    guestWc.__djxxrExtTab = true;
  } catch (err) {
    console.warn('[ext] addTab', err && err.message);
  }
}

function getContextMenuItems(guestWc, params) {
  if (!chromeExtApi || !guestWc) return [];
  try {
    return chromeExtApi.getContextMenuItems(guestWc, params) || [];
  } catch {
    return [];
  }
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
  initChromeApi,
  trackGuestTab,
  getContextMenuItems,
  getChromeApi: () => chromeExtApi,
  syncAdblockForExtensions,
  setInstallAskHandler,
  respondInstallAsk,
};
