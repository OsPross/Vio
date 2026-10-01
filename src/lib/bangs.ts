/** DuckDuckGo-style bangs (!g, trailing query !yt, …). */

export type Bang = { key: string; label: string; url: string };

export const DEFAULT_BANGS: Bang[] = [
  { key: 'g', label: 'Google', url: 'https://www.google.com/search?q=%s' },
  { key: 'yt', label: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
  { key: 'w', label: 'Wikipedia', url: 'https://pl.wikipedia.org/wiki/Specjalna:Szukaj?search=%s' },
  { key: 'gh', label: 'GitHub', url: 'https://github.com/search?q=%s' },
  { key: 'a', label: 'Amazon', url: 'https://www.amazon.com/s?k=%s' },
  { key: 'm', label: 'Mapy', url: 'https://www.google.com/maps/search/%s' },
  { key: 'maps', label: 'Mapy', url: 'https://www.google.com/maps/search/%s' },
  { key: 'r', label: 'Reddit', url: 'https://www.reddit.com/search/?q=%s' },
  { key: 'gmail', label: 'Gmail', url: 'https://mail.google.com/mail/u/0/#search/%s' },
  { key: 'tr', label: 'Tłumacz', url: 'https://translate.google.com/?sl=auto&tl=pl&text=%s&op=translate' },
  { key: 'gi', label: 'Google Images', url: 'https://www.google.com/search?tbm=isch&q=%s' },
  { key: 'so', label: 'Stack Overflow', url: 'https://stackoverflow.com/search?q=%s' },
  { key: 'tw', label: 'Twitter / X', url: 'https://x.com/search?q=%s' },
  { key: 'sp', label: 'Startpage', url: 'https://www.startpage.com/sp/search?query=%s' },
  { key: 'ddg', label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' },
  { key: 'b', label: 'Bing', url: 'https://www.bing.com/search?q=%s' },
  { key: 'wiki', label: 'Wikipedia EN', url: 'https://en.wikipedia.org/wiki/Special:Search?search=%s' },
  { key: 'ahmia', label: 'Ahmia', url: 'https://ahmia.fi/search/?q=%s' },
  { key: 'onion', label: 'OnionLand', url: 'https://onionlandsearchengine.com/search?q=%s' },
];

/** One-shot: migrate legacy !g → Gmail mistake to Google; add missing DDG-style bangs. */
export function migrateBangsToDdg(bangs: Bang[]): Bang[] {
  if (!Array.isArray(bangs) || bangs.length === 0) return DEFAULT_BANGS.map((b) => ({ ...b }));
  const byKey = new Map(bangs.map((b) => [b.key.toLowerCase(), { ...b }]));
  const g = byKey.get('g');
  if (g && /mail\.google\.com/i.test(g.url)) {
    byKey.set('g', { key: 'g', label: 'Google', url: 'https://www.google.com/search?q=%s' });
  }
  if (!byKey.has('gmail')) {
    byKey.set('gmail', {
      key: 'gmail',
      label: 'Gmail',
      url: 'https://mail.google.com/mail/u/0/#search/%s',
    });
  }
  for (const d of DEFAULT_BANGS) {
    if (!byKey.has(d.key.toLowerCase())) byKey.set(d.key.toLowerCase(), { ...d });
  }
  return [...byKey.values()];
}

/** Resolve bang `!yt query`, trailing `query !g`, or plain `!g`. */
export function resolveBang(raw: string, bangs: Bang[]): string | null {
  const t = raw.trim();
  if (!t) return null;

  let m = t.match(/^!([a-z0-9]+)\s*(.*)$/i);
  if (m) {
    const bang = bangs.find((b) => b.key.toLowerCase() === m![1].toLowerCase());
    if (!bang) return null;
    const rest = (m[2] ?? '').trim();
    if (!rest) {
      if (!bang.url.includes('%s')) return bang.url;
      return bang.url.replace('%s', '').replace(/[?&][^=]+=$/, '') || bang.url.split('%s')[0];
    }
    return bang.url.replace('%s', encodeURIComponent(rest));
  }

  m = t.match(/^(.*?)\s+!([a-z0-9]+)$/i);
  if (m) {
    const bang = bangs.find((b) => b.key.toLowerCase() === m![2].toLowerCase());
    if (!bang) return null;
    const rest = (m[1] ?? '').trim();
    if (!rest) return null;
    return bang.url.replace('%s', encodeURIComponent(rest));
  }

  return null;
}
