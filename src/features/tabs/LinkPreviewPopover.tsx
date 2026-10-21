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
/** Keep popover clear of the link under the cursor. */
const CURSOR_GAP = 28;

function placeNearCursor(x: number, y: number) {
  const PAD = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Prefer right of cursor; if no room, left — never centered on the link.
  let left = x + CURSOR_GAP;
  if (left + POP_W > vw - PAD) left = Math.max(PAD, x - POP_W - CURSOR_GAP);
  let top = y + CURSOR_GAP;
  if (top + POP_H > vh - PAD) top = Math.max(PAD, y - POP_H - CURSOR_GAP);
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

type WebviewEl = HTMLElement & {
  src: string;
  setAudioMuted?: (m: boolean) => void;
  getWebContentsId?: () => number;
  addEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
  removeEventListener: (type: string, listener: (...args: unknown[]) => void) => void;
};

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
  const wcIdRef = useRef<number | null>(null);
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState('');

  useEffect(() => {
    if (!target) {
      setTitle('');
      setStatus('loading');
      setErrorText('');
      return;
    }
    setTitle('');
    setStatus('loading');
    setErrorText('');
  }, [target?.url]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [target, onClose]);

  useEffect(() => {
    return () => {
      const id = wcIdRef.current;
      if (id != null) void window.shell?.linkPreviewUnregister?.(id);
      wcIdRef.current = null;
    };
  }, []);

  const bindRef = (node: HTMLElement | null) => {
    if (!node || !target) return;
    const el = node as unknown as WebviewEl;
    const flag = el as unknown as { __djxxrPreviewInit?: boolean };
    if (flag.__djxxrPreviewInit) return;
    flag.__djxxrPreviewInit = true;

    const mute = () => {
      try {
        el.setAudioMuted?.(true);
      } catch {
        /* */
      }
    };
    const register = () => {
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
    };
    const onTitle = (raw: unknown) => {
      const ev = raw as { title?: string };
      if (typeof ev?.title === 'string' && ev.title) setTitle(ev.title);
    };
    const onFinish = () => {
      mute();
      setStatus('ready');
    };
    const onFail = (raw: unknown) => {
      const ev = raw as {
        errorCode?: number;
        errorDescription?: string;
        isMainFrame?: boolean;
      };
      if (ev.isMainFrame === false) return;
      // -3 = aborted (redirect / supersede)
      if (ev.errorCode === -3) return;
      setStatus('error');
      setErrorText(
        ev.errorDescription || t('linkPreview.loadError', { code: String(ev.errorCode ?? '?') }),
      );
    };
    const onStart = () => setStatus((s) => (s === 'error' ? s : 'loading'));

    el.addEventListener('did-attach', register);
    el.addEventListener('dom-ready', register);
    el.addEventListener('did-start-loading', onStart);
    el.addEventListener('did-finish-load', onFinish);
    el.addEventListener('did-fail-load', onFail);
    el.addEventListener('page-title-updated', onTitle);
    // src is set via attribute — ensure mute even if events already fired
    mute();
    register();
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
            {status === 'loading' && (
              <div className="link-preview-skeleton" aria-busy="true" aria-live="polite">
                <div className="link-preview-skeleton-bar" />
                <div className="link-preview-skeleton-bar short" />
                <div className="link-preview-skeleton-block" />
              </div>
            )}
            {status === 'error' && (
              <div className="link-preview-error" role="alert">
                <p>{errorText || t('linkPreview.loadFailed')}</p>
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
              </div>
            )}
            <webview
              ref={bindRef as unknown as React.Ref<HTMLElement>}
              className={`link-preview-webview${status === 'ready' ? ' is-ready' : ''}`}
              src={target.url}
              partition={target.partition}
              // Custom attr → security will-attach-webview → claimPending (no history)
              {...({ 'data-djxxr-link-preview': '1' } as Record<string, string>)}
              webpreferences="contextIsolation=yes,sandbox=yes,nativeWindowOpen=no,spellcheck=no"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
