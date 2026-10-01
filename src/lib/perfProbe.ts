/** Perf measurement probe — active only with PERF_BENCH (via shell.perfBench). */

type Bucket = { id: string; count: number; actualDuration: number };

const buckets = new Map<string, Bucket>();

export function isPerfBenchEnabled() {
  try {
    if (typeof window === 'undefined') return false;
    return Boolean((window as unknown as { shell?: { perfBench?: boolean } }).shell?.perfBench);
  } catch {
    return false;
  }
}

export function perfReset() {
  buckets.clear();
}

export function perfOnRender(id: string, actualDuration: number) {
  if (!isPerfBenchEnabled()) return;
  const cur = buckets.get(id) || { id, count: 0, actualDuration: 0 };
  cur.count += 1;
  cur.actualDuration += actualDuration;
  buckets.set(id, cur);
}

export function perfSnapshot() {
  const list = [...buckets.values()].sort((a, b) => b.count - a.count);
  return {
    at: Date.now(),
    totalRenders: list.reduce((a, b) => a + b.count, 0),
    components: list.slice(0, 40),
  };
}

export function installPerfGlobals() {
  if (typeof window === 'undefined') return;
  if (!isPerfBenchEnabled()) return;
  try {
    performance.mark('djxxr-renderer-boot');
  } catch {
    /* */
  }
  (window as unknown as { __DJXXR_PERF__?: object }).__DJXXR_PERF__ = {
    enabled: true,
    reset: perfReset,
    snapshot: perfSnapshot,
    onRender: perfOnRender,
  };
}
