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
    if (typeof ses.setSpellCheckerEnabled === 'function') ses.setSpellCheckerEnabled(true);
    if (typeof ses.setSpellCheckerLanguages === 'function') ses.setSpellCheckerLanguages(['pl', 'en-US']);
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

module.exports = {
  PRIVATE_PARTITION_RE,
  isPrivatePartition,
  createPrivatePartition,
  setWindowMeta,
  getWindowMeta,
  getMetaForWebContents,
  ensurePrivateSession,
  wipePrivatePartition,
};
