import { interpolate } from './interpolate';
import { lookup } from './lookup';
import type { Dict, TParams, UiLocale } from './types';
import en from './locales/en.json';
import pl from './locales/pl.json';

export type { UiLocale, TParams } from './types';

const CATALOGS: Record<UiLocale, Dict> = {
  pl: pl as Dict,
  en: en as Dict,
};

let runtimeLocale: UiLocale = 'pl';

export function getUiLocale(): UiLocale {
  return runtimeLocale;
}

export function setUiLocale(locale: UiLocale): void {
  runtimeLocale = locale === 'en' ? 'en' : 'pl';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = runtimeLocale;
  }
}

export function catalogFor(locale: UiLocale): Dict {
  return CATALOGS[locale] || CATALOGS.pl;
}

export function translate(locale: UiLocale, key: string, params?: TParams): string {
  const primary = lookup(catalogFor(locale), key);
  if (primary != null) return interpolate(primary, params);
  if (locale !== 'pl') {
    const fallback = lookup(catalogFor('pl'), key);
    if (fallback != null) {
      if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
        console.warn(`[i18n] missing ${locale}: ${key}`);
      }
      return interpolate(fallback, params);
    }
  }
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    console.warn(`[i18n] missing key: ${key}`);
  }
  return key;
}

export function t(key: string, params?: TParams): string {
  return translate(runtimeLocale, key, params);
}

export function flattenKeys(dict: Dict, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.push(path);
    else if (v && typeof v === 'object') out.push(...flattenKeys(v as Dict, path));
  }
  return out;
}

export { CATALOGS };
