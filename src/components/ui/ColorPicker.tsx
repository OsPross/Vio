import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { hexToHsv, hsvToCss, hsvToHex, normalizeHex } from '../../lib/color';

type Props = {
  value: string;
  onChange: (hex: string) => void;
  'aria-label'?: string;
  className?: string;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function ColorPicker({
  value,
  onChange,
  'aria-label': ariaLabel = 'Wybierz kolor',
  className,
}: Props) {
  const hex = normalizeHex(value);
  const hsv = hexToHsv(hex);
  const [open, setOpen] = useState(false);
  const [draftHex, setDraftHex] = useState(hex);
  const [hue, setHue] = useState(hsv.h);
  const [sat, setSat] = useState(hsv.s);
  const [val, setVal] = useState(hsv.v);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // Sync from outside when closed
  useEffect(() => {
    if (open) return;
    const next = hexToHsv(hex);
    setHue(next.h);
    setSat(next.s);
    setVal(next.v);
    setDraftHex(hex);
  }, [hex, open]);

  const emit = useCallback(
    (h: number, s: number, v: number) => {
      const next = hsvToHex(h, s, v);
      setDraftHex(next);
      onChange(next);
    },
    [onChange],
  );

  const place = useCallback(() => {
    const anchor = rootRef.current?.getBoundingClientRect();
    if (!anchor) return;
    const panelW = 240;
    const panelH = 280;
    const pad = 8;
    const gap = 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = anchor.right - panelW;
    left = Math.min(Math.max(pad, left), vw - panelW - pad);
    let top = anchor.bottom + gap;
    if (top + panelH > vh - pad && anchor.top - gap - panelH > pad) {
      top = anchor.top - gap - panelH;
    }
    top = Math.min(Math.max(pad, top), vh - panelH - pad);
    setPos({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => place();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, place]);

  const dragSv = (clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const s = clamp01((clientX - r.left) / r.width);
    const v = clamp01(1 - (clientY - r.top) / r.height);
    setSat(s);
    setVal(v);
    emit(hue, s, v);
  };

  const dragHue = (clientX: number) => {
    const el = hueRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const h = clamp01((clientX - r.left) / r.width) * 360;
    setHue(h);
    emit(h, sat, val);
  };

  const bindDrag = (move: (x: number, y: number) => void, ev: ReactPointerEvent) => {
    ev.preventDefault();
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
    move(ev.clientX, ev.clientY);
    const onMove = (e: PointerEvent) => move(e.clientX, e.clientY);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const applyHexDraft = () => {
    const next = normalizeHex(draftHex, hex);
    const hsvNext = hexToHsv(next);
    setHue(hsvNext.h);
    setSat(hsvNext.s);
    setVal(hsvNext.v);
    setDraftHex(next);
    onChange(next);
  };

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          className="ui-color-pop"
          id={uid}
          role="dialog"
          aria-label={ariaLabel}
          style={{ top: pos.top, left: pos.left }}
        >
          <div
            ref={svRef}
            className="ui-color-sv"
            style={{ backgroundColor: hsvToCss(hue, 1, 1) }}
            onPointerDown={(e) => bindDrag((x, y) => dragSv(x, y), e)}
          >
            <div className="ui-color-sv-white" />
            <div className="ui-color-sv-black" />
            <i
              className="ui-color-sv-thumb"
              style={{
                left: `${sat * 100}%`,
                top: `${(1 - val) * 100}%`,
                background: hsvToHex(hue, sat, val),
              }}
            />
          </div>

          <div
            ref={hueRef}
            className="ui-color-hue"
            onPointerDown={(e) => bindDrag((x) => dragHue(x), e)}
          >
            <i
              className="ui-color-hue-thumb"
              style={{ left: `${(hue / 360) * 100}%` }}
            />
          </div>

          <div className="ui-color-hex-row">
            <span className="ui-color-preview" style={{ background: hsvToHex(hue, sat, val) }} />
            <input
              className="ui-color-hex"
              value={draftHex}
              spellCheck={false}
              aria-label="Hex"
              onChange={(e) => setDraftHex(e.target.value)}
              onBlur={applyHexDraft}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  applyHexDraft();
                }
              }}
            />
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={`ui-color${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`ui-color-trigger${open ? ' on' : ''}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={open ? uid : undefined}
        style={{ background: hex }}
        onClick={() => {
          if (!open) {
            const next = hexToHsv(hex);
            setHue(next.h);
            setSat(next.s);
            setVal(next.v);
            setDraftHex(hex);
            place();
          }
          setOpen((v) => !v);
        }}
      />
      {panel}
    </div>
  );
}
