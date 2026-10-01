import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Bookmark,
  Download,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Search,
  Upload,
} from 'lucide-react';
import { letterFavicon } from '../lib/favicon';
import { formatUrlPlain } from '../lib/url-display';
import { exportNetscapeBookmarksHtml, parseNetscapeBookmarksHtml } from '../lib/bookmarksHtml';
import { countChromeImportPreview, parseChromeBookmarksJson } from '../lib/bookmarksChrome';
import {
  BOOKMARKS_BAR_FOLDER_ID,
  BOOKMARKS_OTHER_FOLDER_ID,
  useStore,
  type Bookmark as Bm,
  type BookmarkFolder,
} from '../store';
import { InternalPage } from './InternalPage';
import { Input } from './ui/Input';
import { Switch } from './ui/Switch';

type Props = {
  onOpen: (url: string, opts?: { newTab?: boolean }) => void;
  onEditBookmark: (b: Bm) => void;
};

type FolderKey = string | 'all';

type CtxMenu = {
  x: number;
  y: number;
  bookmark: Bm;
};

type ProfileRow = { browser: string; path: string; exists: boolean };

function folderIdOf(b: Bm) {
  return b.folderId ?? BOOKMARKS_OTHER_FOLDER_ID;
}

function folderLabel(folders: BookmarkFolder[], id: string) {
  if (id === BOOKMARKS_BAR_FOLDER_ID) return 'Pasek zakładek';
  if (id === BOOKMARKS_OTHER_FOLDER_ID) return 'Inne';
  return folders.find((f) => f.id === id)?.title ?? '—';
}

function FolderDropTarget({
  id,
  active,
  onSelect,
  icon,
  label,
  count,
}: {
  id: FolderKey;
  active: boolean;
  onSelect: () => void;
  icon: ReactNode;
  label: string;
  count: number;
}) {
  const dropId = id === 'all' ? 'folder-all' : `folder-${id}`;
  const { setNodeRef, isOver } = useDroppable({ id: dropId, disabled: id === 'all' });
  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`bm-folder ${active ? 'active' : ''} ${isOver ? 'drop-target' : ''}`}
      onClick={onSelect}
    >
      {icon}
      <span>{label}</span>
      <span className="bm-folder-count">{count}</span>
    </button>
  );
}

