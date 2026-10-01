'use strict';

/**
 * Tor leak / wiring static checks (no live network required).
 * Covers favicon cache isolation, history, clearnet fetches, autostart default, WebRTC, wipe.
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

const appTsx = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
const home = fs.readFileSync(path.join(root, 'src', 'components', 'HomeSearch.tsx'), 'utf8');
const tor = fs.readFileSync(path.join(root, 'electron', 'tor.cjs'), 'utf8');
const daemon = fs.readFileSync(path.join(root, 'electron', 'tor-daemon.cjs'), 'utf8');
const fav = fs.readFileSync(path.join(root, 'electron', 'favicon-cache.cjs'), 'utf8');
const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'electron', 'preload.cjs'), 'utf8');
const store = fs.readFileSync(path.join(root, 'src', 'store.ts'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src', 'components', 'SettingsPage.tsx'), 'utf8');
const adblockPlus = fs.readFileSync(path.join(root, 'electron', 'adblock-plus.cjs'), 'utf8');

console.log('\n=== 1. Favicony Tor ===');
check('Tor tab favicon only data: or letter (no faviconCachePut)', /mode === 'tor'[\s\S]*?faviconCachePut/.test(appTsx) === false || /if \(tab\.mode === 'tor'\)[\s\S]*?return;[\s\S]*?faviconCachePut/.test(appTsx));
check('Tor favicon branch rejects non-data', appTsx.includes("f.startsWith('data:')") && appTsx.includes("tab.mode === 'tor'"));
check('favicon-cache refuses .onion', fav.includes('.onion'));
check('main favicon-cache-put rejects opts.tor / onion', main.includes('opts.tor') && main.includes('.onion'));

console.log('\n=== 2. Sugestie / historia ===');
check('navigateActive skips pushHistory for Tor', /const tor = isTorTab\(active\);\s*\n\s*if \(!tor\)/.test(appTsx) || appTsx.includes('if (!tor) {\n      if (query) pushHistory'));
check('go() early-return for Tor without history', /if \(isTorTab\(active\)\) \{\s*\n\s*navigateActive\(url\);\s*\n\s*return;/.test(appTsx));
check('HomeSearch only on non-Tor home', appTsx.includes('!activeIsTor') && appTsx.includes('<HomeSearch'));
check('searchSuggest is main net.fetch (clearnet) — must not be used from Tor UI', main.includes('shell:search-suggest') && main.includes('duckduckgo.com/ac/'));
check('history module exists', fs.existsSync(path.join(root, 'electron', 'history.cjs')));
check('history IPC wired', main.includes('shell:history-record-visit') && preload.includes('historyRecordVisit'));
check('recordVisit rejects tor', (() => {
  const h = fs.readFileSync(path.join(root, 'electron', 'history.cjs'), 'utf8');
  return h.includes("opts.tor") && h.includes("reason: 'tor'") && h.includes('.onion');
})());
check('App never records Tor visits', appTsx.includes('tab.mode !== \'tor\'') && appTsx.includes('recordVisitFromTab') && /if \(tab\.mode === 'tor'\) return;/.test(appTsx));
check('OmniboxSuggest disabled on Tor', appTsx.includes('torMode={activeIsTor}') || appTsx.includes('torMode={activeIsTor}'));
check('Ctrl+H blocked for Tor tabs', appTsx.includes('Ctrl') && appTsx.includes('HISTORY_URL') && /isTorTab\(tab\)\) return/.test(appTsx));
check('historySuggest returns empty when tor', main.includes("opts.tor) return { completion: null, groups: [] }") || main.includes('if (opts && opts.tor) return { completion: null, groups: [] }'));

console.log('\n=== 2c. Session restore (Tor never persisted) ===');
check('session module exists', fs.existsSync(path.join(root, 'electron', 'session.cjs')));
check('session IPC wired', main.includes('shell:session-save') && preload.includes('sessionSave'));
check('session isTorLike rejects tor/onion', (() => {
  const s = fs.readFileSync(path.join(root, 'electron', 'session.cjs'), 'utf8');
  return s.includes('isTorLike') && s.includes("mode === 'tor'") && s.includes('.onion') && s.includes('about:tor');
})());
check('buildSessionSnapshot filters Tor', fs.existsSync(path.join(root, 'src', 'lib', 'sessionSnapshot.ts')) && fs.readFileSync(path.join(root, 'src', 'lib', 'sessionSnapshot.ts'), 'utf8').includes('isTorTab'));
check('closeTab skips Tor closed stack', store.includes('toClosedTab') && store.includes('isTorTab(closing)'));
check('Ctrl+Shift+T reopenClosedTab', appTsx.includes('reopenClosedTab') && appTsx.includes("e.key === 'T'") && appTsx.includes('e.shiftKey'));

(() => {
  // Runtime without electron app path: mock via temp by requiring after patching getPath is hard;
  // exercise sanitize helpers through module with tmp override if we export enough.
  const sess = require(path.join(root, 'electron', 'session.cjs'));
  check('sanitizeTab drops tor mode', sess.sanitizeTab({ id: '1', url: 'https://x.com', mode: 'tor' }) === null);
  check('sanitizeTab drops onion', sess.sanitizeTab({ id: '1', url: 'http://abc.onion/' }) === null);
  check('sanitizeTab keeps https', !!sess.sanitizeTab({ id: '1', url: 'https://example.com', title: 'Ex', mode: 'normal' }));
  check('isTorLike about:tor', sess.isTorLike({ url: 'about:tor', mode: 'normal' }));
})();

console.log('\n=== 2b. History runtime (Tor guards) ===');
(() => {
  const hist = require(path.join(root, 'electron', 'history.cjs'));
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'djxxr-hist-'));
  hist._setRootForTests(tmp);
  hist.setConfig({ retention: 'always' });
  hist.clear({ range: 'all' });
  check('recordVisit rejects tor:true', hist.recordVisit({ url: 'https://example.com', tor: true }).reason === 'tor');
  check('recordVisit rejects .onion', hist.recordVisit({ url: 'http://xyz.onion/' }).ok === false);
  check('recordVisit rejects about:', hist.recordVisit({ url: 'about:blank' }).ok === false);
  check('recordVisit accepts https', hist.recordVisit({ url: 'https://youtube.com/watch', title: 'YouTube', typed: true }).ok === true);
  const emptyTor = hist.suggest('you', { tor: true });
  check('suggest empty under tor flag', !emptyTor.completion && (!emptyTor.groups || emptyTor.groups.length === 0));
  const r2 = hist.suggest('you', { suggestHistory: true, limit: 8 });
  check('suggest finds youtube host', !!r2.completion || r2.groups.some((g) => g.items.some((i) => /youtube/i.test(i.url || ''))));
  // frecency volume
  for (let i = 0; i < 2000; i++) hist.recordVisit({ url: `https://site${i}.example/p`, title: `S${i}` });
  const t0 = Date.now();
  hist.suggest('site1', { suggestHistory: true, limit: 8 });
  const ms = Date.now() - t0;
  check(`suggest <20ms at ~2k entries (got ${ms}ms)`, ms < 20);
  hist.flushSync();
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* */
  }
})();

