'use strict';

const assert = require('node:assert/strict');
const {
  publicKeyDerToExtensionId,
  decodeManifestKey,
  extractPublicKeyFromCrx,
  extractAllPublicKeysFromCrx,
  generateDevPublicKey,
  isChromeExtensionId,
} = require('../electron/lib/chrome-extension-id.cjs');

const gen = generateDevPublicKey();
assert.equal(isChromeExtensionId(gen.id), true);
assert.equal(publicKeyDerToExtensionId(gen.der), gen.id);
assert.equal(publicKeyDerToExtensionId(decodeManifestKey(gen.der.toString('base64'))), gen.id);

// CRX2: Cr24 + version + pubkeyLen + sigLen + pubkey + sig + zip stub
const pubkey = gen.der;
const sig = Buffer.alloc(128, 1);
const header = Buffer.alloc(16);
header.write('Cr24', 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(pubkey.length, 8);
header.writeUInt32LE(sig.length, 12);
const crx2 = Buffer.concat([header, pubkey, sig, Buffer.from('PK\x03\x04')]);
const extracted = extractPublicKeyFromCrx(crx2);
assert.ok(extracted);
assert.equal(publicKeyDerToExtensionId(extracted), gen.id);
assert.equal(extractAllPublicKeysFromCrx(crx2).length, 1);

assert.equal(isChromeExtensionId('not-an-id'), false);
assert.equal(isChromeExtensionId('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), true);

const { isChromeWebStoreUrl } = require('../electron/lib/chrome-extension-id.cjs');
assert.equal(isChromeWebStoreUrl('https://chromewebstore.google.com/detail/x/abc'), true);
assert.equal(isChromeWebStoreUrl('https://chrome.google.com/webstore/detail/abc'), true);
assert.equal(isChromeWebStoreUrl('https://chrome.google.com/other'), false);
assert.equal(isChromeWebStoreUrl('http://chromewebstore.google.com/'), false);
assert.equal(isChromeWebStoreUrl('https://chromewebstore.google.com.evil.com/'), false);
assert.equal(isChromeWebStoreUrl('https://evil.com/?chromewebstore.google.com'), false);
assert.equal(isChromeWebStoreUrl(''), false);

console.log('chrome-extension-id.test.cjs OK');
