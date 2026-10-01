import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowLeft,
  Bold,
  CheckSquare,
  Copy,
  List,
  Pin,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useStore } from '../store';
import {
  noteTitleFromBody,
  notesCreate,
  notesDelete,
  notesList,
  notesMigrateLegacy,
  notesUpdate,
  type NoteRecord,
} from '../lib/notesApi';

const SAVE_DEBOUNCE_MS = 420;
const UNDO_MS = 6000;
const WIDE_MIN = 440; // L widget ≈460px — two columns on L; ≥560 uses full 240–280 list
const LIST_MIN = 240;
const LIST_MAX = 280;
const LIST_DEFAULT = 260;
const LIST_WIDTH_KEY = 'djxxr-notes-list-width';

type NoteRow = NoteRecord & { pinned?: boolean };

const PREVIEW_NOTES: NoteRow[] = [
  {
    id: 'p1',
    title: 'Lista zakupów',
    body: 'Lista zakupów\n- mleko\n- chleb\n- [ ] jajka',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 3600000,
    pinned: true,
  },
  {
    id: 'p2',
    title: 'Pomysły',
    body: 'Pomysły\nSpotkanie w piątek',
    createdAt: Date.now() - 172800000,
    updatedAt: Date.now() - 7200000,
  },
];

function applyWrap(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): { next: string; selStart: number; selEnd: number } {
  const selected = value.slice(start, end);
  const inner = selected || placeholder;
  const next = value.slice(0, start) + before + inner + after + value.slice(end);
  const selStart = start + before.length;
  const selEnd = selStart + inner.length;
  return { next, selStart, selEnd };
}

