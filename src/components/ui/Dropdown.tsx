import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';

export type DropdownOption = {
  id: string;
  label: string;
  icon?: ReactNode;
};

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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="ui-dd" ref={ref}>
      <button
        type="button"
        className="ui-dd-trigger"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        {selected?.icon}
        <span className="ui-dd-label">{selected?.label ?? value}</span>
        <ChevronDown size={14} strokeWidth={1.75} className="ui-dd-chevron" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="ui-dd-menu"
            role="listbox"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.14 }}
          >
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === value}
                className={`ui-dd-option ${o.id === value ? 'on' : ''}`}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                {o.icon}
                <span>{o.label}</span>
                {o.id === value && <Check size={13} strokeWidth={2} className="ui-dd-check" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
