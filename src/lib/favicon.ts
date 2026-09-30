/** Prefer page-captured / local cache; never hit external favicon CDNs */

export function hostnameOf(urlOrHost: string): string {
  try {
    const host = urlOrHost.includes('://') ? new URL(urlOrHost).hostname : urlOrHost;
    return host.replace(/^www\./i, '') || urlOrHost;
  } catch {
    return urlOrHost;
  }
}

export function letterFavicon(urlOrHost: string): string {
  const host = hostnameOf(urlOrHost);
  const letter = (host.charAt(0) || '?').toUpperCase().replace(/[<>&"']/g, '') || '?';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="12" fill="#333a48"/>` +
    `<text x="32" y="34" text-anchor="middle" dominant-baseline="central" ` +
    `font-family="Segoe UI,Arial,sans-serif" font-size="28" font-weight="600" fill="#c8cdd6">${letter}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** @deprecated External CDNs removed — always letter */
export function hostIconUrl(urlOrHost: string): string {
  return letterFavicon(urlOrHost);
}

/** Accept local cache (data/file/blob) or https from the page itself; never third-party icon CDNs */
export function resolveFavicon(url: string, cached?: string | null): string {
  if (cached) {
    if (
      cached.startsWith('data:') ||
      cached.startsWith('blob:') ||
      cached.startsWith('file:') ||
      cached.startsWith('http://') ||
      cached.startsWith('https://')
    ) {
      return cached;
    }
  }
  return letterFavicon(url || '?');
}

export function faviconImgFallback(e: { currentTarget: HTMLImageElement }, url: string) {
  const el = e.currentTarget;
  const letter = letterFavicon(url);
  if (el.src !== letter) el.src = letter;
}
