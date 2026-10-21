import assert from 'node:assert/strict';
import { discardSkipReason, normalizeDiscardMinutes } from '../src/lib/tabDiscard.ts';

const base = {
  id: 't1',
  title: 'Example',
  url: 'https://example.com/',
  lastActiveAt: Date.now() - 60_000,
};

assert.equal(discardSkipReason(base, 't1', { keepPinned: true }), 'active');
assert.equal(
  discardSkipReason({ ...base, discarded: true }, 'other', { keepPinned: true }),
  'already',
);
assert.equal(
  discardSkipReason({ ...base, mode: 'tor' }, 'other', { keepPinned: true }),
  'tor',
);
assert.equal(
  discardSkipReason({ ...base, mode: 'private' }, 'other', { keepPinned: true }),
  'private',
);
assert.equal(
  discardSkipReason({ ...base, pinned: true }, 'other', { keepPinned: true }),
  'pinned',
);
assert.equal(
  discardSkipReason({ ...base, pinned: true }, 'other', { keepPinned: false }),
  null,
);
assert.equal(
  discardSkipReason({ ...base, url: 'about:home' }, 'other', { keepPinned: true }),
  'internal',
);
assert.equal(
  discardSkipReason(base, 'other', { keepPinned: true, audioPlaying: true }),
  'audio',
);
assert.equal(discardSkipReason(base, 'other', { keepPinned: true }), null);

assert.equal(normalizeDiscardMinutes(0), 0);
assert.equal(normalizeDiscardMinutes(7), 15);
assert.equal(normalizeDiscardMinutes(20), 30);
assert.equal(normalizeDiscardMinutes(45), 60);
assert.equal(normalizeDiscardMinutes(90), 60);

console.log('tab-discard.test.mjs: ok');
