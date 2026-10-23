'use strict';

/**
 * Packaged auto-update via electron-updater.
 * Feed: public GitHub repo (OsPross/Vio) — never embed GH tokens in the .exe.
 */

const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

/** @type {{ status: string, info?: unknown, error?: string }} */
let last = { status: 'idle' };

/** @type {import('electron-updater').AppUpdater | null} */
let updater = null;

function push(win, payload) {
  last = { ...payload };
  try {
    const targets = win
      ? [win]
      : BrowserWindow.getAllWindows().filter((w) => w && !w.isDestroyed());
    for (const w of targets) {
      if (!w.isDestroyed()) w.webContents.send('shell:update-status', last);
    }
  } catch {
    /* */
  }
}

// Flatpak is read-only and electron-updater would fall back to the AppImage updater and fail.
const IS_FLATPAK = Boolean(process.env.FLATPAK_ID);

function getUpdater() {
  if (updater) return updater;
  if (IS_FLATPAK) return null;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;

  // Dev / unpackaged: optional local feed (dev-app-update.yml at repo root)
  if (!app.isPackaged) {
    const cfg = path.join(__dirname, '..', 'dev-app-update.yml');
    if (!fs.existsSync(cfg)) {
      return null;
    }
    try {
      autoUpdater.forceDevUpdateConfig = true;
      autoUpdater.updateConfigPath = cfg;
    } catch {
      /* older electron-updater */
    }
  }

  autoUpdater.on('checking-for-update', () => push(null, { status: 'checking' }));
  autoUpdater.on('update-available', (info) => push(null, { status: 'available', info }));
  autoUpdater.on('update-not-available', (info) => push(null, { status: 'not-available', info }));
  autoUpdater.on('error', (err) =>
    push(null, { status: 'error', error: String(err?.message || err) }),
  );
  autoUpdater.on('download-progress', (p) =>
    push(null, { status: 'downloading', info: { percent: p.percent } }),
  );
  autoUpdater.on('update-downloaded', (info) => push(null, { status: 'downloaded', info }));

  updater = autoUpdater;
  return updater;
}

function getStatus() {
  return { ok: true, ...last };
}

async function checkForUpdates() {
  const u = getUpdater();
  if (!u) {
    return {
      ok: false,
      error: IS_FLATPAK
        ? 'W wersji Flatpak zainstaluj nowszy plik .flatpak z Releases.'
        : app.isPackaged
        ? 'Updater niedostępny.'
        : 'Brak dev-app-update.yml (skopiuj z .example) — updater w trybie testowym.',
      status: 'unavailable',
    };
  }
  try {
    const result = await u.checkForUpdates();
    return { ok: true, status: last.status || 'checking', result: result?.updateInfo || null };
  } catch (err) {
    const msg = String(err?.message || err);
    push(null, { status: 'error', error: msg });
    return { ok: false, error: msg, status: 'error' };
  }
}

function installDownloaded() {
  const u = getUpdater();
  if (!u) return { ok: false, error: 'Updater niedostępny.' };
  if (last.status !== 'downloaded') {
    return { ok: false, error: 'Brak pobranej aktualizacji. Najpierw „Sprawdź aktualizacje”.' };
  }
  try {
    // isSilent=false, isForceRunAfter=true
    u.quitAndInstall(false, true);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/** Quiet check shortly after ready (packaged only). */
function scheduleStartupCheck() {
  if (!app.isPackaged || IS_FLATPAK) return;
  setTimeout(() => {
    void checkForUpdates().catch(() => {});
  }, 8_000);
}

module.exports = {
  checkForUpdates,
  installDownloaded,
  getStatus,
  scheduleStartupCheck,
  getUpdater,
};
