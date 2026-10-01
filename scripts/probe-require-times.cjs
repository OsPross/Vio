'use strict';
/** Measure top-level require cost of electron modules (no app.ready). */
const path = require('path');
const times = {};
function timed(name, rel) {
  const t0 = Date.now();
  require(path.join(__dirname, '..', 'electron', rel));
  times[name] = Date.now() - t0;
}
const order = [
  ['adblock-plus', 'adblock-plus.cjs'],
  ['perf', 'perf.cjs'],
  ['passwords', 'passwords.cjs'],
  ['metrics', 'metrics.cjs'],
  ['security', 'security.cjs'],
  ['tor', 'tor.cjs'],
  ['tor-daemon', 'tor-daemon.cjs'],
  ['privacy', 'privacy.cjs'],
  ['favicon-cache', 'favicon-cache.cjs'],
  ['history', 'history.cjs'],
  ['notes', 'notes.cjs'],
  ['session', 'session.cjs'],
  ['downloads', 'downloads.cjs'],
  ['home-bg', 'home-bg.cjs'],
  ['context-menu', 'context-menu.cjs'],
  ['window-mode', 'window-mode.cjs'],
  ['certificate', 'certificate.cjs'],
  ['shortcuts-guest', 'shortcuts-guest.cjs'],
  ['pip', 'pip.cjs'],
  ['bookmarks-import', 'bookmarks-import.cjs'],
  ['extensions', 'extensions.cjs'],
  ['ua-chrome', 'ua-chrome.cjs'],
  ['mouse-nav', 'mouse-nav.cjs'],
  ['spellcheck', 'spellcheck.cjs'],
];
const tAll = Date.now();
for (const [n, f] of order) timed(n, f);
times.__total = Date.now() - tAll;
console.log(JSON.stringify(times, null, 2));
