'use strict';

/** webContents.id set — guests used only for Shift+hover link preview (no history). */
const ids = new Set();
/** will-attach-webview saw data-djxxr-link-preview before web-contents-created. */
let pendingAttach = 0;

function expectAttach() {
  pendingAttach += 1;
  return { ok: true, pending: pendingAttach };
}

/** Call from web-contents-created for type=webview; registers if a preview attach is pending. */
function claimPending(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return { ok: false };
  if (pendingAttach <= 0) return { ok: false, pending: false };
  pendingAttach -= 1;
  ids.add(n);
  return { ok: true, id: n, pending: true };
}

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
  pendingAttach = 0;
}

module.exports = {
  expectAttach,
  claimPending,
  register,
  unregister,
  has,
  clear,
};
