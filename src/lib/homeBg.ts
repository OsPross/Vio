/** Convert stored wallpaper path → CSS-safe url (vio-bg / file). Reject data: blobs. */
export function homeBgCssUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('data:')) return null;
  if (pathOrUrl.startsWith('vio-bg:')) return pathOrUrl;
  if (pathOrUrl.startsWith('file:')) return pathOrUrl;
  const normalized = pathOrUrl.replace(/\\/g, '/');
  const base = normalized.split('/').pop() || '';
  if (!base || base === '.' || base === '..') return null;
  // Custom protocol registered in electron/home-bg.cjs (works under Vite + packaged).
  return `vio-bg://home/${encodeURIComponent(base)}`;
}
