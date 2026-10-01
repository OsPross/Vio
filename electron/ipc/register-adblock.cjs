'use strict';

const C = require('./channels.cjs');

function register(deps) {
  const { ipcMain, wrapApp, wrapAppOrGuest, adblock } = deps;

  ipcMain.handle(
    C.ADBLOCK_CONFIG,
    wrapApp((_e, next) => {
      if (next && typeof next === 'object') return adblock.setConfig(next);
      return adblock.getStatus();
    }),
  );

  ipcMain.handle(C.ADBLOCK_STATUS, wrapApp(() => adblock.getStatus()));
  ipcMain.handle(C.ADBLOCK_COSMETIC, wrapAppOrGuest(() => adblock.getCosmeticCss()));
  ipcMain.handle(
    C.ADBLOCK_PAGE_SCRIPT,
    wrapAppOrGuest((_e, pageUrl) => adblock.getPageScript(typeof pageUrl === 'string' ? pageUrl : '')),
  );
}

module.exports = { register };
