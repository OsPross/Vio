'use strict';

/**
 * Extensions IPC — delegates to extensions.cjs register.
 * @param {object} deps
 */
function register(deps) {
  const { ipcMain, wrapApp, wrapAppOrGuest, extensions } = deps;
  extensions.register(ipcMain, wrapApp, wrapAppOrGuest);
}

module.exports = { register };
