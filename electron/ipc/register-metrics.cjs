'use strict';

const C = require('./channels.cjs');

function register(deps) {
  const { ipcMain, wrapApp, metrics } = deps;

  ipcMain.handle(C.METRICS_SUBSCRIBE, wrapApp(() => metrics.subscribe()));
  ipcMain.handle(C.METRICS_UNSUBSCRIBE, wrapApp(() => metrics.unsubscribe()));
  ipcMain.handle(C.METRICS_SUBSCRIBE_LIVE, wrapApp(() => metrics.subscribeLive()));
  ipcMain.handle(C.METRICS_UNSUBSCRIBE_LIVE, wrapApp(() => metrics.unsubscribeLive()));
  ipcMain.handle(C.METRICS_SUBSCRIBE_DISCARD, wrapApp(() => metrics.subscribeDiscard()));
  ipcMain.handle(C.METRICS_UNSUBSCRIBE_DISCARD, wrapApp(() => metrics.unsubscribeDiscard()));
  ipcMain.handle(
    C.METRICS_SET_GUESTS,
    wrapApp((_e, list) => {
      metrics.setGuests(Array.isArray(list) ? list : []);
      return { ok: true };
    }),
  );
  ipcMain.handle(
    C.METRICS_SET_INTERVAL,
    wrapApp((_e, ms) => ({ ok: true, intervalMs: metrics.setIntervalMs(ms) })),
  );
  ipcMain.handle(
    C.METRICS_LOW_POWER,
    wrapApp((_e, on) => ({ ok: true, intervalMs: metrics.setLowPower(Boolean(on)) })),
  );
  ipcMain.handle(C.METRICS_SNAPSHOT, wrapApp(() => metrics.getSnapshot()));
}

module.exports = { register };
