import type { ReactNode } from 'react';
import { Switch } from '../../ui';

export function PzSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pz-sec">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function PzGroup({ children }: { children: ReactNode }) {
  return <div className="pz-group">{children}</div>;
}

export function PzRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="pz-row">
      <div className="pz-row-copy">
        <span className="pz-row-title">{label}</span>
        {hint ? <span className="pz-row-hint">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function PzSwitchRow({
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
    <PzRow label={label} hint={hint}>
      <Switch on={on} onChange={onChange} aria-label={label} />
    </PzRow>
  );
}
