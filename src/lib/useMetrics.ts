import { useEffect, useRef, useState } from 'react';
import type { MetricsGuest, MetricsPayload } from './metricsTypes';

let refCount = 0;
let unsubPush: (() => void) | null = null;
let latest: MetricsPayload | null = null;
const listeners = new Set<(p: MetricsPayload | null) => void>();

function emit(p: MetricsPayload | null) {
  latest = p;
  for (const l of listeners) l(p);
}

async function acquire() {
  refCount += 1;
  if (refCount === 1) {
    unsubPush = window.shell?.onMetrics?.((payload) => {
      emit(payload as MetricsPayload);
    }) ?? null;
    await window.shell?.metricsSubscribe?.();
  }
}

async function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0) {
    unsubPush?.();
    unsubPush = null;
    await window.shell?.metricsUnsubscribe?.();
  }
}

/** Shared live metrics — only samples in main while ≥1 consumer is mounted. */
export function useMetrics(active: boolean, lowPower = false) {
  const [data, setData] = useState<MetricsPayload | null>(() => (active ? latest : null));
  const activeRef = useRef(active);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      setData(null);
      return;
    }
    const on = (p: MetricsPayload | null) => {
      if (activeRef.current) setData(p);
    };
    listeners.add(on);
    if (latest) setData(latest);
    void acquire();
    void window.shell?.metricsLowPower?.(lowPower);
    return () => {
      listeners.delete(on);
      void release();
    };
  }, [active, lowPower]);

  return data;
}

export function useMetricsGuests(active: boolean, guests: MetricsGuest[]) {
  const key = active
    ? guests.map((g) => `${g.id}:${g.webContentsId ?? ''}`).join('|')
    : '';

  useEffect(() => {
    if (!active) return;
    void window.shell?.metricsSetGuests?.(guests);
  }, [active, key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export async function metricsOnce(): Promise<MetricsPayload | null> {
  const snap = await window.shell?.metricsSnapshot?.();
  if (snap && 'system' in snap) {
    emit(snap as MetricsPayload);
    return snap as MetricsPayload;
  }
  return null;
}

export function getLatestMetrics() {
  return latest;
}
