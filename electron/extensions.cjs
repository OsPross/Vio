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
    let text = fs.readFileSync(storeFile(), 'utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const raw = JSON.parse(text);
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
    // Resolve __MSG_* names left over from older installs
    let dirty = false;
    for (const rec of records) {
      try {
        if (!rec.path || !fs.existsSync(rec.path)) continue;
        const meta = readManifest(rec.path);
        if (meta.name && !meta.name.startsWith('__MSG_') && rec.name !== meta.name) {
          rec.name = meta.name;
          dirty = true;
        }
        if (!rec.iconRel && meta.iconRel) {
          rec.iconRel = meta.iconRel;
          dirty = true;
        }
      } catch {
        /* */
      }
    }
    if (dirty) saveStore();
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

/**
 * Resolve chrome.i18n message placeholders (__MSG_foo__) from _locales.
 * @param {string} dir
 * @param {string} value
 * @returns {string}
 */
function resolveManifestString(dir, value) {
  const s = String(value || '');
  const m = /^__MSG_([A-Za-z0-9_]+)__$/.exec(s);
  if (!m) return s;
  const key = m[1];
  let locale = 'en';
  try {
    const mf = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
    if (typeof mf.default_locale === 'string' && mf.default_locale) locale = mf.default_locale;
  } catch {
    /* */
  }
  for (const loc of [locale, 'en', 'en_US', 'pl']) {
    try {
      const messages = JSON.parse(
        fs.readFileSync(path.join(dir, '_locales', loc, 'messages.json'), 'utf8'),
      );
      const entry = messages[key] || messages[key.toLowerCase()];
      if (entry && typeof entry.message === 'string' && entry.message) return entry.message;
    } catch {
      /* */
    }
  }
  return s;
}

/**
 * Pick best icon path relative to extension root (for toolbar / about:extensions).
 * @param {string} dir
 * @param {object} raw
 * @returns {string|null}
 */
function pickIconRel(dir, raw) {
  const candidates = [];
  const collect = (icons) => {
    if (!icons || typeof icons !== 'object') return;
    for (const [size, p] of Object.entries(icons)) {
      const n = Number(size) || 0;
      if (typeof p === 'string' && p) candidates.push({ n, p: p.replace(/^\//, '') });
    }
  };
  collect(raw.icons);
  const action = raw.action || raw.browser_action;
  if (action && typeof action === 'object') collect(action.default_icon);
  candidates.sort((a, b) => b.n - a.n);
  for (const c of candidates) {
    if (fs.existsSync(path.join(dir, c.p))) return c.p;
  }
  // Common fallbacks
  for (const p of ['icon.png', 'icons/icon128.png', 'icons/icon48.png', 'img/icon128.png']) {
    if (fs.existsSync(path.join(dir, p))) return p;
  }
  return null;
}

/**
 * APIs Electron / electron-chrome-extensions often lack or only partially support.
 * Used for honest "may not work fully" UI — not a hard block.
 */
const LIMITED_PERMS = new Set([
  'declarativenetrequest',
  'declarativenetrequestwithhostaccess',
  'declarativenetrequestfeedback',
  'webrequestblocking',
  'debugger',
  'proxy',
  'nativemessaging',
  'identity',
  'enterprise.deviceattributes',
  'offscreen',
  'sidepanel',
  'userscripts',
  'tabgroups',
  'devtools',
  'tabcapture',
  'desktopcapture',
]);

function assessCompatibility(rec, raw) {
  const warnings = [];
  const perms = (rec.permissions || []).map((p) => String(p).toLowerCase());
  const limited = perms.filter((p) => {
    const base = p.split('.')[0];
    return LIMITED_PERMS.has(p) || LIMITED_PERMS.has(base);
  });
  if (limited.length) {
    const hasTabCapture = limited.some((p) => p.includes('tabcapture'));
    warnings.push(
      hasTabCapture
        ? 'tabCapture: Electron go nie ma — Vio podłącza suwak głośności do aktywnej karty (Web Audio).'
        : `Niedostępne lub ograniczone w Electron: ${limited.slice(0, 4).join(', ')}${limited.length > 4 ? '…' : ''}`,
    );
  }
  if (looksLikeAdblocker(rec) && wantsChromeWebRequest(rec)) {
    warnings.push('Adblocker: wstrzymuje sieciowy Ghostery (konflikt webRequest/DNR).');
  }
  // MV3 content/scripting extensions often work; only flag SW when other gaps exist
  if (raw?.background?.service_worker && limited.length) {
    warnings.push('Service worker MV3 — część chrome.* może być niedostępna.');
  }
  const uniq = [...new Set(warnings)];
  return {
    limitedSupport: uniq.length > 0,
    warnings: uniq.slice(0, 3),
  };
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
  const nameRaw = String(raw.name || path.basename(dir));
  const iconRel = pickIconRel(dir, raw);
  return {
    name: resolveManifestString(dir, nameRaw),
    version: String(raw.version || '0'),
    manifestVersion: Number(raw.manifest_version) || 2,
    permissions: [...new Set(perms)],
    key: typeof raw.key === 'string' ? raw.key : null,
    iconRel,
    raw,
  };
}

function iconDataUrl(dir, iconRel) {
  if (!dir || !iconRel) return null;
  try {
    const abs = path.join(dir, iconRel);
    if (!fs.existsSync(abs)) return null;
    const buf = fs.readFileSync(abs);
    if (buf.length > 512 * 1024) return null;
    const ext = path.extname(abs).toLowerCase();
    const mime =
      ext === '.svg'
        ? 'image/svg+xml'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
            ? 'image/webp'
            : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
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
  let storeDirty = false;
  const out = records.map((r) => {
    let icon = null;
    let limitedSupport = false;
    let warnings = [];
    let displayName = r.name;
    let hasPopup = false;
    try {
      if (fs.existsSync(r.path)) {
        const meta = readManifest(r.path);
        icon = iconDataUrl(r.path, meta.iconRel || r.iconRel);
        const assessed = assessCompatibility(r, meta.raw);
        limitedSupport = assessed.limitedSupport;
        warnings = assessed.warnings;
        if (meta.name && !meta.name.startsWith('__MSG_')) {
          displayName = meta.name;
          if (r.name !== displayName) {
            r.name = displayName;
            storeDirty = true;
          }
        }
        const action = meta.raw?.action || meta.raw?.browser_action;
        hasPopup = Boolean(action && typeof action === 'object' && action.default_popup);
      }
    } catch {
      /* */
    }
    return {
      ...r,
      name: displayName,
      loaded: loadedMain.has(r.id),
      electronId: loadedMain.get(r.id)?.id || r.chromeId || null,
      usesWebRequest: wantsChromeWebRequest(r),
      icon,
      limitedSupport,
      warnings,
      hasPopup,
      canUpdate: Boolean(
        (r.chromeId && isChromeExtensionId(r.chromeId)) ||
          (isChromeExtensionId(r.id) && String(r.source || '').startsWith('cws:')),
      ),
    };
  });
  if (storeDirty) saveStore();
  return out;
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
      pinned: true,
      permissions: pinnedMeta.permissions,
      manifestVersion: pinnedMeta.manifestVersion,
      source: sourceLabel || 'folder',
      iconRel: pinnedMeta.iconRel || null,
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
  try {
    const { chromeFull } = require('./ua-chrome.cjs');
    if (typeof chromeFull === 'function') {
      const v = String(chromeFull() || '');
      if (/^\d+\.\d+\.\d+\.\d+/.test(v)) return v.split(' ')[0];
    }
  } catch {
    /* */
  }
  const v = String(process.versions.chrome || process.versions.electron || '134.0.0.0');
  // Google update endpoint expects Chrome-like major.minor.build.patch
  if (/^\d+\.\d+\.\d+\.\d+/.test(v)) return v.split(' ')[0];
  if (/^\d+\.\d+\.\d+/.test(v)) return `${v}.0`;
  return '134.0.0.0';
}

function chromeDownloadUa(prod) {
  try {
    const { buildChromeUa } = require('./ua-chrome.cjs');
    if (typeof buildChromeUa === 'function') return buildChromeUa();
  } catch {
    /* */
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${prod} Safari/537.36`;
}

/**
 * Download a signed CRX from Google's update2 endpoint.
 * Requires Chrome-like UA + acceptformat=crx2,crx3; wrong/missing IDs return HTTP 404
 * with body "error-unknownApplication".
 */
async function downloadCrx(extensionId) {
  const id = String(extensionId || '').toLowerCase();
  if (!isChromeExtensionId(id)) throw new Error('Nieprawidłowe ID rozszerzenia');
  const prod = chromeProdVersion();
  const ua = chromeDownloadUa(prod);
  const urls = [
    `https://clients2.google.com/service/update2/crx?response=redirect&acceptformat=crx2,crx3&prodversion=${encodeURIComponent(prod)}&x=id%3D${id}%26installsource%3Dondemand%26uc`,
    `https://clients2.google.com/service/update2/crx?response=redirect&os=win&arch=x64&os_arch=x86_64&nacl_arch=x86-64&prod=chromiumcrx&prodchannel=&prodversion=${encodeURIComponent(prod)}&lang=en-US&acceptformat=crx2,crx3&x=id%3D${id}%26installsource%3Dondemand%26uc`,
  ];
  let lastErr = null;
  for (const url of urls) {
    try {
      const res = await net.fetch(url, {
        redirect: 'follow',
        headers: {
          'User-Agent': ua,
          Accept: 'application/x-chrome-extension,*/*',
        },
      });
      if (!res.ok) {
        lastErr = new Error(
          res.status === 404
            ? `Rozszerzenie niedostępne w sklepie (HTTP 404) — sprawdź ID`
            : `Pobieranie CRX: HTTP ${res.status}`,
        );
        continue;
      }
      const ab = await res.arrayBuffer();
      const buf = Buffer.from(ab);
      if (buf.length < 16) {
        lastErr = new Error('Pusty CRX');
        continue;
      }
      const magic = buf.toString('utf8', 0, 4);
      if (magic !== 'Cr24') {
        lastErr = new Error(`Odpowiedź nie jest plikiem CRX (magic=${JSON.stringify(magic)})`);
        continue;
      }
      const out = path.join(stagingRoot(), `${id}.crx`);
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

/** Re-download from CWS when we know the Chrome Web Store id. */
async function updateFromStore(id) {
  const rec = records.find((r) => r.id === id);
  if (!rec) return { ok: false, error: 'not_found' };
  const storeId =
    (rec.chromeId && isChromeExtensionId(rec.chromeId) && rec.chromeId) ||
    (isChromeExtensionId(rec.id) && rec.id) ||
    (typeof rec.source === 'string' && /^cws:([a-p]{32})$/i.exec(rec.source)?.[1]) ||
    null;
  if (!storeId) {
    return { ok: false, error: 'Brak ID Chrome Web Store — zaktualizuj ręcznie (folder / CRX)' };
  }
  const wasPinned = rec.pinned;
  const wasEnabled = rec.enabled;
  const allowPrivate = rec.allowPrivate;
  const result = await installFromStore(storeId);
  if (result.ok) {
    const next = records.find((r) => r.id === storeId || r.chromeId === storeId || r.id === result.extension?.id);
    if (next) {
      next.pinned = wasPinned;
      next.allowPrivate = allowPrivate;
      if (!wasEnabled) {
        next.enabled = true;
        saveStore();
        await setEnabled(next.id, false);
      } else {
        saveStore();
      }
    }
  }
  return result;
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
  // Turning on → pin to toolbar so the user has a visible icon to click
  if (rec.enabled && !rec.pinned) rec.pinned = true;
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

/** @type {import('electron').BrowserWindow | null} */
let actionPopupWin = null;
/** Guests that arrived before electron-chrome-extensions was ready. */
const pendingGuestTabs = [];
/** @type {ReturnType<typeof setInterval> | null} */
let audiblePollTimer = null;
/** @type {WeakMap<object, boolean>} */
const lastAudible = new WeakMap();

/**
 * Apply volume gain to a guest page (Web Audio). Used because Electron has no
 * chrome.tabCapture for store extensions like Volume Master.
 * @param {import('electron').WebContents} guestWc
 * @param {number} percent 0–600 (Volume Master scale; 100 = normal)
 */
async function applyGuestVolumeGain(guestWc, percent) {
  if (!guestWc || guestWc.isDestroyed()) return { ok: false };
  const gain = Math.max(0, Math.min(8, Number(percent) / 100));
  const js = `(() => {
    const g = ${JSON.stringify(gain)};
    try {
      if (!window.__vioAudioBoost) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return { ok: false, error: 'no-audio-context' };
        const ctx = new AC();
        const gainNode = ctx.createGain();
        gainNode.connect(ctx.destination);
        gainNode.gain.value = 1;
        const wrap = (el) => {
          if (!el || el.__vioVolWrapped) return;
          try {
            const src = ctx.createMediaElementSource(el);
            src.connect(gainNode);
            el.__vioVolWrapped = true;
          } catch (_) { /* already connected / CORS */ }
        };
        document.querySelectorAll('audio,video').forEach(wrap);
        new MutationObserver(() => {
          document.querySelectorAll('audio,video').forEach(wrap);
        }).observe(document.documentElement, { childList: true, subtree: true });
        window.__vioAudioBoost = { ctx, gainNode };
        try { ctx.resume(); } catch (_) {}
      }
      window.__vioAudioBoost.gainNode.gain.setTargetAtTime(g, window.__vioAudioBoost.ctx.currentTime, 0.02);
      return { ok: true, gain: g };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  })()`;
  try {
    const res = await guestWc.executeJavaScript(js, true);
    return res && typeof res === 'object' ? res : { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function resolveGuestForVolume(preferredId) {
  const { webContents } = require('electron');
  if (preferredId != null) {
    const wc = webContents.fromId(Number(preferredId));
    if (wc && !wc.isDestroyed() && wc.getType?.() === 'webview') return wc;
  }
  if (chromeExtApi) {
    try {
      const active = chromeExtApi.ctx?.store?.getActiveTabOfCurrentWindow?.();
      if (active && !active.isDestroyed() && active.getType?.() === 'webview') return active;
    } catch {
      /* */
    }
  }
  try {
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue;
      if (wc.getType?.() !== 'webview') continue;
      if (isTorSession(wc.session)) continue;
      if (typeof wc.isCurrentlyAudible === 'function' && wc.isCurrentlyAudible()) return wc;
    }
  } catch {
    /* */
  }
  return null;
}

/**
 * Hook Volume Master (and similar) popup slider → guest Web Audio gain.
 * Electron cannot provide chrome.tabCapture; this is the practical substitute.
 */
function wireTabCaptureVolumeBridge(popupWc, guestHintId) {
  if (!popupWc || popupWc.isDestroyed()) return;
  if (popupWc.__vioVolBridge) return;
  popupWc.__vioVolBridge = true;

  const onConsole = (_e, _level, message) => {
    const m = /^__VIO_VOL__=(-?[\d.]+)$/.exec(String(message || ''));
    if (!m) return;
    const percent = Number(m[1]);
    if (!Number.isFinite(percent)) return;
    const guest = resolveGuestForVolume(guestHintId);
    if (!guest) return;
    void applyGuestVolumeGain(guest, percent);
  };
  popupWc.on('console-message', onConsole);
  popupWc.once('destroyed', () => {
    try {
      popupWc.removeListener('console-message', onConsole);
    } catch {
      /* */
    }
  });

  const inject = async () => {
    try {
      await popupWc.executeJavaScript(
        `(() => {
          if (window.__vioVolHook) return true;
          window.__vioVolHook = true;
          const send = (v) => { try { console.log('__VIO_VOL__=' + v); } catch (_) {} };
          const bind = () => {
            const nodes = document.querySelectorAll(
              '.js-volume-slider__slider, input[type=range], [class*="volume"] input[type=range]'
            );
            nodes.forEach((s) => {
              if (s.__vioVolBound) return;
              s.__vioVolBound = true;
              const fire = () => send(s.value);
              s.addEventListener('input', fire);
              s.addEventListener('change', fire);
              fire();
            });
          };
          bind();
          new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
          return true;
        })()`,
        true,
      );
    } catch (err) {
      console.warn('[ext] volume bridge inject', err && err.message);
    }
  };
  popupWc.on('dom-ready', () => {
    void inject();
  });
  popupWc.on('did-finish-load', () => {
    void inject();
  });
  void inject();
}

function startAudiblePolling() {
  if (audiblePollTimer) return;
  audiblePollTimer = setInterval(() => {
    if (!chromeExtApi) return;
    try {
      const tabs = chromeExtApi.ctx?.store?.tabs;
      if (!tabs) return;
      for (const tab of tabs) {
        if (!tab || tab.isDestroyed?.()) continue;
        let now = false;
        try {
          now = Boolean(tab.isCurrentlyAudible?.());
        } catch {
          continue;
        }
        const prev = lastAudible.get(tab);
        if (prev === now) continue;
        lastAudible.set(tab, now);
        try {
          tab.emit('tab-updated');
        } catch {
          /* */
        }
      }
    } catch {
      /* */
    }
  }, 750);
}

function flushPendingGuestTabs() {
  const { BrowserWindow } = require('electron');
  while (pendingGuestTabs.length) {
    const item = pendingGuestTabs.shift();
    if (!item?.guest || item.guest.isDestroyed()) continue;
    const host =
      item.host && !item.host.isDestroyed()
        ? item.host
        : BrowserWindow.fromWebContents(item.guest) || getMainWindow?.();
    trackGuestTab(item.guest, host, { tor: item.tor });
  }
}

function rescanGuestTabs() {
  const { webContents, BrowserWindow } = require('electron');
  try {
    for (const wc of webContents.getAllWebContents()) {
      if (wc.isDestroyed()) continue;
      if (wc.getType?.() !== 'webview') continue;
      if (isTorSession(wc.session)) continue;
      let host = null;
      try {
        host = BrowserWindow.fromWebContents(wc);
      } catch {
        /* */
      }
      if (!host) host = getMainWindow?.();
      trackGuestTab(wc, host, { tor: false });
    }
  } catch (err) {
    console.warn('[ext] rescan guests', err && err.message);
  }
}

/**
 * Open an extension's browser_action / action popup in a real window.
 * Does not depend on electron-chrome-extensions tab tracking (which often fails
 * for webview guests) — loads chrome-extension:// via persist:main session.
 */
async function openAction(id, opts = {}) {
  const key = String(id || '');
  const rec = records.find((r) => r.id === key || r.chromeId === key);
  if (!rec) return { ok: false, error: 'Nie znaleziono rozszerzenia' };

  if (!rec.enabled) {
    const en = await setEnabled(rec.id, true);
    if (!en?.ok) return { ok: false, error: en?.error || 'Nie udało się włączyć' };
  } else if (!loadedMain.has(rec.id)) {
    await loadOneMain(rec);
  }
  if (!rec.pinned) {
    rec.pinned = true;
    saveStore();
  }

  let popupRel = '';
  try {
    const meta = readManifest(rec.path);
    const action = meta.raw?.action || meta.raw?.browser_action;
    if (action && typeof action === 'object' && typeof action.default_popup === 'string') {
      popupRel = action.default_popup.replace(/^\//, '');
    }
  } catch (err) {
    return { ok: false, error: err?.message || 'Błąd odczytu manifestu' };
  }
  if (!popupRel) {
    return {
      ok: false,
      error: 'To rozszerzenie nie ma okna popup — działa w tle albo dopiero na stronie',
    };
  }

  const loaded = loadedMain.get(rec.id);
  const extId = loaded?.id || rec.chromeId || rec.id;
  const url = `chrome-extension://${extId}/${popupRel}`;
  const filePopup = path.join(rec.path, popupRel);

  const { BrowserWindow, screen } = require('electron');
  const parent = getMainWindow?.() || BrowserWindow.getFocusedWindow();
  if (!parent || parent.isDestroyed()) {
    return { ok: false, error: 'Brak okna przeglądarki' };
  }

  // Prefer the active *guest* webview as chrome.tabs target (never the host chrome —
  // host uses defaultSession and is not audible).
  const guestHint =
    opts?.webContentsId != null ? Number(opts.webContentsId) : NaN;
  let actionTabId = parent.webContents.id;
  try {
    flushPendingGuestTabs();
    rescanGuestTabs();
    const guest = resolveGuestForVolume(Number.isFinite(guestHint) ? guestHint : null);
    if (guest && !guest.isDestroyed()) {
      try {
        chromeExtApi?.addTab?.(guest, parent);
        chromeExtApi?.selectTab?.(guest, parent);
        actionTabId = guest.id;
      } catch (err) {
        console.warn('[ext] select guest tab', err && err.message);
      }
    }
  } catch {
    /* */
  }

  // Preferred path: electron-chrome-extensions PopupView (needs a tracked tab).
  try {
    if (chromeExtApi?.api?.browserAction?.activateClick) {
      const anchor = opts?.anchorRect || { x: 0, y: 48, width: 28, height: 28 };
      chromeExtApi.api.browserAction.activateClick({
        extensionId: extId,
        tabId: actionTabId,
        anchorRect: {
          x: Number(anchor.x) || 0,
          y: Number(anchor.y) || 48,
          width: Number(anchor.width) || 28,
          height: Number(anchor.height) || 28,
        },
        alignment: 'bottom left',
      });
      return { ok: true, via: 'browserAction', tabId: actionTabId };
    }
  } catch (err) {
    console.warn('[ext] browserAction.activateClick', err && err.message);
  }

  try {
    if (actionPopupWin && !actionPopupWin.isDestroyed()) {
      actionPopupWin.close();
    }
  } catch {
    /* */
  }
  actionPopupWin = null;

  const anchor = opts?.anchorRect || null;
  let x;
  let y;
  try {
    const pb = parent.getBounds();
    if (anchor && typeof anchor.x === 'number') {
      x = Math.round(pb.x + anchor.x + (anchor.width || 0) / 2 - 180);
      y = Math.round(pb.y + anchor.y + (anchor.height || 28) + 8);
    } else {
      x = Math.round(pb.x + pb.width - 400);
      y = Math.round(pb.y + 80);
    }
    const disp = screen.getDisplayMatching(pb);
    const wa = disp.workArea;
    x = Math.min(Math.max(wa.x + 8, x), wa.x + wa.width - 360);
    y = Math.min(Math.max(wa.y + 8, y), wa.y + wa.height - 200);
  } catch {
    /* */
  }

  const win = new BrowserWindow({
    width: 360,
    height: 520,
    x,
    y,
    show: false,
    frame: true,
    autoHideMenuBar: true,
    parent,
    modal: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#1e1f24',
    webPreferences: {
      session: mainSession(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: false,
    },
  });
  actionPopupWin = win;
  win.on('closed', () => {
    if (actionPopupWin === win) actionPopupWin = null;
  });

  wireTabCaptureVolumeBridge(win.webContents, Number.isFinite(guestHint) ? guestHint : actionTabId);
  try {
    try {
      await win.loadURL(url);
    } catch (crxErr) {
      // Some MV3 extensions fail chrome-extension:// after SW crash — fall back to file.
      if (!fs.existsSync(filePopup)) throw crxErr;
      console.warn('[ext] chrome-extension popup failed, file fallback', crxErr && crxErr.message);
      await win.loadFile(filePopup);
    }
    win.show();
    try {
      win.focus();
    } catch {
      /* */
    }
    return { ok: true, url };
  } catch (err) {
    try {
      if (!win.isDestroyed()) win.close();
    } catch {
      /* */
    }
    return {
      ok: false,
      error: `Nie udało się otworzyć popupu: ${err?.message || err}`,
    };
  }
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
    'shell:extensions-update',
    wrapApp((_e, id) => updateFromStore(String(id || ''))),
  );
  ipcMain.handle(
    'shell:extensions-open-action',
    wrapApp((_e, id, opts) => openAction(String(id || ''), opts && typeof opts === 'object' ? opts : {})),
  );
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
            let guestId = null;
            try {
              const active = chromeExtApi.ctx?.store?.getActiveTabOfCurrentWindow?.();
              if (active && !active.isDestroyed()) guestId = active.id;
            } catch {
              /* */
            }
            wireTabCaptureVolumeBridge(popup.browserWindow.webContents, guestId);
          }
        } catch {
          /* */
        }
      });
    } catch {
      /* */
    }
    flushPendingGuestTabs();
    rescanGuestTabs();
    startAudiblePolling();
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
  if (!guestWc || guestWc.isDestroyed()) return;
  if (opts.tor) return;
  if (!chromeExtApi) {
    pendingGuestTabs.push({ guest: guestWc, host: hostWin || null, tor: Boolean(opts.tor) });
    return;
  }
  if (guestWc.__djxxrExtTab) {
    // Still refresh audible / active selection when re-focused
    try {
      chromeExtApi.selectTab?.(guestWc, hostWin);
    } catch {
      /* */
    }
    return;
  }
  try {
    // Guests must share the extensions session (persist:main). Skip private/tor.
    try {
      const gp = String(guestWc.session?.partitionName || '');
      if (gp && !/^persist:main$/i.test(gp) && !/^persist:main\b/i.test(gp)) {
        // Ephemeral private partitions — only when allowPrivate loadIntoSession ran
        if (/^private-/i.test(gp) || /^tor-/i.test(gp)) {
          /* still allow addTab if extension was loaded into that session */
        } else if (gp.startsWith('persist:') && gp !== 'persist:main') {
          console.warn('[ext] skip addTab (partition)', gp);
          return;
        }
      }
    } catch {
      /* */
    }
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
    try {
      lastAudible.set(guestWc, Boolean(guestWc.isCurrentlyAudible?.()));
    } catch {
      /* */
    }
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
  updateFromStore,
  pickAndInstall,
  setEnabled,
  setAllowPrivate,
  setPinned,
  remove,
  openAction,
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
