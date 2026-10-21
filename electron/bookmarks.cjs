'use strict';

/**
 * Bookmarks + folders — JSON in userData/djxxr-bookmarks.json (main process).
 * Renderer keeps a Zustand RAM cache; mutations flush here (like notes/history).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { writeAtomicSync } = require('./lib/atomic-write.cjs');

let app;
try {
  ({ app } = require('electron'));
} catch {
  app = null;
}

const VERSION = 1;
const FLUSH_MS = 220;
const BAR_ID = 'folder-bar';
const OTHER_ID = 'folder-other';

/** @type {string | null} */
let rootOverride = null;

function bookmarksDir() {
  if (rootOverride) return rootOverride;
  try {
    if (app && typeof app.getPath === 'function') return app.getPath('userData');
  } catch {
    /* */
  }
  return path.join(os.tmpdir(), 'djxxr-bookmarks');
}

function storePath() {
  return path.join(bookmarksDir(), 'djxxr-bookmarks.json');
}

/** @typedef {{ id: string, title: string, url: string, folderId?: string, createdAt: number, iconOnly?: boolean }} Bookmark */
/** @typedef {{ id: string, title: string, parentId?: string }} Folder */

/** @type {{ version: number, bookmarks: Bookmark[], folders: Folder[] } | null} */
let store = null;
let dirty = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let flushTimer = null;

function defaultFolders() {
  return [
    { id: BAR_ID, title: 'Pasek zakładek' },
    { id: OTHER_ID, title: 'Inne zakładki' },
  ];
}

function ensureDefaults(data) {
  const folders = Array.isArray(data.folders) ? [...data.folders] : [];
  for (const def of defaultFolders()) {
    if (!folders.some((f) => f.id === def.id)) folders.unshift(def);
  }
  return {
    version: VERSION,
    bookmarks: Array.isArray(data.bookmarks) ? data.bookmarks : [],
    folders,
  };
}

function load() {
  if (store) return store;
  try {
    const raw = fs.readFileSync(storePath(), 'utf8');
    const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    store = ensureDefaults(JSON.parse(text));
  } catch {
    store = ensureDefaults({ bookmarks: [], folders: [] });
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
    fs.mkdirSync(bookmarksDir(), { recursive: true });
    writeAtomicSync(storePath(), `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn('[bookmarks] save', err && err.message);
    dirty = true;
  }
}

function getAll() {
  const s = load();
  return { ok: true, bookmarks: s.bookmarks, folders: s.folders };
}

/**
 * Replace full snapshot (from renderer after mutate).
 * @param {{ bookmarks?: Bookmark[], folders?: Folder[] }} payload
 */
function replaceAll(payload) {
  const s = load();
  if (Array.isArray(payload?.bookmarks)) s.bookmarks = payload.bookmarks;
  if (Array.isArray(payload?.folders)) s.folders = payload.folders;
  store = ensureDefaults(s);
  scheduleFlush();
  return getAll();
}

/**
 * One-shot migrate from legacy Zustand / localStorage payload.
 * Only fills empty disk store.
 */
function migrateFromLegacy(payload) {
  const s = load();
  const hasDisk = s.bookmarks.length > 0 || s.folders.some((f) => f.id !== BAR_ID && f.id !== OTHER_ID);
  if (hasDisk) return { ok: true, migrated: false, ...getAll() };
  const bookmarks = Array.isArray(payload?.bookmarks) ? payload.bookmarks : [];
  const folders = Array.isArray(payload?.folders) ? payload.folders : [];
  if (!bookmarks.length && folders.length <= 2) {
    return { ok: true, migrated: false, ...getAll() };
  }
  store = ensureDefaults({ bookmarks, folders });
  dirty = true;
  flushNow();
  return { ok: true, migrated: true, ...getAll() };
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

module.exports = {
  getAll,
  replaceAll,
  migrateFromLegacy,
  flushNow,
  load,
  _setRootForTests,
  BAR_ID,
  OTHER_ID,
};
