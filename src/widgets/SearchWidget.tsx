import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Clock3, Search, Sparkles, X } from 'lucide-react';
import {
  SEARCH_ENGINES,
  engineLabel,
  normalizeInput,
  searchHome,
  useStore,
  type SearchEngine,
} from '../store';
import { letterFavicon } from '../lib/favicon';

const easeOut = [0.16, 1, 0.3, 1] as const;

function EngineIconSelect({
  value,
  onChange,
  reduced,
}: {
  value: SearchEngine;
  onChange: (v: SearchEngine) => void;
  reduced: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const settings = useStore((s) => s.settings);
  const home = searchHome({ ...settings, searchEngine: value });
  const ico = letterFavicon(home);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="home-engine-wrap pz-select" ref={ref}>
      <button
        type="button"
        className="home-engine-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`Silnik: ${engineLabel(value)}`}
      >
        <img src={ico} alt="" width={16} height={16} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="pz-select-menu"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: reduced ? 0.12 : 0.2, ease: easeOut }}
          >
            {SEARCH_ENGINES.map((e) => (
              <button
                key={e.id}
                type="button"
                className={`pz-option ${value === e.id ? 'on' : ''}`}
                onClick={() => {
                  onChange(e.id);
                  setOpen(false);
                }}
              >
                <span>{e.label}</span>
                {value === e.id && <Check size={13} strokeWidth={2} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type SuggestItem = {
  kind: 'history' | 'bang' | 'remote' | 'search';
  title: string;
  subtitle?: string;
  fill?: string;
};

const MAX_HOME_SUGGEST = 6;

function SuggestPortal({
  anchorEl,
  suggestions,
  idx,
  setIdx,
  onPick,
  onRemoveHistory,
}: {
  anchorEl: HTMLElement | null;
  suggestions: SuggestItem[];
  idx: number;
  setIdx: (i: number) => void;
  onPick: (s: SuggestItem) => void;
  onRemoveHistory: (title: string) => void;
}) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; maxH: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!anchorEl) return;
    const update = () => {
      const r = anchorEl.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom - 12;
      const spaceAbove = r.top - 12;
      const need = Math.min(suggestions.length, MAX_HOME_SUGGEST) * 36 + 8;
      const maxH = Math.max(need, Math.min(need + 8, spaceBelow > need ? spaceBelow : spaceAbove));
      const openUp = spaceBelow < need && spaceAbove > spaceBelow;
      setBox({
        left: r.left,
        top: openUp ? Math.max(8, r.top - maxH - 6) : r.bottom + 6,
        width: r.width,
        maxH,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorEl, suggestions.length]);

  if (!box || !suggestions.length) return null;

  return createPortal(
    <div
      className="home-suggest home-suggest-portal"
      style={{
        position: 'fixed',
        left: box.left,
        top: box.top,
        width: box.width,
        maxHeight: box.maxH,
        zIndex: 80,
        overflowY: 'auto',
      }}
      role="listbox"
    >
      {suggestions.slice(0, MAX_HOME_SUGGEST).map((s, i) => (
        <button
          key={`${s.kind}-${s.title}-${i}`}
          type="button"
          className={`home-suggest-row ${i === idx ? 'active' : ''}`}
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setIdx(i)}
          onClick={() => onPick(s)}
        >
          <span className="home-suggest-ico">
            {s.kind === 'bang' ? (
              <Sparkles size={16} strokeWidth={1.75} />
            ) : s.kind === 'history' ? (
              <Clock3 size={16} strokeWidth={1.75} />
            ) : (
              <Search size={16} strokeWidth={1.75} />
            )}
          </span>
          <span className="grow">
            <span className="home-suggest-title">{s.title}</span>
            {s.subtitle ? <span className="home-suggest-sub">{s.subtitle}</span> : null}
          </span>
          {s.kind === 'history' && (
            <span
              className="home-suggest-x"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveHistory(s.title);
              }}
            >
              <X size={12} />
            </span>
          )}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function SearchWidget({
  onGo,
  reduced,
  size = 'L',
  inert = false,
}: {
  onGo: (url: string, query?: string) => void;
  reduced: boolean;
  size?: 'S' | 'M' | 'L';
  /** Personalize live preview or home edit mode — no focus, suggestions, or history */
  inert?: boolean;
}) {
  const settings = useStore((s) => s.settings);
  const bangs = useStore((s) => s.bangs);
  const patchSettings = useStore((s) => s.patchSettings);

  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [focused, setFocused] = useState(false);
  const [remoteSuggest, setRemoteSuggest] = useState<string[]>([]);
  const [queryHistory, setQueryHistory] = useState<{ q: string; at: number }[]>([]);
  const formRef = useRef<HTMLFormElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [inPreviewDom, setInPreviewDom] = useState(false);

  useLayoutEffect(() => {
    setInPreviewDom(!!formRef.current?.closest('.home-preview-virtual'));
  }, []);

  const inPreview = inert || inPreviewDom;

  useEffect(() => {
    if (inPreview || !settings.suggestHistory) {
      setQueryHistory([]);
      return;
    }
    let cancelled = false;
    void window.shell?.historyList?.({ limit: 1 }).then((res) => {
      if (!cancelled && Array.isArray(res?.queries)) setQueryHistory(res.queries);
    });
    return () => {
      cancelled = true;
    };
  }, [inPreview, settings.suggestHistory, focused, q]);

  const removeHistory = (query: string) => {
    void window.shell?.historyRemoveQuery?.(query);
    setQueryHistory((prev) => prev.filter((h) => h.q !== query));
  };

  useEffect(() => {
    if (inPreview) {
      setRemoteSuggest([]);
      return;
    }
    const t = q.trim();
    if (
      !settings.privacySearchSuggest ||
      !settings.privacyAllowAppNetwork ||
      t.length < 2 ||
      t.startsWith('!') ||
      /^https?:/i.test(t)
    ) {
      setRemoteSuggest([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void window.shell?.searchSuggest?.(t).then((list) => {
        if (!cancelled && Array.isArray(list)) setRemoteSuggest(list.slice(0, 5));
      });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, settings.privacySearchSuggest, settings.privacyAllowAppNetwork, inPreview]);

  const suggestions = useMemo((): SuggestItem[] => {
    if (inPreview) return [];
    const t = q.trim().toLowerCase();
    if (!t) {
      if (!settings.suggestHistory) return [];
      return queryHistory
        .slice(0, MAX_HOME_SUGGEST)
        .map((h) => ({ kind: 'history' as const, title: h.q }));
    }
    if (t.startsWith('!')) {
      if (!settings.suggestBangs) return [];
      const key = t.slice(1);
      return bangs
        .filter((b) => b.key.startsWith(key) || b.label.toLowerCase().includes(key))
        .slice(0, MAX_HOME_SUGGEST)
        .map((b) => ({
          kind: 'bang' as const,
          title: `!${b.key}`,
          subtitle: b.label,
          fill: `!${b.key} `,
        }));
    }
    const hist = settings.suggestHistory
      ? queryHistory
          .filter((h) => h.q.toLowerCase().includes(t))
          .slice(0, 3)
          .map((h) => ({ kind: 'history' as const, title: h.q }))
      : [];
    const remote =
      settings.privacySearchSuggest && settings.privacyAllowAppNetwork
        ? remoteSuggest
            .filter((s) => s.toLowerCase() !== t)
            .slice(0, 3)
            .map((s) => ({ kind: 'remote' as const, title: s }))
        : [];
    return [
      {
        kind: 'search' as const,
        title: q.trim(),
      },
      ...hist,
      ...remote,
    ].slice(0, MAX_HOME_SUGGEST);
  }, [
    q,
    queryHistory,
    bangs,
    settings.suggestHistory,
    settings.suggestBangs,
    settings.privacySearchSuggest,
    settings.privacyAllowAppNetwork,
    remoteSuggest,
    inPreview,
  ]);

  const showSuggest = !inPreview && focused && suggestions.length > 0;
  const engineName = engineLabel(settings.searchEngine);
  const placeholder =
    settings.homePlaceholder?.trim() || `Szukaj w ${engineName} albo wklej adres…`;

  const run = (title?: string, fill?: string) => {
    if (fill) {
      setQ(fill);
      return;
    }
    const raw = (title ?? q).trim();
    if (!raw) return;
    const url = normalizeInput(raw, settings, bangs);
    onGo(url, raw.startsWith('http') ? undefined : raw);
  };

  const onPick = (s: SuggestItem) => {
    if (s.kind === 'bang' && s.fill) setQ(s.fill);
    else run(s.title);
  };

  return (
    <form
      ref={formRef}
      className={`home-search hw-search hw-size-${size} ${focused ? 'is-focus' : ''}`}
      onSubmit={(e) => {
        e.preventDefault();
        const s = suggestions[idx];
        if (s?.kind === 'bang' && s.fill && !q.trim().includes(' ')) {
          setQ(s.fill);
          return;
        }
        run(
          s?.kind === 'search' || s?.kind === 'history' || s?.kind === 'remote'
            ? s.title
            : undefined,
        );
      }}
    >
      <div className="home-search-inner" ref={innerRef}>
        {settings.homeShowEngine !== false && (
          <EngineIconSelect
            value={settings.searchEngine}
            reduced={reduced}
            onChange={(searchEngine) => patchSettings({ searchEngine })}
          />
        )}
        <input
          autoFocus={!inPreview}
          tabIndex={inPreview ? -1 : undefined}
          readOnly={inPreview}
          value={q}
          onChange={(e) => {
            if (inPreview) return;
            setQ(e.target.value);
            setIdx(0);
          }}
          onFocus={() => {
            if (!inPreview) setFocused(true);
          }}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onKeyDown={(e) => {
            if (inPreview) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIdx((i) => Math.min(suggestions.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIdx((i) => Math.max(0, i - 1));
            } else if (e.key === 'Escape') setQ('');
          }}
          placeholder={placeholder}
          spellCheck={false}
        />
      </div>

      {showSuggest && (
        <SuggestPortal
          anchorEl={innerRef.current}
          suggestions={suggestions}
          idx={idx}
          setIdx={setIdx}
          onPick={onPick}
          onRemoveHistory={removeHistory}
        />
      )}
    </form>
  );
}
