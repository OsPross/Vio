import type { ReactNode } from 'react';
import { Select, type SelectOption } from './Select';

export type DropdownOption = {
  id: string;
  label: string;
  icon?: ReactNode;
};

/** Thin wrapper — same API as before, powered by Select. */
export function Dropdown({
  value,
  options,
  onChange,
  reduced,
  'aria-label': ariaLabel,
}: {
  value: string;
  options: DropdownOption[];
  onChange: (id: string) => void;
  reduced?: boolean;
  'aria-label'?: string;
}) {
  const mapped: SelectOption[] = options.map((o) => ({
    value: o.id,
    label: o.label,
    icon: o.icon,
  }));
  return (
    <Select
      value={value}
      options={mapped}
      onChange={onChange}
      reduced={reduced}
      aria-label={ariaLabel}
    />
  );
}
