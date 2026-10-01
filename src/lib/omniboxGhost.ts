/**
 * Pure omnibox ghost-text matching (no DOM).
 * Ghost = host/URL suffix after what the user typed; never mutates typed value.
 */

/** Normalize candidate to host-like string without scheme / leading www. */
export function normalizeGhostFill(fill: string): string {
  let s = String(fill || '').trim();
  s = s.replace(/^https?:\/\//i, '');
  s = s.replace(/^www\./i, '');
  // strip trailing slash on host-only
  if (!s.includes('/') || /^[^/]+\/$/.test(s)) {
    s = s.replace(/\/$/, '');
    s = s.split(/[?#]/)[0] || '';
  }
  return s;
}

/**
 * Return ghost suffix to show after `typed`, or '' if no match.
 * Prefers fills that are host/URL prefixes (case-insensitive).
 */
export function matchOmniboxGhost(typed: string, fill: string | null | undefined): string {
  if (!fill) return '';
  if (typed.length < 1) return '';
  // Spaces / bangs / full URLs: no ghost
  if (/\s/.test(typed) || typed.startsWith('!')) return '';
  if (/^https?:\/\//i.test(typed)) return '';

  const fillNorm = normalizeGhostFill(fill);
  if (!fillNorm) return '';

  const t = typed.toLowerCase();
  const f = fillNorm.toLowerCase();
  if (!f.startsWith(t)) return '';
  if (fillNorm.length <= typed.length) return '';

  // Suffix keeps fillNorm casing from the unmatched part
  return fillNorm.slice(typed.length);
}

export type GhostShowOpts = {
  typed: string;
  fill: string | null | undefined;
  focused: boolean;
  composing: boolean;
  dismissed: boolean;
  /** List selection index; ghost only when < 0 */
  listActive: number;
  caretStart: number;
  caretEnd: number;
};

/** Whether ghost UI should render (pure). */
export function shouldShowOmniboxGhost(opts: GhostShowOpts): boolean {
  if (!opts.focused || opts.composing || opts.dismissed) return false;
  if (opts.listActive >= 0) return false;
  if (opts.caretStart !== opts.caretEnd) return false;
  if (opts.caretStart !== opts.typed.length) return false;
  return matchOmniboxGhost(opts.typed, opts.fill).length > 0;
}

/** Full completed address for navigation (https + fill host). */
export function ghostNavigateUrl(typed: string, fill: string): string {
  const suffix = matchOmniboxGhost(typed, fill);
  const host = normalizeGhostFill(fill);
  const completed = suffix ? typed + suffix : host.toLowerCase() === typed.toLowerCase() ? host : typed;
  if (/^https?:\/\//i.test(completed)) return completed;
  return `https://${completed}`;
}
