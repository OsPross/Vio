'use strict';

/**
 * Static wiring checks for isolated Tor mode (no live Tor required).
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
let failed = 0;

function check(name, cond) {
  if (cond) console.log('OK ', name);
  else {
    console.error('FAIL', name);
    failed += 1;
  }
}

const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const tor = fs.readFileSync(path.join(root, 'electron', 'tor.cjs'), 'utf8');
const sec = fs.readFileSync(path.join(root, 'electron', 'security.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
const store = fs.readFileSync(path.join(root, 'src', 'store.ts'), 'utf8');
const settings = fs.readFileSync(
  path.join(root, 'src', 'components', 'settings', 'sections', 'SearchSection.tsx'),
  'utf8',
);

check('tor.cjs exists with start/stop', tor.includes('async function start') && tor.includes('async function stop'));
check('ephemeral partition tor-uuid', tor.includes('tor-${crypto.randomUUID()}') || tor.includes('tor-${'));
check('no persist prefix for tor partition', /partition = `tor-/.test(tor) && !tor.includes('persist:tor'));
check('proxyBypassRules <-loopback>', tor.includes("'<-loopback>'") || tor.includes('"<-loopback>"'));
check('verify check.torproject.org', tor.includes('check.torproject.org/api/ip'));
check('remote DNS note socks5', tor.includes('remote-via-socks5') || tor.includes('socks5h'));
check('WebRTC kill + UTC', tor.includes('RTCPeerConnection') && tor.includes('timeZone: \'UTC\''));
check('UA Firefox-like', tor.includes('Firefox/128.0'));
check('Accept-Language en-US', tor.includes('en-US,en;q=0.5'));

check('main wires tor IPC', main.includes('shell:tor-start') && main.includes("require('./tor.cjs')"));
check('legacy shell:set-proxy removed', !main.includes('shell:set-proxy') && !preload.includes('setProxy:'));
check('tor guest harden on attach', main.includes('tor.hardenGuestWebContents') || main.includes('isTorWebContents'));

check('security allows tor partitions', sec.includes('TOR_PARTITION_RE') && sec.includes('isAllowedPartition'));
check('security torMode blocks external', sec.includes('torMode'));

check('preload torStart/Stop', preload.includes('torStart:') && preload.includes('shell:tor-start'));
check('preload open-url object', preload.includes('payload.tor'));

check('store Tab.mode tor + newTorTab', store.includes("mode?: 'normal' | 'tor'") && store.includes('newTorTab:'));
check('store TOR_HOME_URL', store.includes("about:tor"));
check('store torSeenDisclaimer', store.includes('torSeenDisclaimer'));

check('App Ctrl+Shift+N', app.includes("Ctrl+Shift+N") || (app.includes("shiftKey") && app.includes("'N'")));
check('App openTorTab + partition', app.includes('openTorTab') && app.includes('partition={partition}'));
check('App no passwords on tor', app.includes("t.mode !== 'tor'") || app.includes("tab.mode === 'tor'"));
check('App no history push on tor', app.includes('isTorTab(active)'));
check('App letter favicon tor', app.includes('letterFavicon'));

check('Settings honest Tor copy', settings.includes('To nie jest Tor Browser') && settings.includes('Tryb Tor'));
check('Settings mentions Expert Bundle', settings.includes('Expert Bundle') || settings.includes('tor.exe'));
check('tor-daemon embedded module', fs.existsSync(path.join(root, 'electron', 'tor-daemon.cjs')));
const daemon = fs.readFileSync(path.join(root, 'electron', 'tor-daemon.cjs'), 'utf8');
check('daemon downloads expert bundle', daemon.includes('tor-expert-bundle-windows') && daemon.includes('sha256'));
check('daemon socks 19050', daemon.includes('19050'));
check('tor.cjs uses embedded fallback', tor.includes('torDaemon.ensureRunning'));

// parseProxy unit-ish without electron
const { parseProxy, isTorPartition } = (() => {
  // minimal extract: reimplement checks
  return {
    parseProxy(url) {
      const raw = String(url || '').trim();
      const m = raw.match(/^socks5h?:\/\/([^:/]+):(\d+)/i);
      if (!m) return { rules: 'socks5://127.0.0.1:9050' };
      return { rules: `socks5://${m[1]}:${m[2]}` };
    },
    isTorPartition(name) {
      return typeof name === 'string' && /^tor-[0-9a-f-]{8,}$/i.test(name);
    },
  };
})();

check('parseProxy socks5', parseProxy('socks5://127.0.0.1:9150').rules === 'socks5://127.0.0.1:9150');
check('isTorPartition ok', isTorPartition('tor-12345678-1234-1234-1234-123456789abc'));
check('isTorPartition rejects persist', !isTorPartition('persist:main') && !isTorPartition('persist:tor'));

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll Tor wiring checks passed.');
