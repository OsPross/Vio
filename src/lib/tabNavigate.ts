/**
 * Pure helpers for omnibox / tab navigation titles (no React).
 */
import { t } from '../i18n/core';
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
  if (url === HISTORY_URL) return t('pages.history');
  if (url === DOWNLOADS_URL) return t('pages.downloads');
  if (url === BOOKMARKS_URL) return t('pages.bookmarks');
  if (url === EXTENSIONS_URL) return t('pages.extensions');
  if (url === ABOUT_URL || url === 'about:about') return t('pages.aboutVio');
  if (url === HOME_URL || url === TOR_HOME_URL) return tor ? t('pages.tor') : t('pages.newTab');
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
