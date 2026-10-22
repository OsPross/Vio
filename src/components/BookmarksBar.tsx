import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Folder, LayoutGrid } from 'lucide-react';
import { useT } from '../i18n';
import { hostnameOf } from '../lib/favicon';
import { useLinkPreview } from '../hooks/useLinkPreview';
import { LinkPreviewPopover } from '../features/tabs/LinkPreviewPopover';
import {
  BOOKMARKS_BAR_FOLDER_ID,
  BOOKMARKS_OTHER_FOLDER_ID,
  BOOKMARKS_URL,
  HOME_URL,
  TOR_HOME_URL,
  useStore,
  type Bookmark,
  type BookmarkFolder,
  type BookmarksBarMode,
} from '../store';

export type OpenBookmarkOpts = {
  newTab?: boolean;
  background?: boolean;
  private?: boolean;
};

type Props = {
  onOpen: (url: string, opts?: OpenBookmarkOpts) => void;
  onEdit: (bookmark: Bookmark) => void;
  activeUrl?: string;
};

type CtxTarget =
  | { kind: 'bookmark'; bookmark: Bookmark; x: number; y: number }
  | { kind: 'folder'; folder: BookmarkFolder; x: number; y: number }
  | { kind: 'bar'; x: number; y: number }
  | null;

type BarEntry =
  | { kind: 'bookmark'; bookmark: Bookmark }
  | { kind: 'folder'; folder: BookmarkFolder };

function folderChildren(folders: BookmarkFolder[], parentId: string): BookmarkFolder[] {
  return folders
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.title.localeCompare(b.title, 'pl'));
}

function barBookmarks(bookmarks: Bookmark[]): Bookmark[] {
  return bookmarks.filter(
    (b) => (b.folderId ?? BOOKMARKS_OTHER_FOLDER_ID) === BOOKMARKS_BAR_FOLDER_ID,
  );
}

function bookmarksInFolder(bookmarks: Bookmark[], folderId: string): Bookmark[] {
  return bookmarks.filter((b) => (b.folderId ?? BOOKMARKS_OTHER_FOLDER_ID) === folderId);
}

function collectFolderUrls(bookmarks: Bookmark[], folders: BookmarkFolder[], folderId: string): string[] {
  const urls = bookmarksInFolder(bookmarks, folderId).map((b) => b.url);
  for (const sf of folderChildren(folders, folderId)) {
    urls.push(...collectFolderUrls(bookmarks, folders, sf.id));
  }
  return urls;
}

export function shouldShowBookmarksBar(mode: BookmarksBarMode, activeUrl?: string): boolean {
  if (mode === 'always') return true;
  if (mode === 'never') return false;
  const u = activeUrl || '';
  return u === HOME_URL || u === TOR_HOME_URL || u === '' || u.startsWith('about:home');
}

function BookmarkFavicon({
  url,
  cached,
  size = 16,
}: {
  url: string;
  cached?: string;
  size?: number;
}) {
  if (cached) {
    return (
      <img
        className="bookmarks-bar-fav"
        src={cached}
        alt=""
        width={size}
        height={size}
        draggable={false}
      />
    );
  }
  const letter = (hostnameOf(url).charAt(0) || '?').toUpperCase();
  return (
    <span className="bookmarks-bar-fav-letter" style={{ width: size, height: size }} aria-hidden>
      {letter}
    </span>
  );
}

