import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { folderTitleById, suggestFolderByDomain } from '../lib/bookmarkFolderSuggest';
import { BOOKMARKS_BAR_FOLDER_ID, useStore } from '../store';
import { Select } from './ui/Select';

type Props = {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
  anchorRef?: React.RefObject<HTMLElement | null>;
  /** Tor / private window — confirm before writing to disk */
  sensitiveSession?: boolean;
};

export function BookmarkPopover({
  open,
  onClose,
  url,
  title,
  anchorRef,
  sensitiveSession,
}: Props) {
  const t = useT();
  const popId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const folders = useStore((s) => s.bookmarkFolders);
  const bookmarks = useStore((s) => s.bookmarks);
  const existing = useStore((s) => s.bookmarks.find((b) => b.url === url));
  const addBookmark = useStore((s) => s.addBookmark);
  const updateBookmark = useStore((s) => s.updateBookmark);
  const removeBookmark = useStore((s) => s.removeBookmark);

  const suggested = useMemo(
    () => suggestFolderByDomain(url, bookmarks, folders, BOOKMARKS_BAR_FOLDER_ID),
    [url, bookmarks, folders],
  );

  const [draftTitle, setDraftTitle] = useState(title);
  const [folderId, setFolderId] = useState<string | undefined>(BOOKMARKS_BAR_FOLDER_ID);

  useEffect(() => {
    if (!open) return;
    setDraftTitle(existing?.title || title);
    setFolderId(existing?.folderId ?? suggested ?? BOOKMARKS_BAR_FOLDER_ID);
  }, [open, existing, title, suggested]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
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

  const hintFolder =
    !existing && suggested && suggested !== BOOKMARKS_BAR_FOLDER_ID
      ? folderTitleById(folders, suggested)
      : '';

  const save = () => {
    if (sensitiveSession && !existing) {
      const ok = window.confirm(t('bookmarks.sensitiveConfirm'));
      if (!ok) return;
    }
    const nextTitle = draftTitle.trim() || url;
    if (existing) {
      updateBookmark(existing.id, { title: nextTitle, folderId });
    } else {
      addBookmark({ title: nextTitle, url, folderId });
    }
    onClose();
  };

  const remove = () => {
    if (existing) removeBookmark(existing.id);
    onClose();
  };

  return (
    <div className="bookmark-popover" ref={panelRef} role="dialog" aria-labelledby={popId}>
      <h2 id={popId}>{existing ? t('bookmarks.popEdit') : t('bookmarks.popAdd')}</h2>
      <label className="bookmark-field">
        <span>{t('bookmarks.popTitle')}</span>
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
        <span>{t('bookmarks.popFolder')}</span>
        <Select
          aria-label={t('bookmarks.popFolder')}
          value={folderId ?? ''}
          onChange={(v) => setFolderId(v || undefined)}
          options={folders.map((f) => ({ value: f.id, label: f.title }))}
        />
      </label>
      {hintFolder ? (
        <p className="bookmark-pop-hint muted">{t('bookmarks.popDomainHint', { folder: hintFolder })}</p>
      ) : null}
      {sensitiveSession && !existing ? (
        <p className="bookmark-pop-hint muted">{t('bookmarks.sensitiveHint')}</p>
      ) : null}
      <p className="bookmark-pop-url muted" title={url}>
        {url}
      </p>
      <div className="bookmark-pop-actions">
        {existing ? (
          <button type="button" className="sbtn danger-text" onClick={remove}>
            {t('bookmarks.ctxDelete')}
          </button>
        ) : (
          <span />
        )}
        <div className="bookmark-pop-actions-right">
          <button type="button" className="sbtn ghost" onClick={onClose}>
            {t('bookmarks.popCancel')}
          </button>
          <button type="button" className="sbtn primary" onClick={save}>
            {existing ? t('bookmarks.popSave') : t('bookmarks.popAddBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
