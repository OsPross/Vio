export function Switch({
  on,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`ui-switch ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    />
  );
}
