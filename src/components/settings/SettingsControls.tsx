import { type ReactNode } from 'react';
import { Switch } from '../ui';

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sg">
      <span className="sg-label">{title}</span>
      <div className="sg-block">{children}</div>
    </section>
  );
}

export function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="sr">
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {desc && <span className="sr-desc">{desc}</span>}
      </div>
      <div className="sr-control">{children}</div>
    </div>
  );
}

export function FieldRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="sr sr-field">
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {desc && <span className="sr-desc">{desc}</span>}
      </div>
      <div className="sr-control">{children}</div>
    </div>
  );
}

export function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={`sr ${on ? 'on' : ''}`}>
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {hint && <span className="sr-desc">{hint}</span>}
      </div>
      <div className="sr-control">
        <Switch on={on} onChange={onChange} aria-label={label} />
      </div>
    </div>
  );
}

export function SliderRow({
  label,
  desc,
  value,
  valueNum,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  desc?: string;
  value: string;
  valueNum: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className={`sr ${disabled ? 'is-disabled' : ''}`}>
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {desc && <span className="sr-desc">{desc}</span>}
      </div>
      <div className="sr-control">
        <div className="sslider">
          <input
            type="range"
            min={min}
            max={max}
            step={step ?? 1}
            value={valueNum}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
        <span className="sr-value">{value}</span>
      </div>
    </div>
  );
}
