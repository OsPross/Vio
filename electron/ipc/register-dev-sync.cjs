'use strict';

const { ipcMain, app } = require('electron');
const C = require('./channels.cjs');
const devSync = require('../dev-sync.cjs');

/**
 * @param {{ wrapApp: Function }} deps
 */
function register({ wrapApp }) {
  ipcMain.handle(
    C.DEV_SYNC_AVAILABLE,
    wrapApp(() => ({ ok: true, available: !app.isPackaged })),
  );
  ipcMain.handle(C.DEV_SYNC_CHECK, wrapApp(() => devSync.checkUpdates()));
  ipcMain.handle(C.DEV_SYNC_APPLY, wrapApp(() => devSync.applyUpdates()));
}

module.exports = { register };
