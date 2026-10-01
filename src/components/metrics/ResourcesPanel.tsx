import { useEffect, useMemo, useState } from 'react';
import { Moon, X } from 'lucide-react';
import { metricsRetry, useMetrics } from '../../lib/useMetrics';
import type { MetricsRow } from '../../lib/metricsTypes';
import { resolveFavicon, faviconImgFallback } from '../../lib/favicon';
import { AnimatedNumber, Sparkline } from './Sparkline';
import { useStore } from '../../store';

function fmtBytes(n: number) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function faviconOf(row: MetricsRow) {
  if (row.favicon) return row.favicon;
  if (row.url) return resolveFavicon(row.url);
  return '';
}

type SortKey = 'title' | 'cpu' | 'memMb' | 'netRate';

export function ResourcesPanel({ active }: { active: boolean }) {
  const lowPower = useStore((s) => s.settings.perfLowPowerClock);
  const data = useMetrics(active, lowPower);
  const closeTab = useStore((s) => s.closeTab);
  const updateTab = useStore((s) => s.updateTab);
  const tabs = useStore((s) => s.tabs);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'cpu', dir: -1 });
  const [loadError, setLoadError] = useState('');
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!active) {
      setLoadError('');
      return;
    }
    if (data) {
      setLoadError('');
      return;
    }
    const t = window.setTimeout(() => {
      setLoadError('Brak metryk z procesu głównego (shell:metrics).');
    }, 6000);
    return () => window.clearTimeout(t);
  }, [active, data]);

  const onRetry = async () => {
    setRetrying(true);
    setLoadError('');
    try {
      const snap = await metricsRetry();
      if (!snap) setLoadError('Nie udało się pobrać metryk. Spróbuj ponownie.');
    } catch (err) {
      setLoadError(String((err as Error)?.message || err || 'Błąd IPC metryk'));
    } finally {
      setRetrying(false);
    }
  };

  const rows = useMemo(() => {
    const list = data?.rows ? [...data.rows] : [];
    list.sort((a, b) => {
      const ka = a[sort.key];
      const kb = b[sort.key];
      if (typeof ka === 'string' && typeof kb === 'string') return ka.localeCompare(kb) * sort.dir;
      return ((Number(ka) || 0) - (Number(kb) || 0)) * sort.dir;
    });
    return list;
  }, [data?.rows, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'title' ? 1 : -1 },
    );
  };

  const sleep = (id: string) => {
    if (tabs.some((t) => t.id === id)) updateTab(id, { discarded: true });
  };

  const kill = (id: string, kind: string) => {
    if (kind === 'tab' && tabs.some((t) => t.id === id)) closeTab(id);
  };

  return (
    <div className="settings-stack">
      <section className="sg">
        <span className="sg-label">System i przeglądarka</span>
        <div className="sg-block mx-overview">
          <div className="mx-card">
            <div className="mx-card-head">
              <span>CPU systemu</span>
              <strong>
                <AnimatedNumber value={data?.system.cpu ?? 0} digits={1} suffix="%" />
              </strong>
            </div>
            <Sparkline
              points={data?.history ?? []}
              field="sysCpu"
              maxHint={100}
              width={200}
              height={40}
            />
          </div>
          <div className="mx-card">
            <div className="mx-card-head">
              <span>RAM systemu</span>
              <strong>
                <AnimatedNumber value={data?.system.memPercent ?? 0} digits={0} suffix="%" />
              </strong>
            </div>
            <Sparkline
              points={data?.history ?? []}
              field="sysMem"
              maxHint={100}
              width={200}
              height={40}
              stroke="color-mix(in srgb, var(--fg-2) 80%, var(--accent))"
            />
            <div className="mx-sub">
              {data ? `${data.system.memUsedMb} / ${data.system.memTotalMb} MB` : '—'}
            </div>
          </div>
          <div className="mx-card">
            <div className="mx-card-head">
              <span>CPU Vio</span>
              <strong>
                <AnimatedNumber value={data?.browser.cpu ?? 0} digits={1} suffix="%" />
              </strong>
            </div>
            <Sparkline
              points={data?.history ?? []}
              field="appCpu"
              maxHint={100}
              width={200}
              height={40}
            />
          </div>
          <div className="mx-card">
            <div className="mx-card-head">
              <span>RAM Vio</span>
              <strong>
                <AnimatedNumber value={data?.browser.memMb ?? 0} digits={0} suffix=" MB" />
              </strong>
            </div>
            <Sparkline points={data?.history ?? []} field="appMem" width={200} height={40} />
            <div className="mx-sub">{data ? `${data.browser.processes} procesów` : '—'}</div>
          </div>
        </div>
      </section>

      {(data?.gpu?.gpuDevice || data?.uptimeSec != null) && (
        <section className="sg">
          <span className="sg-label">Szczegóły</span>
          <div className="sg-block">
            <div className="sr">
              <div className="sr-text">
                <div className="sr-label">Czas działania</div>
              </div>
              <div className="sr-control">
                <span className="sr-value">{formatUptime(data?.uptimeSec ?? 0)}</span>
              </div>
            </div>
            {data?.gpu?.gpuDevice && (
              <div className="sr">
                <div className="sr-text">
                  <div className="sr-label">GPU</div>
                  <div className="sr-hint">{data.gpu.gpuDevice}</div>
                </div>
              </div>
            )}
            <div className="sr">
              <div className="sr-text">
                <div className="sr-label">Próbkowanie</div>
                <div className="sr-hint">
                  Tylko gdy ten widok / menedżer / widżet home jest otwarty
                </div>
              </div>
              <div className="sr-control">
                <span className="sr-value">
                  {data?.intervalMs ? `${data.intervalMs / 1000}s` : '—'}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="sg">
        <span className="sg-label">Menedżer zadań</span>
        <div className="sg-block mx-table-wrap">
          {loadError && !data ? (
            <div className="snote" style={{ display: 'grid', gap: 10 }}>
              <span>{loadError}</span>
              <button type="button" className="sbtn" disabled={retrying} onClick={() => void onRetry()}>
                Spróbuj ponownie
              </button>
            </div>
          ) : (
            !data && <p className="snote">Ładowanie metryk…</p>
          )}
          {data && (
            <table className="mx-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('title')}>Zadanie</th>
                  <th onClick={() => toggleSort('cpu')}>CPU</th>
                  <th onClick={() => toggleSort('memMb')}>Pamięć</th>
                  <th onClick={() => toggleSort('netRate')}>Sieć</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isTab = r.kind === 'tab' && tabs.some((t) => t.id === r.id);
                  const sleeping = isTab && tabs.find((t) => t.id === r.id)?.discarded;
                  return (
                    <tr key={r.id} className={sleeping ? 'is-sleep' : ''}>
                      <td>
                        <div className="mx-task">
                          {faviconOf(r) ? (
                            <img
                              src={faviconOf(r)}
                              alt=""
                              width={14}
                              height={14}
                              onError={(ev) => faviconImgFallback(ev, r.url || r.title)}
                            />
                          ) : (
                            <i className="mx-dot" />
                          )}
                          <span>
                            <strong>{r.title || '—'}</strong>
                            <em>
                              {r.kind === 'tab' ? 'Karta' : r.kind === 'side' ? 'Sidebar' : r.kind}
                            </em>
                          </span>
                        </div>
                      </td>
                      <td>
                        <AnimatedNumber value={r.cpu} digits={1} suffix="%" />
                      </td>
                      <td>{r.memMb ? `${r.memMb} MB` : '—'}</td>
                      <td title={fmtBytes(r.netBytes)}>{r.netRate ? fmtBytes(r.netRate) : '—'}</td>
                      <td className="mx-actions">
                        {isTab && !sleeping && (
                          <button
                            type="button"
                            className="sbtn ghost"
                            title="Uśpij"
                            onClick={() => sleep(r.id)}
                          >
                            <Moon size={13} strokeWidth={1.75} />
                          </button>
                        )}
                        {isTab && (
                          <button
                            type="button"
                            className="sbtn danger-text"
                            title="Zamknij"
                            onClick={() => kill(r.id, r.kind)}
                          >
                            <X size={13} strokeWidth={1.75} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function formatUptime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function TaskManagerOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="mx-overlay" role="dialog" aria-label="Menedżer zadań">
      <button
        type="button"
        className="mx-overlay-backdrop"
        aria-label="Zamknij"
        onClick={onClose}
      />
      <div className="mx-overlay-panel">
        <header className="mx-overlay-head">
          <div>
            <strong>Menedżer zadań</strong>
            <span>Shift+Esc · zużycie kart i procesów</span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} title="Zamknij">
            <X size={16} strokeWidth={1.75} />
          </button>
        </header>
        <div className="mx-overlay-body">
          <ResourcesPanel active={open} />
        </div>
      </div>
    </div>
  );
}

export function HomeResourcesWidget({ active }: { active: boolean }) {
  const lowPower = useStore((s) => s.settings.perfLowPowerClock);
  const data = useMetrics(active, lowPower);
  if (!active) return null;
  return (
    <div className="mx-home-widget">
      <div className="mx-home-row">
        <span>CPU</span>
        <strong>
          <AnimatedNumber value={data?.system.cpu ?? 0} digits={0} suffix="%" />
        </strong>
        <Sparkline
          points={data?.history ?? []}
          field="sysCpu"
          width={72}
          height={22}
          maxHint={100}
        />
      </div>
      <div className="mx-home-row">
        <span>RAM</span>
        <strong>
          <AnimatedNumber value={data?.system.memPercent ?? 0} digits={0} suffix="%" />
        </strong>
        <Sparkline
          points={data?.history ?? []}
          field="sysMem"
          width={72}
          height={22}
          maxHint={100}
        />
      </div>
      <div className="mx-home-row">
        <span>Vio</span>
        <strong>
          <AnimatedNumber value={data?.browser.memMb ?? 0} digits={0} suffix=" MB" />
        </strong>
      </div>
    </div>
  );
}