function SortableRow({
  bookmark,
  folderName,
  favicon,
  selected,
  selectionActive,
  editing,
  onToggleSelect,
  onOpen,
  onContext,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onMenu,
}: {
  bookmark: Bm;
  folderName: string;
  favicon: string;
  selected: boolean;
  selectionActive: boolean;
  editing: 'title' | 'url' | null;
  onToggleSelect: (shift: boolean) => void;
  onOpen: () => void;
  onContext: (e: ReactMouseEvent) => void;
  onStartEdit: (field: 'title' | 'url') => void;
  onCommitEdit: (field: 'title' | 'url', value: string) => void;
  onCancelEdit: () => void;
  onMenu: (e: ReactMouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bookmark.id,
  });
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(editing === 'title' ? bookmark.title : bookmark.url);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, bookmark.title, bookmark.url]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bm-row ${selected ? 'selected' : ''} ${selectionActive ? 'show-check' : ''}`}
      onContextMenu={onContext}
      onDoubleClick={() => onStartEdit('title')}
      {...attributes}
      {...listeners}
    >
      <label className="bm-check" title="Zaznacz" onPointerDown={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(false)}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(e.shiftKey);
          }}
        />
      </label>
      <img src={favicon} alt="" width={16} height={16} />
      {editing ? (
        <div
          className="bm-row-edit"
          style={{ gridColumn: '3 / 6' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') onCommitEdit(editing, draft);
              if (e.key === 'Escape') onCancelEdit();
            }}
            onBlur={() => onCommitEdit(editing, draft)}
          />
        </div>
      ) : (
        <>
          <button type="button" className="bm-row-main" onClick={onOpen} title={bookmark.url}>
            <span className="bm-row-title">{bookmark.title}</span>
          </button>
          <span className="bm-row-url" title={bookmark.url}>
            {formatUrlPlain(bookmark.url)}
          </span>
          <span className="bm-row-folder">{folderName}</span>
        </>
      )}
      <button
        type="button"
        className="icon-btn sm"
        title="Menu"
        onClick={onMenu}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <MoreHorizontal size={14} />
      </button>
    </div>
  );
}

export function BookmarksPage({ onOpen, onEditBookmark }: Props) {
  const bookmarks = useStore((s) => s.bookmarks);
  const bookmarkFolders = useStore((s) => s.bookmarkFolders);
  const addBookmarkFolder = useStore((s) => s.addBookmarkFolder);
  const removeBookmarkFolder = useStore((s) => s.removeBookmarkFolder);
  const removeBookmark = useStore((s) => s.removeBookmark);
  const updateBookmark = useStore((s) => s.updateBookmark);
  const mergeImportedBookmarks = useStore((s) => s.mergeImportedBookmarks);
  const reorderBookmarks = useStore((s) => s.reorderBookmarks);
  const moveBookmark = useStore((s) => s.moveBookmark);
  const patchSettings = useStore((s) => s.patchSettings);
  const showBar = useStore((s) => s.settings.showBookmarksBar);

  const [q, setQ] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<FolderKey>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ctx, setCtx] = useState<CtxMenu | null>(null);
  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; field: 'title' | 'url' } | null>(null);
  const [favicons, setFavicons] = useState<Record<string, string>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLDivElement>(null);

  const userFolders = useMemo(
    () =>
      bookmarkFolders
        .filter((f) => f.id !== BOOKMARKS_BAR_FOLDER_ID && f.id !== BOOKMARKS_OTHER_FOLDER_ID)
        .sort((a, b) => a.title.localeCompare(b.title, 'pl')),
    [bookmarkFolders],
  );

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    map.set('all', bookmarks.length);
    for (const b of bookmarks) {
      const fid = folderIdOf(b);
      map.set(fid, (map.get(fid) ?? 0) + 1);
    }
    return map;
  }, [bookmarks]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return bookmarks.filter((b) => {
      if (selectedFolder !== 'all' && folderIdOf(b) !== selectedFolder) return false;
      if (!needle) return true;
      return b.title.toLowerCase().includes(needle) || b.url.toLowerCase().includes(needle);
    });
  }, [bookmarks, q, selectedFolder]);

  const selectionActive = selected.size > 0;

  useEffect(() => {
    setSelected(new Set());
  }, [q, selectedFolder, bookmarks.length]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const urls = [...new Set(filtered.slice(0, 80).map((b) => b.url))];
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
  }, [filtered]);

  useEffect(() => {
    if (!importOpen) return;
    void window.shell?.bookmarksDiscoverProfiles?.().then((list) => {
      if (Array.isArray(list)) setProfiles(list as ProfileRow[]);
    });
    const close = (e: Event) => {
      if (!importRef.current?.contains(e.target as Node)) setImportOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [importOpen]);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'F2' && selected.size === 1) {
        const id = [...selected][0];
        setEditing({ id, field: 'title' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onImportHtml = async (file: File) => {
    const text = await file.text();
    const parsed = parseNetscapeBookmarksHtml(text);
    mergeImportedBookmarks(parsed);
    setImportOpen(false);
  };

  const onImportChrome = async (profilePath: string) => {
    try {
      const text = await window.shell?.bookmarksReadProfile?.(profilePath);
      if (!text) return;
      const count = countChromeImportPreview(text);
      if (!count) {
        window.alert('Nie znaleziono zakładek w tym profilu.');
        return;
      }
      if (!window.confirm(`Zaimportować ${count} zakładek (pomijając duplikaty URL)?`)) return;
      mergeImportedBookmarks(parseChromeBookmarksJson(text));
      setImportOpen(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Import nie powiódł się.');
    }
  };

  const onExport = async () => {
    const html = exportNetscapeBookmarksHtml(bookmarkFolders, bookmarks, 'Zakładki djxxr');
    try {
      if (window.shell?.bookmarksSaveExport) {
        const res = await window.shell.bookmarksSaveExport(html);
        if (res?.canceled) return;
        if (!res?.ok) {
          window.alert(res?.error || 'Eksport nie powiódł się.');
        }
        return;
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Eksport nie powiódł się.');
      return;
    }
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookmarks.html';
    a.click();
    URL.revokeObjectURL(url);
  };

  const newFolder = () => {
    const title = prompt('Nazwa folderu');
    if (!title?.trim()) return;
    const parentId = selectedFolder === 'all' ? BOOKMARKS_OTHER_FOLDER_ID : selectedFolder;
    addBookmarkFolder({ title: title.trim(), parentId });
  };

  const toggleSelect = (id: string, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (shift && prev.size) {
        const ids = filtered.map((b) => b.id);
        const anchor = ids.findIndex((x) => prev.has(x));
        const idx = ids.indexOf(id);
        if (anchor >= 0 && idx >= 0) {
          const lo = Math.min(anchor, idx);
          const hi = Math.max(anchor, idx);
          for (let i = lo; i <= hi; i++) next.add(ids[i]);
          return next;
        }
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onDragStart = (e: DragStartEvent) => setDragId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const activeId = String(e.active.id);
    const over = e.over;
    if (!over) return;
    const overId = String(over.id);
    if (overId.startsWith('folder-') && overId !== 'folder-all') {
      moveBookmark(activeId, overId.slice('folder-'.length));
      return;
    }
    if (overId !== activeId) reorderBookmarks(activeId, overId);
  };

  const commitEdit = (id: string, field: 'title' | 'url', value: string) => {
    const v = value.trim();
    setEditing(null);
    if (!v) return;
    if (field === 'title') updateBookmark(id, { title: v });
    else updateBookmark(id, { url: v });
  };

  const openCtx = (e: ReactMouseEvent, bookmark: Bm) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, bookmark });
    setMoveMenuFor(null);
  };

  const dragBookmark = dragId ? bookmarks.find((b) => b.id === dragId) : null;

  const emptyAll = bookmarks.length === 0;

  return (
    <InternalPage
      className="bookmarks-page"
      title="Zakładki"
      subtitle={
        <span className="muted">
          {bookmarks.length} {bookmarks.length === 1 ? 'zakładka' : 'zakładek'}
        </span>
      }
      toolbar={
        <>
          <label className="history-search">
            <Search size={14} strokeWidth={1.75} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Szukaj zakładek…"
              spellCheck={false}
            />
          </label>
          <div className="bm-import-menu" ref={importRef}>
            <button
              type="button"
              className="history-sbtn secondary"
              onClick={() => setImportOpen((v) => !v)}
            >
              <Upload size={14} /> Import
            </button>
            {importOpen && (
              <div className="bm-import-pop">
                <button type="button" onClick={() => fileRef.current?.click()}>
                  Plik HTML (Netscape)…
                </button>
                {profiles.map((p) => (
                  <button
                    key={p.path}
                    type="button"
                    disabled={!p.exists}
                    onClick={() => void onImportChrome(p.path)}
                  >
                    Z {p.browser}
                    {!p.exists ? ' (brak profilu)' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="history-sbtn secondary"
            onClick={onExport}
            disabled={!bookmarks.length}
          >
            <Download size={14} /> Eksport
          </button>
          <button type="button" className="history-sbtn secondary" onClick={newFolder}>
            <FolderPlus size={14} /> Nowy folder
          </button>
          <label className="bm-toolbar-switch">
            <Switch
              on={showBar}
              onChange={(v) => patchSettings({ showBookmarksBar: v })}
              aria-label="Pokaż pasek zakładek"
            />
            Pokaż pasek zakładek
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".html,text/html"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportHtml(f);
              e.target.value = '';
            }}
          />
        </>
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="bm-layout">
          <nav className="bm-folders" aria-label="Foldery">
            <FolderDropTarget
              id="all"
              active={selectedFolder === 'all'}
              onSelect={() => setSelectedFolder('all')}
              icon={<Bookmark size={14} strokeWidth={1.75} />}
              label="Wszystkie"
              count={counts.get('all') ?? 0}
            />
            <FolderDropTarget
              id={BOOKMARKS_BAR_FOLDER_ID}
              active={selectedFolder === BOOKMARKS_BAR_FOLDER_ID}
              onSelect={() => setSelectedFolder(BOOKMARKS_BAR_FOLDER_ID)}
              icon={<Folder size={14} strokeWidth={1.75} />}
              label="Pasek zakładek"
              count={counts.get(BOOKMARKS_BAR_FOLDER_ID) ?? 0}
            />
            <FolderDropTarget
              id={BOOKMARKS_OTHER_FOLDER_ID}
              active={selectedFolder === BOOKMARKS_OTHER_FOLDER_ID}
              onSelect={() => setSelectedFolder(BOOKMARKS_OTHER_FOLDER_ID)}
              icon={<Folder size={14} strokeWidth={1.75} />}
              label="Inne"
              count={counts.get(BOOKMARKS_OTHER_FOLDER_ID) ?? 0}
            />
            {userFolders.map((f) => (
              <div key={f.id} className="bm-folder-user-wrap">
                <FolderDropTarget
                  id={f.id}
                  active={selectedFolder === f.id}
                  onSelect={() => setSelectedFolder(f.id)}
                  icon={<Folder size={14} strokeWidth={1.75} />}
                  label={f.title}
                  count={counts.get(f.id) ?? 0}
                />
                <button
                  type="button"
                  className="icon-btn sm"
                  title="Usuń folder"
                  onClick={() => {
                    if (window.confirm(`Usunąć folder „${f.title}”? Zakładki trafią do „Inne”.`)) {
                      removeBookmarkFolder(f.id);
                      if (selectedFolder === f.id) setSelectedFolder('all');
                    }
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </nav>

          <div className="bm-list-wrap">
            {!filtered.length ? (
              <div className="bm-empty">
                <Bookmark size={36} strokeWidth={1.25} className="bm-empty-icon" aria-hidden />
                <p>Brak zakładek{q ? ' dla tego zapytania' : ''}.</p>
                {emptyAll && !q ? (
                  <>
                    <button
                      type="button"
                      className="history-sbtn secondary"
                      onClick={() => setImportOpen(true)}
                    >
                      Importuj z Chrome/Brave
                    </button>
                    <p className="muted">Ctrl+D na stronie dodaje zakładkę</p>
                  </>
                ) : (
                  <p className="muted">Zmień folder lub wyszukiwanie.</p>
                )}
              </div>
            ) : (
              <SortableContext
                items={filtered.map((b) => b.id)}
                strategy={verticalListSortingStrategy}
              >
                {filtered.map((b) => (
                  <SortableRow
                    key={b.id}
                    bookmark={b}
                    folderName={folderLabel(bookmarkFolders, folderIdOf(b))}
                    favicon={favicons[b.url] || letterFavicon(b.url)}
                    selected={selected.has(b.id)}
                    selectionActive={selectionActive}
                    editing={editing?.id === b.id ? editing.field : null}
                    onToggleSelect={(shift) => toggleSelect(b.id, shift)}
                    onOpen={() => onOpen(b.url)}
                    onContext={(e) => openCtx(e, b)}
                    onStartEdit={(field) => setEditing({ id: b.id, field })}
                    onCommitEdit={(field, value) => commitEdit(b.id, field, value)}
                    onCancelEdit={() => setEditing(null)}
                    onMenu={(e) => openCtx(e, b)}
                  />
                ))}
              </SortableContext>
            )}
          </div>
        </div>

        <DragOverlay>
          {dragBookmark ? (
            <div
              className="bm-row"
              style={{ boxShadow: '0 8px 24px rgba(0,0,0,.35)', background: 'var(--bg-elev)' }}
            >
              <img
                src={favicons[dragBookmark.url] || letterFavicon(dragBookmark.url)}
                alt=""
                width={16}
                height={16}
              />
              <span className="bm-row-title">{dragBookmark.title}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {ctx && (
        <div
          className="tab-ctx-backdrop"
          onMouseDown={() => {
            setCtx(null);
            setMoveMenuFor(null);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtx(null);
          }}
        >
          <div
            className="tab-ctx-menu history-ctx-menu"
            style={{ left: ctx.x, top: ctx.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                onOpen(ctx.bookmark.url);
                setCtx(null);
              }}
            >
              Otwórz
            </button>
            <button
              type="button"
              onClick={() => {
                onOpen(ctx.bookmark.url, { newTab: true });
                setCtx(null);
              }}
            >
              Otwórz w nowej karcie
            </button>
            <button
              type="button"
              onClick={() => {
                onEditBookmark(ctx.bookmark);
                setCtx(null);
              }}
            >
              Edytuj…
            </button>
            <button
              type="button"
              className="danger-text"
              onClick={() => {
                removeBookmark(ctx.bookmark.id);
                setCtx(null);
              }}
            >
              Usuń
            </button>
            <hr />
            <button
              type="button"
              onClick={() => setMoveMenuFor((v) => (v ? null : ctx.bookmark.id))}
            >
              Przenieś do folderu…
            </button>
            {moveMenuFor === ctx.bookmark.id && (
              <>
                {[
                  BOOKMARKS_BAR_FOLDER_ID,
                  BOOKMARKS_OTHER_FOLDER_ID,
                  ...userFolders.map((f) => f.id),
                ].map((fid) => (
                  <button
                    key={fid}
                    type="button"
                    onClick={() => {
                      moveBookmark(ctx.bookmark.id, fid);
                      setCtx(null);
                      setMoveMenuFor(null);
                    }}
                  >
                    {folderLabel(bookmarkFolders, fid)}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </InternalPage>
  );
}