function parseDropUrl(dt: DataTransfer): string | null {
  const uri = dt.getData('text/uri-list')?.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
  if (uri && /^https?:\/\//i.test(uri)) return uri;
  const plain = (dt.getData('text/plain') || '').trim();
  if (/^https?:\/\//i.test(plain)) return plain;
  const tabUrl = dt.getData('application/x-vio-tab-url')?.trim();
  if (tabUrl && /^https?:\/\//i.test(tabUrl)) return tabUrl;
  return null;
}

export function BookmarksBar({ onOpen, onEdit, activeUrl }: Props) {
  const t = useT();
  const mode = useStore((s) => s.settings.bookmarksBarMode ?? (s.settings.showBookmarksBar ? 'always' : 'never'));
  const linkPreviewEnabled = useStore((s) => s.settings.linkPreviewEnabled !== false);
  const show = shouldShowBookmarksBar(mode, activeUrl);
  const bookmarks = useStore((s) => s.bookmarks);
  const bookmarkFolders = useStore((s) => s.bookmarkFolders);
  const removeBookmark = useStore((s) => s.removeBookmark);
  const updateBookmark = useStore((s) => s.updateBookmark);
  const reorderBookmarks = useStore((s) => s.reorderBookmarks);
  const moveBookmark = useStore((s) => s.moveBookmark);
  const addBookmark = useStore((s) => s.addBookmark);
  const addBookmarkFolder = useStore((s) => s.addBookmarkFolder);
  const updateTab = useStore((s) => s.updateTab);
  const activeId = useStore((s) => s.activeId);
  const setView = useStore((s) => s.setView);
  const newTab = useStore((s) => s.newTab);
  const linkPreview = useLinkPreview(linkPreviewEnabled && show);

  const onLinkPreview = useCallback(
    (p: { url: string; x: number; y: number } | null) => {
      if (!p) {
        linkPreview.scheduleClose();
        return;
      }
      linkPreview.show({ url: p.url, x: p.x, y: p.y, partition: 'persist:main' });
    },
    [linkPreview],
  );

  const [ctx, setCtx] = useState<CtxTarget>(null);
  const [favicons, setFavicons] = useState<Record<string, string>>({});
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [dropOver, setDropOver] = useState(false);
  const [folderDropId, setFolderDropId] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; title: string; domain: string } | null>(
    null,
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const tipTimer = useRef<number | null>(null);

  const clearTipTimer = useCallback(() => {
    if (tipTimer.current != null) {
      window.clearTimeout(tipTimer.current);
      tipTimer.current = null;
    }
  }, []);

  const hideTip = useCallback(() => {
    clearTipTimer();
    setTip(null);
  }, [clearTipTimer]);

  const scheduleTip = useCallback(
    (e: React.MouseEvent, title: string, url: string) => {
      clearTipTimer();
      const x = e.clientX;
      const y = e.clientY;
      tipTimer.current = window.setTimeout(() => {
        tipTimer.current = null;
        setTip({ x, y: y + 14, title, domain: hostnameOf(url) });
      }, 500);
    },
    [clearTipTimer],
  );

  useEffect(() => () => clearTipTimer(), [clearTipTimer]);

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

  const sortableIds = useMemo(
    () => entries.filter((e) => e.kind === 'bookmark').map((e) => e.bookmark.id),
    [entries],
  );

  const visibleEntries = visibleCount == null ? entries : entries.slice(0, visibleCount);
  const overflowEntries = visibleCount == null ? [] : entries.slice(visibleCount);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useLayoutEffect(() => {
    if (!show) return;
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;
    const gridW = 34;
    const overflowBtnW = 36;
    const maxW = wrap.clientWidth - overflowBtnW - gridW;
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
    setVisibleCount(count >= entries.length ? entries.length : Math.max(0, count));
  }, [show, entries]);

  useEffect(() => {
    if (!show) return;
    const onResize = () => setVisibleCount(null);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [show]);

  useEffect(() => {
    if (!show) return;
    let cancelled = false;
    const load = async () => {
      const urls = [...new Set(barItems.slice(0, 40).map((b) => b.url))];
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

  const openAllBookmarks = useCallback(() => {
    updateTab(activeId, { url: BOOKMARKS_URL, title: t('pages.bookmarks') });
    setView('browser');
  }, [activeId, setView, t, updateTab]);

  const onItemClick = useCallback(
    (e: React.MouseEvent, url: string) => {
      if (e.button === 1 || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        onOpen(url, { newTab: true, background: true });
        return;
      }
      if (e.button === 0) onOpen(url);
    },
    [onOpen],
  );

  const onBookmarkHover = useCallback(
    (e: React.MouseEvent, url: string) => {
      if (!onLinkPreview) return;
      if (e.shiftKey) onLinkPreview({ url, x: e.clientX, y: e.clientY });
      else onLinkPreview(null);
    },
    [onLinkPreview],
  );

  const addDroppedUrl = useCallback(
    (url: string, folderId = BOOKMARKS_BAR_FOLDER_ID) => {
      let title = url;
      try {
        title = new URL(url).hostname.replace(/^www\./, '') || url;
      } catch {
        /* */
      }
      addBookmark({ title, url, folderId });
    },
    [addBookmark],
  );

  const onNativeDragOver = (e: React.DragEvent) => {
    if ([...e.dataTransfer.types].some((x) => x === 'text/uri-list' || x === 'text/plain' || x === 'application/x-vio-tab-url')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropOver(true);
    }
  };

  const onNativeDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropOver(false);
    const url = parseDropUrl(e.dataTransfer);
    if (url) addDroppedUrl(url);
  };

  const onDragEnd = (ev: DragEndEvent) => {
    setFolderDropId(null);
    const { active, over } = ev;
    if (!over) return;
    const activeIdStr = String(active.id);
    const overId = String(over.id);
    if (overId.startsWith('folder:')) {
      moveBookmark(activeIdStr, overId.slice(7));
      return;
    }
    if (activeIdStr !== overId) reorderBookmarks(activeIdStr, overId);
  };

  const onDragOver = (ev: DragOverEvent) => {
    const overId = ev.over ? String(ev.over.id) : null;
    if (overId?.startsWith('folder:')) setFolderDropId(overId.slice(7));
    else setFolderDropId(null);
  };

  if (!show) return null;

  const renderBookmarkBtn = (b: Bookmark, opts?: { sortable?: boolean; measure?: boolean }) => {
    const inner = (
      <>
        <BookmarkFavicon url={b.url} cached={favicons[b.url]} />
        {!b.iconOnly ? <span>{b.title}</span> : null}
      </>
    );
    const onEnter = (e: React.MouseEvent) => {
      scheduleTip(e, b.title, b.url);
      onBookmarkHover(e, b.url);
    };
    const onLeave = () => {
      hideTip();
      onLinkPreview?.(null);
    };
    const onMove = (e: React.MouseEvent) => {
      if (tip) setTip((p) => (p ? { ...p, x: e.clientX, y: e.clientY + 14 } : p));
      onBookmarkHover(e, b.url);
    };
    if (opts?.sortable) {
      return (
        <SortableBarItem
          key={b.id}
          id={b.id}
          onClick={(e) => onItemClick(e, b.url)}
          onContextMenu={(e) => {
            e.preventDefault();
            hideTip();
            setCtx({ kind: 'bookmark', bookmark: b, x: e.clientX, y: e.clientY });
          }}
          onMouseEnter={onEnter}
          onMouseLeave={onLeave}
          onMouseMove={onMove}
        >
          {inner}
        </SortableBarItem>
      );
    }
    return (
      <button
        key={b.id}
        type="button"
        data-bar-entry={opts?.measure ? true : undefined}
        className="bookmarks-bar-item"
        onClick={(e) => onItemClick(e, b.url)}
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          hideTip();
          setCtx({ kind: 'bookmark', bookmark: b, x: e.clientX, y: e.clientY });
        }}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onMouseMove={onMove}
      >
        {inner}
      </button>
    );
  };

  return (
    <>
      <div
        className={`bookmarks-bar-wrap${dropOver ? ' drop-over' : ''}`}
        ref={wrapRef}
        onDragOver={onNativeDragOver}
        onDragLeave={() => setDropOver(false)}
        onDrop={onNativeDrop}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('.bookmarks-bar-item, .bookmarks-bar-folder')) return;
          e.preventDefault();
          setCtx({ kind: 'bar', x: e.clientX, y: e.clientY });
        }}
      >
        <button
          type="button"
          className="bookmarks-bar-grid"
          aria-label={t('bookmarks.barAll')}
          onClick={openAllBookmarks}
          onMouseEnter={(e) => scheduleTip(e, t('bookmarks.barAll'), '')}
          onMouseLeave={hideTip}
        >
          <LayoutGrid size={15} strokeWidth={1.75} />
        </button>
        <span className="bookmarks-bar-sep" aria-hidden />

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
        >
          <div className="bookmarks-bar-dnd">
          <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
            <div
              className="bookmarks-bar"
              role="toolbar"
              aria-label={t('bookmarks.barAria')}
              ref={barRef}
            >
              {visibleEntries.map((entry) =>
                entry.kind === 'bookmark' ? (
                  renderBookmarkBtn(entry.bookmark, { sortable: true })
                ) : (
                  <div key={entry.folder.id} data-bar-entry>
                    <FolderMenu
                      folder={entry.folder}
                      bookmarks={bookmarks}
                      folders={bookmarkFolders}
                      favicons={favicons}
                      dropHighlight={folderDropId === entry.folder.id}
                      onOpen={onOpen}
                      onCtxFolder={(f, x, y) => setCtx({ kind: 'folder', folder: f, x, y })}
                      onCtxBookmark={(b, x, y) => setCtx({ kind: 'bookmark', bookmark: b, x, y })}
                      onLinkPreview={onLinkPreview}
                    />
                  </div>
                ),
              )}

              {!entries.length ? (
                <span className="bookmarks-bar-empty muted">{t('bookmarks.barEmpty')}</span>
              ) : null}
            </div>
          </SortableContext>

          {overflowEntries.length > 0 && (
            <div className="bookmarks-bar-overflow">
              <button
                type="button"
                className="bookmarks-bar-overflow-btn"
                title={t('bookmarks.barMore')}
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
                        onClick={(e) => {
                          onItemClick(e, entry.bookmark.url);
                          setOverflowOpen(false);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setCtx({
                            kind: 'bookmark',
                            bookmark: entry.bookmark,
                            x: e.clientX,
                            y: e.clientY,
                          });
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
                        favicons={favicons}
                        onOpen={onOpen}
                        onCtxFolder={(f, x, y) => setCtx({ kind: 'folder', folder: f, x, y })}
                        onCtxBookmark={(b, x, y) => setCtx({ kind: 'bookmark', bookmark: b, x, y })}
                        onLinkPreview={onLinkPreview}
                      />
                    ),
                  )}
                </div>
              )}
            </div>
          )}
          </div>
        </DndContext>

        <div className="bookmarks-bar bookmarks-bar-measure" ref={measureRef} aria-hidden>
          {entries.map((entry) =>
            entry.kind === 'bookmark' ? (
              renderBookmarkBtn(entry.bookmark, { measure: true })
            ) : (
              <div key={entry.folder.id} data-bar-entry>
                <button type="button" className="bookmarks-bar-item">
                  <Folder size={16} strokeWidth={1.75} />
                  <span>{entry.folder.title}</span>
                </button>
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
          {ctx.kind === 'bookmark' ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpen(ctx.bookmark.url);
                  setCtx(null);
                }}
              >
                {t('bookmarks.ctxOpen')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpen(ctx.bookmark.url, { newTab: true, background: true });
                  setCtx(null);
                }}
              >
                {t('bookmarks.ctxOpenTab')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onOpen(ctx.bookmark.url, { private: true });
                  setCtx(null);
                }}
              >
                {t('bookmarks.ctxOpenPrivate')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onEdit(ctx.bookmark);
                  setCtx(null);
                }}
              >
                {t('bookmarks.ctxEdit')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  updateBookmark(ctx.bookmark.id, { iconOnly: !ctx.bookmark.iconOnly });
                  setCtx(null);
                }}
              >
                {ctx.bookmark.iconOnly ? t('bookmarks.ctxShowTitle') : t('bookmarks.ctxIconOnly')}
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
                {t('bookmarks.ctxDelete')}
              </button>
            </>
          ) : null}

          {ctx.kind === 'folder' ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const urls = collectFolderUrls(bookmarks, bookmarkFolders, ctx.folder.id);
                  urls.forEach((u, i) => onOpen(u, { newTab: true, background: i > 0 }));
                  setCtx(null);
                }}
              >
                {t('bookmarks.ctxOpenAll')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const name = window.prompt(t('internal.bookmarksFolderNamePrompt'));
                  if (!name?.trim()) return;
                  addBookmarkFolder({ title: name.trim(), parentId: ctx.folder.id });
                  setCtx(null);
                }}
              >
                {t('bookmarks.ctxNewFolder')}
              </button>
            </>
          ) : null}

          {ctx.kind === 'bar' ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                const name = window.prompt(t('internal.bookmarksFolderNamePrompt'));
                if (!name?.trim()) return;
                addBookmarkFolder({ title: name.trim(), parentId: BOOKMARKS_BAR_FOLDER_ID });
                setCtx(null);
              }}
            >
              {t('bookmarks.ctxNewFolder')}
            </button>
          ) : null}
        </div>
      ) : null}

      {tip ? (
        <div className="bookmarks-bar-tip" style={{ left: tip.x, top: tip.y }} role="tooltip">
          <strong>{tip.title}</strong>
          {tip.domain ? <span>{tip.domain}</span> : null}
        </div>
      ) : null}

      <LinkPreviewPopover
        target={linkPreview.target}
        onClose={linkPreview.close}
        onHoldChange={linkPreview.onHoldChange}
        onOpenTab={(url) => newTab(url)}
      />
    </>
  );
}

