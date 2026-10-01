import type { Tab } from './types';
import {
  ABOUT_URL,
  ABOUT_URL_ALT,
  BOOKMARKS_URL,
  DOWNLOADS_URL,
  EXTENSIONS_URL,
  HISTORY_URL,
  HOME_URL,
  TOR_HOME_URL,
} from './constants';

export function isBookmarkableUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  if (url === HOME_URL || url === TOR_HOME_URL) return false;
  if (
    url === HISTORY_URL ||
    url === DOWNLOADS_URL ||
    url === BOOKMARKS_URL ||
    url === EXTENSIONS_URL ||
    url === ABOUT_URL ||
    url === ABOUT_URL_ALT
  )
    return false;
  if (url.startsWith('about:') || url.startsWith('view-source:')) return false;
  return /^https?:\/\//i.test(url) || /\.onion\b/i.test(url);
}

export function isOnionUrl(url: string): boolean {
  try {
    return /\.onion$/i.test(new URL(url).hostname);
  } catch {
    return /\.onion\b/i.test(url);
  }
}

export function isTorTab(t: Tab | undefined | null): boolean {
  return !!t && t.mode === 'tor';
}

export function isPrivateTab(t: Tab | undefined | null): boolean {
  return !!t && t.mode === 'private';
}

export function sortTabsPinnedFirst(tabs: Tab[]): Tab[] {
  return [...tabs].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return 0;
  });
}
