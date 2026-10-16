'use strict';

const assert = require('node:assert/strict');
const googleAuth = require('../electron/lib/google-auth.cjs');

assert.equal(googleAuth.isGoogleAuthUrl('https://accounts.google.com/'), true);
assert.equal(googleAuth.isGoogleAuthUrl('https://accounts.google.com/v3/signin/identifier'), true);
assert.equal(googleAuth.isGoogleAuthUrl('https://accounts.youtube.com/'), true);
assert.equal(
  googleAuth.isGoogleAuthUrl('https://www.google.com/o/oauth2/v2/auth?client_id=x'),
  true,
);
assert.equal(googleAuth.isGoogleAuthUrl('https://mail.google.com/'), false);
assert.equal(googleAuth.isGoogleAuthUrl('https://www.youtube.com/'), false);

const chromeUa =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';
const chromeless = googleAuth.buildGoogleAuthUa(chromeUa);
assert.ok(!/Chrome\//i.test(chromeless), 'Wexond: no Chrome/ in Google auth UA');
assert.ok(!/Electron\//i.test(chromeless), 'no Electron/ in Google auth UA');
assert.ok(/Safari\//i.test(chromeless), 'Safari token kept');

const withElectron = googleAuth.buildGoogleAuthUa(
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Electron/44.0.0 Safari/537.36',
);
assert.ok(!/Electron\//i.test(withElectron));
assert.ok(!/Chrome\//i.test(withElectron));

const headers = {
  'sec-ch-ua': '"Not(A:Brand";v="8", "Chromium";v="134"',
  'Sec-CH-UA-Mobile': '?0',
  'User-Agent': chromeUa,
};
googleAuth.stripSecChUaHeaders(headers);
assert.equal(Object.keys(headers).filter((k) => k.toLowerCase().startsWith('sec-ch-ua')).length, 0);

const branded = googleAuth.withGoogleChromeBrand('"Not(A:Brand";v="8", "Chromium";v="134"', '134');
assert.ok(branded.includes('Google Chrome'));
assert.ok(branded.includes('Not(A:Brand'));

console.log('google-auth.test.cjs OK');
