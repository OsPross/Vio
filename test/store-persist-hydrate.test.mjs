/**
 * Persist hydrate: old localStorage JSON → same partialize keys + merge behavior.
 * Must set fixture BEFORE importing the store module.
 * Run: npx tsx test/store-persist-hydrate.test.mjs
 */
import assert from 'node:assert/strict';

const PERSIST_KEY = 'moja-przegladarka-v8';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  get length() {
    return mem.size;
  },
};
globalThis.window = globalThis;

/** Fixture shaped like a previous app version write (zustand persist v8). */
const oldPersist = {
  state: {
    settings: {
      searchEngine: 'ddg',
      theme: 'ocean',
      accent: '#4db6e2',
      useThemeAccent: true,
      homepage: 'about:home',
      homeLayout: 'dashboard',
      homeAlign: 'center',
      homeShowClock: true,
      homeShowApps: true,
      homeWidgets: [{ id: 'w-notes', type: 'notes', size: 'M', settings: { text: 'hi' } }],
      allowInspect: false,
      perfSpellcheck: false,
      sidebarMode: 'on',
      showSidebar: true,
    },
    bangs: [{ key: 'yt', url: 'https://www.youtube.com/results?search_query=%s' }],
    shortcuts: [{ id: 'gmail', label: 'Gmail', url: 'https://mail.google.com/' }],
    sideApps: [{ id: 'chatgpt', label: 'ChatGPT', url: 'https://chatgpt.com/' }],
    bookmarks: [
      {
        id: 'bm1',
        title: 'Example',
        url: 'https://example.com/',
        folderId: 'folder-bar',
        createdAt: 1700000000000,
      },
    ],
    bookmarkFolders: [
      { id: 'folder-bar', title: 'Pasek zakładek' },
      { id: 'folder-other', title: 'Inne zakładki' },
    ],
    // Must never become Zustand browsing source of truth (ban) — merge keeps ephemeral array only
    history: [{ q: 'should-not-hydrate-as-truth', at: 1 }],
  },
  version: 0,
};

mem.set(PERSIST_KEY, JSON.stringify(oldPersist));

const { useStore, PERSIST_KEY: key, DEFAULT_SETTINGS } = await import('../src/store/index.ts');

assert.equal(key, PERSIST_KEY);

const s = useStore.getState();

assert.equal(s.settings.searchEngine, 'ddg');
assert.equal(s.settings.theme, 'ocean');
assert.equal(s.settings.homepage, 'about:home');
assert.ok(Array.isArray(s.settings.homeWidgets));
assert.ok(s.settings.homeWidgets.some((w) => w.type === 'notes'));
assert.equal(s.settings.homeLayoutPreset, 'centered');

assert.ok(s.bangs.some((b) => b.key === 'yt'));
assert.equal(s.shortcuts[0]?.id, 'gmail');
assert.equal(s.sideApps[0]?.id, 'chatgpt');
assert.equal(s.bookmarks[0]?.url, 'https://example.com/');
assert.ok(s.bookmarkFolders.some((f) => f.id === 'folder-bar'));
assert.ok(s.bookmarkFolders.some((f) => f.id === 'folder-other'));

// history ephemeral: merge keeps array via historyMustStayEphemeral; partialize never writes it
assert.ok(Array.isArray(s.history));
assert.equal(s.history.length, 1);
assert.equal(s.history[0].q, 'should-not-hydrate-as-truth');

// tabs are session-only (not in partialize)
assert.ok(s.tabs.length >= 1);
assert.ok(s.tabs.every((t) => typeof t.id === 'string'));

// Force a persist write (hydrate itself does not rewrite localStorage)
useStore.getState().patchSettings({ omniboxPlaceholder: 'hydrate-test' });
const written = JSON.parse(mem.get(PERSIST_KEY));
assert.ok(written.state);
const allowed = new Set([
  'settings',
  'bangs',
  'shortcuts',
  'sideApps',
  'bookmarks',
  'bookmarkFolders',
]);
for (const k of Object.keys(written.state)) {
  assert.ok(allowed.has(k), `unexpected persist key: ${k}`);
}
assert.equal('history' in written.state, false);
assert.equal('tabs' in written.state, false);
assert.equal(written.state.settings.omniboxPlaceholder, 'hydrate-test');
assert.equal(written.state.settings.searchEngine, 'ddg');

// Defaults still fill missing settings fields
assert.equal(typeof s.settings.torProxyUrl, 'string');
assert.equal(useStore.getState().settings.torProxyUrl, DEFAULT_SETTINGS.torProxyUrl);

console.log('store-persist-hydrate.test.mjs: ok');
