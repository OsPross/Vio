import { useMemo } from 'react';
import type { MetricsHistoryPoint } from '../../lib/metricsTypes';

type Props = {
  points: MetricsHistoryPoint[];
  field: keyof Omit<MetricsHistoryPoint, 'ts'>;
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  maxHint?: number;
};

export function Sparkline({
  points,
  field,
  width = 120,
  height = 36,
  stroke = 'var(--accent)',
  fill = 'color-mix(in srgb, var(--accent) 16%, transparent)',
  maxHint,
}: Props) {
  const path = useMemo(() => {
    if (!points.length) return { line: '', area: '', max: 1 };
    const vals = points.map((p) => Number(p[field]) || 0);
    const max = Math.max(maxHint ?? 0, ...vals, 1);
    const n = vals.length;
    const step = n <= 1 ? width : width / (n - 1);
    const coords = vals.map((v, i) => {
      const x = i * step;
      const y = height - (v / max) * (height - 2) - 1;
      return [x, y] as const;
    });
    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area, max };
  }, [points, field, width, height, maxHint]);

  return (
    <svg className="mx-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      {path.area && <path d={path.area} fill={fill} stroke="none" />}
      {path.line && (
        <path d={path.line} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function AnimatedNumber({ value, digits = 0, suffix = '' }: { value: number; digits?: number; suffix?: string }) {
  const shown = Number.isFinite(value) ? value.toFixed(digits) : '—';
  return (
    <span className="mx-num" key={`${shown}${suffix}`}>
      {shown}
      {suffix}
    </span>
  );
}
