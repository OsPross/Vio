import { useCallback, useEffect, useRef, useState } from 'react';
import type { LinkPreviewTarget } from '../features/tabs/LinkPreviewPopover';

const CLOSE_MS = 200;

export function useLinkPreview(enabled: boolean) {
  const [target, setTarget] = useState<LinkPreviewTarget | null>(null);
  const closeTimer = useRef<number | null>(null);
  const holdRef = useRef(false);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearCloseTimer();
    holdRef.current = false;
    setTarget(null);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      if (!holdRef.current) setTarget(null);
    }, CLOSE_MS);
  }, [clearCloseTimer]);

  const show = useCallback(
    (next: LinkPreviewTarget) => {
      if (!enabled) return;
      clearCloseTimer();
      setTarget(next);
    },
    [enabled, clearCloseTimer],
  );

  const onHoldChange = useCallback(
    (hold: boolean) => {
      holdRef.current = hold;
      if (hold) clearCloseTimer();
      else scheduleClose();
    },
    [clearCloseTimer, scheduleClose],
  );

  useEffect(() => {
    if (!enabled) close();
  }, [enabled, close]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, [clearCloseTimer]);

  return {
    target,
    show,
    close,
    scheduleClose,
    onHoldChange,
  };
}
