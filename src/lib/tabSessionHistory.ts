/**
 * In-memory per-tab back/forward chain (includes about:*).
 * Not browsing history — session chrome only; never persisted to disk/Zustand visits.
 */

type SessionEntry = { stack: string[]; index: number };

const byTab = new Map<string, SessionEntry>();

function entry(tabId: string): SessionEntry {
  let e = byTab.get(tabId);
  if (!e) {
    e = { stack: [], index: -1 };
    byTab.set(tabId, e);
  }
  return e;
}

/** Record a navigation to `url` (new entry or sync after webview back/forward). */
export function recordTabSessionUrl(tabId: string, url: string): void {
  if (!tabId || !url) return;
  const e = entry(tabId);
  if (e.index >= 0 && e.stack[e.index] === url) return;
  if (e.index > 0 && e.stack[e.index - 1] === url) {
    e.index -= 1;
    return;
  }
  if (e.index >= 0 && e.index < e.stack.length - 1 && e.stack[e.index + 1] === url) {
    e.index += 1;
    return;
  }
  e.stack = e.stack.slice(0, e.index + 1);
  e.stack.push(url);
  e.index = e.stack.length - 1;
}

export function tabSessionCanBack(tabId: string): boolean {
  const e = byTab.get(tabId);
  return !!e && e.index > 0;
}

export function tabSessionCanForward(tabId: string): boolean {
  const e = byTab.get(tabId);
  return !!e && e.index >= 0 && e.index < e.stack.length - 1;
}

export function tabSessionPeekBack(tabId: string): string | null {
  const e = byTab.get(tabId);
  if (!e || e.index <= 0) return null;
  return e.stack[e.index - 1] ?? null;
}

export function tabSessionPeekForward(tabId: string): string | null {
  const e = byTab.get(tabId);
  if (!e || e.index < 0 || e.index >= e.stack.length - 1) return null;
  return e.stack[e.index + 1] ?? null;
}

export function tabSessionBack(tabId: string): string | null {
  const e = byTab.get(tabId);
  if (!e || e.index <= 0) return null;
  e.index -= 1;
  return e.stack[e.index] ?? null;
}

export function tabSessionForward(tabId: string): string | null {
  const e = byTab.get(tabId);
  if (!e || e.index < 0 || e.index >= e.stack.length - 1) return null;
  e.index += 1;
  return e.stack[e.index] ?? null;
}

export function dropTabSessionHistory(tabId: string): void {
  byTab.delete(tabId);
}

export function pruneTabSessionHistory(liveIds: Iterable<string>): void {
  const keep = new Set(liveIds);
  for (const id of byTab.keys()) {
    if (!keep.has(id)) byTab.delete(id);
  }
}
