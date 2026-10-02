export type DisplayUrlParts = {
  text: string;
  host: string;
  path: string;
  kind: 'url' | 'search' | 'internal' | 'special';
  searchEngine?: string;
  searchQuery?: string;
  fullUrl: string;
  tooltip: string;
};

const DEFAULT_MAX_LEN = 48;

const INTERNAL_LABELS: Record<string, string> = {
  'about:home': 'Strona startowa',
  'about:history': 'Historia',
  'about:downloads': 'Pobrania',
  'about:bookmarks': 'Zakładki',
  'about:extensions': 'Rozszerzenia',
  'djxxr://about': 'O aplikacji',
  'about:about': 'O aplikacji',
  'about:tor': 'Tor',
};

/** Latin, Cyrillic, Greek, Common (digits/punctuation) for spoof detection */
function scriptBucket(ch: string): string {
  const cp = ch.codePointAt(0)!;
  if (cp >= 0x30 && cp <= 0x39) return 'common';
  if (cp >= 0x41 && cp <= 0x5a) return 'latin';
  if (cp >= 0x61 && cp <= 0x7a) return 'latin';
  if (cp >= 0x0400 && cp <= 0x04ff) return 'cyrillic';
  if (cp >= 0x0370 && cp <= 0x03ff) return 'greek';
  if (cp >= 0x0590 && cp <= 0x05ff) return 'hebrew';
  if (cp >= 0x0600 && cp <= 0x06ff) return 'arabic';
  if (cp >= 0x4e00 && cp <= 0x9fff) return 'cjk';
  if (cp >= 0x3040 && cp <= 0x30ff) return 'cjk';
  if (cp >= 0xac00 && cp <= 0xd7af) return 'cjk';
  if (cp >= 0x0900 && cp <= 0x097f) return 'devanagari';
  if (cp === 0x2e || cp === 0x2d) return 'common';
  if (cp > 0x7f) return 'other';
  return 'latin';
}

function hostScripts(host: string): Set<string> {
  const scripts = new Set<string>();
  for (const ch of host.replace(/\./g, '')) {
    const s = scriptBucket(ch);
    if (s !== 'common') scripts.add(s);
  }
  return scripts;
}

export function shouldShowPunycode(hostname: string): boolean {
  const h = hostname.replace(/^www\./i, '');
  if (!h || h === 'localhost' || /^[\d.a-fA-F:]+$/.test(h)) return false;
  if (h.includes('xn--')) {
    const scripts = hostScripts(h);
    if (scripts.size > 1) return true;
    return scripts.has('cyrillic') || scripts.has('greek');
  }
  const scripts = hostScripts(h);
  if (scripts.size <= 1) return false;
  const risky = ['cyrillic', 'greek', 'other'];
  const hasLatin = scripts.has('latin');
  if (hasLatin && [...scripts].some((s) => risky.includes(s))) return true;
  return scripts.size > 1;
}

export function middleEllipsis(s: string, maxLen: number): string {
  if (maxLen < 1) return '';
  if (s.length <= maxLen) return s;
  if (maxLen <= 1) return '…';
  const inner = maxLen - 1;
  const head = Math.ceil(inner / 2);
  const tail = Math.floor(inner / 2);
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}

function stripWww(host: string): string {
  return host.replace(/^www\./i, '');
}

function hostFromRawUrl(url: string): string | null {
  const m = url.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)/i);
  return m ? m[2] : null;
}

