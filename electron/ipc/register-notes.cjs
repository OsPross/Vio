'use strict';

/**
 * Notes IPC — delegates to notes.cjs register (handlers stay owned there).
 * @param {object} deps
 */
function register(deps) {
  const { ipcMain, wrapApp, notes } = deps;
  notes.register(ipcMain, wrapApp);
}

module.exports = { register };
