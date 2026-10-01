/**
 * Adblock boot + blocked list proof (PERF_VERIFY_ADBLOCK=1).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(getMainWindow) {
  const out = { at: new Date().toISOString(), ok: false };
  await sleep(2000);
  let win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  for (let i = 0; i < 20 && (!win || win.isDestroyed()); i++) {
    await sleep(400);
    win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  }
  if (!win || win.isDestroyed()) {
    process.exitCode = 2;
    return out;
  }
  const wc = win.webContents;
  const evalInApp = (code) => wc.executeJavaScript(code, true);
  const adblock = require('../electron/adblock-plus.cjs');

  out.bootBeforeNav = adblock.getBootTiming();
  out.statusBeforeNav = adblock.getStatus();

  // Navigate to a page that typically triggers filter hits
  await evalInApp(`window.__DJXXR_STORE__.getState().updateTab(
    window.__DJXXR_STORE__.getState().activeId,
    { url: 'https://www.bbc.com/' }
  )`);
  await sleep(12000);

  out.bootAfterNav = adblock.getBootTiming();
  out.statusAfterNav = adblock.getStatus();
  out.recentBlocked = (adblock.getRecentBlocked('global') || []).slice(0, 25);
  out.ok =
    Boolean(out.statusAfterNav?.ready) &&
    (out.statusAfterNav?.blockedCount || 0) > 0 &&
    (out.recentBlocked?.length || 0) > 0 &&
    (out.bootAfterNav?.engineReadyAt || 0) > 0;

  const dir = path.join(os.tmpdir(), 'djxxr-perf-verify');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `adblock-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log('[perf-verify-adblock]', JSON.stringify(out, null, 2));
  console.log('[perf-verify-adblock] wrote', file, 'ok=', out.ok);
  return out;
}

module.exports = { run };
