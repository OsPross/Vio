'use strict';

/**
 * Smoke-test history module against a temp dir (no Electron UI).
 * Also patches a probe into the live userData path if ELECTRON_USER_DATA is set.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const hist = require('../electron/history.cjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'djxxr-hist-smoke-'));
hist._setRootForTests(tmp);
hist.setConfig({ retention: 'always' });
hist.clear({ range: 'all' });

const a = hist.recordVisit({ url: 'https://example.com/', title: 'Example' });
const b = hist.recordVisit({ url: 'https://wikipedia.org/wiki/Test', title: 'Wikipedia' });
const c = hist.recordVisit({ url: 'https://github.com/', title: 'GitHub', typed: true });
hist.flushSync();

const list = hist.list({ limit: 50 });
const file = path.join(tmp, 'visits.jsonl');
const disk = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

console.log(JSON.stringify({
  ok: a.ok && b.ok && c.ok && list.total === 3,
  total: list.total,
  items: list.items.map((i) => i.url),
  diskBytes: disk.length,
  diskLines: disk.trim() ? disk.trim().split('\n').length : 0,
  tmp,
}, null, 2));

if (!(a.ok && b.ok && c.ok && list.total === 3 && diskLinesOk(disk))) {
  process.exit(1);
}

function diskLinesOk(d) {
  return d.trim().split('\n').filter(Boolean).length === 3;
}
