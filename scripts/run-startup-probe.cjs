/**
 * 3× cold start against Vite. Usage: node scripts/run-startup-probe.cjs
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'tmp-verify', 'startup');
fs.mkdirSync(outDir, { recursive: true });
const VITE = process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173';

function waitVite(url, timeoutMs = 60_000) {
  const u = new URL(url);
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = http.get({ hostname: u.hostname, port: u.port, path: '/', timeout: 2000 }, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error('vite not ready'));
        else setTimeout(tryOnce, 400);
      });
    };
    tryOnce();
  });
}

function runOne(runIdx) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PERF_STARTUP: '1',
      VITE_DEV_SERVER: VITE,
    };
    delete env.PERF_BENCH;
    delete env.ELECTRON_ENABLE_LOGGING;
    const logPath = path.join(outDir, `run${runIdx}.log`);
    const logFd = fs.openSync(logPath, 'w');
    const before = new Set(fs.readdirSync(outDir).filter((f) => f.startsWith('startup-')));
    console.log(`[run-startup] run ${runIdx}…`);
    const electronBin = require('electron');
    const child = spawn(String(electronBin), ['.'], {
      cwd: root,
      env,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    });
    const killer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* */
      }
      reject(new Error(`run ${runIdx} timeout`));
    }, 45_000);
    child.on('exit', (code) => {
      clearTimeout(killer);
      try {
        fs.closeSync(logFd);
      } catch {
        /* */
      }
      const after = fs.readdirSync(outDir).filter((f) => f.startsWith('startup-') && !before.has(f));
      if (!after.length) {
        const tail = fs.readFileSync(logPath, 'utf8').slice(-1500);
        reject(new Error(`run ${runIdx} exit=${code} no sample\n${tail}`));
        return;
      }
      const sample = JSON.parse(fs.readFileSync(path.join(outDir, after.sort().at(-1)), 'utf8'));
      console.log(
        `[run-startup] run ${runIdx}`,
        'ready',
        sample.launchToReadyMs,
        'visible',
        sample.launchToWindowVisibleMs,
        'react',
        sample.renderer?.now,
      );
      resolve(sample);
    });
    child.on('error', (err) => {
      clearTimeout(killer);
      reject(err);
    });
  });
}

function avg(arr) {
  const a = arr.filter((n) => typeof n === 'number');
  if (!a.length) return null;
  return Math.round(a.reduce((s, n) => s + n, 0) / a.length);
}

async function main() {
  await waitVite(VITE);
  const runs = [];
  for (let i = 1; i <= 3; i++) {
    runs.push(await runOne(i));
  }
  const summary = {
    at: new Date().toISOString(),
    n: runs.length,
    avgLaunchToReadyMs: avg(runs.map((r) => r.launchToReadyMs)),
    avgLaunchToWindowVisibleMs: avg(runs.map((r) => r.launchToWindowVisibleMs)),
    avgLaunchToWindowCreatedMs: avg(runs.map((r) => r.launchToWindowCreatedMs)),
    avgRendererNowMs: avg(runs.map((r) => r.renderer?.now)),
    requireTimesMax: runs.reduce((acc, r) => {
      const t = r.requireTimes || {};
      for (const [k, v] of Object.entries(t)) {
        acc[k] = Math.max(acc[k] || 0, v);
      }
      return acc;
    }, {}),
    phaseMsMax: runs.reduce((acc, r) => {
      const t = r.phaseMs || {};
      for (const [k, v] of Object.entries(t)) {
        acc[k] = Math.max(acc[k] || 0, v);
      }
      return acc;
    }, {}),
    runs,
  };
  const out = path.join(outDir, 'summary-baseline.json');
  fs.writeFileSync(out, JSON.stringify(summary, null, 2));
  console.log('[run-startup] SUMMARY', JSON.stringify(summary, null, 2));
  console.log('[run-startup] wrote', out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
