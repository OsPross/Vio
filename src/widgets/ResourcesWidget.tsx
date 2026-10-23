import { Cpu } from 'lucide-react';
import { useMetrics } from '../lib/useMetrics';
import { useStore } from '../store';

function MiniBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="hw-res-track" aria-hidden>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ResourcesWidget({ size, preview }: { size: 'S' | 'M' | 'L'; preview?: boolean }) {
  const lowPower = useStore((s) => s.settings.perfLowPowerClock);
  const data = useMetrics(!preview, lowPower);

  if (preview) {
    return (
      <div className={`hw-resources hw-size-${size}`}>
        <div className="hw-res-row">
          <div className="hw-res-label">
            <span>CPU</span>
            <strong>34%</strong>
          </div>
          <MiniBar value={34} />
        </div>
        <div className="hw-res-row">
          <div className="hw-res-label">
            <span>RAM</span>
            <strong>58%</strong>
          </div>
          <MiniBar value={58} />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={`hw-resources hw-resources-skel hw-size-${size}`}>
        <div className="hw-skeleton hw-skel-line" />
        <div className="hw-skeleton hw-skel-bar" />
        <div className="hw-skeleton hw-skel-line" />
        <div className="hw-skeleton hw-skel-bar" />
      </div>
    );
  }

  const cpu = data.system.cpu ?? 0;
  const ram = data.system.memPercent ?? 0;

  return (
    <div className={`hw-resources hw-size-${size}`}>
      <div className="hw-res-row">
        <div className="hw-res-label">
          <span>CPU</span>
          <strong>{Math.round(cpu)}%</strong>
        </div>
        <MiniBar value={cpu} />
      </div>
      <div className="hw-res-row">
        <div className="hw-res-label">
          <span>RAM</span>
          <strong>{Math.round(ram)}%</strong>
        </div>
        <MiniBar value={ram} />
      </div>
    </div>
  );
}

export const ResourcesIcon = Cpu;
