import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Switch } from '../ui';

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sg">
      <span className="sg-label">{title}</span>
      <div className="sg-block">{children}</div>
    </section>
  );
}

/** Collapsible block inside a settings group — use for long lists. */
export function SettingsDisclosure({
  title,
  summary,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary?: string;
  badge?: string | number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <details
      className={`sfold${open ? ' is-open' : ''}`}
      open={open}
      onToggle={(e) => {
        const next = (e.currentTarget as HTMLDetailsElement).open;
        setOpen(next);
      }}
    >
      <summary className="sfold-sum">
        <span className="sfold-sum-copy">
          <span className="sfold-title">{title}</span>
          {summary ? <span className="sfold-desc">{summary}</span> : null}
        </span>
        {badge != null && badge !== '' ? <span className="sfold-badge">{badge}</span> : null}
        <ChevronDown size={16} strokeWidth={1.75} className="sfold-chevron" aria-hidden />
      </summary>
      <div className="sfold-body">{children}</div>
    </details>
  );
}

/** One-line toggle for dense lists (exceptions, filter lists). */
export function CompactToggle({
  label,
  detail,
  on,
  onChange,
}: {
  label: string;
  detail?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  const showDetail = Boolean(detail && detail !== label);

  return (
    <div className={`sdense-row${on ? ' on' : ''}`}>
      <div className="sdense-copy sdense-copy-inline">
        <span className="sdense-label truncate">{label}</span>
        {showDetail ? <span className="sdense-detail mono truncate">{detail}</span> : null}
      </div>
      <Switch on={on} onChange={onChange} aria-label={label} />
    </div>
  );
}

export function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className={`sr${desc ? ' sr-has-desc' : ''}`}>
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {desc ? <span className="sr-desc">{desc}</span> : null}
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
    <div className={`sr sr-field${desc ? ' sr-has-desc' : ''}`}>
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {desc ? <span className="sr-desc">{desc}</span> : null}
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
    <div className={`sr${on ? ' on' : ''}${hint ? ' sr-has-desc' : ''}`}>
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {hint ? <span className="sr-desc">{hint}</span> : null}
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
    <div className={`sr${disabled ? ' is-disabled' : ''}${desc ? ' sr-has-desc' : ''}`}>
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {desc ? <span className="sr-desc">{desc}</span> : null}
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
