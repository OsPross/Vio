/**
 * Pure helpers for omnibox / tab navigation titles (no React).
 */
import {
  ABOUT_URL,
  BOOKMARKS_URL,
  DOWNLOADS_URL,
  EXTENSIONS_URL,
  HISTORY_URL,
  HOME_URL,
  TOR_HOME_URL,
} from '../store';

export function titleForInternalUrl(url: string, tor: boolean): string {
  if (url === HISTORY_URL) return 'Historia';
  if (url === DOWNLOADS_URL) return 'Pobrania';
  if (url === BOOKMARKS_URL) return 'Zakładki';
  if (url === EXTENSIONS_URL) return 'Rozszerzenia';
  if (url === ABOUT_URL || url === 'about:about') return 'O Vio';
  if (url === HOME_URL || url === TOR_HOME_URL) return tor ? 'Tor' : 'Nowa karta';
  return '…';
}

export function isInternalPageUrl(url: string): boolean {
  return (
    url === HOME_URL ||
    url === TOR_HOME_URL ||
    url === HISTORY_URL ||
    url === DOWNLOADS_URL ||
    url === BOOKMARKS_URL ||
    url === EXTENSIONS_URL ||
    url === ABOUT_URL ||
    url === 'about:about' ||
    url.startsWith('about:') ||
    url.startsWith('djxxr://')
  );
}

export function draftForUrl(url: string): string {
  if (
    url === HOME_URL ||
    url === TOR_HOME_URL ||
    url === HISTORY_URL ||
    url === DOWNLOADS_URL ||
    url === BOOKMARKS_URL ||
    url === EXTENSIONS_URL ||
    url === ABOUT_URL ||
    url === 'about:about'
  ) {
    return '';
  }
  return url;
}

export function resolveTorHomeUrl(url: string, tor: boolean): string {
  if (tor && (url === HOME_URL || url === 'about:home')) return TOR_HOME_URL;
  return url;
}
