import type { Bookmark, BookmarkFolder } from '../store';

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Suggest a folder for a new bookmark: prefer a folder that already holds
 * bookmarks for the same domain (most common folder wins).
 */
export function suggestFolderByDomain(
  url: string,
  bookmarks: Bookmark[],
  folders: BookmarkFolder[],
  fallbackId?: string,
): string | undefined {
  const host = hostOf(url);
  if (!host) return fallbackId;

  const counts = new Map<string, number>();
  for (const b of bookmarks) {
    if (!b.folderId) continue;
    if (hostOf(b.url) !== host) continue;
    counts.set(b.folderId, (counts.get(b.folderId) || 0) + 1);
  }
  let bestId: string | undefined;
  let bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN && folders.some((f) => f.id === id)) {
      bestId = id;
      bestN = n;
    }
  }
  return bestId ?? fallbackId;
}

export function folderTitleById(folders: BookmarkFolder[], id: string | undefined): string {
  if (!id) return '';
  return folders.find((f) => f.id === id)?.title ?? '';
}
