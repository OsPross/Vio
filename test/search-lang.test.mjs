import assert from 'node:assert/strict';
import { searchLanguageParams, searchUrl } from '../src/store/settingsHelpers';
import { DEFAULT_SETTINGS } from '../src/store/constants';

assert.equal(searchLanguageParams('google', 'auto'), '');
assert.ok(searchLanguageParams('google', 'en').includes('hl=en'));
assert.ok(searchLanguageParams('ddg', 'en').includes('kl=us-en'));
assert.ok(searchLanguageParams('brave', 'pl').includes('country=PL'));

const en = { ...DEFAULT_SETTINGS, searchEngine: 'google', searchLanguage: 'en' };
const url = searchUrl(en, 'hello world');
assert.ok(url.startsWith('https://www.google.com/search?q=hello%20world'));
assert.ok(url.includes('hl=en'));
assert.ok(url.includes('gl=us'));

const auto = { ...DEFAULT_SETTINGS, searchEngine: 'brave', searchLanguage: 'auto' };
assert.equal(searchUrl(auto, 'test'), 'https://search.brave.com/search?q=test');

const ddg = { ...DEFAULT_SETTINGS, searchEngine: 'ddg', searchLanguage: 'en' };
assert.ok(searchUrl(ddg, 'x').includes('kl=us-en'));

console.log('search-lang.test.mjs: ok');
