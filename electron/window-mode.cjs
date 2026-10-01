/**
 * Window chrome mode for secondary BrowserWindows (private / tor).
 * Ephemeral private partitions: private-<uuid> (no persist).
 */
const { randomUUID } = require('node:crypto');
const { session } = require('electron');
const security = require('./security.cjs');
const privacy = require('./privacy.cjs');
const downloads = require('./downloads.cjs');
const adblock = require('./adblock-plus.cjs');
const spellcheck = require('./spellcheck.cjs');

/** @type {WeakMap<import('electron').BrowserWindow, { mode: string, partition: string|null }>} */
const windowMeta = new WeakMap();

const PRIVATE_PARTITION_RE = /^private-[0-9a-f-]{8,}$/i;

function isPrivatePartition(name) {
  return PRIVATE_PARTITION_RE.test(String(name || ''));
}

function createPrivatePartition() {
  return `private-${randomUUID()}`;
}

/**
 * @param {import('electron').BrowserWindow} bw
 * @param {{ mode?: string, partition?: string|null }} meta
 */
function setWindowMeta(bw, meta) {
  windowMeta.set(bw, {
    mode: meta.mode || 'normal',
    partition: meta.partition || null,
  });
}

function getWindowMeta(bw) {
  return windowMeta.get(bw) || { mode: 'normal', partition: null };
}

function getMetaForWebContents(wc) {
  const { BrowserWindow } = require('electron');
  const win = BrowserWindow.fromWebContents(wc);
  if (!win) return { mode: 'normal', partition: null };
  return getWindowMeta(win);
}

/** Wire adblock/downloads/privacy for ephemeral private session (once). */
const wired = new WeakSet();
function ensurePrivateSession(ses) {
  if (!ses || wired.has(ses)) return;
  wired.add(ses);
  try {
    security.attachPermissionHandlers(ses);
    adblock.attachToSession(ses);
    downloads.attachToSession(ses, { tor: false, ephemeral: true });
    privacy.attachToSession(ses, {
      isTracker: (url) => {
        try {
          return adblock.shouldBlock(url);
        } catch {
          return false;
        }
      },
    });
    spellcheck.applyToSession(ses, { tor: false });
  } catch (err) {
    console.warn('[window-mode] ensurePrivateSession', err);
  }
}

async function wipePrivatePartition(partition) {
  if (!isPrivatePartition(partition)) return;
  try {
    const ses = session.fromPartition(partition);
    await ses.clearStorageData();
    await ses.clearCache();
  } catch (err) {
    console.warn('[window-mode] wipe', err);
  }
}

/**
 * Remove legacy on-disk persist:private folder BEFORE any session is created.
 * On EPERM, leave a flag and retry next boot; log the warning only once per sticky failure.
 * Does NOT call session.fromPartition('persist:private') — that would recreate the store.
 */
function purgeLegacyPrivatePartitionSync() {
  const { app } = require('electron');
  const fs = require('node:fs');
  const path = require('node:path');
  const userData = app.getPath('userData');
  const partDir = path.join(userData, 'Partitions', 'private');
  const flagPath = path.join(userData, 'purge-private-pending');
  const loggedPath = path.join(userData, 'purge-private-logged');

  const pending = fs.existsSync(flagPath);
  const exists = fs.existsSync(partDir);
  if (!exists && !pending) return { ok: true, skipped: true };

  try {
    if (exists) {
      fs.rmSync(partDir, { recursive: true, force: true });
    }
    if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
    if (fs.existsSync(loggedPath)) fs.unlinkSync(loggedPath);
    console.log('[window-mode] removed legacy Partitions/private');
    return { ok: true };
  } catch (err) {
    try {
      fs.writeFileSync(flagPath, String(Date.now()), { encoding: 'utf8' });
    } catch {
      /* */
    }
    let alreadyLogged = false;
    try {
      alreadyLogged = fs.existsSync(loggedPath);
    } catch {
      /* */
    }
    if (!alreadyLogged) {
      console.warn(
        '[window-mode] purge Partitions/private failed (will retry next start):',
        err && err.message ? err.message : err,
      );
      try {
        fs.writeFileSync(loggedPath, '1', { encoding: 'utf8' });
      } catch {
        /* */
      }
    }
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

module.exports = {
  PRIVATE_PARTITION_RE,
  isPrivatePartition,
  createPrivatePartition,
  setWindowMeta,
  getWindowMeta,
  getMetaForWebContents,
  ensurePrivateSession,
  wipePrivatePartition,
  purgeLegacyPrivatePartitionSync,
};
