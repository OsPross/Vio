import { useCallback, useEffect } from 'react';
import type { WebviewEl } from '../features/tabs';
import { useStore } from '../store';

export type UsePageActionsArgs = {
  guestWc: Record<string, number>;
  currentView: () => WebviewEl | null;
};

export type UsePageActionsResult = {
  saveActivePage: () => void;
  saveActivePdf: () => void;
  printActivePage: () => void;
};

export function usePageActions({
  guestWc,
  currentView,
}: UsePageActionsArgs): UsePageActionsResult {
  const saveActivePage = useCallback(() => {
    const id = useStore.getState().activeId;
    const wcId = guestWc[id];
    if (typeof wcId !== 'number') return;
    void window.shell?.savePage?.(wcId);
  }, [guestWc]);

  const saveActivePdf = useCallback(() => {
    const id = useStore.getState().activeId;
    const wcId = guestWc[id];
    if (typeof wcId !== 'number') return;
    void window.shell?.printToPdf?.(wcId);
  }, [guestWc]);

  const printActivePage = useCallback(() => {
    const id = useStore.getState().activeId;
    const wcId = guestWc[id];
    if (typeof wcId === 'number' && window.shell?.printPage) {
      void window.shell.printPage(wcId);
      return;
    }
    try {
      currentView()?.print?.();
    } catch {
      void currentView()?.executeJavaScript?.('window.print()');
    }
  }, [guestWc, currentView]);

  useEffect(() => {
    const onSave = () => saveActivePage();
    window.addEventListener('djxxr-save-page', onSave);
    return () => window.removeEventListener('djxxr-save-page', onSave);
  }, [saveActivePage]);

  return { saveActivePage, saveActivePdf, printActivePage };
}