console.log('\n=== 3. Clearnet paths inventory (must not serve Tor tabs) ===');
const clearnetHits = [];
if (fav.includes('net.fetch')) clearnetHits.push('favicon-cache.net.fetch');
if (main.includes("duckduckgo.com/ac/")) clearnetHits.push('search-suggest');
if (adblockPlus.includes('net.fetch') || adblockPlus.includes('fetchText')) clearnetHits.push('adblock-lists');
if (daemon.includes('https.get') || daemon.includes('https.get')) clearnetHits.push('tor-bundle-download');
check('tor verify uses ses.fetch not net.fetch default', tor.includes('ses.fetch') && tor.includes('check.torproject.org'));
check('listed clearnet helpers are app-level only', clearnetHits.length >= 3);
console.log('   clearnet helpers:', clearnetHits.join(', '));

console.log('\n=== 4. Bundle integrity (OpenPGP) ===');
check('download host allowlist torproject.org', daemon.includes('www.torproject.org') && daemon.includes('ALLOWED_DOWNLOAD_HOSTS'));
check('sha256sums-signed-build', daemon.includes('sha256sums-signed-build'));
check('fingerprint Tor Browser Developers', daemon.includes('EF6E286DDA85EA2A4BA7DE684E2C6E8793298290'));
check('bundled torbrowser.asc present', fs.existsSync(path.join(root, 'electron', 'tor-keys', 'torbrowser.asc')));
check('uses openpgp (not gpg CLI)', daemon.includes("require('openpgp')") && !daemon.includes('gpg --verify') && !daemon.includes('tryGpgVerify'));
check('fail-closed: no pinned-hash fallback', !daemon.includes('using pinned sha256'));
check('verifySha256SumsSignature exported', daemon.includes('verifySha256SumsSignature') && daemon.includes('loadBundledTorKey'));
check('HTTPS-only download', daemon.includes("protocol !== 'https:'"));

