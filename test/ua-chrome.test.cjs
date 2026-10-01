/**
 * Chrome UA brands / Client Hints lists.
 * Run: node test/ua-chrome.test.mjs
 */
const assert = require('node:assert/strict');
const {
  brandList,
  buildChromeUa,
  fullVersionList,
  userAgentMetadataFromFull,
} = require('../electron/lib/ua-brands.cjs');

const full = '152.0.7977.130';
const brands = brandList(full);
assert.equal(brands.length, 3);
assert.equal(brands[0].brand, 'Not.A/Brand');
assert.equal(brands[0].version, '99');
assert.equal(brands[1].brand, 'Google Chrome');
assert.equal(brands[1].version, '152');
assert.equal(brands[2].brand, 'Chromium');
assert.equal(brands[2].version, '152');

const fvl = fullVersionList(full);
assert.equal(fvl[1].version, full);
assert.equal(fvl[2].version, full);

const ua = buildChromeUa(full);
assert.match(ua, /Chrome\/152\.0\.7977\.130/);
assert.equal(/Electron/i.test(ua), false);

const meta = userAgentMetadataFromFull(full);
assert.equal(meta.mobile, false);
assert.equal(meta.platform, 'Windows');
assert.deepEqual(meta.brands, brands);

console.log('ua-chrome.test.mjs: ok');
