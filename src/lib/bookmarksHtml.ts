import type { Bookmark, BookmarkFolder } from '../store';
import { BOOKMARKS_BAR_FOLDER_ID, BOOKMARKS_OTHER_FOLDER_ID } from '../store';

const BAR_NAMES = new Set(['bookmarks bar', 'pasek zakładek', 'pasek zakadek']);

function uid() {
  return `imp-${Math.random().toString(36).slice(2, 10)}`;
}

function parseAddDate(a: Element): number {
  const raw = a.getAttribute('ADD_DATE') || a.getAttribute('add_date') || '';
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return Date.now();
  return n > 1e12 ? n : n * 1000;
}

type ImportAcc = {
  folders: BookmarkFolder[];
  bookmarks: Omit<Bookmark, 'id'>[];
};

function walkDl(dl: Element, parentId: string | undefined, acc: ImportAcc) {
  for (const dt of dl.children) {
    if (dt.tagName !== 'DT') continue;
    const h3 = dt.querySelector(':scope > H3');
    const link = dt.querySelector(':scope > A');
    if (h3) {
      const title = (h3.textContent || 'Folder').trim();
      const lower = title.toLowerCase();
      let id = uid();
      if (BAR_NAMES.has(lower) && parentId === undefined) {
        id = BOOKMARKS_BAR_FOLDER_ID;
      } else if (lower === 'other bookmarks' || lower === 'inne zakładki') {
        id = BOOKMARKS_OTHER_FOLDER_ID;
      }
      acc.folders.push({ id, title, parentId });
      const nested = dt.querySelector(':scope > DL');
      if (nested) walkDl(nested, id, acc);
    } else if (link) {
      const href = link.getAttribute('HREF') || link.getAttribute('href') || '';
      if (!href || href.startsWith('javascript:') || href.startsWith('place:')) continue;
      acc.bookmarks.push({
        title: (link.textContent || href).trim(),
        url: href,
        folderId: parentId,
        createdAt: parseAddDate(link),
      });
    }
  }
}

export function parseNetscapeBookmarksHtml(html: string): ImportAcc {
  const acc: ImportAcc = { folders: [], bookmarks: [] };
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('DL');
  if (root) walkDl(root, undefined, acc);
  return acc;
}

function folderChildren(folders: BookmarkFolder[], parentId: string | undefined): BookmarkFolder[] {
  return folders
    .filter((f) => (f.parentId ?? undefined) === (parentId ?? undefined))
    .sort((a, b) => a.title.localeCompare(b.title, 'pl'));
}

function bookmarksInFolder(bookmarks: Bookmark[], folderId: string | undefined): Bookmark[] {
  return bookmarks
    .filter((b) => (b.folderId ?? undefined) === (folderId ?? undefined))
    .sort((a, b) => a.title.localeCompare(b.title, 'pl') || a.createdAt - b.createdAt);
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFolder(
  folders: BookmarkFolder[],
  bookmarks: Bookmark[],
  folderId: string | undefined,
): string {
  const parts: string[] = [];
  for (const f of folderChildren(folders, folderId)) {
    parts.push(
      `<DT><H3>${esc(f.title)}</H3>\n<DL><p>\n${renderFolder(folders, bookmarks, f.id)}\n</DL><p>`,
    );
  }
  for (const b of bookmarksInFolder(bookmarks, folderId)) {
    const add = Math.floor(b.createdAt / 1000);
    parts.push(`<DT><A HREF="${esc(b.url)}" ADD_DATE="${add}">${esc(b.title || b.url)}</A>`);
  }
  return parts.join('\n');
}

export function exportNetscapeBookmarksHtml(
  folders: BookmarkFolder[],
  bookmarks: Bookmark[],
  title = 'Zakładki',
): string {
  const body = renderFolder(folders, bookmarks, undefined);
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>${esc(title)}</TITLE>
<H1>${esc(title)}</H1>
<DL><p>
${body}
</DL><p>`;
}
