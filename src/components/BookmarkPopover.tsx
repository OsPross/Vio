import { useEffect, useId, useRef, useState } from 'react';
import { BOOKMARKS_BAR_FOLDER_ID, useStore } from '../store';
import { Select } from './ui/Select';

type Props = {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
};

export function BookmarkPopover({ open, onClose, url, title, anchorRef }: Props) {
  const popId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const folders = useStore((s) => s.bookmarkFolders);
  const existing = useStore((s) => s.bookmarks.find((b) => b.url === url));
  const addBookmark = useStore((s) => s.addBookmark);
  const updateBookmark = useStore((s) => s.updateBookmark);
  const removeBookmark = useStore((s) => s.removeBookmark);

  const [draftTitle, setDraftTitle] = useState(title);
  const [folderId, setFolderId] = useState<string | undefined>(BOOKMARKS_BAR_FOLDER_ID);

  useEffect(() => {
    if (!open) return;
    setDraftTitle(existing?.title || title);
    setFolderId(existing?.folderId ?? BOOKMARKS_BAR_FOLDER_ID);
  }, [open, existing, title]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef?.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const save = () => {
    const t = draftTitle.trim() || url;
    if (existing) {
      updateBookmark(existing.id, { title: t, folderId });
    } else {
      addBookmark({ title: t, url, folderId });
    }
    onClose();
  };

  const remove = () => {
    if (existing) removeBookmark(existing.id);
    onClose();
  };

  return (
    <div className="bookmark-popover" ref={panelRef} role="dialog" aria-labelledby={popId}>
      <h2 id={popId}>{existing ? 'Edytuj zakładkę' : 'Dodaj zakładkę'}</h2>
      <label className="bookmark-field">
        <span>Tytuł</span>
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              save();
            }
          }}
        />
      </label>
      <label className="bookmark-field">
        <span>Folder</span>
        <Select
          aria-label="Folder zakładki"
          value={folderId ?? ''}
          onChange={(v) => setFolderId(v || undefined)}
          options={folders.map((f) => ({ value: f.id, label: f.title }))}
        />
      </label>
      <p className="bookmark-pop-url muted" title={url}>
        {url}
      </p>
      <div className="bookmark-pop-actions">
        {existing ? (
          <button type="button" className="sbtn danger-text" onClick={remove}>
            Usuń
          </button>
        ) : (
          <span />
        )}
        <div className="bookmark-pop-actions-right">
          <button type="button" className="sbtn ghost" onClick={onClose}>
            Anuluj
          </button>
          <button type="button" className="sbtn primary" onClick={save}>
            {existing ? 'Zapisz' : 'Dodaj'}
          </button>
        </div>
      </div>
    </div>
  );
}
