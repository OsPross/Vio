/** Host key for per-site zoom persistence (http/https only). */
export function hostFromPageUrl(url: string): string | null {
  try {
    if (!/^https?:\/\//i.test(url)) return null;
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function zoomFactorForHost(
  factors: Record<string, number>,
  host: string | null,
): number {
  if (!host) return 1;
  const v = factors[host];
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.min(5, Math.max(0.25, v));
  }
  return 1;
}
