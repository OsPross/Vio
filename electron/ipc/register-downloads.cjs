'use strict';

const C = require('./channels.cjs');

function register(deps) {
  const { ipcMain, wrapApp, downloads } = deps;

  ipcMain.handle(C.DOWNLOADS_LIST, wrapApp(() => downloads.list()));
  ipcMain.handle(
    C.DOWNLOADS_CONFIG,
    wrapApp((_e, next) => {
      if (next && typeof next === 'object') return downloads.setConfig(next);
      return downloads.getConfig();
    }),
  );
  ipcMain.handle(C.DOWNLOADS_PAUSE, wrapApp((_e, id) => downloads.pause(String(id || ''))));
  ipcMain.handle(C.DOWNLOADS_RESUME, wrapApp((_e, id) => downloads.resume(String(id || ''))));
  ipcMain.handle(C.DOWNLOADS_CANCEL, wrapApp((_e, id) => downloads.cancel(String(id || ''))));
  ipcMain.handle(C.DOWNLOADS_REMOVE, wrapApp((_e, id) => downloads.remove(String(id || ''))));
  ipcMain.handle(C.DOWNLOADS_CLEAR, wrapApp(() => downloads.clearCompleted()));
  ipcMain.handle(C.DOWNLOADS_OPEN, wrapApp((_e, id) => downloads.openFile(String(id || ''))));
  ipcMain.handle(C.DOWNLOADS_SHOW, wrapApp((_e, id) => downloads.showInFolder(String(id || ''))));
  ipcMain.handle(C.DOWNLOADS_DRAG, wrapApp((_e, id) => downloads.startDrag(String(id || ''))));
}

module.exports = { register };
