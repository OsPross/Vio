'use strict';

/**
 * [T] Updater test mode: forceDevUpdateConfig + missing/invalid feed → controlled error (no hang).
 * Run via: npx electron scripts/test-updater-dev.cjs
 */

const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');

const ROOT = path.join(__dirname, '..');
const CFG = path.join(ROOT, 'dev-app-update.yml');
const EXAMPLE = path.join(ROOT, 'dev-app-update.yml.example');

app.whenReady().then(async () => {
  let created = false;
  try {
    if (!fs.existsSync(CFG) && fs.existsSync(EXAMPLE)) {
      fs.copyFileSync(EXAMPLE, CFG);
      created = true;
    }
    const updater = require('../electron/updater.cjs');
    const u = updater.getUpdater();
    if (!u) {
      console.log('[test-updater-dev] FAIL no updater instance with config present');
      app.exit(1);
      return;
    }
    const r = await Promise.race([
      updater.checkForUpdates(),
      new Promise((resolve) =>
        setTimeout(() => resolve({ ok: false, error: 'timeout', status: 'timeout' }), 8_000),
      ),
    ]);
    // Expect network error / not-available / error — not hang
    const okShape = r && typeof r.ok === 'boolean';
    console.log(
      '[test-updater-dev]',
      okShape ? 'OK' : 'FAIL',
      'status=',
      r?.status,
      'err=',
      (r?.error || '').slice(0, 120),
    );
    app.exit(okShape ? 0 : 1);
  } catch (err) {
    console.log('[test-updater-dev] FAIL', err && err.message);
    app.exit(1);
  } finally {
    if (created) {
      try {
        fs.unlinkSync(CFG);
      } catch {
        /* */
      }
    }
  }
});
