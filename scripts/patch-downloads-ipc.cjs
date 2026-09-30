'use strict';
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'electron', 'main.cjs');
let s = fs.readFileSync(p, 'utf8');
if (s.includes('shell:downloads-list')) {
  console.log('already');
  process.exit(0);
}
const insert = `ipcMain.handle('shell:downloads-list', wrapApp(() => downloads.list()));
ipcMain.handle('shell:downloads-config', wrapApp((_e, next) => {
  if (next && typeof next === 'object') return downloads.setConfig(next);
  return downloads.getConfig();
}));
ipcMain.handle('shell:downloads-pause', wrapApp((_e, id) => downloads.pause(String(id || ''))));
ipcMain.handle('shell:downloads-resume', wrapApp((_e, id) => downloads.resume(String(id || ''))));
ipcMain.handle('shell:downloads-cancel', wrapApp((_e, id) => downloads.cancel(String(id || ''))));
ipcMain.handle('shell:downloads-remove', wrapApp((_e, id) => downloads.remove(String(id || ''))));
ipcMain.handle('shell:downloads-clear', wrapApp(() => downloads.clearCompleted()));
ipcMain.handle('shell:downloads-open', wrapApp((_e, id) => downloads.openFile(String(id || ''))));
ipcMain.handle('shell:downloads-show', wrapApp((_e, id) => downloads.showInFolder(String(id || ''))));
ipcMain.handle('shell:downloads-drag', wrapApp((_e, id) => downloads.startDrag(String(id || ''))));

`;
const idx = s.indexOf("'shell:session-load'");
if (idx < 0) {
  console.error('no session-load');
  process.exit(1);
}
const handleIdx = s.lastIndexOf('ipcMain.handle', idx);
const nl = s.includes('\r\n') ? '\r\n' : '\n';
fs.writeFileSync(p, s.slice(0, handleIdx) + insert.replace(/\n/g, nl) + s.slice(handleIdx));
console.log('wired downloads ipc');
