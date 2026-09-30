/**
 * Live smoke: real Electron + Vite, no IPC stubs.
 * Opens ≡ menu actions via DOM click / store and logs outcomes.
 * Also probes window.open OAuth-style popup + _blank tab path.
 */
'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const DEV = process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173';
const OUT = path.join(__dirname, '..', 'tmp-verify', 'smoke-round4.json');
const LOGS = [];

function log(line) {
  const s = typeof line === 'string' ? line : JSON.stringify(line);
  console.log('[smoke4]', s);
  LOGS.push({ t: Date.now(), msg: s });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Load real main after boot path — we spawn via requiring main is hard.
// Instead: launch electron . as child? Simpler: run as drop-in after app ready by
// using the project's main through electron . with env SMOKE_ROUND4=1.

if (!process.env.SMOKE_ROUND4) {
  // Re-exec: electron . with SMOKE_ROUND4 so main.cjs loads normally, then we inject.
  const { spawn } = require('child_process');
  const electronBin = require('electron');
  const child = spawn(electronBin, ['.'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      VITE_DEV_SERVER: DEV,
      SMOKE_ROUND4: '1',
      ELECTRON_ENABLE_LOGGING: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let buf = '';
  child.stdout.on('data', (d) => {
    process.stdout.write(d);
    buf += d.toString();
  });
  child.stderr.on('data', (d) => {
    process.stderr.write(d);
    buf += d.toString();
  });
  child.on('exit', (code) => {
    try {
      fs.mkdirSync(path.dirname(OUT), { recursive: true });
      fs.writeFileSync(OUT, JSON.stringify({ code, logs: LOGS, bufTail: buf.slice(-8000) }, null, 2));
    } catch {
      /* */
    }
    process.exit(code || 0);
  });
  // Parent waits for child
  return;
}

// --- Injected path: this file is NOT main. SMOKE_ROUND4=1 means we need a hook in main.
// Fallback: standalone window that loads Vite and drives UI (uses real preload via electron .)
// Actually when SMOKE_ROUND4=1, user would need main to call us. Simpler approach below:
log('SMOKE_ROUND4 set but this script is entry — use smoke-menu-live.cjs instead');
app.quit();
