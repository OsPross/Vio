import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Clock, Globe, LayoutTemplate, Search, Terminal, X } from 'lucide-react';
import {
  formatOmniboxIdleDisplay,
  formatSuggestSubtitle,
  isHttpNavigableUrl,
  isSkippableSuggestUrl,
  suggestDomainLabel,
} from '../lib/url-display';
import { letterFavicon } from '../lib/favicon';
import {
  ghostNavigateUrl,
  matchOmniboxGhost,
  normalizeGhostFill,
  shouldShowOmniboxGhost,
} from '../lib/omniboxGhost';
import { useStore, type Bang, type Shortcut, type Tab } from '../store';

const MAX_SUGGEST = 6;

/** Same topsites as history.cjs — snappy ghost before IPC returns */
const TOP_SITE_HOSTS = [
  'youtube.com',
  'google.com',
  'github.com',
  'wikipedia.org',
  'reddit.com',
  'facebook.com',
  'twitter.com',
  'x.com',
  'amazon.com',
  'netflix.com',
  'discord.com',
  'stackoverflow.com',
];

function localTopFill(typed: string): string | null {
  const t = typed.trim().toLowerCase();
  if (t.length < 1 || /\s/.test(t) || t.startsWith('!') || /^https?:/i.test(t)) return null;
  const hit = TOP_SITE_HOSTS.find((h) => h.startsWith(t) && h.length > t.length);
  return hit || null;
}

export type SuggestItem = {
  kind: string;
  title: string;
  subtitle?: string;
  url?: string;
  fill?: string;
  id?: string;
  tabId?: string;
  faviconKey?: string;
  score?: number;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (raw: string, opts?: { typed?: boolean; fromSuggest?: boolean }) => void;
  onSwitchTab?: (tabId: string) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLInputElement>) => void;
  pageUrl?: string;
  onEditingChange?: (editing: boolean) => void;
  onFocusChange?: (focused: boolean) => void;
  disabledSuggest?: boolean;
  placeholder?: string;
  torMode?: boolean;
  inputId?: string;
  bangs: Bang[];
  shortcuts: Shortcut[];
  tabs: Tab[];
  className?: string;
  children?: React.ReactNode;
};

function flattenGroups(groups: { label: string; items: SuggestItem[] }[]) {
  const rows: SuggestItem[] = [];
  for (const g of groups) {
    for (const it of g.items || []) {
      if (isSkippableSuggestUrl(it.url)) continue;
      rows.push(it);
      if (rows.length >= MAX_SUGGEST) return rows;
    }
  }
  return rows;
}

function itemDisplay(item: SuggestItem): string {
  if (item.kind === 'completion') return item.fill || item.title || '';
  if (item.kind === 'query' || item.kind === 'remote') return item.fill || item.title || '';
  return item.url || item.fill || item.title || '';
}

function rowCopy(item: SuggestItem): { title: string; sub?: string } {
  if (item.kind === 'completion') {
    return { title: item.title };
  }
  if (item.kind === 'query' || item.kind === 'remote') {
    return { title: item.title };
  }
  if (item.kind === 'bang') {
    return { title: item.title, sub: item.subtitle || undefined };
  }
  if (item.kind === 'tab') {
    const domain = suggestDomainLabel(item.url);
    return { title: item.title || domain || item.url || '', sub: domain };
  }
  const domain = suggestDomainLabel(item.url);
  const rawTitle = (item.title || '').trim();
  const titleLooksUrl =
    !rawTitle ||
    /^https?:\/\//i.test(rawTitle) ||
    (domain != null && rawTitle === item.url) ||
    (domain != null && rawTitle === domain);
  const title = titleLooksUrl ? domain || rawTitle || item.url || '' : rawTitle;
  const sub = domain && domain !== title ? domain : formatSuggestSubtitle(item.subtitle, item.url);
  return { title, sub: sub && sub !== title ? sub : undefined };
}

