/**
 * Omnibox / internal URL helpers.
 * Run: npx tsx test/tab-navigate.test.mjs
 */
import assert from 'node:assert/strict';
import {
  draftForUrl,
  isInternalPageUrl,
  resolveTorHomeUrl,
  titleForInternalUrl,
} from '../src/lib/tabNavigate.ts';
import { HOME_URL, HISTORY_URL, TOR_HOME_URL } from '../src/store/index.ts';

assert.equal(titleForInternalUrl(HISTORY_URL, false), 'Historia');
assert.equal(titleForInternalUrl(HOME_URL, true), 'Tor');
assert.equal(titleForInternalUrl(HOME_URL, false), 'Nowa karta');
assert.equal(titleForInternalUrl(HOME_URL, false, true), 'Nowa karta prywatna');
assert.equal(titleForInternalUrl('https://example.com', false), '…');
assert.equal(isInternalPageUrl(HISTORY_URL), true);
assert.equal(isInternalPageUrl('https://example.com'), false);
assert.equal(draftForUrl(HOME_URL), '');
assert.equal(draftForUrl('https://a.com'), 'https://a.com');
assert.equal(resolveTorHomeUrl(HOME_URL, true), TOR_HOME_URL);
assert.equal(resolveTorHomeUrl(HOME_URL, false), HOME_URL);

console.log('tab-navigate.test.mjs: ok');
