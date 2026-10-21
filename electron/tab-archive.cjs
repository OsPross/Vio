'use strict';

/**
 * Archived tabs — JSON in userData/tab-archive.json (not browsing history, not Zustand).
 * Never stores Tor / private entries.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { writeAtomicSync } = require('./lib/atomic-write.cjs');

let app;
try {
  ({ app } = require('electron'));
} catch {
  app = null;
}

const VERSION = 1;
const MAX_ENTRIES = 200;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FLUSH_MS = 200;

/** @type {string | null} */
let rootOverride = null;

/** @typedef {{
 *   id: string,
 *   url: string,
 *   title: string,
 *   favicon?: string,
 *   archivedAt: number,
 *   scrollY?: number,
 *   session?: { stack: string[], index: number },
 *   navHistory?: object | null,
 * }} ArchiveEntry */

/** @type {{ version: number, entries: ArchiveEntry[] } | null} */
let store = null;
let dirty = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let flushTimer = null;

function archiveDir() {
  if (rootOverride) return rootOverride;
  try {
    if (app && typeof app.getPath === 'function') return app.getPath('userData');
  } catch {
    /* */
  }
  return path.join(os.tmpdir(), 'djxxr-tab-archive');
}

function archivePath() {
  return path.join(archiveDir(), 'tab-archive.json');
}

function _setRootForTests(dir) {
  rootOverride = dir || null;
  store = null;
  dirty = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

function uid() {
  return crypto.randomBytes(8).toString('hex');
}

function isForbiddenUrl(url) {
  const s = String(url || '');
  if (!s) return true;
  if (s.startsWith('about:') || s.startsWith('djxxr://')) return true;
  if (/\.onion\b/i.test(s)) return true;
  return false;
}

function prune(entries) {
  const cutoff = Date.now() - TTL_MS;
  return entries
    .filter((e) => e && typeof e.url === 'string' && e.archivedAt >= cutoff && !isForbiddenUrl(e.url))
    .sort((a, b) => b.archivedAt - a.archivedAt)
    .slice(0, MAX_ENTRIES);
}

function ensureLoaded() {
  if (store) return store;
  const file = archivePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const entries = Array.isArray(raw?.entries) ? raw.entries : [];
      store = { version: VERSION, entries: prune(entries) };
    } else {
      store = { version: VERSION, entries: [] };
    }
  } catch {
    store = { version: VERSION, entries: [] };
  }
  return store;
}

function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushNow();
  }, FLUSH_MS);
}

function flushNow() {
  if (!dirty || !store) return;
  dirty = false;
  try {
    fs.mkdirSync(path.dirname(archivePath()), { recursive: true });
    writeAtomicSync(archivePath(), JSON.stringify({ version: VERSION, entries: store.entries }, null, 0));
  } catch (err) {
    console.error('[tab-archive] flush', err);
  }
}

function init() {
  ensureLoaded();
}

function list() {
  const data = ensureLoaded();
  data.entries = prune(data.entries);
  return { ok: true, entries: data.entries.slice() };
}

/**
 * @param {Partial<ArchiveEntry> & { url: string }} raw
 */
function add(raw) {
  if (!raw || typeof raw.url !== 'string') return { ok: false, error: 'bad_url' };
  if (isForbiddenUrl(raw.url)) return { ok: false, error: 'forbidden' };
  const data = ensureLoaded();
  const entry = {
    id: String(raw.id || uid()),
    url: String(raw.url),
    title: String(raw.title || raw.url).slice(0, 200),
    favicon: typeof raw.favicon === 'string' ? raw.favicon : undefined,
    archivedAt: typeof raw.archivedAt === 'number' ? raw.archivedAt : Date.now(),
    scrollY: typeof raw.scrollY === 'number' ? raw.scrollY : undefined,
    session:
      raw.session && Array.isArray(raw.session.stack)
        ? { stack: raw.session.stack.map(String), index: Number(raw.session.index) || 0 }
        : undefined,
    navHistory: raw.navHistory || null,
  };
  data.entries = prune([entry, ...data.entries.filter((e) => e.id !== entry.id)]);
  scheduleFlush();
  return { ok: true, entry, entries: data.entries.slice() };
}

function remove(id) {
  const data = ensureLoaded();
  const before = data.entries.length;
  data.entries = data.entries.filter((e) => e.id !== String(id || ''));
  if (data.entries.length === before) return { ok: false, error: 'not_found' };
  scheduleFlush();
  return { ok: true, entries: data.entries.slice() };
}

function clear() {
  const data = ensureLoaded();
  data.entries = [];
  scheduleFlush();
  return { ok: true, entries: [] };
}

function register(ipcMain, wrapApp) {
  ipcMain.handle('shell:tab-archive-list', wrapApp(() => list()));
  ipcMain.handle('shell:tab-archive-add', wrapApp((_e, entry) => add(entry && typeof entry === 'object' ? entry : {})));
  ipcMain.handle('shell:tab-archive-remove', wrapApp((_e, id) => remove(id)));
  ipcMain.handle('shell:tab-archive-clear', wrapApp(() => clear()));
}

module.exports = {
  init,
  list,
  add,
  remove,
  clear,
  flushNow,
  register,
  _setRootForTests,
  MAX_ENTRIES,
  TTL_MS,
};
