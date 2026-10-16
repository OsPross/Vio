'use strict';

/**
 * Page scripts for the API v2 commands of lib/automation.cjs. Fixed source, args JSON-encoded (no arbitrary eval);
 * they run in the automation's isolated JS world.
 */

const READABLE_MAX = 50_000;

const refEl = (ref) =>
  `const el = document.querySelector('[data-vio-ref=' + JSON.stringify(${JSON.stringify(ref)}) + ']');
  if (!el) return { error: 'stale ref' };`;

/** Readability-style main text: biggest article/main block, else the parent holding the most paragraph text. */
const READABLE_JS = `(() => {
  const len = (el) => (el && el.innerText ? el.innerText.length : 0);
  let best = null;
  for (const el of document.querySelectorAll('article, main, [role=main], [itemprop=articleBody]')) if (len(el) > len(best)) best = el;
  const score = new Map();
  let top = null;
  for (const p of document.querySelectorAll('p')) {
    const n = (p.innerText || '').trim().length;
    if (n < 40 || !p.parentElement) continue;
    const s = (score.get(p.parentElement) || 0) + n;
    score.set(p.parentElement, s);
    if (!top || s > score.get(top)) top = p.parentElement;
  }
  const root = (best && len(best) > 500 ? best : null) || (top && score.get(top) > len(best) ? top : best) || document.body;
  const meta = (s) => document.querySelector(s)?.getAttribute('content') || '';
  const txt = (s) => (document.querySelector(s)?.innerText || '').trim();
  const clean = (s) => String(s || '').replace(/[ \\t]+/g, ' ').replace(/\\n\\s*\\n\\s*\\n+/g, '\\n\\n').trim();
  return {
    title: clean(meta('meta[property="og:title"]') || (root && root.querySelector('h1')?.innerText) || document.title).slice(0, 300),
    byline: clean(meta('meta[name="author"]') || txt('[rel=author]') || txt('[itemprop=author]') || txt('.byline') || txt('.author')).slice(0, 200),
    text: clean(root ? root.innerText : '').slice(0, ${READABLE_MAX}),
    lang: document.documentElement.lang || '',
  };
})()`;

/** Selection (≤2000) + focused field for the event poller. Password fields: no selection, editable false, never a value. */
const snapshotJs = (gen) => `(() => {
  const gen = ${JSON.stringify(gen)};
  const el = document.activeElement;
  const tag = el && el.tagName ? el.tagName.toLowerCase() : '';
  const type = tag === 'input' ? (el.type || 'text').toLowerCase() : '';
  const pw = type === 'password' || /password/i.test(el?.getAttribute?.('autocomplete') || '');
  let sel = '';
  if (!pw) {
    try {
      sel = (tag === 'input' || tag === 'textarea') && typeof el.selectionStart === 'number'
        ? String(el.value).slice(el.selectionStart, el.selectionEnd) : String(getSelection());
    } catch { sel = ''; }
  }
  let field = null;
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || (el && el.isContentEditable)) {
    let ref = el.getAttribute('data-vio-ref') || '';
    if (!ref.startsWith(gen + '-')) {
      window.__vioSeq = (window.__vioSeq || 100000) + 1;
      ref = gen + '-' + window.__vioSeq;
      el.setAttribute('data-vio-ref', ref);
    }
    const label = el.getAttribute('aria-label') || (el.labels && el.labels[0] ? el.labels[0].innerText : '') ||
      el.getAttribute('placeholder') || el.getAttribute('name') || el.getAttribute('title') || '';
    field = { ref, type: type || tag, label: String(label).replace(/\\s+/g, ' ').trim().slice(0, 120), editable: !pw && !el.disabled && !el.readOnly };
  }
  return { sel: sel.slice(0, 2000), field };
})()`;

/** action '' = read state only. Picks a playing media element, else the largest video, else the first one. */
function mediaJs(action, value) {
  return `(async () => {
  const action = ${JSON.stringify(action)}, value = ${JSON.stringify(value)};
  const all = [...document.querySelectorAll('video, audio')];
  const area = (m) => { const r = m.getBoundingClientRect(); return r.width * r.height; };
  const el = all.find((m) => !m.paused && !m.ended) || all.filter((m) => m.tagName === 'VIDEO').sort((a, b) => area(b) - area(a))[0] || all[0];
  if (!el) return { error: 'no media element' };
  try {
    if (action === 'play' || (action === 'toggle' && el.paused)) await el.play();
    else if (action === 'pause' || action === 'toggle') el.pause();
    else if (action === 'seek') el.currentTime = value;
    else if (action === 'seekBy') el.currentTime = Math.max(0, el.currentTime + value);
    else if (action === 'rate') el.playbackRate = value;
    else if (action === 'volume') el.volume = value;
  } catch (e) { return { error: 'media ' + action + ' failed: ' + ((e && e.name) || 'error') }; }
  return {
    playing: !el.paused && !el.ended, muted: el.muted, currentTime: Math.round(el.currentTime * 10) / 10,
    duration: Number.isFinite(el.duration) ? Math.round(el.duration * 10) / 10 : null,
    title: String((navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.title) || document.title).slice(0, 200),
  };
})()`;
}

function scrollToJs(ref, text) {
  if (ref) {
    return `(() => { ${refEl(ref)} el.scrollIntoView({ block: 'center', inline: 'nearest' }); return { ok: true }; })()`;
  }
  return `(() => {
  const want = ${JSON.stringify(text)}.toLowerCase();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName) || !n.nodeValue.toLowerCase().includes(want)) continue;
    if (!p.getClientRects().length) continue;
    p.scrollIntoView({ block: 'center', inline: 'nearest' });
    return { ok: true };
  }
  return { error: 'text not found' };
})()`;
}

const CLEAR_HIGHLIGHT_JS = `(() => { document.querySelectorAll('[data-vio-hl]').forEach((e) => e.remove()); return { ok: true }; })()`;

/** Outline box + optional label over the element, in document coordinates; pointer-events none. */
function highlightJs(ref, label) {
  return `(() => {
  ${refEl(ref)}
  document.querySelectorAll('[data-vio-hl]').forEach((e) => e.remove());
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const box = document.createElement('div');
  box.setAttribute('data-vio-hl', '');
  Object.assign(box.style, {
    position: 'absolute', left: (r.left + scrollX - 3) + 'px', top: (r.top + scrollY - 3) + 'px',
    width: (r.width + 6) + 'px', height: (r.height + 6) + 'px', border: '2px solid #8b5cf6', borderRadius: '6px',
    boxShadow: '0 0 0 4px rgba(139,92,246,.25)', pointerEvents: 'none', zIndex: '2147483647', boxSizing: 'border-box',
  });
  const label = ${JSON.stringify(label)};
  if (label) {
    const tag = document.createElement('div');
    tag.textContent = label;
    Object.assign(tag.style, {
      position: 'absolute', left: '-2px', bottom: '100%', marginBottom: '4px', padding: '2px 6px', background: '#8b5cf6',
      color: '#fff', font: '600 12px system-ui, sans-serif', borderRadius: '4px', whiteSpace: 'nowrap',
    });
    box.appendChild(tag);
  }
  document.documentElement.appendChild(box);
  return { ok: true };
})()`;
}

module.exports = { READABLE_JS, snapshotJs, mediaJs, scrollToJs, highlightJs, CLEAR_HIGHLIGHT_JS };
