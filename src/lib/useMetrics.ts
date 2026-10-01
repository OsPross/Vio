import { useEffect, useRef, useState } from 'react';
import type { MetricsGuest, MetricsPayload } from './metricsTypes';

let liveRefCount = 0;
let discardRefCount = 0;
let unsubPush: (() => void) | null = null;
let latest: MetricsPayload | null = null;
const listeners = new Set<(p: MetricsPayload | null) => void>();

function payloadKey(p: MetricsPayload | null) {
  if (!p) return '';
  return JSON.stringify({
    sysCpu: Math.round(p.system?.cpu ?? 0),
    sysMem: Math.round(p.system?.memPercent ?? 0),
    appCpu: Math.round(p.browser?.cpu ?? 0),
    appMem: Math.round(p.browser?.memMb ?? 0),
    rows: (p.rows || []).map((r) => [r.id, Math.round(r.cpu), Math.round(r.memMb ?? 0)]),
  });
}

function emit(p: MetricsPayload | null) {
  if (p && latest && payloadKey(p) === payloadKey(latest)) {
    latest = p;
    return;
  }
  latest = p;
  for (const l of listeners) l(p);
}

async function ensurePushChannel() {
  if (unsubPush) return;
  unsubPush =
    window.shell?.onMetrics?.((payload) => {
      emit(payload as MetricsPayload);
    }) ?? null;
}

/** Serialize IPC so StrictMode unsub/sub cannot desync main watchers. */
let ipcGate: Promise<void> = Promise.resolve();
let liveSubscribed = false;
let discardSubscribed = false;

function enqueueIpc(fn: () => Promise<void>) {
  ipcGate = ipcGate.then(fn, fn);
  return ipcGate;
}

async function syncLiveSub() {
  await ensurePushChannel();
  if (liveRefCount > 0 && !liveSubscribed) {
    if (window.shell?.metricsSubscribeLive) await window.shell.metricsSubscribeLive();
    else await window.shell?.metricsSubscribe?.();
    liveSubscribed = true;
    await metricsOnce();
  } else if (liveRefCount === 0 && liveSubscribed) {
    if (window.shell?.metricsUnsubscribeLive) await window.shell.metricsUnsubscribeLive();
    else await window.shell?.metricsUnsubscribe?.();
    liveSubscribed = false;
    if (!discardSubscribed) {
      unsubPush?.();
      unsubPush = null;
    }
  } else if (liveRefCount > 0 && !latest) {
    await metricsOnce();
  }
}

async function syncDiscardSub() {
  await ensurePushChannel();
  if (discardRefCount > 0 && !discardSubscribed) {
    await window.shell?.metricsSubscribeDiscard?.();
    discardSubscribed = true;
    await metricsOnce();
  } else if (discardRefCount === 0 && discardSubscribed) {
    await window.shell?.metricsUnsubscribeDiscard?.();
    discardSubscribed = false;
    if (!liveSubscribed) {
      unsubPush?.();
      unsubPush = null;
    }
  }
}

async function acquireLive() {
  liveRefCount += 1;
  await enqueueIpc(syncLiveSub);
}

async function releaseLive() {
  liveRefCount = Math.max(0, liveRefCount - 1);
  await enqueueIpc(syncLiveSub);
}

async function acquireDiscard() {
  discardRefCount += 1;
  await enqueueIpc(syncDiscardSub);
}

async function releaseDiscard() {
  discardRefCount = Math.max(0, discardRefCount - 1);
  await enqueueIpc(syncDiscardSub);
}

/**
 * Shared metrics.
 * mode 'live' = task mgr / widgets (≈2s); 'discard' = hot-tab hints (≈15s).
 * UI setState only when rounded values change.
 */
export function useMetrics(active: boolean, lowPower = false, mode: 'live' | 'discard' = 'live') {
  const [data, setData] = useState<MetricsPayload | null>(() => (active ? latest : null));
  const activeRef = useRef(active);
  const lastKeyRef = useRef('');

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      setData(null);
      lastKeyRef.current = '';
      return;
    }
    const on = (p: MetricsPayload | null) => {
      if (!activeRef.current) return;
      const key = payloadKey(p);
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      setData(p);
    };
    listeners.add(on);
    if (latest) {
      lastKeyRef.current = payloadKey(latest);
      setData(latest);
    }
    if (mode === 'live') {
      void acquireLive();
      void window.shell?.metricsLowPower?.(lowPower);
    } else {
      void acquireDiscard();
    }
    return () => {
      listeners.delete(on);
      if (mode === 'live') void releaseLive();
      else void releaseDiscard();
    };
  }, [active, lowPower, mode]);

  return data;
}

export function useMetricsGuests(active: boolean, guests: MetricsGuest[]) {
  const key = active ? guests.map((g) => `${g.id}:${g.webContentsId ?? ''}`).join('|') : '';

  useEffect(() => {
    if (!active) return;
    void window.shell?.metricsSetGuests?.(guests);
  }, [active, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export async function metricsOnce(): Promise<MetricsPayload | null> {
  try {
    const snap = await window.shell?.metricsSnapshot?.();
    if (snap && 'system' in snap) {
      emit(snap as MetricsPayload);
      return snap as MetricsPayload;
    }
  } catch {
    /* */
  }
  return null;
}

export function getLatestMetrics() {
  return latest;
}

/** Force re-subscribe + snapshot (task manager retry). */
export async function metricsRetry(): Promise<MetricsPayload | null> {
  await enqueueIpc(async () => {
    if (liveRefCount > 0) {
      if (liveSubscribed) {
        if (window.shell?.metricsUnsubscribeLive) await window.shell.metricsUnsubscribeLive();
        else await window.shell?.metricsUnsubscribe?.();
        liveSubscribed = false;
      }
      await syncLiveSub();
    } else if (discardRefCount > 0) {
      if (discardSubscribed) {
        await window.shell?.metricsUnsubscribeDiscard?.();
        discardSubscribed = false;
      }
      await syncDiscardSub();
    } else {
      await metricsOnce();
    }
  });
  return latest;
}
