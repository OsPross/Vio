import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Moon, X } from 'lucide-react';
import { metricsRetry, useMetrics } from '../../lib/useMetrics';
import type { MetricsRow } from '../../lib/metricsTypes';
import { resolveFavicon, faviconImgFallback } from '../../lib/favicon';
import { isMotionOff, popupTransition } from '../../lib/motionPresets';
import { AnimatedNumber, Sparkline } from './Sparkline';
import { useStore } from '../../store';
import { useT } from '../../i18n';

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
  const t = useT();
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
    const timer = window.setTimeout(() => {
      setLoadError(t('settings.resources.metricsMissing'));
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [active, data, t]);

  const onRetry = async () => {
    setRetrying(true);
    setLoadError('');
    try {
      const snap = await metricsRetry();
      if (!snap) setLoadError(t('settings.resources.metricsFetchFailed'));
    } catch (err) {
      setLoadError(
        String((err as Error)?.message || err || t('settings.resources.metricsIpcError')),
      );
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
    if (tabs.some((tab) => tab.id === id)) updateTab(id, { discarded: true });
  };

  const kill = (id: string, kind: string) => {
    if (kind === 'tab' && tabs.some((tab) => tab.id === id)) closeTab(id);
  };

  return (
    <div className="settings-stack">
      <section className="sg">
        <span className="sg-label">{t('settings.resources.systemBrowser')}</span>
        <div className="sg-block mx-overview">
          <div className="mx-card">
            <div className="mx-card-head">
              <span>{t('settings.resources.cpuSystem')}</span>
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
              <span>{t('settings.resources.ramSystem')}</span>
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
              <span>{t('settings.resources.cpuVio')}</span>
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
              <span>{t('settings.resources.ramVio')}</span>
              <strong>
                <AnimatedNumber value={data?.browser.memMb ?? 0} digits={0} suffix=" MB" />
              </strong>
            </div>
            <Sparkline points={data?.history ?? []} field="appMem" width={200} height={40} />
            <div className="mx-sub">
              {data ? t('settings.resources.processes', { n: data.browser.processes }) : '—'}
            </div>
          </div>
        </div>
      </section>

      {(data?.gpu?.gpuDevice || data?.uptimeSec != null) && (
        <section className="sg">
          <span className="sg-label">{t('settings.resources.details')}</span>
          <div className="sg-block">
            <div className="sr">
              <div className="sr-text">
                <div className="sr-label">{t('settings.resources.uptime')}</div>
              </div>
              <div className="sr-control">
                <span className="sr-value">{formatUptime(data?.uptimeSec ?? 0)}</span>
              </div>
            </div>
            {data?.gpu?.gpuDevice && (
              <div className="sr">
                <div className="sr-text">
                  <div className="sr-label">{t('settings.resources.gpu')}</div>
                  <div className="sr-hint">{data.gpu.gpuDevice}</div>
                </div>
              </div>
            )}
            <div className="sr">
              <div className="sr-text">
                <div className="sr-label">{t('settings.resources.sampling')}</div>
                <div className="sr-hint">{t('settings.resources.samplingHint')}</div>
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
        <span className="sg-label">{t('settings.resources.taskManager')}</span>
        <div className="sg-block mx-table-wrap">
          {loadError && !data ? (
            <div className="snote" style={{ display: 'grid', gap: 10 }}>
              <span>{loadError}</span>
              <button type="button" className="sbtn" disabled={retrying} onClick={() => void onRetry()}>
                {t('errors.tryAgain')}
              </button>
            </div>
          ) : (
            !data && <p className="snote">{t('settings.resources.loading')}</p>
          )}
          {data && (
            <table className="mx-table">
              <thead>
                <tr>
                  <th onClick={() => toggleSort('title')}>{t('settings.resources.colTask')}</th>
                  <th onClick={() => toggleSort('cpu')}>{t('settings.resources.colCpu')}</th>
                  <th onClick={() => toggleSort('memMb')}>{t('settings.resources.colMem')}</th>
                  <th onClick={() => toggleSort('netRate')}>{t('settings.resources.colNet')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isTab = r.kind === 'tab' && tabs.some((tab) => tab.id === r.id);
                  const sleeping = isTab && tabs.find((tab) => tab.id === r.id)?.discarded;
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
                              {r.kind === 'tab'
                                ? t('settings.resources.kindTab')
                                : r.kind === 'side'
                                  ? t('settings.resources.kindSidebar')
                                  : r.kind}
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
                            title={t('settings.resources.sleep')}
                            onClick={() => sleep(r.id)}
                          >
                            <Moon size={13} strokeWidth={1.75} />
                          </button>
                        )}
                        {isTab && (
                          <button
                            type="button"
                            className="sbtn danger-text"
                            title={t('common.close')}
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
  const t = useT();
  const settings = useStore((s) => s.settings);
  const motionOff = isMotionOff(settings);
  const popMotion = popupTransition(motionOff);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="mx-overlay"
          role="dialog"
          aria-label={t('settings.resources.overlayTitle')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: motionOff ? 0.06 : 0.12 } }}
          transition={{ duration: motionOff ? 0.08 : 0.14 }}
        >
          <button
            type="button"
            className="mx-overlay-backdrop"
            aria-label={t('common.close')}
            onClick={onClose}
          />
          <motion.div
            className="mx-overlay-panel motion-popup"
            initial={popMotion.initial}
            animate={popMotion.animate}
            exit={popMotion.exit}
            transition={popMotion.transition}
            style={{ transformOrigin: 'center center' }}
          >
            <header className="mx-overlay-head">
              <div>
                <strong>{t('settings.resources.overlayTitle')}</strong>
                <span>{t('settings.resources.overlayHint')}</span>
              </div>
              <button type="button" className="icon-btn" onClick={onClose} title={t('common.close')}>
                <X size={16} strokeWidth={1.75} />
              </button>
            </header>
            <div className="mx-overlay-body">
              <ResourcesPanel active={open} />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function HomeResourcesWidget({ active }: { active: boolean }) {
  const t = useT();
  const lowPower = useStore((s) => s.settings.perfLowPowerClock);
  const data = useMetrics(active, lowPower);
  if (!active) return null;
  return (
    <div className="mx-home-widget">
      <div className="mx-home-row">
        <span>{t('settings.resources.widgetCpu')}</span>
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
        <span>{t('settings.resources.widgetRam')}</span>
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
        <span>{t('settings.resources.widgetVio')}</span>
        <strong>
          <AnimatedNumber value={data?.browser.memMb ?? 0} digits={0} suffix=" MB" />
        </strong>
      </div>
    </div>
  );
}