function SortableBarItem({
  id,
  children,
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: {
  id: string;
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onMouseEnter?: (e: React.MouseEvent) => void;
  onMouseLeave?: () => void;
  onMouseMove?: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-bar-entry
      className={`bookmarks-bar-item${isDragging ? ' dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.55 : 1,
        zIndex: isDragging ? 20 : undefined,
      }}
      onClick={onClick}
      onMouseDown={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
      {...attributes}
      {...listeners}
    >
      {children}
    </button>
  );
}

function FolderMenu({
  folder,
  bookmarks,
  folders,
  favicons,
  dropHighlight,
  onOpen,
  onCtxFolder,
  onCtxBookmark,
  onLinkPreview,
}: {
  folder: BookmarkFolder;
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  favicons: Record<string, string>;
  dropHighlight?: boolean;
  onOpen: (url: string, opts?: OpenBookmarkOpts) => void;
  onCtxFolder: (f: BookmarkFolder, x: number, y: number) => void;
  onCtxBookmark: (b: Bookmark, x: number, y: number) => void;
  onLinkPreview?: (opts: { url: string; x: number; y: number } | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const items = bookmarksInFolder(bookmarks, folder.id);
  const subs = folderChildren(folders, folder.id);

  const { setNodeRef, isOver } = useDroppable({ id: `folder:${folder.id}` });

  return (
    <div
      ref={setNodeRef}
      className={`bookmarks-bar-folder${dropHighlight || isOver ? ' drop-target' : ''}`}
      data-folder-id={folder.id}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onCtxFolder(folder, e.clientX, e.clientY);
      }}
    >
      <button type="button" className="bookmarks-bar-item">
        <Folder size={16} strokeWidth={1.75} />
        <span>{folder.title}</span>
      </button>

      {open && (items.length || subs.length) ? (
        <div className="bookmarks-bar-submenu">
          {items.length > 1 ? (
            <button
              type="button"
              className="bookmarks-bar-subitem bookmarks-bar-open-all"
              onClick={() => {
                items.forEach((b, i) => onOpen(b.url, { newTab: true, background: i > 0 }));
              }}
            >
              {t('bookmarks.ctxOpenAll')}
            </button>
          ) : null}
          {items.map((b) => (
            <button
              key={b.id}
              type="button"
              className="bookmarks-bar-subitem"
              onClick={(e) => {
                if (e.button === 1 || e.ctrlKey || e.metaKey) {
                  onOpen(b.url, { newTab: true, background: true });
                } else onOpen(b.url);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCtxBookmark(b, e.clientX, e.clientY);
              }}
              onMouseEnter={(e) => {
                if (e.shiftKey) onLinkPreview?.({ url: b.url, x: e.clientX, y: e.clientY });
              }}
              onMouseLeave={() => onLinkPreview?.(null)}
            >
              <BookmarkFavicon url={b.url} cached={favicons[b.url]} size={14} />
              <span>{b.title}</span>
            </button>
          ))}
          {subs.map((sf) => (
            <FolderMenu
              key={sf.id}
              folder={sf}
              bookmarks={bookmarks}
              folders={folders}
              favicons={favicons}
              onOpen={onOpen}
              onCtxFolder={onCtxFolder}
              onCtxBookmark={onCtxBookmark}
              onLinkPreview={onLinkPreview}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
