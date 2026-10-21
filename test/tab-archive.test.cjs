'use strict';

/**
 * Tab archive store (main process).
 * Run: node test/tab-archive.test.cjs
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const archive = require('../electron/tab-archive.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tab-archive-test-'));
archive._setRootForTests(tmp);
archive.init();

const added = archive.add({
  url: 'https://example.com/page',
  title: 'Example',
  favicon: 'https://example.com/f.ico',
});
assert.equal(added.ok, true);
assert.equal(added.entry.url, 'https://example.com/page');

const listed = archive.list();
assert.equal(listed.entries.length, 1);

const forbidden = archive.add({ url: 'http://xyz.onion/', title: 'Tor' });
assert.equal(forbidden.ok, false);
assert.equal(forbidden.error, 'forbidden');

const about = archive.add({ url: 'about:blank', title: 'x' });
assert.equal(about.ok, false);

archive.flushNow();
assert.ok(fs.existsSync(path.join(tmp, 'tab-archive.json')));

const rem = archive.remove(added.entry.id);
assert.equal(rem.ok, true);
assert.equal(rem.entries.length, 0);

archive.add({ url: 'https://a.test/', title: 'A' });
archive.add({ url: 'https://b.test/', title: 'B' });
const cleared = archive.clear();
assert.equal(cleared.entries.length, 0);

// Cap at MAX_ENTRIES
for (let i = 0; i < archive.MAX_ENTRIES + 20; i++) {
  archive.add({ url: `https://n${i}.test/`, title: `N${i}` });
}
assert.equal(archive.list().entries.length, archive.MAX_ENTRIES);

console.log('tab-archive.test.cjs OK');
