import { Cpu } from 'lucide-react';
import { useMetrics } from '../lib/useMetrics';
import { useStore } from '../store';

function Ring({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="hw-res-ring" role="img" aria-label={`${label} ${Math.round(pct)}%`}>
      <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden>
        <circle className="hw-res-ring-track" cx="36" cy="36" r={r} />
        <circle
          className="hw-res-ring-val"
          cx="36"
          cy="36"
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="hw-res-ring-label">
        <strong>{Math.round(pct)}</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ResourcesWidget({ size, preview }: { size: 'S' | 'M' | 'L'; preview?: boolean }) {
  const lowPower = useStore((s) => s.settings.perfLowPowerClock);
  const data = useMetrics(!preview, lowPower);

  if (preview) {
    return (
      <div className={`hw-resources hw-size-${size}`}>
        <div className="hw-resources-inner">
          <Ring value={34} label="CPU" />
          <Ring value={58} label="RAM" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`hw-resources hw-resources-skel hw-size-${size}`}>
        <div className="hw-resources-inner">
          <div className="hw-skeleton hw-skel-ring" />
          <div className="hw-skeleton hw-skel-ring" />
        </div>
      </div>
    );
  }

  const cpu = data.system.cpu ?? 0;
  const ram = data.system.memPercent ?? 0;

  return (
    <div className={`hw-resources hw-size-${size}`}>
      <div className="hw-resources-inner">
        <Ring value={cpu} label="CPU" />
        <Ring value={ram} label="RAM" />
      </div>
    </div>
  );
}

export const ResourcesIcon = Cpu;
