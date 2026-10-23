import type { CSSProperties } from 'react';
import { Cpu } from 'lucide-react';
import { useMetrics } from '../lib/useMetrics';
import { useStore } from '../store';

function Stat({ value, label }: { value: number | null; label: string }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      className="hw-res-stat"
      role="img"
      aria-label={value == null ? label : `${label} ${Math.round(pct)}%`}
    >
      <span className="hw-res-label">{label}</span>
      <strong className="hw-res-value">
        {value == null ? '—' : Math.round(pct)}
        <small>%</small>
      </strong>
      <span className="hw-res-bar" style={{ '--pct': `${pct}%` } as CSSProperties}>
        <i />
      </span>
    </div>
  );
}

export function ResourcesWidget({ size, preview }: { size: 'S' | 'M' | 'L'; preview?: boolean }) {
  const lowPower = useStore((s) => s.settings.perfLowPowerClock);
  const data = useMetrics(!preview, lowPower);

  const cpu = preview ? 34 : data ? (data.system.cpu ?? 0) : null;
  const ram = preview ? 58 : data ? (data.system.memPercent ?? 0) : null;

  return (
    <div className={`hw-resources hw-size-${size}`}>
      <Stat value={cpu} label="CPU" />
      <Stat value={ram} label="RAM" />
    </div>
  );
}

export const ResourcesIcon = Cpu;
