import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Archive, RotateCcw, Trash2, X } from 'lucide-react';
import { useT } from '../i18n';
import { isMotionOff, popupTransition } from '../lib/motionPresets';
import {
  clearTabArchive,
  restoreAllArchivedTabs,
  restoreArchivedTab,
  type ArchivedTabEntry,
} from '../lib/tabArchive';
import { useStore } from '../store';

function formatWhen(ts: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pl-PL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function TabArchiveOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const motionOff = isMotionOff(settings);
  const popMotion = popupTransition(motionOff);
  const [entries, setEntries] = useState<ArchivedTabEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const res = await window.shell?.tabArchiveList?.();
    setEntries((res?.entries as ArchivedTabEntry[]) || []);
  }, []);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  const onRestore = async (entry: ArchivedTabEntry) => {
    setBusy(true);
    try {
      await restoreArchivedTab(entry);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const onRestoreAll = async () => {
    setBusy(true);
    try {
      await restoreAllArchivedTabs();
      await reload();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const onClear = async () => {
    setBusy(true);
    try {
      await clearTabArchive();
      setEntries([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="mx-overlay"
          role="dialog"
          aria-label={t('archive.title')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: motionOff ? 0.06 : 0.12 } }}
          transition={{ duration: motionOff ? 0.08 : 0.14 }}
        >
          <button
            type="button"
            className="mx-overlay-backdrop"
            aria-label={t('common.close')}
            onClick={onClose}
          />
          <motion.div
            className="mx-overlay-panel motion-popup ta-panel"
            initial={popMotion.initial}
            animate={popMotion.animate}
            exit={popMotion.exit}
            transition={popMotion.transition}
            style={{ transformOrigin: 'center center' }}
          >
            <header className="mx-overlay-head">
              <div>
                <strong>{t('archive.title')}</strong>
                <span>{t('archive.hint')}</span>
              </div>
              <button type="button" className="icon-btn" onClick={onClose} title={t('common.close')}>
                <X size={16} strokeWidth={1.75} />
              </button>
            </header>
            <div className="mx-overlay-body ta-body">
              {entries.length === 0 ? (
                <p className="ta-empty">{t('archive.empty')}</p>
              ) : (
                <ul className="ta-list">
                  {entries.map((e) => (
                    <li key={e.id} className="ta-row">
                      <button
                        type="button"
                        className="ta-row-main"
                        disabled={busy}
                        onClick={() => void onRestore(e)}
                        title={t('archive.restoreOne')}
                      >
                        {e.favicon ? (
                          <img className="ta-fav" src={e.favicon} alt="" width={16} height={16} />
                        ) : (
                          <Archive size={14} strokeWidth={1.75} className="ta-fav-fallback" />
                        )}
                        <span className="ta-text">
                          <span className="ta-title">{e.title || e.url}</span>
                          <span className="ta-url">{e.url}</span>
                          <span className="ta-when">
                            {formatWhen(e.archivedAt, settings.uiLocale || 'pl')}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        className="icon-btn ta-restore-btn"
                        disabled={busy}
                        title={t('archive.restoreOne')}
                        onClick={() => void onRestore(e)}
                      >
                        <RotateCcw size={14} strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <footer className="ta-foot">
              <button
                type="button"
                className="sbtn"
                disabled={busy || entries.length === 0}
                onClick={() => void onRestoreAll()}
              >
                {t('archive.restoreAll')}
              </button>
              <button
                type="button"
                className="sbtn text"
                disabled={busy || entries.length === 0}
                onClick={() => void onClear()}
              >
                <Trash2 size={14} strokeWidth={1.75} />
                {t('archive.clear')}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
