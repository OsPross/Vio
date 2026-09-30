import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import { letterFavicon } from '../lib/favicon';
import { formatUrlPlain } from '../lib/url-display';
import {
  BOOKMARKS_BAR_FOLDER_ID,
  BOOKMARKS_OTHER_FOLDER_ID,
  useStore,
  type Bookmark,
  type BookmarkFolder,
} from '../store';

export type OpenBookmarkOpts = {
  newTab?: boolean;
};

type Props = {
  onOpen: (url: string, opts?: OpenBookmarkOpts) => void;
  onEdit: (bookmark: Bookmark) => void;
};

type Ctx = { x: number; y: number; bookmark: Bookmark } | null;

type BarEntry =
  | { kind: 'bookmark'; bookmark: Bookmark }
  | { kind: 'folder'; folder: BookmarkFolder };

function folderChildren(folders: BookmarkFolder[], parentId: string): BookmarkFolder[] {
  return folders.filter((f) => f.parentId === parentId).sort((a, b) => a.title.localeCompare(b.title, 'pl'));
}

function barBookmarks(bookmarks: Bookmark[]): Bookmark[] {
  return bookmarks.filter((b) => (b.folderId ?? BOOKMARKS_OTHER_FOLDER_ID) === BOOKMARKS_BAR_FOLDER_ID);
}

function bookmarksInFolder(bookmarks: Bookmark[], folderId: string): Bookmark[] {
  return bookmarks.filter((b) => (b.folderId ?? BOOKMARKS_OTHER_FOLDER_ID) === folderId);
}

