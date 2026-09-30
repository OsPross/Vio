/** Per-window chrome mode (not persisted). Set by shell:window-boot. */
export type WindowChromeMode = 'normal' | 'private' | 'tor';

let mode: WindowChromeMode = 'normal';
let partition: string | null = null;
const listeners = new Set<() => void>();

export function getWindowMode(): WindowChromeMode {
  return mode;
}

export function getWindowPartition(): string | null {
  return partition;
}

export function isPrivateWindow(): boolean {
  return mode === 'private';
}

export function isTorWindow(): boolean {
  return mode === 'tor';
}

export function setWindowBoot(next: { mode?: string; partition?: string | null }) {
  const m = next.mode === 'private' || next.mode === 'tor' ? next.mode : 'normal';
  mode = m;
  partition = typeof next.partition === 'string' ? next.partition : null;
  listeners.forEach((fn) => fn());
}

export function subscribeWindowBoot(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