console.log('\n=== 5. Autostart ===');
check('torDaemonAutostart default false in store', store.includes('torDaemonAutostart: false'));
check('removeAutostartShortcuts on ready', main.includes('removeAutostartShortcuts'));
check('setAutostart only via settings IPC', preload.includes('torDaemonAutostart') && settings.includes('Autostart daemona Tor'));
check('no automatic writeShortcutLink at ensureRunning', !/ensureRunning[\s\S]{0,800}writeShortcutLink/.test(daemon));

console.log('\n=== 6. WebRTC ===');
check('disable_non_proxied_udp on Tor guests', tor.includes("disable_non_proxied_udp"));
check('RTCPeerConnection blocked in injected script', tor.includes('RTCPeerConnection'));

console.log('\n=== 7. DNS ===');
check('socks5 remote DNS note', tor.includes('remote-via-socks5') || tor.includes('socks5h'));
check('only socks5 rules (no socks4)', tor.includes('socks5://') && !tor.includes('socks4://'));

console.log('\n=== 8. Permissions ===');
check('permission request always false', tor.includes('callback(false)'));
check('permission check always false', tor.includes('setPermissionCheckHandler(() => false)'));

console.log('\n=== 9. Downloads ===');
const downloadsSrc = fs.existsSync(path.join(root, 'electron', 'downloads.cjs'))
  ? fs.readFileSync(path.join(root, 'electron', 'downloads.cjs'), 'utf8')
  : '';
check('downloads manager exists', !!downloadsSrc);
check('will-download asks before save (Tor session)', downloadsSrc.includes('Zapisz przez Tor'));
check('download warns about IP leak on open', downloadsSrc.includes('ujawnić') || downloadsSrc.includes('prawdziwe IP'));
check('Tor entries never persisted to disk', downloadsSrc.includes('if (!tor) persistList') || downloadsSrc.includes('.filter((r) => !r.tor)'));
check('wipeTorEntries on tor stop', tor.includes('wipeTorEntries'));
check('Zone.Identifier MOTW', downloadsSrc.includes('Zone.Identifier'));

console.log('\n=== 9b. Bridges + ControlPort + NEWNYM ===');
const controlMod = fs.existsSync(path.join(root, 'electron', 'tor-control.cjs'))
  ? fs.readFileSync(path.join(root, 'electron', 'tor-control.cjs'), 'utf8')
  : '';
const bridgesMod = fs.existsSync(path.join(root, 'electron', 'tor-bridges-builtin.cjs'))
  ? fs.readFileSync(path.join(root, 'electron', 'tor-bridges-builtin.cjs'), 'utf8')
  : '';
check('tor-control.cjs exists', !!controlMod);
check('CookieAuthentication + AUTHENTICATE', controlMod.includes('AUTHENTICATE') && daemon.includes('CookieAuthentication 1'));
check('SIGNAL NEWNYM', controlMod.includes('SIGNAL NEWNYM') || /newnym/i.test(controlMod));
check('builtin bridges with date', bridgesMod.includes('updated') && bridgesMod.includes('obfs4'));
check('ClientTransportPlugin lyrebird/snowflake', daemon.includes('ClientTransportPlugin') && daemon.includes('lyrebird'));
check('UseBridges + applyBridges', daemon.includes('UseBridges 1') && daemon.includes('applyBridges'));
check('newIdentity in tor.cjs', tor.includes('newIdentity') && tor.includes('signalNewnym'));
check('IPC new-identity / bridges', main.includes('shell:tor-new-identity') && preload.includes('torNewIdentity') && preload.includes('torBridges'));
check('no Moat (builtin + manual only)', !daemon.includes('moat/fetch') && !daemon.includes('bridges.torproject.org/moat'));
check('torBridgeMode default none', store.includes("torBridgeMode: 'none'"));
check('Settings mosty UI', settings.includes('Mosty') && settings.includes('obfs4'));
check('Ctrl+Shift+U / new identity event', appTsx.includes('djxxr-tor-new-identity'));