function prefixLines(value: string, start: number, end: number, prefix: string) {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEndRaw = value.indexOf('\n', end);
  const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
  const block = value.slice(lineStart, lineEnd);
  const lines = block
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`));
  const nextBlock = lines.join('\n');
  const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
  return { next, selStart: lineStart, selEnd: lineStart + nextBlock.length };
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'teraz';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} godz.`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} dn.`;
  try {
    return new Date(ts).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function loadListWidth(): number {
  try {
    const n = Number(localStorage.getItem(LIST_WIDTH_KEY));
    if (Number.isFinite(n) && n >= LIST_MIN && n <= LIST_MAX) return n;
  } catch {
    /* */
  }
  return LIST_DEFAULT;
}

function sortNotes(list: NoteRow[]): NoteRow[] {
  return [...list].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt;
  });
}

export function NotesWidget({ size, preview }: { size: 'S' | 'M' | 'L'; preview?: boolean }) {
  const legacyNotes = useStore((s) => s.settings.homeNotes);
  const patchSettings = useStore((s) => s.patchSettings);

  const rootRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [notes, setNotes] = useState<NoteRow[]>(preview ? PREVIEW_NOTES : []);
  const [activeId, setActiveId] = useState<string | null>(
    preview ? (PREVIEW_NOTES[0]?.id ?? null) : null,
  );
  const [draft, setDraft] = useState(preview ? (PREVIEW_NOTES[0]?.body ?? '') : '');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);
  const [panelW, setPanelW] = useState(0);
  const [listWidth, setListWidth] = useState(LIST_DEFAULT);
  const [mobileShowList, setMobileShowList] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<NoteRow | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());

  const draftRef = useRef(draft);
  const activeRef = useRef(activeId);
  draftRef.current = draft;
  activeRef.current = activeId;

  const wide = panelW >= WIDE_MIN;
  const listVisible = wide ? true : mobileShowList;
  const editorVisible = wide ? true : !mobileShowList;
  const activeNote = notes.find((n) => n.id === activeId) ?? null;
  const empty = !preview && notes.length === 0 && !query.trim();

  useEffect(() => {
    setListWidth(loadListWidth());
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      setPanelW(w);
    });
    ro.observe(el);
    setPanelW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const refreshList = useCallback(
    async (q?: string) => {
      const list = (await notesList(q)) as NoteRow[];
      setNotes(sortNotes(list.map((n) => ({ ...n, pinned: pinnedIds.has(n.id) }))));
      return list;
    },
    [pinnedIds],
  );

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let list = (await notesList()) as NoteRow[];
      if (!list.length && legacyNotes.trim()) {
        const migrated = await notesMigrateLegacy(legacyNotes);
        if (migrated.migrated) {
          patchSettings({ homeNotes: '' });
          list = migrated.notes as NoteRow[];
        }
      }
      if (cancelled) return;
      setNotes(sortNotes(list.map((n) => ({ ...n, pinned: pinnedIds.has(n.id) }))));
      const first = list[0];
      if (first) {
        setActiveId(first.id);
        setDraft(first.body);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, legacyNotes, patchSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (preview) return;
    const t = setTimeout(() => {
      void refreshList(query.trim() || undefined).then((list) => {
        if (activeId && !list.some((n) => n.id === activeId)) {
          const first = list[0];
          setActiveId(first?.id ?? null);
          setDraft(first?.body ?? '');
        }
      });
    }, 180);
    return () => clearTimeout(t);
  }, [query, preview, refreshList, activeId]);

  const flushSave = useCallback(async () => {
    const id = activeRef.current;
    const body = draftRef.current;
    if (!id || preview) return;
    setSaving(true);
    const updated = await notesUpdate(id, { body });
    setSaving(false);
    if (updated) {
      setNotes((prev) =>
        sortNotes(
          prev.map((n) => (n.id === updated.id ? { ...n, ...updated, pinned: n.pinned } : n)),
        ),
      );
    }
  }, [preview]);

  const scheduleSave = useCallback(() => {
    if (preview) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void flushSave();
    }, SAVE_DEBOUNCE_MS);
  }, [flushSave, preview]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (!preview) void flushSave();
    };
  }, [flushSave, preview]);

  useEffect(() => {
    if (preview) return;
    const flush = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      void flushSave();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [flushSave, preview]);

  const selectNote = (note: NoteRow) => {
    if (preview) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void flushSave();
    }
    setActiveId(note.id);
    setDraft(note.body);
    setCtxMenu(null);
    if (!wide) setMobileShowList(false);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    const id = activeId;
    if (!id) return;
    const title = noteTitleFromBody(value);
    setNotes((prev) =>
      sortNotes(
        prev.map((n) => (n.id === id ? { ...n, body: value, title, updatedAt: Date.now() } : n)),
      ),
    );
    scheduleSave();
  };

  const addNote = async () => {
    if (preview) return;
    const created = (await notesCreate('')) as NoteRow | null;
    if (!created) return;
    setNotes((prev) => sortNotes([{ ...created, pinned: false }, ...prev]));
    setActiveId(created.id);
    setDraft('');
    setCtxMenu(null);
    if (!wide) setMobileShowList(false);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  const duplicateNote = async (id: string) => {
    const src = notes.find((n) => n.id === id);
    if (!src || preview) return;
    const created = (await notesCreate(src.body)) as NoteRow | null;
    if (!created) return;
    setNotes((prev) => sortNotes([{ ...created, pinned: false }, ...prev]));
    setActiveId(created.id);
    setDraft(created.body);
    setCtxMenu(null);
    if (!wide) setMobileShowList(false);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setNotes((prev) => sortNotes(prev.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n))));
    setCtxMenu(null);
  };

  const confirmDelete = (id?: string) => {
    if (preview) return;
    const target = notes.find((n) => n.id === (id || activeId));
    if (!target) return;
    const snapshot = { ...target };
    setPendingDelete(snapshot);
    setCtxMenu(null);
    setNotes((prev) => {
      const rest = prev.filter((n) => n.id !== snapshot.id);
      const next = rest[0];
      setActiveId(next?.id ?? null);
      setDraft(next?.body ?? '');
      return rest;
    });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(async () => {
      undoTimer.current = null;
      setPendingDelete(null);
      await notesDelete(snapshot.id);
    }, UNDO_MS);
  };

  const undoDelete = () => {
    if (!pendingDelete) return;
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    setNotes((prev) => sortNotes([pendingDelete, ...prev]));
    setActiveId(pendingDelete.id);
    setDraft(pendingDelete.body);
    setPendingDelete(null);
  };

  const format = (kind: 'bold' | 'list' | 'check') => {
    const el = areaRef.current;
    if (!el || preview) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    let result: { next: string; selStart: number; selEnd: number };
    if (kind === 'bold') result = applyWrap(value, start, end, '**', '**', 'tekst');
    else if (kind === 'list') result = prefixLines(value, start, end, '- ');
    else result = prefixLines(value, start, end, '- [ ] ');
    onDraftChange(result.next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.selStart, result.selEnd);
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        !rootRef.current?.contains(document.activeElement) &&
        document.activeElement !== rootRef.current
      ) {
        // allow when focus inside notes panel
        if (!rootRef.current?.contains(e.target as Node)) return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        e.stopPropagation();
        void addNote();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('blur', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('blur', close);
    };
  }, [ctxMenu]);

  const onResizeStart = (e: ReactPointerEvent) => {
    if (preview || !wide) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = listWidth;
    const onMove = (ev: PointerEvent) => {
      const next = Math.min(LIST_MAX, Math.max(LIST_MIN, startW + (ev.clientX - startX)));
      setListWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        localStorage.setItem(LIST_WIDTH_KEY, String(listWidth));
      } catch {
        /* */
      }
    };
    // persist latest via ref on up
    const onUpPersist = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUpPersist);
      setListWidth((w) => {
        try {
          localStorage.setItem(LIST_WIDTH_KEY, String(w));
        } catch {
          /* */
        }
        return w;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUpPersist);
    void onUp;
  };

  if (loading && !preview) {
    return (
      <div ref={rootRef} className={`hw-notes hw-size-${size}`}>
        <div className="hw-notes-muted">Ładowanie notatek…</div>
      </div>
    );
  }

  const rows = preview ? PREVIEW_NOTES : notes;
  const titleLine = draft.split(/\r?\n/)[0] || '';
  const bodyRest = draft.includes('\n') ? draft.slice(draft.indexOf('\n') + 1) : '';

  return (
    <div
      ref={rootRef}
      className={`hw-notes hw-size-${size}${wide ? ' is-wide' : ' is-narrow'}${empty ? ' is-empty' : ''}`}
      style={wide ? ({ ['--notes-list-w']: `${listWidth}px` } as CSSProperties) : undefined}
    >
      {pendingDelete && !preview && (
        <div className="hw-notes-undo" role="status">
          <span>Usunięto „{pendingDelete.title}”</span>
          <button type="button" className="hw-notes-undo-btn" onClick={undoDelete}>
            <Undo2 size={14} />
            Cofnij
          </button>
        </div>
      )}

      {empty ? (
        <div className="hw-notes-empty-full">
          <StickyNote size={36} strokeWidth={1.4} aria-hidden />
          <p className="hw-notes-empty-title">Brak notatek</p>
          <button type="button" className="hw-notes-empty-cta" onClick={() => void addNote()}>
            Nowa notatka
            <kbd>Ctrl+N</kbd>
          </button>
        </div>
      ) : (
        <div className="hw-notes-shell">
          {listVisible && (
            <aside className="hw-notes-list-pane" aria-label="Lista notatek">
              <div className="hw-notes-list-head">
                <div className="hw-notes-search">
                  <Search size={14} aria-hidden />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Szukaj"
                    spellCheck={false}
                    disabled={preview}
                    aria-label="Szukaj notatek"
                  />
                </div>
                {!preview && (
                  <button
                    type="button"
                    className="hw-notes-new-btn"
                    title="Nowa notatka (Ctrl+N)"
                    onClick={() => void addNote()}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
              {rows.length === 0 ? (
                <div className="hw-notes-list-empty">Brak wyników</div>
              ) : (
                <ul className="hw-notes-list">
                  {rows.map((n) => {
                    const snippet = n.body.split(/\r?\n/).slice(1).join(' ').trim();
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          className={n.id === activeId ? 'on' : ''}
                          onClick={() => selectNote(n)}
                          onContextMenu={(e) => {
                            if (preview) return;
                            e.preventDefault();
                            setCtxMenu({ x: e.clientX, y: e.clientY, id: n.id });
                          }}
                          disabled={preview}
                        >
                          <span className="hw-notes-list-top">
                            <span className="hw-notes-list-title">
                              {n.pinned ? <Pin size={11} className="hw-notes-pin" /> : null}
                              {n.title || 'Bez tytułu'}
                            </span>
                            <span className="hw-notes-list-date">{relativeTime(n.updatedAt)}</span>
                          </span>
                          <span className="hw-notes-list-snippet">{snippet || ' '}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </aside>
          )}

          {wide && listVisible && editorVisible && (
            <div
              className="hw-notes-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Szerokość listy"
              onPointerDown={onResizeStart}
            />
          )}

          {editorVisible && (
            <div className="hw-notes-editor-pane">
              {!wide && (
                <button
                  type="button"
                  className="hw-notes-back"
                  onClick={() => setMobileShowList(true)}
                  disabled={preview}
                >
                  <ArrowLeft size={14} />
                  Notatki
                </button>
              )}
              {!activeNote && !preview ? (
                <div className="hw-notes-editor-placeholder">Wybierz notatkę</div>
              ) : (
                <>
                  <div className="hw-notes-toolbar">
                    <button
                      type="button"
                      className="hw-notes-tool"
                      title="Pogrubienie"
                      disabled={preview}
                      onClick={() => format('bold')}
                    >
                      <Bold size={14} />
                    </button>
                    <button
                      type="button"
                      className="hw-notes-tool"
                      title="Lista"
                      disabled={preview}
                      onClick={() => format('list')}
                    >
                      <List size={14} />
                    </button>
                    <button
                      type="button"
                      className="hw-notes-tool"
                      title="Checkbox"
                      disabled={preview}
                      onClick={() => format('check')}
                    >
                      <CheckSquare size={14} />
                    </button>
                    <span className="hw-notes-toolbar-spacer" />
                    <span className="hw-notes-save-hint">
                      {saving ? 'Zapisywanie…' : preview ? '' : 'Autosave'}
                    </span>
                    {!preview && activeNote && (
                      <button
                        type="button"
                        className="hw-notes-tool danger"
                        title="Usuń"
                        onClick={() => confirmDelete()}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="hw-notes-editor-scroll">
                    <div className="hw-notes-editor-inner">
                      <input
                        className="hw-notes-title-input"
                        value={preview ? (PREVIEW_NOTES[0]?.title ?? titleLine) : titleLine}
                        readOnly={preview}
                        placeholder="Tytuł"
                        aria-label="Tytuł notatki"
                        onChange={(e) => {
                          const t = e.target.value;
                          const rest = bodyRest;
                          onDraftChange(rest ? `${t}\n${rest}` : t);
                        }}
                      />
                      <textarea
                        ref={areaRef}
                        className="hw-notes-body"
                        value={
                          preview
                            ? (PREVIEW_NOTES[0]?.body.split(/\r?\n/).slice(1).join('\n') ?? '')
                            : bodyRest
                        }
                        readOnly={preview}
                        onChange={(e) => {
                          const t = titleLine || 'Nowa notatka';
                          onDraftChange(e.target.value ? `${t}\n${e.target.value}` : t);
                        }}
                        placeholder="Zacznij pisać…"
                        spellCheck
                        aria-label="Treść notatki"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {ctxMenu && (
        <div
          className="hw-notes-ctx"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => togglePin(ctxMenu.id)}>
            <Pin size={14} />
            {pinnedIds.has(ctxMenu.id) || notes.find((n) => n.id === ctxMenu.id)?.pinned
              ? 'Odepnij'
              : 'Przypnij'}
          </button>
          <button type="button" role="menuitem" onClick={() => void duplicateNote(ctxMenu.id)}>
            <Copy size={14} />
            Duplikuj
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => confirmDelete(ctxMenu.id)}
          >
            <Trash2 size={14} />
            Usuń
          </button>
        </div>
      )}
    </div>
  );
}
