import type { Dict } from './types';

/** Dot-path lookup: `settings.nav.general` → nested or flat key. */
export function lookup(dict: Dict, key: string): string | undefined {
  if (!key) return undefined;
  const direct = dict[key];
  if (typeof direct === 'string') return direct;

  const parts = key.split('.');
  let cur: string | Dict | undefined = dict;
  for (const p of parts) {
    if (!cur || typeof cur === 'string') return undefined;
    cur = cur[p];
  }
  return typeof cur === 'string' ? cur : undefined;
}
