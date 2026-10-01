/**
 * Notes store (main process module).
 * Run: node test/notes.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const notes = await import('../electron/notes.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-test-'));
notes._setRootForTests(tmp);
notes.init();

const created = notes.create({ body: 'Tytuł\nDruga linia' });
assert.equal(created.ok, true);
assert.equal(created.note.title, 'Tytuł');

const listed = notes.list();
assert.equal(listed.notes.length, 1);

const updated = notes.update(created.note.id, { body: 'Nowy tytuł\n- item' });
assert.equal(updated.note.title, 'Nowy tytuł');

const found = notes.list({ q: 'item' });
assert.equal(found.notes.length, 1);

notes.flushNow();
assert.ok(fs.existsSync(path.join(tmp, 'notes.json')));

notes._setRootForTests(path.join(tmp, 'migrate'));
notes.init();
const mig = notes.migrateLegacy('Stara notatka');
assert.equal(mig.migrated, true);
assert.equal(mig.notes.length, 1);

const mig2 = notes.migrateLegacy('ignored');
assert.equal(mig2.migrated, false);

console.log('notes.test.mjs OK');
