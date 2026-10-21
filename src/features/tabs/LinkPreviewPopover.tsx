import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ExternalLink, X } from 'lucide-react';
import { useT } from '../../i18n';
import { isMotionOff, popupTransition } from '../../lib/motionPresets';
import { useStore } from '../../store';

export type LinkPreviewTarget = {
  url: string;
  x: number;
  y: number;
  partition: string;
};

const POP_W = 480;
const POP_H = 360;

function placeNearCursor(x: number, y: number) {
  const PAD = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + 16;
  let top = y + 16;
  if (left + POP_W > vw - PAD) left = Math.max(PAD, x - POP_W - 16);
  if (top + POP_H > vh - PAD) top = Math.max(PAD, vh - POP_H - PAD);
  if (left < PAD) left = PAD;
  if (top < PAD) top = PAD;
  return { left, top };
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function LinkPreviewPopover({
  target,
  onClose,
  onOpenTab,
  onHoldChange,
}: {
  target: LinkPreviewTarget | null;
  onClose: () => void;
  onOpenTab: (url: string) => void;
  onHoldChange: (hold: boolean) => void;
}) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const reduced = isMotionOff(settings);
  const popMotion = popupTransition(reduced);
  const webRef = useRef<HTMLElement | null>(null);
  const wcIdRef = useRef<number | null>(null);
  const [title, setTitle] = useState('');

  useEffect(() => {
    if (!target) {
      setTitle('');
      return;
    }
    setTitle('');
  }, [target?.url]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
    };
  }, [target, onClose]);

  useEffect(() => {
    return () => {
      const id = wcIdRef.current;
      if (id != null) void window.shell?.linkPreviewUnregister?.(id);
      wcIdRef.current = null;
    };
  }, []);

  const bindRef = (node: HTMLElement | null) => {
    webRef.current = node;
    if (!node || !target) return;
    const el = node as HTMLElement & {
      src: string;
      setAudioMuted?: (m: boolean) => void;
      getWebContentsId?: () => number;
      addEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
      removeEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
    };
    const flag = el as unknown as { __djxxrPreviewInit?: boolean };
    if (flag.__djxxrPreviewInit) return;
    flag.__djxxrPreviewInit = true;
    const url = target.url;

    const mute = () => {
      try {
        el.setAudioMuted?.(true);
      } catch {
        /* */
      }
    };
    const registerThenLoad = () => {
      try {
        const id = el.getWebContentsId?.();
        if (typeof id === 'number' && id > 0) {
          wcIdRef.current = id;
          void window.shell?.linkPreviewRegister?.(id);
        }
      } catch {
        /* */
      }
      mute();
      try {
        if (!el.src) el.src = url;
      } catch {
        /* */
      }
    };
    const onTitle = (raw: unknown) => {
      const ev = raw as { title?: string };
      if (typeof ev?.title === 'string' && ev.title) setTitle(ev.title);
    };
    // Register before navigation so wire-guest history skip applies
    el.addEventListener('did-attach', registerThenLoad);
    el.addEventListener('dom-ready', registerThenLoad);
    el.addEventListener('did-finish-load', mute);
    el.addEventListener('page-title-updated', onTitle);
  };

  const pos = target ? placeNearCursor(target.x, target.y) : { left: 0, top: 0 };

  return createPortal(
    <AnimatePresence>
      {target && (
        <motion.div
          key={target.url}
          className="link-preview-pop motion-popup"
          role="dialog"
          aria-label={t('linkPreview.aria')}
          initial={popMotion.initial}
          animate={popMotion.animate}
          exit={popMotion.exit}
          transition={popMotion.transition}
          style={{ left: pos.left, top: pos.top, width: POP_W, height: POP_H }}
          onMouseEnter={() => onHoldChange(true)}
          onMouseLeave={() => onHoldChange(false)}
        >
          <header className="link-preview-head">
            <div className="link-preview-meta">
              <strong>{title || domainOf(target.url)}</strong>
              <span>{domainOf(target.url)}</span>
            </div>
            <div className="link-preview-actions">
              <button
                type="button"
                className="link-preview-open"
                onClick={() => {
                  onOpenTab(target.url);
                  onClose();
                }}
              >
                <ExternalLink size={13} strokeWidth={2} />
                {t('linkPreview.openTab')}
              </button>
              <button
                type="button"
                className="link-preview-x"
                aria-label={t('linkPreview.close')}
                onClick={onClose}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          </header>
          <div className="link-preview-body">
            <webview
              ref={bindRef as unknown as React.Ref<HTMLElement>}
              className="link-preview-webview"
              partition={target.partition}
              webpreferences="contextIsolation=yes,sandbox=yes,nativeWindowOpen=no,spellcheck=no"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
