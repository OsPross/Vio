import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Check, ChevronDown } from 'lucide-react';
import { isMotionOff, popupTransition } from '../../lib/motionPresets';
import { useStore } from '../../store';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: ReactNode;
};

export type SelectGroup = {
  label: string;
  options: SelectOption[];
};

type FlatRow =
  | { type: 'group'; label: string }
  | { type: 'option'; option: SelectOption; flatIndex: number };

function flattenOptions(
  options: SelectOption[] | undefined,
  groups: SelectGroup[] | undefined,
): { flat: SelectOption[]; rows: FlatRow[] } {
  const flat: SelectOption[] = [];
  const rows: FlatRow[] = [];
  if (groups?.length) {
    for (const g of groups) {
      rows.push({ type: 'group', label: g.label });
      for (const o of g.options) {
        rows.push({ type: 'option', option: o, flatIndex: flat.length });
        flat.push(o);
      }
    }
  } else {
    for (const o of options || []) {
      rows.push({ type: 'option', option: o, flatIndex: flat.length });
      flat.push(o);
    }
  }
  return { flat, rows };
}

function placeMenu(anchor: DOMRect, menuW: number, menuH: number) {
  const pad = 8;
  const gap = 4;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - anchor.bottom - pad;
  const spaceAbove = anchor.top - pad;
  const openUp = spaceBelow < Math.min(menuH, 200) && spaceAbove > spaceBelow;
  const left = Math.min(Math.max(pad, anchor.left), Math.max(pad, vw - menuW - pad));
  let top = openUp ? anchor.top - menuH - gap : anchor.bottom + gap;
  top = Math.min(Math.max(pad, top), Math.max(pad, vh - Math.min(menuH, vh - pad * 2) - pad));
  return { left, top, openUp };
}