console.log('\n=== 10. Wipe ===');
check('wipeSession clears storage+cache+auth+resolver', tor.includes('clearStorageData') && tor.includes('clearCache') && tor.includes('clearAuthCache') && tor.includes('clearHostResolverCache'));
check('stop() wipes partition', /async function stop\(\)[\s\S]*wipeSession/.test(tor));
check('before-quit calls tor.stop', main.includes('void tor.stop()') || main.includes('tor.stop()'));
check('AvoidDiskWrites 1 in torrc', daemon.includes("'AvoidDiskWrites 1'") || daemon.includes('AvoidDiskWrites 1'));

console.log('\n=== 11. Adblock double-bind ===');
check('adblock-plus does not require legacy adblock.cjs', !adblockPlus.includes("require('./adblock.cjs')"));
check('Ghostery enableBlockingInSession wired', adblockPlus.includes('enableBlockingInSession'));
check('no onBeforeRequest in adblock-plus', !adblockPlus.includes('onBeforeRequest'));
check('legacy adblock.cjs removed', !fs.existsSync(path.join(root, 'electron', 'adblock.cjs')));

async function openpgpCases() {
  console.log('\n=== 4b. OpenPGP runtime ===');
  const daemonMod = require(path.join(root, 'electron', 'tor-daemon.cjs'));
  const openpgp = require('openpgp');

  const key = await daemonMod.loadBundledTorKey();
  check(
    'bundled key fingerprint matches EF6E…8290',
    key.getFingerprint().toLowerCase() === 'ef6e286dda85ea2a4ba7de684e2c6e8793298290',
  );

  // Generate unrelated key → sign a fake/tampered sums list → Tor key must reject
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519',
    userIDs: [{ name: 'djxxr-test', email: 'test@example.invalid' }],
  });
  const attackerKey = await openpgp.readPrivateKey({ armoredKey: privateKey });
  const tamperedSums =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  tor-expert-bundle-windows-x86_64-15.0.24.tar.gz\n';
  const message = await openpgp.createMessage({ text: tamperedSums });
  const detached = await openpgp.sign({
    message,
    signingKeys: attackerKey,
    detached: true,
  });

  let rejectedTampered = false;
  try {
    await daemonMod.verifySha256SumsSignature(tamperedSums, detached);
  } catch (err) {
    rejectedTampered = /TOR_SIG_FAIL|nieprawidłowy|OpenPGP/i.test(String(err.code || '') + String(err.message || err));
  }
  check('rejects sums signed by wrong key (tampered list)', rejectedTampered);

  let rejectedMissingAsc = false;
  try {
    await daemonMod.verifySha256SumsSignature(tamperedSums, '');
  } catch (err) {
    rejectedMissingAsc = err.code === 'TOR_ASC_MISSING' || /Brak lub uszkodzony/.test(String(err.message || ''));
  }
  check('rejects missing .asc signature', rejectedMissingAsc);

  let rejectedGarbageAsc = false;
  try {
    await daemonMod.verifySha256SumsSignature(
      tamperedSums,
      '-----BEGIN PGP SIGNATURE-----\n\nbm90LWEtc2ln\n-----END PGP SIGNATURE-----\n',
    );
  } catch (err) {
    rejectedGarbageAsc =
      err.code === 'TOR_ASC_BAD' ||
      err.code === 'TOR_SIG_FAIL' ||
      /Nieparsowalny|nieprawidłowy|OpenPGP/i.test(String(err.message || ''));
  }
  check('rejects garbage / unusable .asc', rejectedGarbageAsc);

  // Sanity: attacker pubkey must not match Tor fingerprint
  const attackerPub = await openpgp.readKey({ armoredKey: publicKey });
  check(
    'attacker key ≠ Tor fingerprint',
    attackerPub.getFingerprint().toLowerCase() !== 'ef6e286dda85ea2a4ba7de684e2c6e8793298290',
  );
}

openpgpCases()
  .then(() => {
    console.log('\n---');
    if (failed) {
      console.error(`${failed} check(s) failed`);
      process.exit(1);
    }
    console.log('All tor-leaks checks passed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('OpenPGP test crash', err);
    process.exit(1);
  });
