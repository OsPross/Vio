/**
 * Archive idle helpers (renderer lib).
 * Run: npx tsx test/tab-archive-logic.test.mjs
 */
import assert from 'node:assert/strict';
import {
  archiveIdleMs,
  archivePollMs,
  archiveSkipReason,
  normalizeArchiveHours,
} from '../src/lib/tabArchive.ts';
import {
  dropTabSessionHistory,
  exportTabSessionHistory,
  importTabSessionHistory,
  recordTabSessionUrl,
  tabSessionCanBack,
} from '../src/lib/tabSessionHistory.ts';

assert.equal(normalizeArchiveHours(0), 0);
assert.equal(normalizeArchiveHours(5), 6);
assert.equal(normalizeArchiveHours(12), 12);
assert.equal(normalizeArchiveHours(20), 24);
assert.equal(normalizeArchiveHours(-1), 0);

assert.equal(archiveIdleMs(12), 12 * 3_600_000);
assert.ok(archivePollMs(60_000) <= 15_000);
assert.ok(archivePollMs(12 * 3_600_000) >= 60_000);

const base = {
  id: 't1',
  title: 'X',
  url: 'https://example.com/',
  mode: 'normal',
};

assert.equal(archiveSkipReason(base, 't1', {}), 'active');
assert.equal(archiveSkipReason({ ...base, pinned: true }, 'other', {}), 'pinned');
assert.equal(archiveSkipReason({ ...base, mode: 'tor' }, 'other', {}), 'tor');
assert.equal(archiveSkipReason({ ...base, mode: 'private' }, 'other', {}), 'private');
assert.equal(
  archiveSkipReason({ ...base, url: 'about:home' }, 'other', {}),
  'internal',
);
assert.equal(
  archiveSkipReason(base, 'other', { audioPlaying: true }),
  'audio',
);
assert.equal(
  archiveSkipReason(base, 'other', { sideAppUrls: ['https://example.com/'] }),
  'sideapp',
);
assert.equal(archiveSkipReason(base, 'other', {}), null);

const sid = 'sess-arch';
dropTabSessionHistory(sid);
recordTabSessionUrl(sid, 'https://a.example/');
recordTabSessionUrl(sid, 'https://b.example/');
const snap = exportTabSessionHistory(sid);
assert.ok(snap);
assert.equal(snap.stack.length, 2);
dropTabSessionHistory(sid);
importTabSessionHistory('new-id', snap);
assert.equal(tabSessionCanBack('new-id'), true);
dropTabSessionHistory('new-id');

console.log('tab-archive-logic.test.mjs OK');
