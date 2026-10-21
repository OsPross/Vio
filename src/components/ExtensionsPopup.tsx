import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Pin, Puzzle, Settings2, X } from 'lucide-react';
import { Switch } from './ui/Switch';
import { useT } from '../i18n';
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
  icon?: string | null;
  limitedSupport?: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onManage: () => void;
};

export function ExtensionsPopup({ open, onClose, onManage }: Props) {
  const t = useT();
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
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if ((target as Element).closest?.('[data-ext-menu-btn]')) return;
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
          aria-label={t('chrome.extensions')}
          initial={popMotion.initial}
          animate={popMotion.animate}
          exit={popMotion.exit}
          transition={popMotion.transition}
          style={{ transformOrigin: 'top right' }}
        >
          <header className="chrome-flyout-head">
            <div className="chrome-flyout-head-label">
              <Puzzle size={14} strokeWidth={1.75} />
              <strong>{t('chrome.extensions')}</strong>
            </div>
            <button type="button" className="icon-btn sm" onClick={onClose} title={t('common.close')}>
              <X size={14} />
            </button>
          </header>

          {rows.length === 0 ? (
            <div className="chrome-flyout-empty">
              <Puzzle size={22} strokeWidth={1.5} aria-hidden />
              <p>{t('chrome.extensionsEmpty')}</p>
              <span>{t('chrome.extensionsEmptyDesc')}</span>
            </div>
          ) : (
            <ul className="ext-menu-list">
              {rows.map((ext) => (
                <li key={ext.id} className={`ext-menu-row ${ext.enabled ? '' : 'off'}`}>
                  <span className="ext-menu-ico" aria-hidden>
                    {ext.icon ? (
                      <img src={ext.icon} alt="" width={18} height={18} />
                    ) : (
                      <Puzzle size={14} strokeWidth={1.5} />
                    )}
                  </span>
                  <div className="ext-menu-meta">
                    <strong title={ext.name}>
                      {ext.name}
                      {ext.limitedSupport ? (
                        <AlertTriangle
                          size={11}
                          className="ext-menu-warn-ico"
                          aria-label={t('internal.extLimitedSupport')}
                        />
                      ) : null}
                    </strong>
                    <span className="muted">
                      v{ext.version}
                      {ext.manifestVersion ? ` · MV${ext.manifestVersion}` : ''}
                      {ext.loaded ? '' : ext.enabled ? t('chrome.extStarting') : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`icon-btn sm ${ext.pinned ? 'on' : ''}`}
                    title={ext.pinned ? t('chrome.unpinFromBar') : t('chrome.pinToBar')}
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
                    aria-label={
                      ext.enabled
                        ? t('chrome.disableExtension', { name: ext.name })
                        : t('chrome.enableExtension', { name: ext.name })
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          <footer className="chrome-flyout-foot">
            <button
              type="button"
              className="sbtn ghost"
              onClick={() => {
                onClose();
                onManage();
              }}
            >
              <Settings2 size={14} strokeWidth={1.75} />
              {t('chrome.manage')}
            </button>
          </footer>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