function detectSearch(u: URL): { engine: string; query: string } | null {
  const host = stripWww(u.hostname.toLowerCase());
  const q = u.searchParams;

  const googleHosts = ['google.com', 'google.pl', 'google.de'];
  if (googleHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    if (u.pathname === '/search' && q.has('q')) {
      return { engine: 'Google', query: q.get('q')!.trim() };
    }
  }

  if (host === 'duckduckgo.com') {
    const query = q.get('q');
    if (query && (u.pathname === '/' || u.pathname.startsWith('/html'))) {
      return { engine: 'DuckDuckGo', query: query.trim() };
    }
  }

  if (host.endsWith('bing.com') && u.pathname === '/search' && q.has('q')) {
    return { engine: 'Bing', query: q.get('q')!.trim() };
  }

  if (host === 'search.brave.com' && u.pathname === '/search' && q.has('q')) {
    return { engine: 'Brave', query: q.get('q')!.trim() };
  }

  if (host.includes('startpage.com') && q.has('query')) {
    return { engine: 'Startpage', query: q.get('query')!.trim() };
  }

  const ytHosts = ['youtube.com', 'm.youtube.com', 'music.youtube.com'];
  if (ytHosts.some((h) => host === h || host.endsWith(`.${h}`))) {
    if (u.pathname === '/results' && q.has('search_query')) {
      return { engine: 'YouTube', query: q.get('search_query')!.trim() };
    }
  }

  if (host.includes('searx') && u.pathname === '/search' && q.has('q')) {
    return { engine: 'SearX', query: q.get('q')!.trim() };
  }

  return null;
}

function displayHost(parsed: URL, rawUrl: string): string {
  const rawHost = hostFromRawUrl(rawUrl);
  const asciiHost = parsed.hostname;
  const withPort = parsed.host.includes(':') ? parsed.host : stripWww(parsed.host);

  if (shouldShowPunycode(rawHost || asciiHost)) {
    return parsed.host.includes(':') ? parsed.host : stripWww(asciiHost);
  }

  if (rawHost) {
    const withoutWww = rawHost.replace(/^www\./i, '');
    if (parsed.host.includes(':')) {
      const port = parsed.port;
      if (port && !withoutWww.includes(':')) return `${withoutWww}:${port}`;
    }
    return withoutWww;
  }

  return withPort.includes(':') ? withPort : stripWww(withPort);
}

function trimTrailingSlash(text: string): string {
  if (!text.includes('/')) return text;
  return text.replace(/\/+$/, '') || text;
}

