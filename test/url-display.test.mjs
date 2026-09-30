/**
 * URL display formatting.
 * Run: node --experimental-strip-types test/url-display.test.mjs
 */
import assert from 'node:assert/strict';
import {
  formatUrlForDisplay,
  formatUrlPlain,
  middleEllipsis,
  shouldShowPunycode,
} from '../src/lib/url-display.ts';

{
  const p = formatUrlForDisplay('https://www.google.com/search?q=siema&hl=pl');
  assert.equal(p.kind, 'search');
  assert.equal(p.searchEngine, 'Google');
  assert.equal(p.searchQuery, 'siema');
  assert.match(p.text, /Google: siema/);
  assert.equal(p.fullUrl, 'https://www.google.com/search?q=siema&hl=pl');
}

{
  const p = formatUrlForDisplay('https://www.youtube.com/results?search_query=react+tutorial');
  assert.equal(p.kind, 'search');
  assert.equal(p.searchEngine, 'YouTube');
  assert.equal(p.searchQuery, 'react tutorial');
}

{
  const p = formatUrlForDisplay('about:history');
  assert.equal(p.kind, 'internal');
  assert.equal(p.text, 'Historia');
}

{
  const p = formatUrlForDisplay('https://example.com/long/path/segment/one/two/three/four/five/six');
  assert.ok(p.text.includes('…') || p.text.length <= 48);
  assert.equal(p.kind, 'url');
}

{
  const plain = formatUrlPlain('http://www.example.com/page/');
  assert.equal(plain, 'example.com/page');
}

{
  const p = formatUrlForDisplay('https://duckduckgo.com/?q=hello');
  assert.equal(p.kind, 'search');
  assert.equal(p.searchEngine, 'DuckDuckGo');
  assert.equal(p.searchQuery, 'hello');
}

{
  const p = formatUrlForDisplay('https://www.bing.com/search?q=test');
  assert.equal(p.searchEngine, 'Bing');
  assert.equal(p.searchQuery, 'test');
}

{
  const p = formatUrlForDisplay('https://search.brave.com/search?q=privacy');
  assert.equal(p.searchEngine, 'Brave');
}

{
  const p = formatUrlForDisplay('file:///C:/Users/me/doc.pdf');
  assert.equal(p.kind, 'special');
  assert.match(p.text, /^file:\/\//);
}

{
  const p = formatUrlForDisplay('http://127.0.0.1:8080/api');
  assert.match(p.text, /127\.0\.0\.1:8080/);
  assert.match(p.text, /\/api/);
}

{
  const p = formatUrlForDisplay('https://192.168.0.1/admin');
  assert.match(p.text, /192\.168\.0\.1/);
}

{
  const p = formatUrlForDisplay('data:text/plain,hello');
  assert.equal(p.kind, 'special');
  assert.match(p.text, /^data:text\/plain/);
}

{
  assert.equal(middleEllipsis('abcdefghij', 8), 'abcd…hij');
  assert.equal(middleEllipsis('short', 10), 'short');
}

{
  assert.equal(shouldShowPunycode('localhost'), false);
  assert.equal(shouldShowPunycode('127.0.0.1'), false);
  assert.equal(shouldShowPunycode('xn--pple-43d.com'), false);
  assert.equal(shouldShowPunycode('аррle.com'), true);
}

{
  const p = formatUrlForDisplay('https://example.com/app?foo=bar');
  assert.equal(p.kind, 'url');
  assert.ok(!p.text.includes('foo=bar'));
  assert.match(p.text, /example\.com\/app/);
}

console.log('url-display.test.mjs: ok');
