'use strict';

const { ipcMain } = require('electron');
const C = require('./channels.cjs');
const updater = require('../updater.cjs');

/**
 * @param {{ wrapApp: Function }} deps
 */
function register({ wrapApp }) {
  ipcMain.handle(C.UPDATE_CHECK, wrapApp(() => updater.checkForUpdates()));
  ipcMain.handle(C.UPDATE_INSTALL, wrapApp(() => updater.installDownloaded()));
  ipcMain.handle(C.UPDATE_STATUS, wrapApp(() => updater.getStatus()));
}

module.exports = { register };
