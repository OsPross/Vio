/**
 * Per-tab session back/forward (about:* ↔ www).
 * Run: npx tsx test/tab-session-history.test.mjs
 */
import assert from 'node:assert/strict';
import {
  dropTabSessionHistory,
  exportTabSessionHistory,
  importTabSessionHistory,
  recordTabSessionUrl,
  tabSessionBack,
  tabSessionCanBack,
  tabSessionCanForward,
  tabSessionForward,
  tabSessionPeekBack,
  tabSessionPeekForward,
} from '../src/lib/tabSessionHistory.ts';

const id = 'tab-1';
dropTabSessionHistory(id);

recordTabSessionUrl(id, 'https://a.example/');
recordTabSessionUrl(id, 'about:history');
assert.equal(tabSessionCanBack(id), true);
assert.equal(tabSessionCanForward(id), false);
assert.equal(tabSessionPeekBack(id), 'https://a.example/');

const back = tabSessionBack(id);
assert.equal(back, 'https://a.example/');
assert.equal(tabSessionCanForward(id), true);
assert.equal(tabSessionPeekForward(id), 'about:history');

const fwd = tabSessionForward(id);
assert.equal(fwd, 'about:history');

recordTabSessionUrl(id, 'https://b.example/');
assert.equal(tabSessionCanForward(id), false);
assert.equal(tabSessionPeekBack(id), 'about:history');
assert.equal(tabSessionBack(id), 'about:history');
assert.equal(tabSessionBack(id), 'https://a.example/');

// Webview-style sync: landing on previous entry decrements index
recordTabSessionUrl(id, 'https://a.example/');
recordTabSessionUrl(id, 'https://c.example/');
recordTabSessionUrl(id, 'https://a.example/'); // mimics goBack
assert.equal(tabSessionCanForward(id), true);
assert.equal(tabSessionPeekForward(id), 'https://c.example/');

dropTabSessionHistory(id);
assert.equal(tabSessionCanBack(id), false);

recordTabSessionUrl(id, 'https://x.example/');
recordTabSessionUrl(id, 'https://y.example/');
const snap = exportTabSessionHistory(id);
assert.ok(snap && snap.stack.length === 2);
dropTabSessionHistory(id);
importTabSessionHistory(id, snap);
assert.equal(tabSessionCanBack(id), true);
assert.equal(tabSessionPeekBack(id), 'https://x.example/');
dropTabSessionHistory(id);

console.log('tab-session-history.test.mjs: ok');
