import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Renders children at a fixed virtual W×H, scaled to fit the frame via ResizeObserver.
 * No vw/vh inside — children use absolute px relative to the virtual viewport.
 */
export function ScaledPreview({
  width,
  height,
  children,
  className,
}: {
  width: number;
  height: number;
  children: ReactNode;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      setScale(Math.min(r.width / width, r.height / height));
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    // Parent flex layouts sometimes settle after first paint
    const raf = requestAnimationFrame(measure);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [width, height]);

  return (
    <div
      ref={frameRef}
      className={['scaled-preview', className || ''].filter(Boolean).join(' ')}
      style={
        {
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          pointerEvents: 'none',
          contain: 'strict',
        } as CSSProperties
      }
    >
      <div
        className="scaled-preview-stage"
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width,
          height,
          marginLeft: -width / 2,
          marginTop: -height / 2,
          transform: `scale(${scale || 0.0001})`,
          transformOrigin: 'center center',
          visibility: scale > 0 ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
