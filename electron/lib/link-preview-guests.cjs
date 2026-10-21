'use strict';

/** webContents.id set — guests used only for Shift+hover link preview (no history). */
const ids = new Set();

function register(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return { ok: false };
  ids.add(n);
  return { ok: true, id: n };
}

function unregister(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return { ok: false };
  ids.delete(n);
  return { ok: true, id: n };
}

function has(id) {
  const n = Number(id);
  return Number.isFinite(n) && ids.has(n);
}

function clear() {
  ids.clear();
}

module.exports = { register, unregister, has, clear };
