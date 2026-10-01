/**
 * Run live PERF_BENCH 3× against Vite, then write median baseline JSON.
 * Usage: node scripts/run-perf-baseline.cjs
 * Env: PERF_BENCH_IDLE_MS (default 600000), PERF_BENCH_IDLE_BG_MS (default 60000)
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'tmp-verify', 'perf');
fs.mkdirSync(outDir, { recursive: true });

const IDLE_MS = process.env.PERF_BENCH_IDLE_MS || '600000';
const BG_MS = process.env.PERF_BENCH_IDLE_BG_MS || '60000';
const VITE = process.env.VITE_DEV_SERVER || 'http://127.0.0.1:5173';

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function median(arr) {
  const a = (arr || []).filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

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
        else setTimeout(tryOnce, 500);
      });
    };
    tryOnce();
  });
}

function runOne(runIdx) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PERF_BENCH: '1',
      PERF_BENCH_QUIT: '1',
      PERF_BENCH_RUN: String(runIdx),
      PERF_BENCH_IDLE_MS: String(IDLE_MS),
      PERF_BENCH_IDLE_BG_MS: String(BG_MS),
      VITE_DEV_SERVER: VITE,
    };
    // clear other smoke hooks + noisy logging (pipe backpressure)
    for (const k of Object.keys(env)) {
      if (/^SMOKE_|^CAPTURE_/.test(k)) delete env[k];
    }
    delete env.ELECTRON_ENABLE_LOGGING;
    console.log(`[run-perf] starting run ${runIdx}…`);
    const logPath = path.join(outDir, `run${runIdx}-electron.log`);
    const logFd = fs.openSync(logPath, 'w');
    const electronBin = require('electron');
    const child = spawn(String(electronBin), ['.'], {
      cwd: root,
      env,
      stdio: ['ignore', logFd, logFd],
      windowsHide: true,
    });
    // Hard ceiling: idle + bg + ~20 min headroom for UI/react/disk
    const hardMs = Number(IDLE_MS) + Number(BG_MS) + 20 * 60_000;
    const killer = setTimeout(() => {
      console.error(`[run-perf] run ${runIdx} WATCHDOG kill after ${hardMs}ms`);
      try {
        child.kill('SIGTERM');
      } catch {
        /* */
      }
      setTimeout(() => {
        try {
          if (!child.killed) child.kill('SIGKILL');
        } catch {
          /* */
        }
      }, 5000);
    }, hardMs);
    const heartbeat = setInterval(() => {
      try {
        const st = fs.statSync(logPath);
        const tail = fs.readFileSync(logPath, 'utf8').slice(-800);
        const hit = (tail.match(/\[perf-bench\][^\n]*/g) || []).slice(-3).join(' | ');
        console.log(`[run-perf] run${runIdx} alive log=${st.size}b ${hit || '(no bench line yet)'}`);
      } catch {
        /* */
      }
    }, 30_000);
    child.on('error', (err) => {
      clearInterval(heartbeat);
      clearTimeout(killer);
      try {
        fs.closeSync(logFd);
      } catch {
        /* */
      }
      reject(err);
    });
    child.on('exit', (code) => {
      clearInterval(heartbeat);
      clearTimeout(killer);
      try {
        fs.closeSync(logFd);
      } catch {
        /* */
      }
      const ptr = path.join(outDir, `baseline-run${runIdx}.json`);
      if (!fs.existsSync(ptr)) {
        let tail = '';
        try {
          tail = fs.readFileSync(logPath, 'utf8').slice(-2000);
        } catch {
          /* */
        }
        reject(new Error(`run ${runIdx} exit=${code} missing ${ptr}\n${tail}`));
        return;
      }
      console.log(`[run-perf] run ${runIdx} complete exit=${code}`);
      resolve(JSON.parse(fs.readFileSync(ptr, 'utf8')));
    });
  });
}

