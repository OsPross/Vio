'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('popupChrome', {
  ready: () => ipcRenderer.send('djxxr-popup-chrome-ready'),
  onUpdate: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_e, payload) => {
      try {
        cb(payload);
      } catch {
        /* */
      }
    };
    ipcRenderer.on('djxxr-popup-chrome-update', handler);
    return () => ipcRenderer.removeListener('djxxr-popup-chrome-update', handler);
  },
});
