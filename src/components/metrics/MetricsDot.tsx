import { useState } from 'react';

/** Lightweight status affordance — kept out of ResourcesPanel so task-manager can stay lazy. */
export function MetricsDot({ onOpenTaskMgr }: { onOpenTaskMgr: () => void }) {
  const [tip, setTip] = useState('Zasoby — Shift+Esc');
  const [level, setLevel] = useState<'ok' | 'warn' | 'hot'>('ok');

  return (
    <button
      type="button"
      className={`icon-btn mx-dot-btn level-${level}`}
      title={tip}
      onClick={onOpenTaskMgr}
      onMouseEnter={() => {
        void (async () => {
          const { metricsOnce, getLatestMetrics } = await import('../../lib/useMetrics');
          const snap = getLatestMetrics() || (await metricsOnce());
          if (!snap) return;
          const cpu = snap.browser.cpu;
          const mem = snap.system.memPercent;
          setTip(`CPU app ${cpu.toFixed(0)}% · RAM sys ${mem.toFixed(0)}% · Shift+Esc`);
          setLevel(cpu > 60 || mem > 90 ? 'hot' : cpu > 35 || mem > 80 ? 'warn' : 'ok');
        })();
      }}
    >
      <i className="mx-status-dot" />
    </button>
  );
}
