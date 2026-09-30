import {
  BOOKMARKS_BAR_FOLDER_ID,
  BOOKMARKS_OTHER_FOLDER_ID,
  type Bookmark,
  type BookmarkFolder,
} from '../store';

type ChromeNode = {
  type?: string;
  name?: string;
  url?: string;
  children?: ChromeNode[];
};

type ChromeBookmarksFile = {
  roots?: {
    bookmark_bar?: ChromeNode;
    other?: ChromeNode;
    synced?: ChromeNode;
  };
};

const uid = () => Math.random().toString(36).slice(2, 10);

export type ChromeImportResult = {
  folders: BookmarkFolder[];
  bookmarks: Omit<Bookmark, 'id'>[];
};

function walkFolder(
  node: ChromeNode,
  parentId: string,
  acc: ChromeImportResult,
  folderId: string,
) {
  for (const child of node.children ?? []) {
    if (child.type === 'url' && child.url) {
      acc.bookmarks.push({
        title: (child.name || child.url).trim(),
        url: child.url,
        folderId,
        createdAt: Date.now(),
      });
      continue;
    }
    if (child.type === 'folder') {
      const id = uid();
      acc.folders.push({
        id,
        title: (child.name || 'Folder').trim(),
        parentId,
      });
      walkFolder(child, id, acc, id);
    }
  }
}

function importRoot(node: ChromeNode | undefined, rootFolderId: string, acc: ChromeImportResult) {
  if (!node) return;
  walkFolder(node, rootFolderId, acc, rootFolderId);
}

/** Parse Chromium Bookmarks JSON (Chrome / Brave / Edge). */
export function parseChromeBookmarksJson(text: string): ChromeImportResult {
  let data: ChromeBookmarksFile;
  try {
    data = JSON.parse(text) as ChromeBookmarksFile;
  } catch {
    return { folders: [], bookmarks: [] };
  }
  const roots = data.roots;
  if (!roots) return { folders: [], bookmarks: [] };

  const acc: ChromeImportResult = { folders: [], bookmarks: [] };
  importRoot(roots.bookmark_bar, BOOKMARKS_BAR_FOLDER_ID, acc);
  importRoot(roots.other, BOOKMARKS_OTHER_FOLDER_ID, acc);

  if (roots.synced?.children?.length) {
    const syncedId = uid();
    acc.folders.push({
      id: syncedId,
      title: roots.synced.name?.trim() || 'Zsynchronizowane',
      parentId: BOOKMARKS_OTHER_FOLDER_ID,
    });
    walkFolder(roots.synced, syncedId, acc, syncedId);
  }

  return acc;
}

export function countChromeImportPreview(text: string): number {
  return parseChromeBookmarksJson(text).bookmarks.length;
}
