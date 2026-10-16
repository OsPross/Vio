'use strict';

const C = require('./channels.cjs');

function register(deps) {
  const { ipcMain, wrapApp, history, windowMode } = deps;
  // Private windows never write history (also keeps them out of the Soul searchHistory command).
  const fromPrivate = (e) => windowMode.getMetaForWebContents(e.sender).mode !== 'normal';

  ipcMain.handle(
    C.HISTORY_CONFIG,
    wrapApp((_e, next) => history.setConfig(next && typeof next === 'object' ? next : {})),
  );

  ipcMain.handle(C.HISTORY_STATUS, wrapApp(() => history.getConfig()));

  ipcMain.handle(
    C.HISTORY_RECORD_VISIT,
    wrapApp((e, opts) => {
      if (opts && opts.tor) return { ok: false, reason: 'tor' };
      if (fromPrivate(e)) return { ok: false, reason: 'private' };
      return history.recordVisit(opts && typeof opts === 'object' ? opts : {});
    }),
  );

  ipcMain.handle(
    C.HISTORY_RECORD_QUERY,
    wrapApp((e, q, opts) => {
      if (opts && opts.tor) return { ok: false, reason: 'tor' };
      if (fromPrivate(e)) return { ok: false, reason: 'private' };
      return history.recordQuery(String(q || ''), opts && typeof opts === 'object' ? opts : {});
    }),
  );

  ipcMain.handle(
    C.HISTORY_IMPORT_QUERIES,
    wrapApp((_e, items) => history.importQueries(Array.isArray(items) ? items : [])),
  );

  ipcMain.handle(
    C.HISTORY_SUGGEST,
    wrapApp((_e, q, opts) => {
      if (opts && opts.tor) return { completion: null, groups: [] };
      const t0 = Date.now();
      const res = history.suggest(String(q || ''), opts && typeof opts === 'object' ? opts : {});
      res.tookMs = Date.now() - t0;
      return res;
    }),
  );

  ipcMain.handle(
    C.HISTORY_LIST,
    wrapApp((_e, opts) => history.list(opts && typeof opts === 'object' ? opts : {})),
  );

  ipcMain.handle(
    C.HISTORY_DELETE,
    wrapApp((_e, id) => history.deleteById(String(id || ''))),
  );

  ipcMain.handle(
    C.HISTORY_DELETE_URL,
    wrapApp((_e, url) => history.deleteByUrl(String(url || ''))),
  );

  ipcMain.handle(
    C.HISTORY_DELETE_DOMAIN,
    wrapApp((_e, host) => history.deleteDomain(String(host || ''))),
  );

  ipcMain.handle(
    C.HISTORY_CLEAR,
    wrapApp((_e, opts) => history.clear(opts && typeof opts === 'object' ? opts : { range: 'all' })),
  );

  ipcMain.handle(
    C.HISTORY_REMOVE_QUERY,
    wrapApp((_e, q) => history.removeQuery(String(q || ''))),
  );
}

module.exports = { register };
