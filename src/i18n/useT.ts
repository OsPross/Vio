import { useCallback, useEffect } from 'react';
import { useStore } from '../store';
import { setUiLocale, translate, type TParams, type UiLocale } from './core';

/** React hook — re-renders when uiLocale changes. */
export function useT() {
  const locale = useStore((s) => s.settings.uiLocale) || 'pl';
  const resolved: UiLocale = locale === 'en' ? 'en' : 'pl';

  useEffect(() => {
    setUiLocale(resolved);
  }, [resolved]);

  return useCallback(
    (key: string, params?: TParams) => translate(resolved, key, params),
    [resolved],
  );
}

export function useUiLocale(): UiLocale {
  const locale = useStore((s) => s.settings.uiLocale) || 'pl';
  return locale === 'en' ? 'en' : 'pl';
}
