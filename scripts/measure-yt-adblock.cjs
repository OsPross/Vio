/**
 * Microbench: adblock match cost for YouTube media URLs + optional live video-start probe.
 * Env: MEASURE_YT=1 with electron:dev (wired in main) for live timings.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const YT_URLS = [
  'https://rr1---sn-abc.googlevideo.com/videoplayback?expire=1&id=x&itag=18',
  'https://rr5---sn-xyz.googlevideo.com/videoplayback?expire=2&id=y&itag=137',
  'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  'https://www.youtube.com/youtubei/v1/player?prettyPrint=false',
  'https://www.googleads.g.doubleclick.net/pagead/id',
  'https://securepubads.g.doubleclick.net/gampad/ads?iu=/x',
];

function skipLikeProd(url, resourceType) {
  const rt = String(resourceType || '');
  if (rt === 'media' || rt === 'video' || rt === 'audio') return true;
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h === 'googlevideo.com' || h.endsWith('.googlevideo.com')) return true;
    if (h === 'ytimg.com' || h.endsWith('.ytimg.com')) return true;
    if (h === 'ggpht.com' || h.endsWith('.ggpht.com')) return true;
  } catch {
    /* */
  }
  return false;
}

async function microbench() {
  const { ElectronBlocker } = require('@ghostery/adblocker-electron');
  const { Request } = require('@ghostery/adblocker');
  const enginePath = path.join(
    process.env.APPDATA || '',
    'moja-przegladarka',
    'adblock-lists',
    'engine.bin',
  );
  const out = { at: new Date().toISOString(), enginePath, hasEngine: fs.existsSync(enginePath) };
  if (!out.hasEngine) {
    out.error = 'no engine.bin — run the app once to build cache';
    return out;
  }
  const t0 = Date.now();
  const blocker = ElectronBlocker.deserialize(fs.readFileSync(enginePath));
  out.deserializeMs = Date.now() - t0;

  const rounds = 3;
  /** @type {number[]} */
  const fullMs = [];
  /** @type {number[]} */
  const skipMs = [];
  for (let r = 0; r < rounds; r++) {
    let t = process.hrtime.bigint();
    for (const url of YT_URLS) {
      for (let i = 0; i < 200; i++) {
        const request = Request.fromRawDetails({
          url,
          type: url.includes('googlevideo') ? 'media' : 'xhr',
          sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });
        blocker.match(request);
      }
    }
    fullMs.push(Number(process.hrtime.bigint() - t) / 1e6);

    t = process.hrtime.bigint();
    for (const url of YT_URLS) {
      for (let i = 0; i < 200; i++) {
        const type = url.includes('googlevideo') ? 'media' : 'xhr';
        if (skipLikeProd(url, type)) continue;
        const request = Request.fromRawDetails({
          url,
          type,
          sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });
        blocker.match(request);
      }
    }
    skipMs.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  out.fullMatchMs = fullMs.map((n) => Math.round(n));
  out.skipMediaMatchMs = skipMs.map((n) => Math.round(n));
  out.fullAvg = Math.round(fullMs.reduce((a, b) => a + b, 0) / fullMs.length);
  out.skipAvg = Math.round(skipMs.reduce((a, b) => a + b, 0) / skipMs.length);
  return out;
}

/**
 * Live: navigate watch URL, measure until <video> has readyState>=3 or currentTime>0.
 * @param {() => import('electron').BrowserWindow | null} getMainWindow
 */
async function runLive(getMainWindow) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { at: new Date().toISOString(), ok: false, samples: [] };
  await sleep(2500);
  let win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  for (let i = 0; i < 25 && (!win || win.isDestroyed()); i++) {
    await sleep(400);
    win = typeof getMainWindow === 'function' ? getMainWindow() : getMainWindow;
  }
  if (!win || win.isDestroyed()) {
    out.error = 'no-window';
    return out;
  }
  const adblock = require('../electron/adblock-plus.cjs');
  const watch = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  const evalApp = (code) => win.webContents.executeJavaScript(code, true);

  async function oneSample(label) {
    const status = adblock.getStatus();
    const tNav = Date.now();
    await evalApp(`(() => {
      const s = window.__DJXXR_STORE__.getState();
      s.updateTab(s.activeId, { url: ${JSON.stringify(watch)} + '&n=' + Date.now() });
      return true;
    })()`);
    await sleep(1200);
    let videoMs = null;
    for (let i = 0; i < 36; i++) {
      await sleep(500);
      const st = await evalApp(`(() => {
        const w = document.querySelector('webview');
        if (!w) return { err: 'no-webview' };
        return w.executeJavaScript(\`(function(){
          var v = document.querySelector('video.html5-main-video, video');
          if (!v) return { hasVideo: false };
          return { hasVideo: true, rs: v.readyState, t: v.currentTime, paused: v.paused };
        })()\`);
      })()`).catch((e) => ({ err: String(e.message || e) }));
      if (st && st.hasVideo && (st.rs >= 3 || st.t > 0.2)) {
        videoMs = Date.now() - tNav;
        break;
      }
    }
    out.samples.push({
      label,
      videoStartMs: videoMs,
      adblockReady: Boolean(status.ready),
      adblockEnabled: Boolean(status.enabled && status.network),
      engine: status.engine,
      blockedToday: status.blockedToday,
    });
    await sleep(600);
  }

  // 3 with adblock on (cached engine after first nav)
  for (let n = 0; n < 3; n++) await oneSample(`on-${n}`);
  // 3 with network blocking off (cosmetics may remain)
  adblock.setConfig({ enabled: false, network: false });
  for (let n = 0; n < 3; n++) await oneSample(`off-${n}`);
  adblock.setConfig({ enabled: true, network: true });
  out.ok = out.samples.every((s) => typeof s.videoStartMs === 'number');
  const dir = path.join(os.tmpdir(), 'djxxr-yt-measure');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `yt-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log('[measure-yt]', JSON.stringify(out, null, 2));
  console.log('[measure-yt] wrote', file);
  return out;
}

async function main() {
  const micro = await microbench();
  console.log('[measure-yt-micro]', JSON.stringify(micro, null, 2));
  const dir = path.join(os.tmpdir(), 'djxxr-yt-measure');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `micro-${Date.now()}.json`), JSON.stringify(micro, null, 2));
}

if (require.main === module) {
  void main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}

module.exports = { run: runLive, microbench };
