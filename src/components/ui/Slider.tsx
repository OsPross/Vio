import { useCallback, useRef } from 'react';

/** Custom slider — no native range. */
export function Slider({
  value,
  min,
  max,
  onChange,
  'aria-label': ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  'aria-label'?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pct = ((value - min) / (max - min)) * 100;

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const t = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      onChange(Math.round(min + t * (max - min)));
    },
    [min, max, onChange],
  );

  return (
    <div
      className="ui-slider"
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          onChange(Math.max(min, value - 1));
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          onChange(Math.min(max, value + 1));
        }
      }}
    >
      <div
        ref={trackRef}
        className="ui-slider-track"
        style={{ ['--ui-pct' as string]: `${pct}%` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 1) return;
          setFromClientX(e.clientX);
        }}
      >
        <i className="ui-slider-fill" />
        <b className="ui-slider-thumb" />
      </div>
      <span className="ui-slider-val">{value}</span>
    </div>
  );
}
