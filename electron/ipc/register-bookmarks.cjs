'use strict';

const path = require('node:path');
const { app, dialog, BrowserWindow } = require('electron');
const { writeAtomicSync } = require('../lib/atomic-write.cjs');
const C = require('./channels.cjs');

/**
 * Bookmarks import + optional atomic export save.
 * App bookmarks live in Zustand; this IPC covers profile import and HTML export to disk.
 */
function register(deps) {
  const { ipcMain, wrapApp, bookmarksImport } = deps;

  ipcMain.handle(C.BOOKMARKS_DISCOVER_PROFILES, wrapApp(() => bookmarksImport.discoverProfiles()));
  ipcMain.handle(
    C.BOOKMARKS_READ_PROFILE,
    wrapApp((_e, profilePath) => bookmarksImport.readProfileBookmarks(profilePath)),
  );

  /** Save Netscape/HTML (or any text) bookmarks export atomically (temp + rename). */
  ipcMain.handle(
    C.BOOKMARKS_SAVE_EXPORT,
    wrapApp(async (event, html, opts) => {
      const content = typeof html === 'string' ? html : '';
      if (!content) return { ok: false, error: 'empty' };
      const parent = BrowserWindow.fromWebContents(event.sender);
      let filePath = opts && typeof opts.forcePath === 'string' ? opts.forcePath : null;
      if (!filePath) {
        const dlg = await dialog.showSaveDialog(parent || undefined, {
          title: 'Eksportuj zakładki',
          defaultPath: path.join(app.getPath('downloads'), 'bookmarks.html'),
          filters: [
            { name: 'HTML', extensions: ['html', 'htm'] },
            { name: 'Wszystkie pliki', extensions: ['*'] },
          ],
        });
        if (dlg.canceled || !dlg.filePath) return { ok: false, canceled: true };
        filePath = dlg.filePath;
      }
      try {
        writeAtomicSync(filePath, content, 'utf8');
        return { ok: true, filePath };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    }),
  );
}

module.exports = { register };
