/**
 * Popup / _blank / OAuth policy (pure).
 * Run: node test/popup-policy.test.mjs
 */
const assert = require('node:assert/strict');
const {
  decideWindowOpen,
  looksLikeOauthUrl,
  looksLikePopupFeatures,
  parseFeatureSize,
} = require('../electron/lib/popup-policy.cjs');

assert.equal(looksLikeOauthUrl('https://accounts.google.com/o/oauth2'), true);
assert.equal(looksLikeOauthUrl('https://github.com/login/oauth/authorize'), true);
assert.equal(looksLikeOauthUrl('https://example.com/oauth/start'), true);
assert.equal(looksLikeOauthUrl('https://example.com/blog'), false);

assert.equal(looksLikePopupFeatures('width=500,height=600'), true);
assert.equal(looksLikePopupFeatures('noopener,noreferrer'), false);
assert.equal(parseFeatureSize('width=400,height=300', 'width', 900), 400);
assert.equal(parseFeatureSize('', 'width', 900), 900);
assert.equal(parseFeatureSize('width=50', 'width', 900), 200); // clamped
assert.equal(parseFeatureSize('width=9999', 'width', 900), 1600);

// target=_blank → tab
assert.equal(
  decideWindowOpen({
    url: 'https://example.com/',
    disposition: 'foreground-tab',
    features: '',
    navOk: true,
  }),
  'open-tab',
);

// sized new-window → popup when gestured
assert.equal(
  decideWindowOpen({
    url: 'https://example.com/',
    disposition: 'new-window',
    features: 'width=520,height=680',
    navOk: true,
    hasGesture: true,
  }),
  'allow-popup',
);

// sized new-window without gesture → block
assert.equal(
  decideWindowOpen({
    url: 'https://example.com/',
    disposition: 'new-window',
    features: 'width=520,height=680',
    navOk: true,
    hasGesture: false,
  }),
  'block',
);

// OAuth about:blank / oauth URL may allow without gesture
assert.equal(
  decideWindowOpen({
    url: 'about:blank',
    disposition: 'new-window',
    features: 'width=520,height=680',
    navOk: true,
    hasGesture: false,
  }),
  'allow-popup',
);

assert.equal(
  decideWindowOpen({
    url: 'https://accounts.google.com/o/oauth2/auth',
    disposition: 'new-window',
    features: 'width=520,height=680',
    navOk: true,
    hasGesture: false,
  }),
  'allow-popup',
);

// Tor never real popup window
assert.equal(
  decideWindowOpen({
    url: 'https://example.com/',
    disposition: 'new-window',
    features: 'width=520,height=680',
    navOk: true,
    hasGesture: true,
    torMode: true,
  }),
  'open-tab',
);

console.log('popup-policy.test.mjs: ok');
