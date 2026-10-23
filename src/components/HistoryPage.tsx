import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { ExternalLink, Globe, History, Search, Trash2 } from 'lucide-react';
import { letterFavicon } from '../lib/favicon';
import { formatUrlForDisplay } from '../lib/url-display';
import { Dropdown } from './ui/Dropdown';
import { Input } from './ui/Input';
import { useT, useUiLocale } from '../i18n';
import { t as tCore } from '../i18n/core';
import { InternalPage } from './InternalPage';

type Visit = {
  id: string;
  url: string;
  title: string;
  faviconKey: string;
  lastVisit: number;
  visitCount: number;
  typedCount: number;
};

type GroupedVisit = Visit & { ids: string[] };

type FlatRow =
  | { kind: 'header'; key: string; label: string; dayKey: string }
  | { kind: 'item'; key: string; item: GroupedVisit; flatIndex: number };

const MERGE_MS = 30 * 60 * 1000;
const ROW_H = 52;
const HEADER_H = 36;
const OVERSCAN = 8;

function dayKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(ts: number, locale: string) {
  const d = new Date(ts);
  const today = new Date();
  const yday = new Date();
  yday.setDate(today.getDate() - 1);
  if (dayKey(ts) === dayKey(today.getTime())) return tCore('internal.today');
  if (dayKey(ts) === dayKey(yday.getTime())) return tCore('internal.yesterday');
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function searchKey(url: string): string | null {
  const p = formatUrlForDisplay(url);
  if (p.kind !== 'search' || !p.searchQuery) return null;
  return `${(p.searchEngine || '').toLowerCase()}::${p.searchQuery.toLowerCase()}`;
}

function mergeVisits(items: Visit[]): GroupedVisit[] {
  const sorted = [...items].sort((a, b) => b.lastVisit - a.lastVisit);
  const out: GroupedVisit[] = [];

  for (const it of sorted) {
    const sk = searchKey(it.url);
    let target: GroupedVisit | undefined;
    for (const g of out) {
      if (g.lastVisit - it.lastVisit > MERGE_MS) continue;
      const gsk = searchKey(g.url);
      if (g.url === it.url || (sk && gsk && sk === gsk)) {
        target = g;
        break;
      }
    }
    if (target) {
      target.visitCount += it.visitCount;
      target.ids.push(it.id);
      if (it.lastVisit > target.lastVisit) {
        target.lastVisit = it.lastVisit;
        if (it.title) target.title = it.title;
      }
    } else {
      out.push({ ...it, ids: [it.id] });
    }
  }
  return out.sort((a, b) => b.lastVisit - a.lastVisit);
}

type Props = {
  onOpen: (url: string) => void;
  onOpenNewTab?: (url: string) => void;
};

type CtxMenu = { x: number; y: number; item: GroupedVisit };

export function HistoryPage({ onOpen, onOpenNewTab }: Props) {
  const t = useT();
  const uiLocale = useUiLocale();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Visit[]>([]);
  const [total, setTotal] = useState(0);
  const [favicons, setFavicons] = useState<Record<string, string>>({});
  const [clearRange, setClearRange] = useState<'hour' | 'day' | 'week' | 'all'>('hour');
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ctx, setCtx] = useState<CtxMenu | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastAnchorRef = useRef<number | null>(null);

  const clearOptions = useMemo(
    () => [
      { id: 'hour' as const, label: t('internal.historyClearHour') },
      { id: 'day' as const, label: t('internal.historyClearDay') },
      { id: 'week' as const, label: t('internal.historyClearWeek') },
      { id: 'all' as const, label: t('internal.historyClearAll') },
    ],
    [t],
  );

  const clearConfirmRange = useCallback(
    (range: 'hour' | 'day' | 'week' | 'all') => {
      const key =
        range === 'hour'
          ? 'internal.historyClearConfirmHour'
          : range === 'day'
            ? 'internal.historyClearConfirmDay'
            : range === 'week'
              ? 'internal.historyClearConfirmWeek'
              : 'internal.historyClearConfirmAll';
      return t('internal.historyClearConfirm', { range: t(key) });
    },
    [t],
  );

  const reload = useCallback(async () => {
    const res = await window.shell?.historyList?.({ q, limit: 2000 });
    if (!res) {
      setReady(true);
      return;
    }
    setItems(res.items || []);
    setTotal(res.total || 0);
    setReady(true);
  }, [q]);

  useEffect(() => {
    const t = setTimeout(() => void reload(), 40);
    return () => clearTimeout(t);
  }, [reload]);

  useEffect(() => {
    setSelected(new Set());
    lastAnchorRef.current = null;
  }, [q, items]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const next: Record<string, string> = {};
      const uniq = [...new Set(items.slice(0, 120).map((i) => i.url))];
      await Promise.all(
        uniq.map(async (url) => {
          try {
            const data = await window.shell?.faviconCacheGet?.(url);
            if (typeof data === 'string' && data.startsWith('data:')) next[url] = data;
          } catch {
            /* */
          }
        }),
      );
      if (!cancelled) setFavicons((prev) => ({ ...prev, ...next }));
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [items]);

  const grouped = useMemo(() => mergeVisits(items), [items]);

  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];
    let flatIndex = 0;
    let lastDay = '';
    for (const it of grouped) {
      const dk = dayKey(it.lastVisit);
      if (dk !== lastDay) {
        rows.push({
          kind: 'header',
          key: `h-${dk}`,
          label: dayLabel(it.lastVisit, uiLocale),
          dayKey: dk,
        });
        lastDay = dk;
      }
      rows.push({ kind: 'item', key: it.id, item: it, flatIndex });
      flatIndex += 1;
    }
    return rows;
  }, [grouped, uiLocale]);

  const itemRows = useMemo(
    () => flatRows.filter((r): r is Extract<FlatRow, { kind: 'item' }> => r.kind === 'item'),
    [flatRows],
  );

  const rowOffsets = useMemo(() => {
    const offsets: number[] = [];
    let y = 0;
    for (const row of flatRows) {
      offsets.push(y);
      y += row.kind === 'header' ? HEADER_H : ROW_H;
    }
    return { offsets, total: y };
  }, [flatRows]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () => {
      setScrollTop(el.scrollTop);
      setViewportH(el.clientHeight);
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', sync);
      ro.disconnect();
    };
  }, [flatRows.length]);

  const { renderStart, renderEnd, padTop, padBottom } = useMemo(() => {
    const { offsets, total } = rowOffsets;
    if (!flatRows.length) {
      return { renderStart: 0, renderEnd: 0, padTop: 0, padBottom: 0 };
    }
    const viewTop = scrollTop;
    const viewBottom = scrollTop + viewportH;
    let start = 0;
    while (
      start < flatRows.length &&
      offsets[start] + (flatRows[start].kind === 'header' ? HEADER_H : ROW_H) < viewTop
    ) {
      start += 1;
    }
    start = Math.max(0, start - OVERSCAN);
    let end = start;
    while (end < flatRows.length && offsets[end] < viewBottom) end += 1;
    end = Math.min(flatRows.length, end + OVERSCAN);

    const visibleDays = new Set<string>();
    for (let i = start; i < end; i++) {
      const row = flatRows[i];
      if (row.kind === 'item') visibleDays.add(dayKey(row.item.lastVisit));
    }
    let renderStart = start;
    for (let i = start - 1; i >= 0; i--) {
      const row = flatRows[i];
      if (row.kind === 'header' && visibleDays.has(row.dayKey)) {
        renderStart = i;
      }
    }

    const padTop = offsets[renderStart] ?? 0;
    const last = flatRows[end - 1];
    const lastBottom =
      last != null ? offsets[end - 1] + (last.kind === 'header' ? HEADER_H : ROW_H) : 0;
    const padBottom = Math.max(0, total - lastBottom);
    return { renderStart, renderEnd: end, padTop, padBottom };
  }, [flatRows, rowOffsets, scrollTop, viewportH]);

  const selectionActive = selected.size > 0;

  const removeIds = async (ids: string[]) => {
    await Promise.all(ids.map((id) => window.shell?.historyDelete?.(id)));
    setItems((prev) => prev.filter((x) => !ids.includes(x.id)));
    setTotal((n) => Math.max(0, n - ids.length));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  };

  const removeOne = async (item: GroupedVisit) => {
    await removeIds(item.ids);
  };

  const removeDomain = async (url: string) => {
    const host = hostOf(url);
    if (!window.confirm(t('internal.historyDeleteDomainConfirm', { host }))) return;
    await window.shell?.historyDeleteDomain?.(host);
    void reload();
  };

  const removeSelected = async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (!window.confirm(t('internal.historyDeleteSelectedConfirm', { n: ids.length }))) return;
    await removeIds(ids);
  };

  const clearData = async () => {
    if (!window.confirm(clearConfirmRange(clearRange))) return;
    await window.shell?.historyClear?.({ range: clearRange });
    void reload();
  };

  const openNew = (url: string) => {
    if (onOpenNewTab) onOpenNewTab(url);
    else onOpen(url);
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* */
    }
  };

  const toggleSelect = (item: GroupedVisit, index: number, shift: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const anchor = lastAnchorRef.current;
      if (shift && anchor != null) {
        const lo = Math.min(anchor, index);
        const hi = Math.max(anchor, index);
        for (let i = lo; i <= hi; i++) {
          const row = itemRows[i];
          if (row) for (const id of row.item.ids) next.add(id);
        }
      } else {
        const allOn = item.ids.every((id) => next.has(id));
        if (allOn) {
          for (const id of item.ids) next.delete(id);
        } else {
          for (const id of item.ids) next.add(id);
        }
        lastAnchorRef.current = index;
      }
      return next;
    });
    if (!shift) lastAnchorRef.current = index;
  };

  const isRowSelected = (item: GroupedVisit) => item.ids.some((id) => selected.has(id));

  const onRowContext = (e: MouseEvent, item: GroupedVisit) => {
    e.preventDefault();
    setCtx({ x: e.clientX, y: e.clientY, item });
  };

  const slice = flatRows.slice(renderStart, renderEnd);

  return (
    <InternalPage
      className="history-page"
      title={t('internal.history')}
      icon={<History size={18} strokeWidth={1.75} />}
      subtitle={
        <span>
          {t(total === 1 ? 'internal.historySubOne' : 'internal.historySub', { n: total })}
        </span>
      }
      toolbar={
        <>
          <label className="history-search">
            <Search size={14} strokeWidth={1.75} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('internal.searchHistory')}
              spellCheck={false}
            />
          </label>
          <div className="history-clear">
            <Dropdown
              value={clearRange}
              options={clearOptions}
              onChange={(id) => setClearRange(id as typeof clearRange)}
              aria-label={t('internal.historyClearRangeAria')}
            />
            <button
              type="button"
              className="history-sbtn secondary"
              onClick={() => void clearData()}
            >
              {t('internal.historyClearData')}
            </button>
          </div>
        </>
      }
    >
      {selectionActive && (
        <div className="history-toolbar">
          <span>{t('internal.historySelectedCount', { n: selected.size })}</span>
          <button
            type="button"
            className="history-sbtn danger-text"
            onClick={() => void removeSelected()}
          >
            {t('internal.historyRemoveSelected')}
          </button>
        </div>
      )}

      <div className="history-scroll" ref={scrollRef}>
        {ready && !flatRows.length && (
          <div className="ip-empty">
            <span className="ip-empty-ico" aria-hidden>
              <History size={28} strokeWidth={1.5} />
            </span>
            <p>{q.trim() ? t('internal.historyEmptyQuery') : t('internal.historyEmpty')}</p>
            <span className="muted">{t('internal.historyEmptyHint')}</span>
          </div>
        )}
        {!!flatRows.length && (
          <div className="history-virtual" style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {slice.map((row) => {
              if (row.kind === 'header') {
                return (
                  <h2 key={row.key} className="history-day-head" style={{ height: HEADER_H }}>
                    {row.label}
                  </h2>
                );
              }
              const it = row.item;
              const ico = favicons[it.url] || letterFavicon(it.url);
              const sel = isRowSelected(it);
              return (
                <div
                  key={row.key}
                  className={`history-row ${sel ? 'selected' : ''} ${selectionActive ? 'show-check' : ''}`}
                  style={{ height: ROW_H }}
                  onContextMenu={(e) => onRowContext(e, it)}
                >
                  <label className="history-check" title={t('internal.historySelect')}>
                    <input
                      type="checkbox"
                      checked={sel}
                      onClick={(e) => toggleSelect(it, row.flatIndex, e.shiftKey)}
                      readOnly
                    />
                  </label>
                  <img src={ico} alt="" className="history-fav" width={16} height={16} />
                  <button
                    type="button"
                    className="history-main"
                    onClick={() => onOpen(it.url)}
                    title={it.url}
                  >
                    <span className="history-title">{it.title || hostOf(it.url)}</span>
                    <span className="history-url">{hostOf(it.url).replace(/^www\./i, '')}</span>
                  </button>
                  <div className="history-meta">
                    <span className="history-time">
                      {new Date(it.lastVisit).toLocaleTimeString(uiLocale === 'en' ? 'en-US' : 'pl-PL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {it.visitCount > 1 && <span className="history-count">{it.visitCount}×</span>}
                  </div>
                  <div className="history-actions">
                    <button
                      type="button"
                      className="icon-btn sm"
                      title={t('internal.openInNewTab')}
                      onClick={() => openNew(it.url)}
                    >
                      <ExternalLink size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn sm"
                      title={t('internal.historyRemoveEntry')}
                      onClick={() => void removeOne(it)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {ctx && (
        <div
          className="tab-ctx-backdrop"
          onMouseDown={() => setCtx(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setCtx(null);
          }}
        >
          <div
            className="tab-ctx-menu history-ctx-menu"
            style={{ left: ctx.x, top: ctx.y }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                onOpen(ctx.item.url);
                setCtx(null);
              }}
            >
              {t('common.open')}
            </button>
            <button
              type="button"
              onClick={() => {
                openNew(ctx.item.url);
                setCtx(null);
              }}
            >
              {t('internal.openInNewTab')}
            </button>
            <button
              type="button"
              onClick={() => {
                void copyLink(ctx.item.url);
                setCtx(null);
              }}
            >
              {t('chrome.copyLink')}
            </button>
            <hr />
            <button
              type="button"
              onClick={() => {
                void removeOne(ctx.item);
                setCtx(null);
              }}
            >
              {t('common.delete')}
            </button>
            <button
              type="button"
              onClick={() => {
                void removeDomain(ctx.item.url);
                setCtx(null);
              }}
            >
              {t('internal.historyRemoveFromSite')}
              <Globe size={13} />
            </button>
          </div>
        </div>
      )}
    </InternalPage>
  );
}
