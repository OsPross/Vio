'use strict';

function register(deps) {
  const { ipcMain, wrapApp, tabArchive } = deps;
  if (!tabArchive || typeof tabArchive.register !== 'function') return;
  tabArchive.register(ipcMain, wrapApp);
}

module.exports = { register };
