import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Globe, LayoutTemplate, Search, Sparkles, Terminal, X } from 'lucide-react';
import { formatSuggestSubtitle, formatUrlPlain, isHttpNavigableUrl } from '../lib/url-display';
import { useStore, type Bang, type Shortcut, type Tab } from '../store';

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
  /** Current page URL (full) — used for Esc restore and focus select-all */
  pageUrl?: string;
  /** Notify parent that user is editing (block external draft overwrites) */
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
  const rows: { label?: string; item?: SuggestItem; header?: boolean }[] = [];
  for (const g of groups) {
    if (!g.items?.length) continue;
    rows.push({ header: true, label: g.label });
    for (const it of g.items) rows.push({ item: it });
  }
  return rows;
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
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [completion, setCompletion] = useState<{ host: string; fill: string } | null>(null);
  const [groups, setGroups] = useState<{ label: string; items: SuggestItem[] }[]>([]);
  const [remote, setRemote] = useState<SuggestItem[]>([]);
  const reqId = useRef(0);
  /** User changed text since last focus/sync — parent must not overwrite */
  const dirtyRef = useRef(false);
  const escArmedRef = useRef(false);

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

  const pageCanonical = useMemo(() => {
    if (!pageUrl || pageUrl.startsWith('about:')) return '';
    return pageUrl;
  }, [pageUrl]);

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

  // History / tabs / bangs / shortcuts / bookmarks via main (debounce ~50ms)
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
          limit: 8,
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

  // Remote search suggest (preset-gated) — never on Tor
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
            subtitle: 'Sugestia',
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
      // Cap total flat items at 8
      let n = g.reduce((a, x) => a + x.items.length, 0);
      if (completion) n += 1;
      const room = Math.max(0, 8 - n);
      if (room > 0) g.push({ label: 'Wyszukiwarka', items: remote.slice(0, room) });
    }
    return g;
  }, [groups, remote, completion]);

  const flat = useMemo(() => flattenGroups(allGroups), [allGroups]);
  const selectable = useMemo(() => flat.map((r, i) => ({ ...r, i })).filter((r) => r.item), [flat]);

  const show = open && !tor && (completion || allGroups.some((g) => g.items.length));

  const acceptCompletion = useCallback(() => {
    if (!completion) return false;
    const cur = value;
    const host = completion.fill;
    if (!host.toLowerCase().startsWith(cur.toLowerCase()) || host.length <= cur.length) return false;
    markDirty();
    onChange(host);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(cur.length, host.length);
    });
    return true;
  }, [completion, value, onChange, markDirty]);

  // Chrome-style: expand value to completion and select the suffix while typing
  const inlineApplied = useRef('');
  useEffect(() => {
    if (!focused || tor || !completion?.fill) return;
    const host = completion.fill;
    const cur = value;
    if (!cur || host.length <= cur.length) return;
    if (!host.toLowerCase().startsWith(cur.toLowerCase())) return;
    if (inlineApplied.current === `${cur}|${host}`) return;
    const el = inputRef.current;
    if (!el) return;
    if (el.selectionStart !== el.selectionEnd) return;
    if (el.selectionStart !== cur.length) return;
    inlineApplied.current = `${cur}|${host}`;
    onChange(host);
    requestAnimationFrame(() => {
      el.setSelectionRange(cur.length, host.length);
    });
  }, [completion, value, focused, tor, onChange]);

  const runItem = (item: SuggestItem) => {
    setOpen(false);
    setActive(-1);
    if (item.kind === 'tab' && item.tabId && onSwitchTab) {
      onSwitchTab(item.tabId);
      return;
    }
    if (item.fill && !item.url) {
      onChange(item.fill);
      if (item.kind === 'bang') return;
      onSubmit(item.fill, { typed: true, fromSuggest: true });
      return;
    }
    if (item.url) {
      onChange(item.url);
      onSubmit(item.url, { typed: item.kind === 'history', fromSuggest: true });
      return;
    }
    onSubmit(item.title, { typed: true, fromSuggest: true });
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
    // Never let these bubble to app shortcut handler while editing
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

    // Backspace with completion selected → remove completion only
    if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const el = inputRef.current;
      if (el && completion && el.selectionStart !== el.selectionEnd) {
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const fill = completion.fill;
        if (
          end === value.length &&
          start < end &&
          value.toLowerCase() === fill.toLowerCase()
        ) {
          e.preventDefault();
          const keep = value.slice(0, start);
          inlineApplied.current = '';
          markDirty();
          onChange(keep);
          requestAnimationFrame(() => {
            inputRef.current?.setSelectionRange(keep.length, keep.length);
          });
          return;
        }
      }
    }

    // Ctrl+Enter → www. + .com
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
      if (open) {
        setOpen(false);
        setActive(-1);
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
      // Second Esc (or Esc when already synced): blur → page
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
      setActive((i) => Math.min(selectable.length - 1, i + 1));
      return;
    }
    if (e.key === 'ArrowUp' && show) {
      e.preventDefault();
      e.stopPropagation();
      setActive((i) => Math.max(-1, i - 1));
      return;
    }
    if ((e.key === 'Tab' || e.key === 'ArrowRight') && completion && active < 0) {
      const el = inputRef.current;
      const atEnd = el && el.selectionStart === value.length && el.selectionEnd === value.length;
      if (e.key === 'Tab' || atEnd) {
        if (acceptCompletion()) {
          e.preventDefault();
          e.stopPropagation();
          markDirty();
          return;
        }
      }
    }
    if (e.key === 'Enter' && active < 0 && completion?.fill && value.toLowerCase() === completion.fill.toLowerCase()) {
      e.preventDefault();
      e.stopPropagation();
      clearDirty();
      onSubmit(`https://${completion.fill}`, { typed: true, fromSuggest: true });
      return;
    }
    if (e.key === 'Enter' && active >= 0 && selectable[active]?.item) {
      e.preventDefault();
      e.stopPropagation();
      runItem(selectable[active].item!);
      clearDirty();
      return;
    }
    if (e.key === 'Delete' && e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      const item = active >= 0 ? selectable[active]?.item : null;
      if (item) void removeItem(item);
    }
  };

  // Ghost completion suffix (visual only). Controlled value is ALWAYS full `value` while focused.
  const ghost =
    !tor &&
    focused &&
    completion &&
    value &&
    completion.fill.toLowerCase().startsWith(value.toLowerCase()) &&
    completion.fill.length > value.length
      ? completion.fill.slice(value.length)
      : '';

  // Shortened display ONLY when blurred — never feed shortened text back into draft
  const inputDisplayValue =
    !focused && isHttpNavigableUrl(value) ? formatUrlPlain(value) : value;

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
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={(e) => {
            setFocused(true);
            onFocusChange?.(true);
            escArmedRef.current = false;
            // Ensure full URL is shown (not search-label shortening)
            if (pageCanonical && !dirtyRef.current && value !== pageCanonical) {
              onChange(pageCanonical);
            }
            // Select all after React commits full URL
            requestAnimationFrame(() => {
              e.target.select();
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
        {ghost ? (
          <span className="omnibox-ghost" aria-hidden>
            <span className="omnibox-ghost-pad">{value}</span>
            <span className="omnibox-ghost-rest">{ghost}</span>
          </span>
        ) : null}
      </div>

      {show ? (
        <div className="omnibox-suggest" role="listbox">
          {completion && ghost ? (
            <button
              type="button"
              className={`omnibox-suggest-row ${active === -1 ? 'hint' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                acceptCompletion();
              }}
            >
              <span className="omnibox-suggest-ico">
                <Globe size={14} strokeWidth={1.75} />
              </span>
              <span className="grow">
                <span className="omnibox-suggest-title">
                  {value}
                  <mark>{ghost}</mark>
                </span>
                <span className="omnibox-suggest-sub">Dopełnienie · Tab</span>
              </span>
            </button>
          ) : null}

          {flat.map((row, idx) => {
            if (row.header) {
              return (
                <div key={`h-${row.label}-${idx}`} className="omnibox-suggest-head">
                  {row.label}
                </div>
              );
            }
            const item = row.item!;
            const selIdx = selectable.findIndex((s) => s.i === idx);
            const isActive = selIdx === active;
            const Ico =
              item.kind === 'tab'
                ? LayoutTemplate
                : item.kind === 'bang'
                  ? Terminal
                  : item.kind === 'remote'
                    ? Sparkles
                    : item.kind === 'query'
                      ? Search
                      : Clock;
            return (
              <button
                type="button"
                key={`${item.kind}-${item.id || item.tabId || item.url || item.title}-${idx}`}
                className={`omnibox-suggest-row ${isActive ? 'active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(selIdx)}
                onClick={() => runItem(item)}
              >
                <span className="omnibox-suggest-ico">
                  <Ico size={14} strokeWidth={1.75} />
                </span>
                <span className="grow">
                  <span className="omnibox-suggest-title">{item.title}</span>
                  {item.subtitle ? (
                    <span className="omnibox-suggest-sub">
                      {formatSuggestSubtitle(item.subtitle, item.url)}
                    </span>
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