export function OmniboxSuggest({
  value,
  onChange,
  onSubmit,
  onSwitchTab,
  onContextMenu,
  pageUrl = '',
  onEditingChange,
  onFocusChange,
  disabledSuggest,
  placeholder,
  torMode,
  inputId = 'omnibox-input',
  bangs,
  shortcuts,
  tabs,
  className,
}: Props) {
  const settings = useStore((s) => s.settings);
  const inputRef = useRef<HTMLInputElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [completion, setCompletion] = useState<{ host: string; fill: string } | null>(null);
  const [groups, setGroups] = useState<{ label: string; items: SuggestItem[] }[]>([]);
  const [remote, setRemote] = useState<SuggestItem[]>([]);
  const [composing, setComposing] = useState(false);
  const [ghostDismissed, setGhostDismissed] = useState(false);
  const [caret, setCaret] = useState({ start: 0, end: 0 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const reqId = useRef(0);
  const dirtyRef = useRef(false);
  const escArmedRef = useRef(false);
  /** Text the user typed before arrowing the list (Chrome-style restore) */
  const userTypedRef = useRef(value);

  const tor = !!torMode || !!disabledSuggest;

  const markDirty = useCallback(() => {
    if (!dirtyRef.current) {
      dirtyRef.current = true;
      onEditingChange?.(true);
    }
  }, [onEditingChange]);

  const clearDirty = useCallback(() => {
    dirtyRef.current = false;
    onEditingChange?.(false);
  }, [onEditingChange]);

  const syncCaret = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    setCaret({ start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 });
    setScrollLeft(el.scrollLeft || 0);
  }, []);

  const pageCanonical = useMemo(() => {
    if (!pageUrl || pageUrl.startsWith('about:')) return '';
    return pageUrl;
  }, [pageUrl]);

  useEffect(() => {
    if (!focused && pageCanonical) {
      dirtyRef.current = false;
    }
  }, [pageCanonical, focused]);

  const bookmarks = useStore((s) => s.bookmarks);

  const openTabsPayload = useMemo(
    () =>
      tabs
        .filter((t) => t.mode !== 'tor')
        .map((t) => ({ id: t.id, title: t.title || t.url, url: t.url })),
    [tabs],
  );

  const bookmarksPayload = useMemo(
    () => bookmarks.slice(0, 200).map((b) => ({ title: b.title, url: b.url })),
    [bookmarks],
  );

  useEffect(() => {
    if (tor) {
      setCompletion(null);
      setGroups([]);
      return;
    }
    const id = ++reqId.current;
    const timer = setTimeout(() => {
      void window.shell
        ?.historySuggest?.(value, {
          openTabs: openTabsPayload,
          shortcuts: shortcuts.map((s) => ({ id: s.id, label: s.label, url: s.url })),
          bangs: bangs.map((b) => ({ key: b.key, label: b.label })),
          bookmarks: bookmarksPayload,
          suggestHistory: settings.suggestHistory,
          suggestBangs: settings.suggestBangs,
          limit: MAX_SUGGEST,
          tor: false,
        })
        .then((res) => {
          if (id !== reqId.current) return;
          setCompletion(res?.completion || null);
          setGroups(Array.isArray(res?.groups) ? res.groups : []);
        })
        .catch(() => {
          if (id !== reqId.current) return;
          setCompletion(null);
          setGroups([]);
        });
    }, 50);
    return () => clearTimeout(timer);
  }, [
    value,
    tor,
    openTabsPayload,
    bookmarksPayload,
    shortcuts,
    bangs,
    settings.suggestHistory,
    settings.suggestBangs,
  ]);

  useEffect(() => {
    if (tor || !settings.privacySearchSuggest || !settings.privacyAllowAppNetwork) {
      setRemote([]);
      return;
    }
    const t = value.trim();
    if (t.length < 2 || t.startsWith('!') || /^https?:/i.test(t) || t.startsWith('about:')) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void window.shell?.searchSuggest?.(t).then((list) => {
        if (cancelled || !Array.isArray(list)) return;
        setRemote(
          list.slice(0, 3).map((s) => ({
            kind: 'remote',
            title: s,
            fill: s,
          })),
        );
      });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, tor, settings.privacySearchSuggest, settings.privacyAllowAppNetwork]);

  const allGroups = useMemo(() => {
    const g = [...groups];
    if (remote.length) {
      let n = g.reduce((a, x) => a + x.items.length, 0);
      const room = Math.max(0, MAX_SUGGEST - n);
      if (room > 0) g.push({ label: 'Wyszukiwarka', items: remote.slice(0, room) });
    }
    return g;
  }, [groups, remote]);

  const flat = useMemo(() => flattenGroups(allGroups), [allGroups]);

  const effectiveFill = completion?.fill || localTopFill(value) || null;

  const ghostSuffix = useMemo(() => {
    if (tor || composing || ghostDismissed) return '';
    return matchOmniboxGhost(value, effectiveFill);
  }, [tor, composing, ghostDismissed, value, effectiveFill]);

  const ghostVisible = shouldShowOmniboxGhost({
    typed: value,
    fill: effectiveFill,
    focused,
    composing,
    dismissed: ghostDismissed,
    listActive: active,
    caretStart: caret.start,
    caretEnd: caret.end,
  });

  const completionItem: SuggestItem | null =
    ghostSuffix && effectiveFill
      ? {
          kind: 'completion',
          title: value + ghostSuffix,
          subtitle: 'Enter',
          fill: normalizeGhostFill(effectiveFill),
          url: `https://${normalizeGhostFill(effectiveFill)}`,
        }
      : null;

  const listRows = useMemo(() => {
    const rows: { item: SuggestItem; selIdx: number }[] = [];
    let sel = 0;
    if (completionItem && ghostSuffix) {
      rows.push({ item: completionItem, selIdx: sel++ });
    }
    for (const item of flat) {
      if (rows.length >= MAX_SUGGEST) break;
      rows.push({ item, selIdx: sel++ });
    }
    return rows;
  }, [flat, completionItem, ghostSuffix]);

  const selectable = listRows;

  const show = open && !tor && (Boolean(ghostSuffix) || flat.length > 0);

  const blurOmnibox = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.blur());
  }, []);

  /** Accept ghost into the field (Tab / →) — value becomes completed host */
  const acceptGhost = useCallback(() => {
    if (!effectiveFill || !ghostSuffix) return false;
    const next = value + ghostSuffix;
    markDirty();
    setGhostDismissed(true);
    onChange(next);
    userTypedRef.current = next;
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
      syncCaret();
    });
    return true;
  }, [effectiveFill, ghostSuffix, value, onChange, markDirty, syncCaret]);

  const runItem = (item: SuggestItem) => {
    setOpen(false);
    setActive(-1);
    setGhostDismissed(true);
    if (item.kind === 'tab' && item.tabId && onSwitchTab) {
      onSwitchTab(item.tabId);
      clearDirty();
      blurOmnibox();
      return;
    }
    if (item.kind === 'completion' && item.url) {
      clearDirty();
      onChange(item.fill || item.title);
      onSubmit(item.url, { typed: true, fromSuggest: true });
      blurOmnibox();
      return;
    }
    if (item.fill && !item.url) {
      onChange(item.fill);
      if (item.kind === 'bang') return;
      clearDirty();
      onSubmit(item.fill, { typed: true, fromSuggest: true });
      blurOmnibox();
      return;
    }
    if (item.url) {
      onChange(item.url);
      clearDirty();
      onSubmit(item.url, { typed: item.kind === 'history', fromSuggest: true });
      blurOmnibox();
      return;
    }
    clearDirty();
    onSubmit(item.title, { typed: true, fromSuggest: true });
    blurOmnibox();
  };

  const removeItem = async (item: SuggestItem) => {
    if (item.kind === 'history' && item.id) {
      await window.shell?.historyDelete?.(item.id);
      setGroups((gs) =>
        gs
          .map((g) => ({ ...g, items: g.items.filter((x) => x.id !== item.id) }))
          .filter((g) => g.items.length),
      );
    } else if (item.kind === 'query' && item.title) {
      await window.shell?.historyRemoveQuery?.(item.title);
      setGroups((gs) =>
        gs
          .map((g) => ({
            ...g,
            items: g.items.filter((x) => !(x.kind === 'query' && x.title === item.title)),
          }))
          .filter((g) => g.items.length),
      );
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      e.key === 'Backspace' ||
      e.key === 'Delete' ||
      e.key === 'Home' ||
      e.key === 'End' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      ((e.ctrlKey || e.metaKey) &&
        ['a', 'A', 'z', 'Z', 'x', 'X', 'c', 'C', 'v', 'V', 'Backspace', 'Enter'].includes(e.key))
    ) {
      e.stopPropagation();
    }

    // Shift+Enter → search exactly what was typed (ignore ghost)
    if (e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      setGhostDismissed(true);
      setActive(-1);
      clearDirty();
      onSubmit(value, { typed: false, fromSuggest: false });
      return;
    }

    // Ctrl+Backspace with ghost → ignore ghost, search typed
    if ((e.ctrlKey || e.metaKey) && e.key === 'Backspace' && ghostVisible) {
      e.preventDefault();
      e.stopPropagation();
      setGhostDismissed(true);
      setActive(-1);
      clearDirty();
      onSubmit(value, { typed: false, fromSuggest: false });
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      let raw = value.trim();
      if (!raw) return;
      if (!/^https?:\/\//i.test(raw) && !raw.includes(' ') && !raw.startsWith('!')) {
        raw = raw.replace(/^(www\.)?/i, '');
        if (!/\.[a-z]{2,}$/i.test(raw)) raw = `${raw}.com`;
        raw = `https://www.${raw.replace(/^www\./i, '')}`;
      }
      clearDirty();
      onSubmit(raw, { typed: true });
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (ghostVisible) {
        setGhostDismissed(true);
        escArmedRef.current = true;
        return;
      }
      if (open) {
        setOpen(false);
        setActive(-1);
        if (userTypedRef.current !== value && active >= 0) {
          onChange(userTypedRef.current);
        }
        escArmedRef.current = true;
        return;
      }
      if (dirtyRef.current || (pageCanonical && value !== pageCanonical)) {
        onChange(pageCanonical);
        clearDirty();
        escArmedRef.current = true;
        requestAnimationFrame(() => {
          const el = inputRef.current;
          if (!el) return;
          el.focus();
          el.select();
        });
        return;
      }
      setOpen(false);
      setActive(-1);
      clearDirty();
      inputRef.current?.blur();
      try {
        const wv = document.querySelector('webview:not(.hidden)') as HTMLElement | null;
        wv?.focus?.();
      } catch {
        /* */
      }
      return;
    }

    if (tor) return;

    if (e.key === 'ArrowDown' && show) {
      e.preventDefault();
      e.stopPropagation();
      const next = Math.min(selectable.length - 1, active + 1);
      if (active < 0) userTypedRef.current = value;
      setActive(next);
      const item = selectable[next]?.item;
      if (item) onChange(itemDisplay(item));
      return;
    }
    if (e.key === 'ArrowUp' && show) {
      e.preventDefault();
      e.stopPropagation();
      const next = Math.max(-1, active - 1);
      setActive(next);
      if (next < 0) {
        onChange(userTypedRef.current);
      } else {
        const item = selectable[next]?.item;
        if (item) onChange(itemDisplay(item));
      }
      return;
    }

    if ((e.key === 'Tab' || e.key === 'ArrowRight') && ghostVisible && active < 0) {
      const el = inputRef.current;
      const atEnd = el && el.selectionStart === value.length && el.selectionEnd === value.length;
      if (e.key === 'Tab' || atEnd) {
        if (acceptGhost()) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }
    }

    if (e.key === 'Enter' && active < 0) {
      e.preventDefault();
      e.stopPropagation();
      clearDirty();
      if (ghostVisible && effectiveFill) {
        onSubmit(ghostNavigateUrl(value, effectiveFill), { typed: true, fromSuggest: true });
      } else {
        onSubmit(value, { typed: true });
      }
      blurOmnibox();
      return;
    }
    if (e.key === 'Enter' && active >= 0 && selectable[active]?.item) {
      e.preventDefault();
      e.stopPropagation();
      runItem(selectable[active].item);
      return;
    }
    if (e.key === 'Delete' && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      const item = active >= 0 ? selectable[active]?.item : null;
      if (item && item.kind !== 'completion') void removeItem(item);
    }
  };

  useLayoutEffect(() => {
    if (!ghostVisible || !ghostRef.current || !inputRef.current) return;
    const input = inputRef.current;
    const ghost = ghostRef.current;
    const cs = getComputedStyle(input);
    ghost.style.font = cs.font;
    ghost.style.letterSpacing = cs.letterSpacing;
    ghost.style.paddingLeft = cs.paddingLeft;
    ghost.style.paddingRight = cs.paddingRight;
    ghost.style.paddingTop = cs.paddingTop;
    ghost.style.paddingBottom = cs.paddingBottom;
  }, [ghostVisible, value, ghostSuffix]);

  // Readable query / host when blurred; full URL only while the field is focused.
  const inputDisplayValue =
    !focused && isHttpNavigableUrl(value) ? formatOmniboxIdleDisplay(value) : value;

  return (
    <div className={`omnibox-suggest-wrap ${className || ''}`}>
      <div className="omnibox-input-stack">
        <input
          ref={inputRef}
          id={inputId}
          value={inputDisplayValue}
          onChange={(e) => {
            markDirty();
            escArmedRef.current = false;
            setGhostDismissed(false);
            setActive(-1);
            userTypedRef.current = e.target.value;
            onChange(e.target.value);
            setOpen(true);
            requestAnimationFrame(syncCaret);
          }}
          onSelect={syncCaret}
          onClick={syncCaret}
          onKeyUp={syncCaret}
          onScroll={(e) => setScrollLeft((e.target as HTMLInputElement).scrollLeft)}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => {
            setComposing(false);
            requestAnimationFrame(syncCaret);
          }}
          onPaste={() => {
            setGhostDismissed(true);
            setComposing(false);
          }}
          onFocus={(e) => {
            setFocused(true);
            onFocusChange?.(true);
            escArmedRef.current = false;
            setGhostDismissed(false);
            // Always expand to the real page URL when focusing a clean (non-dirty) field.
            if (pageCanonical && !dirtyRef.current) {
              onChange(pageCanonical);
            }
            requestAnimationFrame(() => {
              e.target.select();
              syncCaret();
            });
            setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            onFocusChange?.(false);
            setTimeout(() => setOpen(false), 160);
            if (!dirtyRef.current) onEditingChange?.(false);
          }}
          onKeyDown={onKeyDown}
          onContextMenu={onContextMenu}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />
        {ghostVisible ? (
          <span className="omnibox-ghost" aria-hidden ref={ghostRef}>
            <span
              className="omnibox-ghost-inner"
              style={{ transform: `translateX(${-scrollLeft}px)` }}
            >
              <span className="omnibox-ghost-pad">{value}</span>
              <span className="omnibox-ghost-rest">{ghostSuffix}</span>
            </span>
          </span>
        ) : null}
      </div>

      {show ? (
        <div className="omnibox-suggest" role="listbox">
          {listRows.map((row, idx) => {
            const item = row.item;
            const selIdx = row.selIdx;
            const isActive =
              selIdx === active ||
              (selIdx === 0 && active < 0 && item.kind === 'completion' && ghostVisible);
            const copy = rowCopy(item);
            const showFav =
              (item.kind === 'history' || item.kind === 'bookmark' || item.kind === 'shortcut') &&
              !!item.url;
            const Ico =
              item.kind === 'completion'
                ? Globe
                : item.kind === 'tab'
                  ? LayoutTemplate
                  : item.kind === 'bang'
                    ? Terminal
                    : item.kind === 'remote' || item.kind === 'query'
                      ? Search
                      : Clock;
            return (
              <button
                type="button"
                key={`${item.kind}-${item.id || item.tabId || item.url || item.title}-${idx}`}
                className={`omnibox-suggest-row ${isActive ? 'active' : ''} ${item.kind === 'completion' ? 'hint' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => {
                  if (item.kind === 'completion' && active < 0) return;
                  if (active < 0) userTypedRef.current = value;
                  setActive(selIdx);
                  onChange(itemDisplay(item));
                }}
                onClick={() => runItem(item)}
              >
                <span className="omnibox-suggest-ico">
                  {showFav ? (
                    <img src={letterFavicon(item.url!)} alt="" width={16} height={16} />
                  ) : (
                    <Ico size={16} strokeWidth={1.75} />
                  )}
                </span>
                <span className="grow">
                  <span className="omnibox-suggest-title">
                    {item.kind === 'completion' ? (
                      <>
                        {value}
                        <mark>{ghostSuffix}</mark>
                      </>
                    ) : (
                      copy.title
                    )}
                  </span>
                  {item.kind === 'completion' ? (
                    <span className="omnibox-suggest-sub omnibox-suggest-enter">
                      <kbd>↵</kbd>
                    </span>
                  ) : copy.sub ? (
                    <span className="omnibox-suggest-sub">{copy.sub}</span>
                  ) : null}
                </span>
                {(item.kind === 'history' || item.kind === 'query') && (
                  <span
                    className="omnibox-suggest-x"
                    title="Usuń (Shift+Delete)"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeItem(item);
                    }}
                  >
                    <X size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
