import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Archive,
  Download,
  ExternalLink,
  File,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  FolderOpen,
  Pause,
  Play,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { formatUrlPlain } from '../lib/url-display';
import { isMotionOff, popupTransition } from '../lib/motionPresets';
import { useT, useUiLocale } from '../i18n';
import { t as tCore } from '../i18n/core';
import { useStore } from '../store';
import { Input } from './ui/Input';
import { InternalPage } from './InternalPage';

export type DownloadRow = {
  id: string;
  url: string;
  filename: string;
  savePath: string;
  receivedBytes: number;
  totalBytes: number;
  state: string;
  startedAt: number;
  endedAt?: number;
  speedBps: number;
  canResume: boolean;
  tor: boolean;
  risky?: boolean;
  fileMissing?: boolean;
};

function fmtBytes(n: number) {
  if (!n || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fmtSpeed(bps: number) {
  if (!bps) return '—';
  return `${fmtBytes(bps)}/s`;
}

function fmtEta(rec: DownloadRow) {
  if (rec.state !== 'progressing' || !rec.speedBps || !rec.totalBytes) return '';
  const left = Math.max(0, rec.totalBytes - rec.receivedBytes);
  const sec = left / rec.speedBps;
  if (sec < 60) return `${Math.ceil(sec)} s`;
  if (sec < 3600) return `${Math.ceil(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
}

function fmtTime(ts: number, locale: string) {
  return new Date(ts).toLocaleTimeString(locale === 'en' ? 'en-US' : 'pl-PL', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function sourceLabel(url: string) {
  const host = hostOf(url);
  if (host) return host;
  return formatUrlPlain(url, { maxLen: 40 });
}

function extOf(filename: string) {
  const i = filename.lastIndexOf('.');
  if (i <= 0) return '';
  return filename.slice(i).toLowerCase();
}

function FileTypeIcon({ filename, size = 16 }: { filename: string; size?: number }) {
  const ext = extOf(filename);
  const props = { size, strokeWidth: 1.75 as const, 'aria-hidden': true as const };
  const img = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp', '.avif']);
  const vid = new Set(['.mp4', '.webm', '.mkv', '.avi', '.mov', '.m4v']);
  const aud = new Set(['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac']);
  const arc = new Set(['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2']);
  const code = new Set([
    '.js',
    '.ts',
    '.tsx',
    '.jsx',
    '.py',
    '.rs',
    '.go',
    '.html',
    '.css',
    '.json',
    '.xml',
  ]);
  const sheet = new Set(['.xls', '.xlsx', '.csv']);
  const doc = new Set(['.pdf', '.doc', '.docx', '.odt', '.rtf', '.txt', '.md']);
  if (img.has(ext)) return <FileImage {...props} />;
  if (vid.has(ext)) return <FileVideo {...props} />;
  if (aud.has(ext)) return <FileAudio {...props} />;
  if (arc.has(ext)) return <Archive {...props} />;
  if (code.has(ext)) return <FileCode {...props} />;
  if (sheet.has(ext)) return <FileSpreadsheet {...props} />;
  if (doc.has(ext)) return <FileText {...props} />;
  return <File {...props} />;
}

function stateHint(rec: DownloadRow) {
  switch (rec.state) {
    case 'progressing':
      return '';
    case 'paused':
      return tCore('internal.dlPaused');
    case 'completed':
      return rec.fileMissing ? tCore('internal.dlFileMissing') : tCore('internal.dlCompleted');
    case 'cancelled':
      return tCore('internal.dlCancelled');
    case 'interrupted':
      return tCore('internal.dlInterrupted');
    default:
      return rec.state;
  }
}

function progressPct(rec: DownloadRow) {
  if (!rec.totalBytes) return 0;
  return Math.max(0, Math.min(100, Math.round((rec.receivedBytes / rec.totalBytes) * 100)));
}

function ProgressRing({ value, size = 18 }: { value: number; size?: number }) {
  const r = (size - 3) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="dl-ring" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.2}
        strokeWidth={2.5}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={2.5}
        strokeDasharray={`${c * pct} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function canRetry(rec: DownloadRow) {
  return rec.state === 'interrupted' || (rec.state === 'cancelled' && rec.canResume);
}

function RowActions({ rec, compact }: { rec: DownloadRow; compact?: boolean }) {
  const t = useT();
  const busy = rec.state === 'progressing' || rec.state === 'paused';
  const done = rec.state === 'completed' && !rec.tor && !rec.fileMissing;
  const btn = compact ? 'icon-btn sm' : 'icon-btn sm';

  return (
    <div className="dl-actions">
      {rec.state === 'progressing' && (
        <button
          type="button"
          className={btn}
          title={t('internal.dlPause')}
          onClick={() => void window.shell?.downloadsPause?.(rec.id)}
        >
          <Pause size={13} />
        </button>
      )}
      {rec.state === 'paused' && (
        <button
          type="button"
          className={btn}
          title={t('internal.dlResume')}
          onClick={() => void window.shell?.downloadsResume?.(rec.id)}
        >
          <Play size={13} />
        </button>
      )}
      {busy && (
        <button
          type="button"
          className={btn}
          title={t('common.cancel')}
          onClick={() => void window.shell?.downloadsCancel?.(rec.id)}
        >
          <X size={13} />
        </button>
      )}
      {canRetry(rec) && !rec.tor && (
        <button
          type="button"
          className={btn}
          title={t('internal.dlRetry')}
          onClick={() => void window.shell?.downloadsResume?.(rec.id)}
        >
          <RotateCcw size={13} />
        </button>
      )}
      {done && (
        <>
          <button
            type="button"
            className={btn}
            title={t('common.open')}
            onClick={() => void window.shell?.downloadsOpen?.(rec.id)}
          >
            <ExternalLink size={13} />
          </button>
          <button
            type="button"
            className={btn}
            title={t('internal.dlShowInFolder')}
            onClick={() => void window.shell?.downloadsShow?.(rec.id)}
          >
            <FolderOpen size={13} />
          </button>
        </>
      )}
      {rec.state === 'completed' && !rec.tor && rec.fileMissing && (
        <button
          type="button"
          className={btn}
          title={t('internal.dlShowInFolder')}
          onClick={() => void window.shell?.downloadsShow?.(rec.id)}
        >
          <FolderOpen size={13} />
        </button>
      )}
      {!busy && (
        <button
          type="button"
          className={btn}
          title={t('internal.dlRemoveFromList')}
          onClick={() => void window.shell?.downloadsRemove?.(rec.id)}
        >
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

function onDragMouseDown(e: ReactMouseEvent, rec: DownloadRow) {
  if (e.button !== 0 || rec.state !== 'completed' || rec.tor || rec.fileMissing) return;
  e.preventDefault();
  void window.shell?.downloadsDrag?.(rec.id);
}

type ButtonProps = {
  onOpenAll: () => void;
  /** Controlled — parent closes sibling chrome flyouts (shield / extensions). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function DownloadsButton({ onOpenAll, open: openProp, onOpenChange }: ButtonProps) {
  const t = useT();
  const [uncontrolled, setUncontrolled] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? Boolean(openProp) : uncontrolled;
  const setOpen = (next: boolean) => {
    if (!controlled) setUncontrolled(next);
    onOpenChange?.(next);
  };
  const [rows, setRows] = useState<DownloadRow[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const settings = useStore((s) => s.settings);
  const motionOff = isMotionOff(settings);
  const popMotion = popupTransition(motionOff);

  useEffect(() => {
    void window.shell?.downloadsList?.().then((list) => {
      if (Array.isArray(list)) setRows(list as DownloadRow[]);
    });
    const off = window.shell?.onDownloadsChanged?.((list) => {
      if (Array.isArray(list)) setRows(list as DownloadRow[]);
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = rows.filter((r) => r.state === 'progressing' || r.state === 'paused');
  const recent = rows.slice(0, 5);

  const ringValue = useMemo(() => {
    if (!active.length) return 0;
    const total = active.reduce((s, r) => s + (r.totalBytes || 0), 0);
    const rec = active.reduce((s, r) => s + r.receivedBytes, 0);
    if (total > 0) return rec / total;
    return 0.2;
  }, [active]);

  return (
    <div className="dl-btn-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`icon-btn dl-btn ${active.length ? 'busy' : ''} ${open ? 'on' : ''}`}
        title={
          active.length
            ? t('internal.dlTitleCount', { n: active.length })
            : t('pages.downloads')
        }
        aria-expanded={open}
        data-dl-menu-btn
        onClick={() => setOpen(!open)}
      >
        {active.length ? (
          <ProgressRing value={ringValue} />
        ) : (
          <Download size={16} strokeWidth={1.75} />
        )}
        {active.length > 0 && <span className="dl-badge">{active.length > 9 ? '9+' : active.length}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="dl-panel chrome-flyout motion-popup"
            role="dialog"
            aria-label={t('pages.downloads')}
            initial={popMotion.initial}
            animate={popMotion.animate}
            exit={popMotion.exit}
            transition={popMotion.transition}
            style={{ transformOrigin: 'top right' }}
          >
            <div className="chrome-flyout-head">
              <div className="chrome-flyout-head-label">
                <Download size={14} strokeWidth={1.75} aria-hidden />
                <strong>{t('pages.downloads')}</strong>
              </div>
              <button
                type="button"
                className="sbtn text"
                onClick={() => {
                  setOpen(false);
                  onOpenAll();
                }}
              >
                {t('internal.all')}
              </button>
            </div>
            {!recent.length ? (
              <div className="chrome-flyout-empty">
                <Download size={22} strokeWidth={1.5} aria-hidden />
                <p>{t('internal.downloadsEmpty')}</p>
                <span>{t('internal.dlPanelEmptyHint')}</span>
              </div>
            ) : (
              <ul className="dl-panel-list">
                {recent.map((r) => {
                  const pct = progressPct(r);
                  const hint = stateHint(r);
                  return (
                    <li key={r.id} className="dl-panel-row">
                      <div className="dl-panel-icon">
                        <FileTypeIcon filename={r.filename} size={15} />
                      </div>
                      <div className="grow">
                        <div className={`dl-name ${r.fileMissing ? 'dl-missing' : ''}`}>
                          {r.filename}
                          {r.tor ? <em className="dl-tor">Tor</em> : null}
                          {r.risky ? <em className="dl-risk">!</em> : null}
                        </div>
                        <div className="dl-meta muted" title={r.url}>
                          {r.state === 'progressing' || r.state === 'paused'
                            ? `${pct}% · ${fmtBytes(r.receivedBytes)} / ${fmtBytes(r.totalBytes)} · ${fmtSpeed(r.speedBps)}${fmtEta(r) ? ` · ${fmtEta(r)}` : ''}`
                            : `${fmtBytes(r.receivedBytes)}${hint ? ` · ${hint}` : ''}`}
                          {r.url ? <span className="dl-url"> · {sourceLabel(r.url)}</span> : null}
                        </div>
                        {(r.state === 'progressing' || r.state === 'paused') && (
                          <div className="dl-bar">
                            <i style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                      <RowActions rec={r} compact />
                    </li>
                  );
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DownloadsPage() {
  const t = useT();
  const uiLocale = useUiLocale();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<DownloadRow[]>([]);

  const reload = () => {
    void window.shell?.downloadsList?.().then((list) => {
      if (Array.isArray(list)) setRows((list as DownloadRow[]).filter((r) => !r.tor));
    });
  };

  useEffect(() => {
    reload();
    const off = window.shell?.onDownloadsChanged?.((list) => {
      if (Array.isArray(list)) setRows((list as DownloadRow[]).filter((r) => !r.tor));
    });
    return () => off?.();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.filename.toLowerCase().includes(needle) ||
        r.url.toLowerCase().includes(needle) ||
        hostOf(r.url).toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const groups = useMemo(() => {
    const map = new Map<string, DownloadRow[]>();
    for (const r of filtered) {
      const key = dayKey(r.startedAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, items]) => ({
        key,
        label: dayLabel(items[0].startedAt, uiLocale),
        items: items.sort((a, b) => b.startedAt - a.startedAt),
      }));
  }, [filtered, uiLocale]);

  const clearList = () => {
    if (!window.confirm(t('internal.dlClearConfirm'))) return;
    void window.shell?.downloadsClear?.().then(reload);
  };

  return (
    <InternalPage
      className="dl-page"
      title={t('internal.downloads')}
      icon={<Download size={18} strokeWidth={1.75} />}
      subtitle={
        <span>
          {t(rows.length === 1 ? 'internal.downloadsSubOne' : 'internal.downloadsSub', {
            n: rows.length,
          })}
        </span>
      }
      toolbar={
        <>
          <label className="history-search">
            <Search size={14} strokeWidth={1.75} />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('internal.searchDownloads')}
              spellCheck={false}
            />
          </label>
          <button type="button" className="history-sbtn secondary" onClick={clearList}>
            {t('internal.clearList')}
          </button>
        </>
      }
    >
      <div className="history-scroll">
        {!groups.length && (
          <div className="ip-empty">
            <span className="ip-empty-ico" aria-hidden>
              <Download size={28} strokeWidth={1.5} />
            </span>
            <p>{q.trim() ? t('internal.downloadsEmptyQuery') : t('internal.downloadsEmpty')}</p>
            <span className="muted">{t('internal.downloadsEmptyHint')}</span>
          </div>
        )}
        {groups.map((g) => (
          <section key={g.key} className="dl-day">
            <h2 className="history-day-head">{g.label}</h2>
            <ul className="dl-list">
              {g.items.map((r) => {
                const pct = progressPct(r);
                const busy = r.state === 'progressing' || r.state === 'paused';
                const hint = stateHint(r);
                const draggable = r.state === 'completed' && !r.fileMissing;
                return (
                  <li
                    key={r.id}
                    className={`dl-row ${r.fileMissing ? 'is-missing' : ''} ${busy ? 'is-busy' : ''}`}
                    draggable={draggable}
                    onMouseDown={(e) => onDragMouseDown(e, r)}
                  >
                    <div className="dl-row-icon">
                      <FileTypeIcon filename={r.filename} />
                    </div>
                    <div className="dl-row-main">
                      <div className="dl-row-title">
                        <span
                          className={`dl-filename ${r.fileMissing ? 'dl-missing' : ''}`}
                          title={r.filename}
                        >
                          {r.filename}
                        </span>
                        {r.risky ? <em className="dl-risk">{t('internal.dlRisky')}</em> : null}
                      </div>
                      <div className="dl-row-meta muted">
                        <span>
                          {fmtBytes(r.receivedBytes)}
                          {r.totalBytes ? ` / ${fmtBytes(r.totalBytes)}` : ''}
                        </span>
                        <span className="dl-dot">·</span>
                        <span title={r.url}>{sourceLabel(r.url)}</span>
                        <span className="dl-dot">·</span>
                        <span>{fmtTime(r.endedAt || r.startedAt, uiLocale)}</span>
                      </div>
                      {busy && (
                        <div className="dl-row-progress">
                          <div className="dl-bar">
                            <i style={{ width: `${pct}%` }} />
                          </div>
                          <span className="dl-progress-meta muted">
                            {pct}% · {fmtSpeed(r.speedBps)}
                            {fmtEta(r)
                              ? ` · ${t('internal.dlRemaining', { eta: fmtEta(r) })}`
                              : ''}
                            {r.state === 'paused' ? ` · ${t('internal.dlPaused').toLowerCase()}` : ''}
                          </span>
                        </div>
                      )}
                      {!busy && hint && (r.state === 'interrupted' || r.fileMissing) && (
                        <p className="dl-row-hint muted">{hint}</p>
                      )}
                    </div>
                    <RowActions rec={r} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </InternalPage>
  );
}
