import { useLayoutEffect, useRef, useState } from 'react';
import { ClockDigits } from '../../../widgets/ClockWidget';
import type { HomeClockStyle } from '../../../store';

/** Fit "12:34" into the card face — same optical digit size across styles. */
function FitClockFace({ styleId }: { styleId: HomeClockStyle }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const text = textRef.current;
    if (!wrap || !text) return;
    text.style.transform = 'scale(1)';
    const maxW = wrap.clientWidth * 0.8;
    const maxH = wrap.clientHeight * 0.6;
    const w = Math.max(text.scrollWidth, text.offsetWidth, 1);
    const h = Math.max(text.scrollHeight, text.offsetHeight, 1);
    const next = Math.min(maxW / w, maxH / h, 1.6);
    setScale(Number.isFinite(next) && next > 0 ? next : 1);
  }, [styleId]);

  return (
    <div ref={wrapRef} className="pz-cstyle-fit">
      <div
        ref={textRef}
        className={`hw-clock hw-clock-style-${styleId} pz-cstyle-digits`}
        style={{ transform: `scale(${scale})` }}
      >
        <div className="home-time">
          <ClockDigits value="12:34" animate={false} />
        </div>
      </div>
    </div>
  );
}

export function ClockStyleCard({
  id,
  label,
  selected,
  onSelect,
}: {
  id: HomeClockStyle;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`pz-cstyle-card ${selected ? 'on' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="pz-cstyle-face" aria-hidden>
        <FitClockFace styleId={id} />
      </span>
      <strong>{label}</strong>
    </button>
  );
}