export function BookmarksBar({ onOpen, onEdit }: Props) {
  const show = useStore((s) => s.settings.showBookmarksBar);
  const bookmarks = useStore((s) => s.bookmarks);
  const bookmarkFolders = useStore((s) => s.bookmarkFolders);
  const removeBookmark = useStore((s) => s.removeBookmark);
  const [ctx, setCtx] = useState<Ctx>(null);
  const [favicons, setFavicons] = useState<Record<string, string>>({});
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);

  const barItems = useMemo(() => barBookmarks(bookmarks), [bookmarks]);
  const subfolders = useMemo(
    () => folderChildren(bookmarkFolders, BOOKMARKS_BAR_FOLDER_ID),
    [bookmarkFolders],
  );

  const entries = useMemo((): BarEntry[] => {
    const out: BarEntry[] = barItems.map((bookmark) => ({ kind: 'bookmark', bookmark }));
    for (const folder of subfolders) out.push({ kind: 'folder', folder });
    return out;
  }, [barItems, subfolders]);

  const visibleEntries = visibleCount == null ? entries : entries.slice(0, visibleCount);
  const overflowEntries = visibleCount == null ? [] : entries.slice(visibleCount);

  useLayoutEffect(() => {
    if (!show) return;
    const wrap = wrapRef.current;
    const bar = barRef.current;
    const measure = measureRef.current;
    if (!wrap || !bar || !measure) return;

    const overflowBtnW = 36;
    const maxW = wrap.clientWidth - overflowBtnW;
    const nodes = [...measure.querySelectorAll<HTMLElement>('[data-bar-entry]')];
    if (!nodes.length) {
      setVisibleCount(entries.length);
      return;
    }
    let used = 0;
    let count = 0;
    for (const node of nodes) {
      const w = node.offsetWidth + 2;
      if (used + w > maxW && count > 0) break;
      used += w;
      count += 1;
    }
    setVisibleCount(count >= entries.length ? entries.length : Math.max(1, count));
  }, [show, entries]);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    const load = async () => {
      const urls = [...new Set(barItems.slice(0, 32).map((b) => b.url))];
      const next: Record<string, string> = {};
      await Promise.all(
        urls.map(async (url) => {
          try {
            const data = await window.shell?.faviconCacheGet?.(url);
            if (typeof data === 'string' && data.startsWith('data:')) next[url] = data;
          } catch {
            /* */
          }
        }),
      );
      if (!cancelled) setFavicons((p) => ({ ...p, ...next }));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [show, barItems]);

  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [ctx]);

  useEffect(() => {
    if (!overflowOpen) return;
    const close = () => setOverflowOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [overflowOpen]);

  const onItemClick = useCallback(
    (e: React.MouseEvent, url: string) => {
      if (e.button === 1) {
        e.preventDefault();
        onOpen(url, { newTab: true });
        return;
      }
      if (e.button === 0) onOpen(url);
    },
    [onOpen],
  );

  if (!show) return null;

  const renderBookmark = (b: Bookmark) => {
    const ico = favicons[b.url] || letterFavicon(b.url);
    return (
      <button
        key={b.id}
        type="button"
        data-bar-entry
        className="bookmarks-bar-item"
        title={formatUrlPlain(b.url)}
        onClick={(e) => onItemClick(e, b.url)}
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtx({ x: e.clientX, y: e.clientY, bookmark: b });
        }}
      >
        <img src={ico} alt="" width={14} height={14} />
        <span>{b.title}</span>
      </button>
    );
  };

  return (
    <>
      <div className="bookmarks-bar-wrap" ref={wrapRef}>
        <div className="bookmarks-bar" role="toolbar" aria-label="Pasek zakładek" ref={barRef}>
          {visibleEntries.map((entry) =>
            entry.kind === 'bookmark' ? (
              renderBookmark(entry.bookmark)
            ) : (
              <div key={entry.folder.id} data-bar-entry>
                <FolderMenu
                  folder={entry.folder}
                  bookmarks={bookmarks}
                  folders={bookmarkFolders}
                  onOpen={onOpen}
                  onEdit={onEdit}
                />
              </div>
            ),
          )}
          {!entries.length ? (
            <span className="bookmarks-bar-empty muted">Brak zakładek na pasku — Ctrl+D aby dodać</span>
          ) : null}
        </div>
        {overflowEntries.length > 0 && (
          <div className="bookmarks-bar-overflow">
            <button
              type="button"
              className="bookmarks-bar-overflow-btn"
              title="Więcej zakładek"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setOverflowOpen((v) => !v)}
            >
              »
            </button>
            {overflowOpen && (
              <div className="bookmarks-bar-overflow-menu" onMouseDown={(e) => e.stopPropagation()}>
                {overflowEntries.map((entry) =>
                  entry.kind === 'bookmark' ? (
                    <button
                      key={entry.bookmark.id}
                      type="button"
                      className="bookmarks-bar-subitem"
                      onClick={() => {
                        onOpen(entry.bookmark.url);
                        setOverflowOpen(false);
                      }}
                    >
                      {entry.bookmark.title}
                    </button>
                  ) : (
                    <FolderMenu
                      key={entry.folder.id}
                      folder={entry.folder}
                      bookmarks={bookmarks}
                      folders={bookmarkFolders}
                      onOpen={onOpen}
                      onEdit={onEdit}
                    />
                  ),
                )}
              </div>
            )}
          </div>
        )}
        <div className="bookmarks-bar bookmarks-bar-measure" ref={measureRef} aria-hidden>
          {entries.map((entry) =>
            entry.kind === 'bookmark' ? (
              renderBookmark(entry.bookmark)
            ) : (
              <div key={entry.folder.id} data-bar-entry>
                <FolderMenu
                  folder={entry.folder}
                  bookmarks={bookmarks}
                  folders={bookmarkFolders}
                  onOpen={onOpen}
                  onEdit={onEdit}
                />
              </div>
            ),
          )}
        </div>
      </div>
      {ctx ? (
        <div
          className="bookmarks-ctx"
          style={{ left: ctx.x, top: ctx.y }}
          role="menu"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => { onOpen(ctx.bookmark.url); setCtx(null); }}>
            Otwórz
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onOpen(ctx.bookmark.url, { newTab: true });
              setCtx(null);
            }}
          >
            Otwórz w nowej karcie
          </button>
          <button type="button" role="menuitem" onClick={() => { onEdit(ctx.bookmark); setCtx(null); }}>
            Edytuj…
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger-text"
            onClick={() => {
              removeBookmark(ctx.bookmark.id);
              setCtx(null);
            }}
          >
            Usuń
          </button>
        </div>
      ) : null}
    </>
  );
}

function FolderMenu({
  folder,
  bookmarks,
  folders,
  onOpen,
  onEdit,
}: {
  folder: BookmarkFolder;
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  onOpen: (url: string, opts?: OpenBookmarkOpts) => void;
  onEdit: (b: Bookmark) => void;
}) {
  const [open, setOpen] = useState(false);
  const items = bookmarksInFolder(bookmarks, folder.id);
  const subs = folderChildren(folders, folder.id);

  return (
    <div
      className="bookmarks-bar-folder"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button type="button" className="bookmarks-bar-item">
        <Folder size={14} strokeWidth={1.75} />
        <span>{folder.title}</span>
        <ChevronRight size={12} />
      </button>
      {open && (items.length || subs.length) ? (
        <div className="bookmarks-bar-submenu">
          {items.map((b) => {
            const ico = letterFavicon(b.url);
            return (
              <button
                key={b.id}
                type="button"
                className="bookmarks-bar-subitem"
                onClick={(e) => {
                  if (e.button === 1 || e.ctrlKey || e.metaKey) onOpen(b.url, { newTab: true });
                  else onOpen(b.url);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onEdit(b);
                }}
              >
                <img src={ico} alt="" width={12} height={12} style={{ marginRight: 6, verticalAlign: -2 }} />
                {b.title}
              </button>
            );
          })}
          {subs.map((sf) => (
            <FolderMenu key={sf.id} folder={sf} bookmarks={bookmarks} folders={folders} onOpen={onOpen} onEdit={onEdit} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
