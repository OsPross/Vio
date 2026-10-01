import type { ClosedTab, Tab } from './types';
import { isTorTab } from './tabHelpers';

export function toClosedTab(tab: Tab, index: number): ClosedTab | null {
  if (isTorTab(tab)) return null;
  return {
    id: tab.id,
    url: tab.url,
    title: tab.title || 'Karta',
    favicon: tab.favicon,
    pinned: Boolean(tab.pinned),
    index,
    navHistory: tab.navHistory || null,
    closedAt: Date.now(),
  };
}
