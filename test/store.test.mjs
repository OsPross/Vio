/**
 * Store pure helpers + tab/session actions.
 * Run: npx tsx test/store.test.mjs
 */
import assert from 'node:assert/strict';

// Minimal localStorage for zustand persist during import
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

const {
  applyHomeLayoutPreset,
  DEFAULT_SETTINGS,
  HOME_URL,
  isBookmarkableUrl,
  isOnionUrl,
  isPrivateTab,
  isTorTab,
  migrateHomeWidgets,
  normalizeHomeWidgets,
  sortTabsPinnedFirst,
  useStore,
} = await import('../src/store.ts');

const {
  applyOneShotLocalFlags,
  deriveHomeLayoutPreset,
  historyMustStayEphemeral,
  mergeBangs,
  normalizeSettingsFields,
} = await import('../src/lib/persistMerge.ts');

assert.equal(isOnionUrl('http://example.onion/'), true);
assert.equal(isOnionUrl('https://example.com/'), false);
assert.equal(isTorTab({ id: '1', title: 't', url: HOME_URL, mode: 'tor' }), true);
assert.equal(isPrivateTab({ id: '1', title: 't', url: HOME_URL, mode: 'private' }), true);
assert.equal(isBookmarkableUrl('https://example.com'), true);
assert.equal(isBookmarkableUrl('about:home'), false);

{
  const tabs = sortTabsPinnedFirst([
    { id: 'a', title: 'a', url: HOME_URL, pinned: false },
    { id: 'b', title: 'b', url: HOME_URL, pinned: true },
    { id: 'c', title: 'c', url: HOME_URL, pinned: false },
  ]);
  assert.equal(tabs[0].id, 'b');
}

assert.equal(applyHomeLayoutPreset('top').homeLayoutPreset, 'top');
assert.equal(applyHomeLayoutPreset('left').homeAlign, 'left');
assert.equal(deriveHomeLayoutPreset({ homeLayout: 'minimal' }), 'top');
assert.equal(deriveHomeLayoutPreset({ homeAlign: 'left', homeShowClock: true, homeShowApps: true }), 'left');
assert.equal(deriveHomeLayoutPreset({ homeLayout: 'stack', homeShowClock: true }), 'left');
assert.equal(deriveHomeLayoutPreset({ homeLayoutPreset: 'custom' }), 'custom');
assert.deepEqual(historyMustStayEphemeral([{ url: 'x' }]), [{ url: 'x' }]);

{
  const flash = new Map();
  const storage = {
    getItem: (k) => (flash.has(k) ? flash.get(k) : null),
    setItem: (k, v) => flash.set(k, v),
  };
  const out = applyOneShotLocalFlags({ allowInspect: false, perfSpellcheck: false }, storage);
  assert.equal(out.allowInspect, true);
  assert.equal(out.perfSpellcheck, true);
}

{
  const n = normalizeSettingsFields({
    ...DEFAULT_SETTINGS,
    homeTodos: null,
    sidebarMode: 'weird',
    showSidebar: true,
  });
  assert.ok(Array.isArray(n.homeTodos));
  assert.equal(n.sidebarMode, 'on');
}

assert.ok(mergeBangs(undefined, []).length > 0);
assert.equal(normalizeHomeWidgets(null).length, 0);
assert.ok(
  migrateHomeWidgets({
    ...DEFAULT_SETTINGS,
    homeWidgets: [{ id: 'w1', type: 'notes', size: 'M', x: 1, y: 1, anchor: 'center', settings: {} }],
  }).length >= 1,
);

// --- tab / session actions ---
{
  useStore.getState().restoreSessionTabs(
    [{ id: 'base', title: 'Home', url: HOME_URL, mode: 'normal' }],
    'base',
    [],
  );
  const t0 = useStore.getState().activeId;
  useStore.getState().newTab('https://example.com/store-test', { background: true });
  assert.equal(useStore.getState().activeId, t0);
  const added = useStore.getState().tabs.find((t) => t.url === 'https://example.com/store-test');
  assert.ok(added);
  useStore.getState().setActive(added.id);
  useStore.getState().updateTab(added.id, { title: 'Example' });
  assert.equal(useStore.getState().tabs.find((t) => t.id === added.id)?.title, 'Example');
  const snap = useStore.getState().tabs;
  useStore.getState().updateTab(added.id, { title: 'Example' });
  assert.equal(useStore.getState().tabs, snap);
  useStore.getState().closeTab(added.id);
  assert.ok((useStore.getState().closedTabs[0]?.url || '').includes('example.com'));
  const closedN = useStore.getState().closedTabs.length;
  useStore.getState().reopenClosedTab();
  assert.equal(useStore.getState().closedTabs.length, closedN - 1);
  useStore.getState().restoreSessionTabs(
    [
      { id: 'sess1', title: 'A', url: 'https://a.example/', mode: 'normal' },
      { id: 'sess2', title: 'B', url: 'https://b.example/', mode: 'normal' },
    ],
    'sess2',
    [],
  );
  assert.equal(useStore.getState().activeId, 'sess2');
  assert.equal(useStore.getState().tabs.length, 2);
  assert.equal(useStore.getState().sessionReady, true);
}

console.log('store.test.mjs: ok');
