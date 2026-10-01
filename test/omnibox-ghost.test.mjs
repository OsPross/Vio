import assert from 'node:assert/strict';
import {
  ghostNavigateUrl,
  matchOmniboxGhost,
  normalizeGhostFill,
  shouldShowOmniboxGhost,
} from '../src/lib/omniboxGhost.ts';

// normalize
assert.equal(normalizeGhostFill('https://www.youtube.com/'), 'youtube.com');
assert.equal(normalizeGhostFill('www.Google.com'), 'Google.com');

// match: you → tube.com
assert.equal(matchOmniboxGhost('you', 'youtube.com'), 'tube.com');
assert.equal(matchOmniboxGhost('YOU', 'youtube.com'), 'tube.com');
assert.equal(matchOmniboxGhost('you', 'https://www.youtube.com'), 'tube.com');

// your → no match against youtube
assert.equal(matchOmniboxGhost('your', 'youtube.com'), '');

// yo → utube.com
assert.equal(matchOmniboxGhost('yo', 'youtube.com'), 'utube.com');

// empty / spaces / bangs / http typed
assert.equal(matchOmniboxGhost('', 'youtube.com'), '');
assert.equal(matchOmniboxGhost('you tube', 'youtube.com'), '');
assert.equal(matchOmniboxGhost('!g', 'youtube.com'), '');
assert.equal(matchOmniboxGhost('https://you', 'youtube.com'), '');

// shouldShow: caret at end, no selection
assert.equal(
  shouldShowOmniboxGhost({
    typed: 'you',
    fill: 'youtube.com',
    focused: true,
    composing: false,
    dismissed: false,
    listActive: -1,
    caretStart: 3,
    caretEnd: 3,
  }),
  true,
);
assert.equal(
  shouldShowOmniboxGhost({
    typed: 'you',
    fill: 'youtube.com',
    focused: true,
    composing: false,
    dismissed: false,
    listActive: -1,
    caretStart: 1,
    caretEnd: 1,
  }),
  false,
  'cursor mid-text → no ghost',
);
assert.equal(
  shouldShowOmniboxGhost({
    typed: 'you',
    fill: 'youtube.com',
    focused: true,
    composing: true,
    dismissed: false,
    listActive: -1,
    caretStart: 3,
    caretEnd: 3,
  }),
  false,
  'IME composing → no ghost',
);
assert.equal(
  shouldShowOmniboxGhost({
    typed: 'you',
    fill: 'youtube.com',
    focused: true,
    composing: false,
    dismissed: false,
    listActive: 0,
    caretStart: 3,
    caretEnd: 3,
  }),
  false,
  'list selection → no ghost',
);

// navigate
assert.equal(ghostNavigateUrl('you', 'youtube.com'), 'https://youtube.com');
assert.equal(ghostNavigateUrl('youtube.com', 'youtube.com'), 'https://youtube.com');

console.log('omnibox-ghost.test.mjs: ok');
