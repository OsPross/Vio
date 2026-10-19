/**
 * Chrome UA brands / Client Hints lists.
 * Run: node test/ua-chrome.test.cjs
 */
const assert = require('node:assert/strict');
const {
  brandList,
  buildChromeUa,
  fullVersionList,
  reducedChromeVersion,
  userAgentMetadataFromFull,
} = require('../electron/lib/ua-brands.cjs');

const full = '152.0.7977.130';
const brands = brandList(full);
assert.equal(brands.length, 3);
assert.equal(brands[0].brand, 'Not?A_Brand');
assert.equal(brands[0].version, '24');
assert.equal(brands[1].brand, 'Chromium');
assert.equal(brands[1].version, '152');
assert.equal(brands[2].brand, 'Google Chrome');
assert.equal(brands[2].version, '152');

const fvl = fullVersionList(full);
assert.equal(fvl[1].version, full);
assert.equal(fvl[2].version, full);
assert.equal(fvl[2].brand, 'Google Chrome');

assert.equal(reducedChromeVersion(full), '152.0.0.0');

const ua = buildChromeUa(full);
assert.match(ua, /Chrome\/152\.0\.0\.0/);
assert.equal(/Electron/i.test(ua), false);
assert.equal(/Vio|moja.?przegladarka/i.test(ua), false);

const meta = userAgentMetadataFromFull(full);
assert.equal(meta.mobile, false);
assert.equal(meta.platform, 'Windows');
assert.equal(meta.fullVersion, full);
assert.deepEqual(meta.brands, brands);

const { buildMobileChromeUa } = require('../electron/ua-chrome.cjs');
const mua = buildMobileChromeUa();
assert.match(mua, /Android/);
assert.match(mua, /Mobile Safari/);
assert.match(mua, /Chrome\//);
assert.equal(/Electron/i.test(mua), false);

console.log('ua-chrome.test.cjs: ok');
