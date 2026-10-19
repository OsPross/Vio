import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Pin, Puzzle, Settings2, X } from 'lucide-react';
import { Switch } from './ui/Switch';
import { isMotionOff, popupTransition } from '../lib/motionPresets';
import { useStore } from '../store';

type ExtRow = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  pinned?: boolean;
  loaded?: boolean;
  manifestVersion?: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onManage: () => void;
};

export function ExtensionsPopup({ open, onClose, onManage }: Props) {
  const [rows, setRows] = useState<ExtRow[]>([]);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const settings = useStore((s) => s.settings);
  const motionOff = isMotionOff(settings);
  const popMotion = popupTransition(motionOff);

  const reload = useCallback(async () => {
    const res = await window.shell?.extensionsList?.();
    if (res?.ok && Array.isArray(res.extensions)) setRows(res.extensions as ExtRow[]);
  }, []);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  useEffect(() => {
    if (!open) return;
    const onPtr = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t)) return;
      if ((t as Element).closest?.('[data-ext-menu-btn]')) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPtr, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onPtr, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          className="ext-menu-panel chrome-flyout motion-popup"
          role="dialog"
          aria-label="Rozszerzenia"
          initial={popMotion.initial}
          animate={popMotion.animate}
          exit={popMotion.exit}
          transition={popMotion.transition}
          style={{ transformOrigin: 'top right' }}
        >
          <header className="ext-menu-head">
            <div className="ext-menu-title">
              <Puzzle size={16} strokeWidth={1.75} />
              <strong>Rozszerzenia</strong>
            </div>
            <button type="button" className="icon-btn sm" onClick={onClose} title="Zamknij">
              <X size={14} />
            </button>
          </header>

          {rows.length === 0 ? (
            <p className="ext-menu-empty muted">
              Brak zainstalowanych rozszerzeń. Zainstalujesz je ze sklepu Chrome albo ze strony
              zarządzania.
            </p>
          ) : (
            <ul className="ext-menu-list">
              {rows.map((ext) => (
                <li key={ext.id} className={`ext-menu-row ${ext.enabled ? '' : 'off'}`}>
                  <div className="ext-menu-meta">
                    <strong title={ext.name}>{ext.name}</strong>
                    <span className="muted">
                      v{ext.version}
                      {ext.manifestVersion ? ` · MV${ext.manifestVersion}` : ''}
                      {ext.loaded ? '' : ext.enabled ? ' · start…' : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`icon-btn sm ${ext.pinned ? 'on' : ''}`}
                    title={ext.pinned ? 'Odepnij z paska' : 'Przypnij na pasek'}
                    disabled={!ext.enabled}
                    onClick={() => {
                      void window.shell
                        ?.extensionsSetPinned?.(ext.id, !ext.pinned)
                        .then(() => reload());
                    }}
                  >
                    <Pin size={13} strokeWidth={1.75} />
                  </button>
                  <Switch
                    on={ext.enabled}
                    onChange={(on) => {
                      void window.shell?.extensionsSetEnabled?.(ext.id, on).then(() => reload());
                    }}
                    aria-label={ext.enabled ? `Wyłącz ${ext.name}` : `Włącz ${ext.name}`}
                  />
                </li>
              ))}
            </ul>
          )}

          <footer className="ext-menu-foot">
            <button
              type="button"
              className="sbtn ghost"
              onClick={() => {
                onClose();
                onManage();
              }}
            >
              <Settings2 size={14} strokeWidth={1.75} />
              Zarządzaj rozszerzeniami
            </button>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
