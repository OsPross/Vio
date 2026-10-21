import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wraps <browser-action-list> and hides actions that are not pinned
 * (pin state lives in djxxr-extensions.json via shell.extensionsList).
 */
export function ExtToolbarActions({
  partition,
  tab,
}: {
  partition: string;
  tab: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const refreshPinned = useCallback(async () => {
    try {
      const res = await window.shell?.extensionsList?.();
      const next = new Set<string>();
      if (res?.ok && Array.isArray(res.extensions)) {
        for (const ext of res.extensions) {
          if (!ext?.enabled || !ext?.pinned) continue;
          const ids = [ext.id, ext.chromeId, ext.electronId].filter(Boolean) as string[];
          for (const id of ids) next.add(String(id).toLowerCase());
        }
      }
      setPinnedIds(next);
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    void refreshPinned();
    const t = window.setInterval(() => void refreshPinned(), 2500);
    return () => window.clearInterval(t);
  }, [refreshPinned]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const host = wrap.querySelector('browser-action-list') as HTMLElement | null;
    if (!host) return;

    const apply = () => {
      const root = host.shadowRoot;
      if (!root) return;
      for (const node of Array.from(root.querySelectorAll('.action'))) {
        const el = node as HTMLElement;
        const id = String(el.id || '').toLowerCase();
        const show = Boolean(id && pinnedIds.has(id));
        el.style.display = show ? '' : 'none';
      }
    };

    apply();
    const mo = new MutationObserver(apply);
    const start = () => {
      if (host.shadowRoot) {
        mo.observe(host.shadowRoot, { childList: true, subtree: true });
        apply();
      }
    };
    start();
    const t = window.setTimeout(start, 200);
    return () => {
      window.clearTimeout(t);
      mo.disconnect();
    };
  }, [pinnedIds, partition, tab]);

  return (
    <div ref={wrapRef} className="ext-browser-actions-wrap">
      <browser-action-list
        className="ext-browser-actions"
        partition={partition}
        tab={tab}
        alignment="bottom left"
      />
    </div>
  );
}
