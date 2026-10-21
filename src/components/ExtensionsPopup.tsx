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
  hasPopup?: boolean;
  chromeId?: string;
  electronId?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onManage: () => void;
  tabId?: number | null;
  partition?: string;
};

export function ExtensionsPopup({ open, onClose, onManage }: Props) {
  const t = useT();
  const [rows, setRows] = useState<ExtRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
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
    setErr(null);
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

  const openExt = async (ext: ExtRow, el: HTMLElement) => {
    setErr(null);
    setBusyId(ext.id);
    try {
      const rect = el.getBoundingClientRect();
      const res = await window.shell?.extensionsOpenAction?.(ext.id, {
        anchorRect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      });
      await reload();
      if (!res?.ok) {
        setErr(res?.error || t('chrome.extOpenFailed'));
        return;
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('chrome.extOpenFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const displayName = (ext: ExtRow) => {
    if (!ext.name || ext.name.startsWith('__MSG_')) return ext.chromeId || ext.id;
    return ext.name;
  };

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

          {err ? <p className="ext-menu-err">{err}</p> : null}

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
                  <button
                    type="button"
                    className="ext-menu-open"
                    disabled={busyId === ext.id}
                    title={t('chrome.openExtension', { name: displayName(ext) })}
                    onClick={(e) => {
                      void openExt(ext, e.currentTarget);
                    }}
                  >
                    <span className="ext-menu-ico" aria-hidden>
                      {ext.icon ? (
                        <img src={ext.icon} alt="" width={18} height={18} />
                      ) : (
                        <Puzzle size={14} strokeWidth={1.5} />
                      )}
                    </span>
                    <div className="ext-menu-meta">
                      <strong title={displayName(ext)}>
                        {displayName(ext)}
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
                        {busyId === ext.id
                          ? ` · ${t('chrome.extOpening')}`
                          : ` · ${t('chrome.extClickToOpen')}`}
                      </span>
                    </div>
                  </button>
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
                        ? t('chrome.disableExtension', { name: displayName(ext) })
                        : t('chrome.enableExtension', { name: displayName(ext) })
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
