import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, Shield, ShieldOff, Trash2 } from 'lucide-react';
import { Switch } from './ui/Switch';
import { useT } from '../i18n';
import { isMotionOff, popupTransition } from '../lib/motionPresets';
import { useStore } from '../store';

type Props = {
  open: boolean;
  onClose: () => void;
  pageUrl: string;
  blockedToday: number;
  protectionOn: boolean;
  onToggleProtection: (on: boolean) => void;
  onForget: () => void;
};

export function ShieldPanel({
  open,
  onClose,
  pageUrl,
  blockedToday,
  protectionOn,
  onToggleProtection,
  onForget,
}: Props) {
  const t = useT();
  const [blocked, setBlocked] = useState<{ host: string; url: string }[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const settings = useStore((s) => s.settings);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const motionOff = isMotionOff(settings);
  const popMotion = popupTransition(motionOff);
  let host: string;
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    host = pageUrl;
  }

  useEffect(() => {
    if (!open) return;
    setDetailsOpen(false);
    void window.shell?.privacyBlocked?.('global').then((list) => {
      if (Array.isArray(list)) setBlocked(list.slice(0, 80));
    });
  }, [open, blockedToday]);

  useEffect(() => {
    if (!open) return;
    const onPtr = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (
        (target as Element).closest?.('.adblock-btn') ||
        (target as Element).closest?.('.bar-shield-wrap > .icon-btn')
      )
        return;
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

  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of blocked) {
      const h = b.host || '?';
      map.set(h, (map.get(h) || 0) + 1);
    }
    return [...map.entries()]
      .map(([h, count]) => ({ host: h, count }))
      .sort((a, b) => b.count - a.count);
  }, [blocked]);

  const visible = grouped.slice(0, 8);
  const hasMore = grouped.length > 8;
  const protectionLabel = host || t('chrome.protection');

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          className="shield-panel chrome-flyout motion-popup"
          role="dialog"
          aria-label={t('chrome.shieldAria')}
          initial={popMotion.initial}
          animate={popMotion.animate}
          exit={popMotion.exit}
          transition={popMotion.transition}
          style={{ transformOrigin: 'top right' }}
        >
          <header className="chrome-flyout-head chrome-flyout-head-clean">
            <div className="chrome-flyout-head-label">
              {protectionOn ? (
                <Shield size={14} strokeWidth={1.75} />
              ) : (
                <ShieldOff size={14} strokeWidth={1.75} />
              )}
              <strong title={protectionLabel}>{protectionLabel}</strong>
            </div>
          </header>

          <div className="chrome-flyout-body">
            <label className="shield-toggle">
              <Switch
                on={protectionOn}
                onChange={onToggleProtection}
                aria-label={t('chrome.shieldForPage')}
              />
              <span>{t('chrome.shieldForPage')}</span>
            </label>

            <div className="shield-panel-stats shield-panel-stats-quiet">
              <div>
                <em>{t('chrome.shieldToday')}</em>
                <strong>{blockedToday}</strong>
              </div>
              <div>
                <em>{t('chrome.shieldDomains')}</em>
                <strong>{grouped.length}</strong>
              </div>
            </div>

            {(visible.length > 0 || hasMore) && (
              <div className="shield-details">
                <button
                  type="button"
                  className={`shield-details-toggle ${detailsOpen ? 'open' : ''}`}
                  onClick={() => setDetailsOpen((v) => !v)}
                  aria-expanded={detailsOpen}
                >
                  <span>{t('chrome.shieldDetails')}</span>
                  <ChevronDown size={14} strokeWidth={1.75} />
                </button>
                {detailsOpen && (
                  <div className="shield-blocked">
                    <ul>
                      {visible.map((b) => (
                        <li key={b.host} title={b.host}>
                          {b.count > 1 ? `${b.host} ×${b.count}` : b.host}
                        </li>
                      ))}
                    </ul>
                    {hasMore && (
                      <button
                        type="button"
                        className="sbtn text"
                        style={{ marginTop: 6 }}
                        onClick={() => {
                          onClose();
                          setSettingsTab('adblock');
                        }}
                      >
                        {t('chrome.shieldShowAll')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="shield-actions">
              <button type="button" className="sbtn text" onClick={onForget}>
                <Trash2 size={13} strokeWidth={1.75} /> {t('chrome.shieldClearSite')}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
