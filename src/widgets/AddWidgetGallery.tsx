import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  normalizeHomeChrome,
  placeNewHomeWidget,
  type HomeWidget,
  type HomeWidgetType,
  useStore,
} from '../store';
import { WIDGET_REGISTRY, type WidgetSizeId } from './registry';
import { WidgetPreview } from './WidgetPreview';

const ALL_TYPES = Object.keys(WIDGET_REGISTRY) as HomeWidgetType[];

export function AddWidgetGallery({
  open,
  onClose,
  widgets,
  onAdd,
  reduced,
}: {
  open: boolean;
  onClose: () => void;
  widgets: HomeWidget[];
  onAdd: (w: HomeWidget) => void;
  reduced: boolean;
}) {
  const [size, setSize] = useState<WidgetSizeId>('M');
  const used = useMemo(() => new Set(widgets.map((w) => w.type)), [widgets]);
  const chromeRaw = useStore((s) => s.settings.homeChrome);
  const chrome = useMemo(() => normalizeHomeChrome(chromeRaw), [chromeRaw]);

  if (!open) return null;

  return (
    <div className="hw-gallery-scrim" onClick={onClose}>
      <div
        className={`hw-gallery ${reduced ? 'reduced' : ''}`}
        role="dialog"
        aria-labelledby="hw-gallery-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="hw-gallery-head">
          <div>
            <h2 id="hw-gallery-title">Dodaj widżet</h2>
            <p>Wybierz typ i rozmiar</p>
          </div>
          <button type="button" className="hw-icon-btn" onClick={onClose} aria-label="Zamknij">
            <X size={16} />
          </button>
        </header>
        <div className="hw-gallery-sizes" role="tablist" aria-label="Rozmiar">
          {(['S', 'M', 'L'] as WidgetSizeId[]).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={size === s}
              className={size === s ? 'on' : ''}
              onClick={() => setSize(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="hw-gallery-scroll">
          <div className="hw-gallery-grid">
            {ALL_TYPES.map((type) => {
              const meta = WIDGET_REGISTRY[type];
              const already = used.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  className={`hw-gallery-card ${already ? 'is-added' : ''}`}
                  onClick={() => {
                    if (already) return;
                    onAdd(
                      placeNewHomeWidget(widgets, chrome, {
                        id: `w-${Math.random().toString(36).slice(2, 10)}`,
                        type,
                        size,
                        settings: {},
                      }),
                    );
                    onClose();
                  }}
                >
                  <WidgetPreview type={type} size={size} />
                  <strong>{meta.label}</strong>
                  <span className="hw-gallery-desc">{meta.description}</span>
                  <div className="hw-gallery-meta">
                    <span className="hw-gallery-badge">{size}</span>
                    {already && <span className="hw-gallery-badge added">Dodany</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
