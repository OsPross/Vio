'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

/** @type {Map<number, (proceed: boolean) => void>} */
const pending = new Map();

/** Hosts the user chose to trust after a certificate warning (persisted). */
let trustedHosts = new Set();

function storePath() {
  return path.join(app.getPath('userData'), 'djxxr-cert-exceptions.json');
}

function loadTrusted() {
  try {
    const raw = JSON.parse(fs.readFileSync(storePath(), 'utf8'));
    const list = Array.isArray(raw?.hosts) ? raw.hosts : [];
    trustedHosts = new Set(list.map((h) => String(h).toLowerCase()));
  } catch {
    trustedHosts = new Set();
  }
}

function saveTrusted() {
  try {
    fs.writeFileSync(storePath(), JSON.stringify({ hosts: [...trustedHosts] }, null, 2), { mode: 0o600 });
  } catch (e) {
    console.warn('[cert] save', e);
  }
}

function hostFromUrl(url) {
  try {
    return new URL(String(url || '')).host.toLowerCase();
  } catch {
    return '';
  }
}

function init() {
  loadTrusted();
}

/**
 * @param {import('electron').WebContents} guestWc
 * @param {{ getMainWindow: () => import('electron').BrowserWindow | null, torMode?: boolean }} opts
 */
function attachCertificateHandler(guestWc, opts = {}) {
  if (!guestWc || guestWc.isDestroyed() || guestWc.__djxxrCertHook) return;
  guestWc.__djxxrCertHook = true;

  guestWc.on('certificate-error', (event, url, error, certificate, callback) => {
    event.preventDefault();
    const host = hostFromUrl(url);
    if (host && trustedHosts.has(host)) {
      callback(true);
      return;
    }
    const id = guestWc.id;
    pending.set(id, callback);
    if (host) notePendingHost(id, host);
    const win = opts.getMainWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send('shell:certificate-error', {
        webContentsId: id,
        url: String(url || ''),
        host,
        error: String(error || ''),
        issuer: certificate?.issuerName || certificate?.subjectName || '',
        tor: Boolean(opts.torMode),
      });
    } else {
      pending.delete(id);
      callback(false);
    }
  });

  guestWc.on('destroyed', () => {
    const cb = pending.get(guestWc.id);
    if (cb) {
      pending.delete(guestWc.id);
      cb(false);
    }
  });
}

function respond(webContentsId, proceed, rememberHost) {
  const id = Number(webContentsId);
  const cb = pending.get(id);
  if (!cb) return { ok: false, error: 'no-pending' };
  const host = pendingHostForId(id);
  pending.delete(id);
  clearPendingHost(id);
  if (proceed && rememberHost && host) {
    trustedHosts.add(host);
    saveTrusted();
  }
  cb(Boolean(proceed));
  return { ok: true };
}

/** @type {Map<number, string>} */
const pendingHosts = new Map();

function notePendingHost(webContentsId, host) {
  if (host) pendingHosts.set(Number(webContentsId), host.toLowerCase());
}

function pendingHostForId(id) {
  return pendingHosts.get(Number(id)) || '';
}

function clearPendingHost(webContentsId) {
  pendingHosts.delete(Number(webContentsId));
}

module.exports = {
  init,
  attachCertificateHandler,
  respond,
  notePendingHost,
  clearPendingHost,
};
