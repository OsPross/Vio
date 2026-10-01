'use strict';

/**
 * Home notes — JSON store in userData/notes.json (main process).
 * Queried via shell:notes-* IPC.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

let app;
try {
  ({ app } = require('electron'));
} catch {
  app = null;
}

const VERSION = 1;
const FLUSH_MS = 280;

/** @type {string | null} */
let rootOverride = null;

function notesDir() {
  if (rootOverride) return rootOverride;
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    /* */
  }
  return path.join(os.tmpdir(), 'djxxr-notes');
}

function notesPath() {
  return path.join(notesDir(), 'notes.json');
}

/** @typedef {{ id: string, title: string, body: string, createdAt: number, updatedAt: number }} Note */

/** @type {{ version: number, notes: Note[] } | null} */
let store = null;
let dirty = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let flushTimer = null;

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

function deriveTitle(body) {
  const first = String(body || '')
    .split(/\r?\n/)[0]
    ?.trim();
  if (first) return first.slice(0, 200);
  return 'Nowa notatka';
}

function ensureLoaded() {
  if (store) return store;
  const file = notesPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      const notes = Array.isArray(raw?.notes) ? raw.notes : [];
      store = {
        version: typeof raw?.version === 'number' ? raw.version : VERSION,
        notes: notes
          .filter((n) => n && typeof n.id === 'string')
          .map((n) => ({
            id: String(n.id),
            title: typeof n.title === 'string' ? n.title : deriveTitle(n.body),
            body: typeof n.body === 'string' ? n.body : '',
            createdAt: typeof n.createdAt === 'number' ? n.createdAt : Date.now(),
            updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : Date.now(),
          })),
      };
      return store;
    }
  } catch {
    /* corrupt — start fresh */
  }
  store = { version: VERSION, notes: [] };
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
  if (!dirty || !store) return { ok: true };
  dirty = false;
  const file = notesPath();
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    return { ok: true };
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* */
    }
    return { ok: false, error: String(err?.message || err) };
  }
}

function init() {
  ensureLoaded();
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt);
}

function list(opts = {}) {
  const data = ensureLoaded();
  const q = String(opts.q || '')
    .trim()
    .toLowerCase();
  let notes = sortNotes(data.notes);
  if (q) {
    notes = notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q),
    );
  }
  return { ok: true, notes };
}

function get(id) {
  const data = ensureLoaded();
  const note = data.notes.find((n) => n.id === String(id || ''));
  if (!note) return { ok: false, error: 'not_found' };
  return { ok: true, note: { ...note } };
}

function create(opts = {}) {
  const data = ensureLoaded();
  const now = Date.now();
  const body = typeof opts.body === 'string' ? opts.body : '';
  /** @type {Note} */
  const note = {
    id: uid(),
    body,
    title: typeof opts.title === 'string' && opts.title.trim() ? opts.title.trim().slice(0, 200) : deriveTitle(body),
    createdAt: now,
    updatedAt: now,
  };
  data.notes.unshift(note);
  scheduleFlush();
  return { ok: true, note: { ...note } };
}

function update(id, patch = {}) {
  const data = ensureLoaded();
  const idx = data.notes.findIndex((n) => n.id === String(id || ''));
  if (idx < 0) return { ok: false, error: 'not_found' };
  const prev = data.notes[idx];
  const body = patch.body !== undefined ? String(patch.body) : prev.body;
  const title =
    patch.title !== undefined && String(patch.title).trim()
      ? String(patch.title).trim().slice(0, 200)
      : deriveTitle(body);
  const next = {
    ...prev,
    body,
    title,
    updatedAt: Date.now(),
  };
  data.notes[idx] = next;
  scheduleFlush();
  return { ok: true, note: { ...next } };
}

function remove(id) {
  const data = ensureLoaded();
  const before = data.notes.length;
  data.notes = data.notes.filter((n) => n.id !== String(id || ''));
  if (data.notes.length === before) return { ok: false, error: 'not_found' };
  scheduleFlush();
  return { ok: true };
}

/** Import legacy homeNotes string once if store is empty */
function migrateLegacy(text) {
  const data = ensureLoaded();
  const body = String(text || '').trim();
  if (!body || data.notes.length > 0) {
    return { ok: true, migrated: false, notes: sortNotes(data.notes) };
  }
  const res = create({ body });
  flushNow();
  return { ok: true, migrated: true, note: res.note, notes: sortNotes(data.notes) };
}

function register(ipcMain, wrapApp) {
  ipcMain.handle('shell:notes-list', wrapApp((_e, opts) => list(opts && typeof opts === 'object' ? opts : {})));
  ipcMain.handle('shell:notes-get', wrapApp((_e, id) => get(id)));
  ipcMain.handle('shell:notes-create', wrapApp((_e, opts) => create(opts && typeof opts === 'object' ? opts : {})));
  ipcMain.handle('shell:notes-update', wrapApp((_e, id, patch) => update(id, patch && typeof patch === 'object' ? patch : {})));
  ipcMain.handle('shell:notes-delete', wrapApp((_e, id) => remove(id)));
  ipcMain.handle('shell:notes-migrate-legacy', wrapApp((_e, text) => migrateLegacy(text)));
}

module.exports = {
  init,
  list,
  get,
  create,
  update,
  remove,
  migrateLegacy,
  deriveTitle,
  register,
  flushNow,
  _setRootForTests,
};
