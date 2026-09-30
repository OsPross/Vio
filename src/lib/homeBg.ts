/** Convert stored wallpaper path → CSS url(). Reject data: blobs. */
export function homeBgCssUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('data:')) return null;
  if (pathOrUrl.startsWith('file:')) return pathOrUrl;
  const normalized = pathOrUrl.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(normalized)) return `file:///${normalized}`;
  if (normalized.startsWith('/')) return `file://${normalized}`;
  return null;
}
