import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  CheckSquare,
  List,
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
import { WidgetEmpty } from './WidgetFrame';

const SAVE_DEBOUNCE_MS = 420;
const UNDO_MS = 6000;

const PREVIEW_NOTES: NoteRecord[] = [
  {
    id: 'p1',
    title: 'Lista zakupów',
    body: 'Lista zakupów\n- mleko\n- chleb\n- [ ] jajka',
    createdAt: Date.now(),
    updatedAt: Date.now(),
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
  const lines = block.split('\n').map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`));
  const nextBlock = lines.join('\n');
  const next = value.slice(0, lineStart) + nextBlock + value.slice(lineEnd);
  return { next, selStart: lineStart, selEnd: lineStart + nextBlock.length };
}

export function NotesWidget({
  size,
  preview,
}: {
  size: 'S' | 'M' | 'L';
  preview?: boolean;
}) {
  const legacyNotes = useStore((s) => s.settings.homeNotes);
  const patchSettings = useStore((s) => s.patchSettings);

  const [notes, setNotes] = useState<NoteRecord[]>(preview ? PREVIEW_NOTES : []);
  const [activeId, setActiveId] = useState<string | null>(preview ? PREVIEW_NOTES[0]?.id ?? null : null);
  const [draft, setDraft] = useState(preview ? PREVIEW_NOTES[0]?.body ?? '' : '');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(!preview);
  const [saving, setSaving] = useState(false);
  const [showList, setShowList] = useState(size !== 'S');
  const [pendingDelete, setPendingDelete] = useState<NoteRecord | null>(null);

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  const activeRef = useRef(activeId);

  draftRef.current = draft;
  activeRef.current = activeId;

  const narrow = size === 'S';
  const listVisible = narrow ? showList : true;
  const editorVisible = narrow ? !showList : true;

  const activeNote = notes.find((n) => n.id === activeId) ?? null;

  const refreshList = useCallback(async (q?: string) => {
    const list = await notesList(q);
    setNotes(list);
    return list;
  }, []);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let list = await notesList();
      if (!list.length && legacyNotes.trim()) {
        const migrated = await notesMigrateLegacy(legacyNotes);
        if (migrated.migrated) {
          patchSettings({ homeNotes: '' });
          list = migrated.notes;
        }
      }
      if (cancelled) return;
      setNotes(list);
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
  }, [preview, legacyNotes, patchSettings]);

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
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === updated.id ? updated : n));
        return [...next].sort((a, b) => b.updatedAt - a.updatedAt);
      });
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

  const selectNote = (note: NoteRecord) => {
    if (preview) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      void flushSave();
    }
    setActiveId(note.id);
    setDraft(note.body);
    if (narrow) setShowList(false);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    const id = activeId;
    if (!id) return;
    const title = noteTitleFromBody(value);
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, body: value, title, updatedAt: Date.now() } : n)),
    );
    scheduleSave();
  };

  const addNote = async () => {
    if (preview) return;
    const created = await notesCreate('');
    if (!created) return;
    setNotes((prev) => [created, ...prev]);
    setActiveId(created.id);
    setDraft('');
    if (narrow) setShowList(false);
    requestAnimationFrame(() => areaRef.current?.focus());
  };

  const confirmDelete = () => {
    if (preview || !activeNote) return;
    const snapshot = { ...activeNote };
    setPendingDelete(snapshot);
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
    setNotes((prev) => [pendingDelete, ...prev].sort((a, b) => b.updatedAt - a.updatedAt));
    setActiveId(pendingDelete.id);
    setDraft(pendingDelete.body);
    setPendingDelete(null);
  };

  const format = (kind: 'bold' | 'list' | 'check') => {
    const el = areaRef.current;
    if (!el || preview) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    let result: { next: string; selStart: number; selEnd: number };
    if (kind === 'bold') {
      result = applyWrap(value, start, end, '**', '**', 'tekst');
    } else if (kind === 'list') {
      result = prefixLines(value, start, end, '- ');
    } else {
      result = prefixLines(value, start, end, '- [ ] ');
    }
    onDraftChange(result.next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.selStart, result.selEnd);
    });
  };

  if (loading && !preview) {
    return (
      <div className={`hw-notes-editor hw-size-${size}`}>
        <div className="hw-notes-muted">Ładowanie notatek…</div>
      </div>
    );
  }

  const empty = !preview && notes.length === 0 && !query.trim();

  return (
    <div className={`hw-notes-editor hw-size-${size}${narrow ? ' is-narrow' : ''}`}>
      {pendingDelete && !preview && (
        <div className="hw-notes-undo" role="status">
          <span>Usunięto „{pendingDelete.title}”</span>
          <button type="button" className="hw-notes-undo-btn" onClick={undoDelete}>
            <Undo2 size={14} />
            Cofnij
          </button>
        </div>
      )}

      <div className="hw-notes-shell">
        {listVisible && (
          <aside className="hw-notes-list-pane" aria-label="Lista notatek">
            <div className="hw-notes-list-head">
              <div className="hw-notes-search">
                <Search size={14} aria-hidden />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Szukaj…"
                  spellCheck={false}
                  disabled={preview}
                  aria-label="Szukaj notatek"
                />
              </div>
              {!preview && (
                <button type="button" className="hw-icon-btn" title="Nowa notatka" onClick={() => void addNote()}>
                  <Plus size={16} />
                </button>
              )}
            </div>
            {empty ? (
              <WidgetEmpty icon={StickyNote} text="Brak notatek — utwórz pierwszą." />
            ) : (
              <ul className="hw-notes-list">
                {(preview ? PREVIEW_NOTES : notes).map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={n.id === activeId ? 'on' : ''}
                      onClick={() => selectNote(n)}
                      disabled={preview}
                    >
                      <span className="hw-notes-list-title">{n.title}</span>
                      <span className="hw-notes-list-snippet">
                        {n.body.split(/\r?\n/).slice(1, 3).join(' · ') || ' '}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}

        {editorVisible && (
          <div className="hw-notes-editor-pane">
            {narrow && (
              <button
                type="button"
                className="hw-notes-back"
                onClick={() => setShowList(true)}
                disabled={preview}
              >
                ← Notatki
              </button>
            )}
            {!activeNote && !preview ? (
              <WidgetEmpty icon={StickyNote} text="Wybierz notatkę lub utwórz nową." />
            ) : (
              <>
                <div className="hw-notes-toolbar">
                  <button type="button" className="hw-notes-tool" title="Pogrubienie" disabled={preview} onClick={() => format('bold')}>
                    <Bold size={14} />
                  </button>
                  <button type="button" className="hw-notes-tool" title="Lista" disabled={preview} onClick={() => format('list')}>
                    <List size={14} />
                  </button>
                  <button type="button" className="hw-notes-tool" title="Checkbox" disabled={preview} onClick={() => format('check')}>
                    <CheckSquare size={14} />
                  </button>
                  <span className="hw-notes-toolbar-spacer" />
                  <span className="hw-notes-save-hint">{saving ? 'Zapisywanie…' : preview ? '' : 'Autosave'}</span>
                  {!preview && activeNote && (
                    <button type="button" className="hw-notes-tool danger" title="Usuń notatkę" onClick={confirmDelete}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <textarea
                  ref={areaRef}
                  className="hw-notes-body"
                  value={preview ? PREVIEW_NOTES[0]?.body ?? draft : draft}
                  readOnly={preview}
                  onChange={(e) => onDraftChange(e.target.value)}
                  placeholder="Pierwsza linia = tytuł…"
                  spellCheck
                  aria-label="Treść notatki"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
