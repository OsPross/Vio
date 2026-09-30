/** Build a session snapshot for main process (Tor tabs stripped). */

import { isTorTab, type ClosedTab, type Tab } from '../store';

export function buildSessionSnapshot(
  tabs: Tab[],
  activeId: string,
  closedTabs: ClosedTab[],
  navByTabId: Record<string, Tab['navHistory']>,
) {
  const normal = tabs.filter((t) => !isTorTab(t));
  const active =
    normal.some((t) => t.id === activeId) ? activeId : normal.find((t) => t.pinned)?.id || normal[0]?.id || null;

  return {
    activeId: active,
    tabs: normal.map((t, index) => ({
      id: t.id,
      url: t.url,
      title: t.title,
      favicon: t.favicon,
      pinned: Boolean(t.pinned),
      index,
      navHistory: navByTabId[t.id] || t.navHistory || null,
    })),
    closedTabs: closedTabs
      .filter((c) => c && !/\.onion\b/i.test(c.url || '') && c.url !== 'about:tor')
      .slice(0, 25),
  };
}