export function Select({
  value,
  options,
  groups,
  onChange,
  disabled,
  className,
  placeholder = 'Wybierz…',
  'aria-label': ariaLabel,
  reduced: reducedProp,
  trigger,
  menuMinWidth = 0,
}: {
  value: string;
  options?: SelectOption[];
  groups?: SelectGroup[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
  reduced?: boolean;
  /** Custom trigger content (icon-only pickers etc.) */
  trigger?: ReactNode;
  /** Floor for popover width (useful for icon triggers) */
  menuMinWidth?: number;
}) {
  const settings = useStore((s) => s.settings);
  const reduced = reducedProp ?? isMotionOff(settings);
  const popMotion = popupTransition(reduced);

  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeBuf = useRef('');
  const typeTimer = useRef(0);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; minWidth: number } | null>(null);
  const [highlight, setHighlight] = useState(-1);

  const { flat, rows } = useMemo(() => flattenOptions(options, groups), [options, groups]);
  const selected = flat.find((o) => o.value === value);
  const selectedIndex = flat.findIndex((o) => o.value === value);

  const close = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
    setPos(null);
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
  }, [disabled, selectedIndex]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const anchor = triggerRef.current!.getBoundingClientRect();
      const measured = menuRef.current?.getBoundingClientRect();
      const menuW = Math.max(
        menuMinWidth || 0,
        Math.max(anchor.width, measured?.width || anchor.width),
      );
      const menuH = measured?.height || Math.min(280, Math.max(flat.length, 1) * 34 + 12);
      const next = placeMenu(anchor, menuW, menuH);
      setPos({
        left: next.left,
        top: next.top,
        minWidth: Math.max(menuMinWidth || 0, anchor.width),
      });
    };
    update();
    requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, flat.length, rows.length, menuMinWidth]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, close]);

  useEffect(() => {
    if (!open || highlight < 0) return;
    optionRefs.current[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight]);

  useEffect(() => {
    if (!open) return;
    // Focus list for arrow keys after open
    requestAnimationFrame(() => menuRef.current?.focus());
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    close();
    triggerRef.current?.focus();
  };

  const jumpToLetter = (ch: string) => {
    const c = ch.toLowerCase();
    if (!c || c.length !== 1) return;
    window.clearTimeout(typeTimer.current);
    typeBuf.current += c;
    typeTimer.current = window.setTimeout(() => {
      typeBuf.current = '';
    }, 500);
    const buf = typeBuf.current;
    const start = highlight >= 0 ? highlight + 1 : 0;
    const order = [...flat.slice(start), ...flat.slice(0, start)];
    const hit = order.find((o) => !o.disabled && o.label.toLowerCase().startsWith(buf));
    if (!hit) return;
    const idx = flat.indexOf(hit);
    if (open) setHighlight(idx);
    else pick(hit.value);
  };

  const moveHighlight = (dir: 1 | -1) => {
    setHighlight((h) => {
      let n = h < 0 ? (dir === 1 ? -1 : 0) : h;
      for (let i = 0; i < flat.length; i++) {
        n = (n + dir + flat.length) % flat.length;
        if (!flat[n]?.disabled) return n;
      }
      return h;
    });
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) openMenu();
      else if (e.key === 'ArrowDown') moveHighlight(1);
      else if (e.key === 'ArrowUp') moveHighlight(-1);
      return;
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      close();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      jumpToLetter(e.key);
    }
  };

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveHighlight(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveHighlight(-1);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      const idx = flat.findIndex((o) => !o.disabled);
      if (idx >= 0) setHighlight(idx);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      for (let i = flat.length - 1; i >= 0; i--) {
        if (!flat[i]?.disabled) {
          setHighlight(i);
          break;
        }
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const opt = flat[highlight];
      if (opt && !opt.disabled) pick(opt.value);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      jumpToLetter(e.key);
    }
  };

  const box =
    pos ??
    (open && triggerRef.current
      ? (() => {
          const r = triggerRef.current!.getBoundingClientRect();
          const minW = Math.max(menuMinWidth || 0, r.width);
          const next = placeMenu(r, minW, Math.min(280, Math.max(flat.length, 1) * 34 + 12));
          return { left: next.left, top: next.top, minWidth: minW };
        })()
      : null);

  return (
    <div
      className={[
        'ui-select',
        trigger ? 'ui-select-custom-trigger' : '',
        className || '',
        open ? 'is-open' : '',
        disabled ? 'is-disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className="ui-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger ?? (
          <>
            <span className="ui-select-value">{selected?.label ?? placeholder}</span>
            <ChevronDown size={14} strokeWidth={1.75} className="ui-select-chevron" aria-hidden />
          </>
        )}
      </button>

      {open &&
        box &&
        createPortal(
          <motion.div
            ref={menuRef}
            id={listId}
            className="ui-select-menu motion-popup"
            role="listbox"
            tabIndex={-1}
            aria-activedescendant={highlight >= 0 ? `${listId}-opt-${highlight}` : undefined}
            initial={popMotion.initial}
            animate={popMotion.animate}
            exit={popMotion.exit}
            transition={popMotion.transition}
            style={{
              position: 'fixed',
              left: box.left,
              top: box.top,
              minWidth: box.minWidth,
              zIndex: 90,
              transformOrigin: 'top center',
            }}
            onKeyDown={onMenuKeyDown}
            onMouseDown={(e) => e.preventDefault()}
          >
            {rows.map((row, i) => {
              if (row.type === 'group') {
                return (
                  <div key={`g-${row.label}-${i}`} className="ui-select-group">
                    {row.label}
                  </div>
                );
              }
              const o = row.option;
              const idx = row.flatIndex;
              const on = o.value === value;
              const hi = idx === highlight;
              return (
                <button
                  key={o.value}
                  id={`${listId}-opt-${idx}`}
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={on}
                  disabled={o.disabled}
                  className={`ui-select-option ${on ? 'on' : ''} ${hi ? 'hi' : ''}`}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => {
                    if (!o.disabled) pick(o.value);
                  }}
                >
                  {o.icon}
                  <span className="ui-select-option-label">{o.label}</span>
                  {on ? <Check size={14} strokeWidth={2} className="ui-select-check" /> : null}
                </button>
              );
            })}
          </motion.div>,
          document.body,
        )}
    </div>
  );
}