function internalParts(url: string, maxLen: number): DisplayUrlParts | null {
  const key = url.split(/[?#]/)[0].toLowerCase();
  const label = INTERNAL_LABELS[key];
  if (!label) return null;
  return {
    text: label,
    host: '',
    path: '',
    kind: 'internal',
    fullUrl: url,
    tooltip: label,
  };
}

function dataUrlParts(url: string, maxLen: number): DisplayUrlParts {
  const mime = url.slice(5, url.indexOf(','));
  const short = mime ? `data:${mime}…` : 'data:…';
  return {
    text: middleEllipsis(short, maxLen),
    host: '',
    path: '',
    kind: 'special',
    fullUrl: url,
    tooltip: url.length > 120 ? `${url.slice(0, 117)}…` : url,
  };
}

function fileUrlParts(url: string, maxLen: number): DisplayUrlParts {
  try {
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname);
    const host = u.hostname || 'localhost';
    const text = trimTrailingSlash(`file://${host}${path}`);
    return {
      text: middleEllipsis(text, maxLen),
      host,
      path,
      kind: 'special',
      fullUrl: url,
      tooltip: url,
    };
  } catch {
    return {
      text: middleEllipsis(url, maxLen),
      host: '',
      path: '',
      kind: 'special',
      fullUrl: url,
      tooltip: url,
    };
  }
}

export function formatUrlForDisplay(url: string, opts?: { maxLen?: number }): DisplayUrlParts {
  const fullUrl = url;
  const maxLen = opts?.maxLen ?? DEFAULT_MAX_LEN;
  const trimmed = url.trim();

  const internal = internalParts(trimmed, maxLen);
  if (internal) return internal;

  if (trimmed.startsWith('data:')) return dataUrlParts(trimmed, maxLen);
  if (trimmed.startsWith('file:')) return fileUrlParts(trimmed, maxLen);

  if (/^about:/i.test(trimmed)) {
    const text = trimmed.replace(/^about:/i, 'about:');
    return {
      text: middleEllipsis(text, maxLen),
      host: '',
      path: '',
      kind: 'internal',
      fullUrl,
      tooltip: trimmed,
    };
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : null;
  if (!withScheme) {
    return {
      text: middleEllipsis(trimmed, maxLen),
      host: '',
      path: '',
      kind: 'url',
      fullUrl,
      tooltip: trimmed,
    };
  }

  try {
    const parsed = new URL(trimmed);
    const search = detectSearch(parsed);
    if (search) {
      const label = `${search.engine}: ${search.query}`;
      return {
        text: middleEllipsis(label, maxLen),
        host: displayHost(parsed, trimmed),
        path: parsed.pathname === '/' ? '' : parsed.pathname,
        kind: 'search',
        searchEngine: search.engine,
        searchQuery: search.query,
        fullUrl,
        tooltip: label,
      };
    }

    const host = displayHost(parsed, trimmed);
    let path = parsed.pathname + parsed.hash;
    if (path === '/') path = '';

    const showQuery = !path && parsed.search && parsed.search.length > 1 && !detectSearch(parsed);

    if (showQuery) {
      path = parsed.search;
    }

    let body = host + path;
    body = trimTrailingSlash(body);

    return {
      text: middleEllipsis(body, maxLen),
      host,
      path,
      kind: 'url',
      fullUrl,
      tooltip: fullUrl,
    };
  } catch {
    const stripped = trimmed.replace(/^https?:\/\//i, '');
    const text = trimTrailingSlash(stripped.replace(/^www\./i, ''));
    return {
      text: middleEllipsis(text, maxLen),
      host: '',
      path: '',
      kind: 'url',
      fullUrl,
      tooltip: fullUrl,
    };
  }
}

export function formatUrlPlain(url: string, opts?: { maxLen?: number }): string {
  return formatUrlForDisplay(url, opts).text;
}

/** Legacy brand protocol — display only; do not rewrite stored history. */
export function rewriteLegacyProtocol(url: string): string {
  if (/^djxxr:\/\//i.test(url)) return `vio://${url.slice(url.indexOf('://') + 3)}`;
  return url;
}

export function isSkippableSuggestUrl(url: string | undefined): boolean {
  if (!url) return false;
  return /^djxxr:\/\//i.test(url);
}

/** Host / short origin for suggest subtitles (gray domain). */
export function suggestDomainLabel(url?: string): string | undefined {
  if (!url) return undefined;
  const display = rewriteLegacyProtocol(url);
  try {
    const u = new URL(display);
    if (u.protocol === 'vio:') return display;
    if (u.protocol === 'about:') return display;
    const host = u.host || u.hostname;
    return host.replace(/^www\./i, '') || undefined;
  } catch {
    return /^vio:\/\//i.test(display) ? display : undefined;
  }
}

/**
 * Omnibox when not focused: search query or short host/path — never the raw URL.
 */
export function formatOmniboxIdleDisplay(url: string, opts?: { maxLen?: number }): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^djxxr:\/\//i.test(trimmed)) {
    const key = trimmed.split(/[?#]/)[0].toLowerCase();
    const label = INTERNAL_LABELS[key];
    if (label) return label;
    return rewriteLegacyProtocol(trimmed);
  }
  const parts = formatUrlForDisplay(trimmed, opts);
  if (parts.kind === 'search' && parts.searchQuery) return parts.searchQuery;
  return parts.text;
}

/** Omnibox / suggest: shorten URL subtitles while keeping human labels. */
export function formatSuggestSubtitle(
  subtitle: string | undefined,
  itemUrl?: string,
): string | undefined {
  if (!subtitle) return undefined;
  const typeOnly = new Set([
    'Zapytanie',
    'Historia',
    'Sugestia',
    'Przełącz na kartę',
    'Skrót',
    'Dopełnienie · Tab',
  ]);
  if (typeOnly.has(subtitle)) {
    // Type labels are shown via icons — prefer domain when we have a URL.
    return itemUrl ? suggestDomainLabel(itemUrl) : undefined;
  }
  const candidate = itemUrl || subtitle;
  if (
    /^https?:\/\//i.test(candidate) ||
    /^about:/i.test(candidate) ||
    /^djxxr:\/\//i.test(candidate) ||
    /^vio:\/\//i.test(candidate) ||
    candidate.startsWith('file:')
  ) {
    return suggestDomainLabel(candidate) || formatUrlPlain(rewriteLegacyProtocol(candidate));
  }
  return subtitle;
}

export function isHttpNavigableUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}