function pick(obj, pathStr) {
  const parts = pathStr.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function mergeMedian(runs) {
  const paths = [
    'marks.launchToReadyMs',
    'marks.launchToWindowCreatedMs',
    'marks.launchToWindowVisibleMs',
    'marks.launchToInteractiveMs',
    'scenarios.emptyHome.totalMemMb',
    'scenarios.emptyHome.totalCpu',
    'scenarios.emptyHome.uiRenderer.cpu',
    'scenarios.emptyHome.uiRenderer.memMb',
    'scenarios.emptyHome.guests.memMb',
    'scenarios.emptyHome.guests.cpu',
    'scenarios.emptyHome.guests.count',
    'scenarios.emptyHome.byType.Browser.memMb',
    'scenarios.emptyHome.byType.Browser.cpu',
    'scenarios.emptyHome.byType.GPU.memMb',
    'scenarios.emptyHome.byType.GPU.cpu',
    'scenarios.tabs10.totalMemMb',
    'scenarios.tabs10.totalCpu',
    'scenarios.tabs10.openMs',
    'scenarios.tabs10.uiRenderer.cpu',
    'scenarios.tabs10.uiRenderer.memMb',
    'scenarios.tabs10.guests.memMb',
    'scenarios.tabs10.guests.cpu',
    'scenarios.tabs10.guests.count',
    'scenarios.tabs10.guests.webContentsCount',
    'scenarios.tabs10.byType.Browser.memMb',
    'scenarios.tabs10.byType.GPU.memMb',
    'scenarios.tabs10AfterIdle.totalMemMb',
    'scenarios.tabs10AfterIdle.totalCpu',
    'scenarios.tabs10AfterIdle.uiRenderer.memMb',
    'scenarios.tabs10AfterIdle.guests.memMb',
    'scenarios.tabs10AfterIdle.guests.count',
    'scenarios.tabs30.totalMemMb',
    'scenarios.tabs30.totalCpu',
    'scenarios.tabs30.guests.memMb',
    'scenarios.tabs30.guests.count',
    'scenarios.tabs30.guests.webContentsCount',
    'scenarios.backgroundIdle.medianTotalCpu',
    'scenarios.backgroundIdle.medianUiRendererCpu',
    'scenarios.backgroundIdle.medianGuestTabCpu',
    'scenarios.backgroundIdle.medianBrowserCpu',
    'scenarios.backgroundIdle.medianGpuCpu',
    'ui.tabSwitchMedianMs',
    'ui.newTabMedianMs',
    'ui.menuOpen.fps',
    'ui.menuOpen.longTaskCount',
    'ui.historyScroll.fps',
    'ui.historyScroll.longTaskCount',
    'ui.tabChurnMotion.fps',
    'ui.tabChurnMotion.longTaskCount',
    'ui.tabDragMotion.fps',
    'ui.tabDragMotion.longTaskCount',
    'react.idle30s.totalRenders',
    'react.loadOnePage5s.totalRenders',
    'listeners.openClose20.deltaWc',
    'listeners.openClose20.deltaWcListeners',
    'listeners.openClose20.deltaIpcListeners',
    'listeners.before20Tabs.windowFanout.focus',
    'listeners.before20Tabs.windowFanout.resized',
    'disk.userDataMb',
    'disk.visitsJsonlBytes',
    'disk.historyJsonlBytes',
    'disk.cacheMb',
    'disk.localStorage.bytesApprox',
    'build.totalKb',
  ];
  const medians = {};
  for (const p of paths) {
    medians[p] = median(runs.map((r) => pick(r, p)));
  }
  // App / Tab render counts from react profiler
  const appIdle = median(
    runs.map((r) => {
      const c = r.react?.idle30s?.components || [];
      return c.find((x) => x.id === 'App')?.count;
    }),
  );
  const appLoad = median(
    runs.map((r) => {
      const c = r.react?.loadOnePage5s?.components || [];
      return c.find((x) => x.id === 'App')?.count;
    }),
  );
  const tabIdle = median(
    runs.map((r) => {
      const c = r.react?.idle30s?.components || [];
      return c.filter((x) => String(x.id).startsWith('Tab:')).reduce((a, x) => a + x.count, 0);
    }),
  );
  const tabLoad = median(
    runs.map((r) => {
      const c = r.react?.loadOnePage5s?.components || [];
      return c.filter((x) => String(x.id).startsWith('Tab:')).reduce((a, x) => a + x.count, 0);
    }),
  );
  medians['react.idle30s.App.count'] = appIdle;
  medians['react.loadOnePage5s.App.count'] = appLoad;
  medians['react.idle30s.Tabs.sumCount'] = tabIdle;
  medians['react.loadOnePage5s.Tabs.sumCount'] = tabLoad;

  // top build chunks median by name from first run order
  const chunkNames = (runs[0]?.build?.files || []).slice(0, 10).map((f) => f.name);
  const topChunks = chunkNames.map((name) => ({
    name,
    kbMedian: median(runs.map((r) => (r.build?.files || []).find((f) => f.name === name)?.kb)),
  }));

  return {
    kind: 'perf-baseline-median',
    runs: runs.length,
    createdAt: new Date().toISOString(),
    config: { IDLE_MS: Number(IDLE_MS), BG_MS: Number(BG_MS) },
    medians,
    topChunks,
    runFiles: runs.map((r) => ({ run: r.run, startedAt: r.startedAt, finishedAt: r.finishedAt })),
  };
}

async function main() {
  console.log('[run-perf] waiting for Vite', VITE);
  await waitVite(VITE);
  // ensure build chunks exist for size metric
  if (!fs.existsSync(path.join(root, 'dist', 'assets'))) {
    console.log('[run-perf] dist/assets missing — run npm run build for chunk sizes (continuing)');
  }
  const runs = [];
  for (let i = 1; i <= 3; i++) {
    const ptr = path.join(outDir, `baseline-run${i}.json`);
    if (fs.existsSync(ptr) && process.env.PERF_BENCH_FORCE !== '1') {
      console.log(`[run-perf] reuse existing ${ptr}`);
      runs.push(JSON.parse(fs.readFileSync(ptr, 'utf8')));
      continue;
    }
    const r = await runOne(i);
    runs.push(r);
    // brief cool-down between runs
    await new Promise((res) => setTimeout(res, 3000));
  }
  const merged = mergeMedian(runs);
  const out = path.join(outDir, `baseline-${stamp()}-median.json`);
  fs.writeFileSync(out, JSON.stringify(merged, null, 2));
  fs.writeFileSync(path.join(outDir, 'baseline-median-latest.json'), JSON.stringify(merged, null, 2));
  console.log('[run-perf] median written', out);
  console.log(JSON.stringify(merged.medians, null, 2));
}

main().catch((err) => {
  console.error('[run-perf] FAIL', err);
  process.exit(1);
});
