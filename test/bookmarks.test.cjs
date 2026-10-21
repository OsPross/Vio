'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bookmarks = require('../electron/bookmarks.cjs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vio-bm-'));
bookmarks._setRootForTests(dir);

const empty = bookmarks.getAll();
assert.equal(empty.ok, true);
assert.equal(empty.bookmarks.length, 0);
assert.ok(empty.folders.some((f) => f.id === bookmarks.BAR_ID));

const mig = bookmarks.migrateFromLegacy({
  bookmarks: [{ id: 'b1', title: 'Example', url: 'https://example.com', folderId: bookmarks.BAR_ID, createdAt: 1 }],
  folders: [
    { id: bookmarks.BAR_ID, title: 'Bar' },
    { id: bookmarks.OTHER_ID, title: 'Other' },
    { id: 'f-custom', title: 'Custom' },
  ],
});
assert.equal(mig.migrated, true);
assert.equal(mig.bookmarks.length, 1);

const again = bookmarks.migrateFromLegacy({
  bookmarks: [{ id: 'b2', title: 'Skip', url: 'https://skip.test', createdAt: 2 }],
  folders: [],
});
assert.equal(again.migrated, false);
assert.equal(again.bookmarks.length, 1);

bookmarks.replaceAll({
  bookmarks: [
    ...again.bookmarks,
    { id: 'b3', title: 'Two', url: 'https://two.test', folderId: bookmarks.BAR_ID, createdAt: 3, iconOnly: true },
  ],
  folders: again.folders,
});
bookmarks.flushNow();

const raw = JSON.parse(fs.readFileSync(path.join(dir, 'djxxr-bookmarks.json'), 'utf8'));
assert.equal(raw.bookmarks.length, 2);
assert.equal(raw.bookmarks[1].iconOnly, true);

bookmarks._setRootForTests(null);
console.log('bookmarks.test.cjs ok');
