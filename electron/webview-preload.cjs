'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__djxxrPw', {
  post: (type, payload) => {
    if (typeof type !== 'string') return;
    ipcRenderer.sendToHost('djxxr-pw', { type, payload: payload || {} });
  },
  onCommand: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_e, msg) => {
      try {
        cb(msg);
      } catch {
        /* */
      }
    };
    ipcRenderer.on('djxxr-pw-cmd', handler);
    return () => ipcRenderer.removeListener('djxxr-pw-cmd', handler);
  },
});
