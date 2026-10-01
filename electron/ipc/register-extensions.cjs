'use strict';

/**
 * Extensions IPC — delegates to extensions.cjs register.
 * @param {object} deps
 */
function register(deps) {
  const { ipcMain, wrapApp, extensions } = deps;
  extensions.register(ipcMain, wrapApp);
}

module.exports = { register };
