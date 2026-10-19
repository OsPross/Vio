import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import {
  fuzzyHighlight,
  fuzzyScore,
  getCommandTitle,
  getCommands,
  getRecentCommandIds,
  pushRecentCommand,
  type CommandContext,
  type CommandDef,
} from '../lib/commands';
import { useT } from '../i18n';
import { useStore, isTorTab, type Tab } from '../store';

type Result =
  | { kind: 'command'; cmd: CommandDef; score: number }
  | { kind: 'tab'; tab: Tab; score: number }
  | { kind: 'history'; title: string; url: string; score: number }
  | { kind: 'bang'; key: string; label: string; score: number }
  | { kind: 'search'; q: string; score: number };

type Props = {
  open: boolean;
  onClose: () => void;
  onNavigate: (url: string, opts?: { newTab?: boolean }) => void;
  onSwitchTab: (id: string) => void;
  onRunBang: (fill: string) => void;
};

export function CommandPalette({ open, onClose, onNavigate, onSwitchTab, onRunBang }: Props) {
  const t = useT();
  const tabs = useStore((s) => s.tabs);
  const activeId = useStore((s) => s.activeId);
  const bangs = useStore((s) => s.bangs);
  const settings = useStore((s) => s.settings);
  const closedTabs = useStore((s) => s.closedTabs);
  const active = tabs.find((t) => t.id === activeId);
  const tor = isTorTab(active);

  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const [hist, setHist] = useState<{ title: string; url: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setIdx(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    if (!tor) {
      void window.shell?.historyList?.({ limit: 40 }).then((res) => {
        if (res?.items) {
          setHist(res.items.map((i) => ({ title: i.title || i.url, url: i.url })));
        }
      });
    } else setHist([]);
  }, [open, tor]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const ctx: CommandContext = {
    tor,
    activeUrl: active?.url,
    closedCount: closedTabs.length,
    theme: settings.theme,
    searchEngine: settings.searchEngine,
    privacyPreset: settings.privacyPreset,
    sidebarVisible: settings.showSidebar,
  };

  const prefix = q.trim()[0];
  const body = ['>', '@', '#', '!', '?'].includes(prefix) ? q.trim().slice(1).trim() : q.trim();
  const mode =
    prefix === '>'
      ? 'commands'
      : prefix === '@'
        ? 'tabs'
        : prefix === '#'
          ? 'history'
          : prefix === '!'
            ? 'bangs'
            : prefix === '?'
              ? 'help'
              : 'all';

  const results = useMemo(() => {
    const out: Result[] = [];
    const query = body;

    if (mode === 'help') {
      return [
        {
          kind: 'command' as const,
          score: 1,
          cmd: {
            id: 'help',
            title: '> polecenia · @ karty · # historia · ! bangs · ? pomoc',
            icon: Search,
            group: 'command' as const,
            run: () => {},
          },
        },
      ];
    }

    if (!query && mode === 'all') {
      const recent = getRecentCommandIds();
      const cmds = getCommands().filter((c) => !c.when || c.when(ctx));
      for (const id of recent) {
        const cmd = cmds.find((c) => c.id === id);
        if (cmd) out.push({ kind: 'command', cmd, score: 2000 });
      }
    }

    if (mode === 'all' || mode === 'commands') {
      for (const cmd of getCommands()) {
        if (cmd.when && !cmd.when(ctx)) continue;
        const hay = `${getCommandTitle(cmd)} ${(cmd.keywords || []).join(' ')}`;
        const score = query
          ? fuzzyScore(query, hay)
          : out.some((r) => r.kind === 'command' && r.cmd.id === cmd.id)
            ? -1
            : 1;
        if (score >= 0) out.push({ kind: 'command', cmd, score });
      }
    }

    if ((mode === 'all' || mode === 'tabs') && (!tor || mode === 'tabs')) {
      const list = tor ? tabs.filter((t) => t.mode === 'tor') : tabs;
      for (const tab of list) {
        const score = query ? fuzzyScore(query, `${tab.title} ${tab.url}`) : 50;
        if (score >= 0) out.push({ kind: 'tab', tab, score });
      }
    }

    if (!tor && (mode === 'all' || mode === 'history')) {
      for (const h of hist) {
        const score = query ? fuzzyScore(query, `${h.title} ${h.url}`) : 20;
        if (score >= 0) out.push({ kind: 'history', ...h, score });
      }
    }

    if (!tor && (mode === 'all' || mode === 'bangs')) {
      for (const b of bangs) {
        const score = query ? fuzzyScore(query, `!${b.key} ${b.label}`) : prefix === '!' ? 40 : -1;
        if (score >= 0) out.push({ kind: 'bang', key: b.key, label: b.label, score });
      }
    }

    if (query && (mode === 'all' || mode === 'commands') && !query.startsWith('http')) {
      out.push({ kind: 'search', q: query, score: 5 });
    }

    // dedupe commands by id keeping best score
    const seen = new Set<string>();
    const deduped: Result[] = [];
    out
      .sort((a, b) => b.score - a.score)
      .forEach((r) => {
        const key =
          r.kind === 'command'
            ? `c:${r.cmd.id}`
            : r.kind === 'tab'
              ? `t:${r.tab.id}`
              : r.kind === 'history'
                ? `h:${r.url}`
                : r.kind === 'bang'
                  ? `b:${r.key}`
                  : `s:${r.q}`;
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(r);
      });
    return deduped.slice(0, 12);
  }, [body, mode, tor, tabs, hist, bangs, ctx, prefix, q, settings.uiLocale]);

  useEffect(() => setIdx(0), [q]);

  const run = (r: Result, newTab?: boolean) => {
    if (r.kind === 'command') {
      pushRecentCommand(r.cmd.id);
      void r.cmd.run({ ...ctx, openInNewTab: newTab });
      onClose();
      return;
    }
    if (r.kind === 'tab') {
      onSwitchTab(r.tab.id);
      onClose();
      return;
    }
    if (r.kind === 'history') {
      onNavigate(r.url, { newTab });
      onClose();
      return;
    }
    if (r.kind === 'bang') {
      onRunBang(`!${r.key} `);
      onClose();
      return;
    }
    if (r.kind === 'search') {
      onNavigate(r.q, { newTab });
      onClose();
    }
  };

  if (!open) return null;

  const groups: { label: string; items: { r: Result; i: number }[] }[] = [];
  const pushGroup = (label: string, kind: Result['kind']) => {
    const items = results.map((r, i) => ({ r, i })).filter((x) => x.r.kind === kind);
    if (items.length) groups.push({ label, items });
  };
  if (!body && mode === 'all') {
    const recentItems = results
      .map((r, i) => ({ r, i }))
      .filter((x) => x.r.kind === 'command' && getRecentCommandIds().includes(x.r.cmd.id));
    if (recentItems.length) groups.push({ label: t('chrome.cmdGroupRecent'), items: recentItems });
  }
  pushGroup(t('chrome.cmdGroupTabs'), 'tab');
  pushGroup(t('chrome.cmdGroupHistory'), 'history');
  pushGroup(t('chrome.cmdGroupBangs'), 'bang');
  pushGroup(t('chrome.cmdGroupCommands'), 'command');
  pushGroup(t('chrome.cmdGroupSearch'), 'search');

  return (
    <div className="cmdk-root" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk-panel" role="dialog" aria-modal="true">
        <div className="cmdk-input-row">
          <Search size={16} strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('chrome.cmdPalettePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setIdx((i) => Math.min(results.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && results[idx]) {
                e.preventDefault();
                run(results[idx], e.ctrlKey);
              }
            }}
          />
        </div>
        <div className="cmdk-list">
          {!results.length && (
            <p className="muted cmdk-empty">{t('chrome.cmdPaletteEmpty')}</p>
          )}
          {groups.map((g) => (
            <div key={g.label} className="cmdk-group">
              <div className="cmdk-group-label">{g.label}</div>
              {g.items.map(({ r, i }) => {
                const activeRow = i === idx;
                const title =
                  r.kind === 'command'
                    ? getCommandTitle(r.cmd)
                    : r.kind === 'tab'
                      ? r.tab.title
                      : r.kind === 'history'
                        ? r.title
                        : r.kind === 'bang'
                          ? `!${r.key}`
                          : t('chrome.cmdSearchFor', { q: r.q });
                const sub =
                  r.kind === 'command'
                    ? r.cmd.shortcut || ''
                    : r.kind === 'tab'
                      ? r.tab.url
                      : r.kind === 'history'
                        ? r.url
                        : r.kind === 'bang'
                          ? r.label
                          : settings.searchEngine;
                const Ico = r.kind === 'command' ? r.cmd.icon : Search;
                return (
                  <button
                    key={`${g.label}-${i}`}
                    type="button"
                    className={`cmdk-row ${activeRow ? 'active' : ''}`}
                    onMouseEnter={() => setIdx(i)}
                    onClick={(e) => run(r, e.ctrlKey)}
                  >
                    <span className="cmdk-ico">
                      <Ico size={14} strokeWidth={1.75} />
                    </span>
                    <span className="grow">
                      <span className="cmdk-title">
                        {fuzzyHighlight(title, body).map((p, pi) =>
                          p.hit ? <mark key={pi}>{p.text}</mark> : <span key={pi}>{p.text}</span>,
                        )}
                      </span>
                      {sub ? <span className="cmdk-sub">{sub}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
