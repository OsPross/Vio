import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus, X } from 'lucide-react';
import { useT } from '../i18n';
import { popupTransition } from '../lib/motionPresets';
import {
  normalizeHomeChrome,
  placeNewHomeWidget,
  type HomeWidget,
  useStore,
} from '../store';
import { WIDGET_REGISTRY, widgetTypes, type WidgetSizeId } from './registry';
import { WidgetPreview } from './WidgetPreview';

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
  const t = useT();
  const [size, setSize] = useState<WidgetSizeId>('M');
  const used = useMemo(() => new Set(widgets.map((w) => w.type)), [widgets]);
  const chromeRaw = useStore((s) => s.settings.homeChrome);
  const chrome = useMemo(() => normalizeHomeChrome(chromeRaw), [chromeRaw]);
  const allTypes = useMemo(() => widgetTypes(), []);
  const pop = popupTransition(reduced);

  const addType = (type: (typeof allTypes)[number]) => {
    if (used.has(type)) return;
    onAdd(
      placeNewHomeWidget(widgets, chrome, {
        id: `w-${Math.random().toString(36).slice(2, 10)}`,
        type,
        size,
        settings: {},
      }),
    );
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="hw-gallery-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0.06 : 0.12 } }}
          transition={{ duration: reduced ? 0.08 : 0.14 }}
          onClick={onClose}
        >
          <motion.div
            className={`hw-gallery motion-popup ${reduced ? 'reduced' : ''}`}
            role="dialog"
            aria-labelledby="hw-gallery-title"
            initial={pop.initial}
            animate={pop.animate}
            exit={pop.exit}
            transition={pop.transition}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="hw-gallery-head">
              <div>
                <h2 id="hw-gallery-title">{t('home.addWidget')}</h2>
                <p>{t('widgets.galleryPickSize')}</p>
              </div>
              <button
                type="button"
                className="hw-icon-btn"
                onClick={onClose}
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </header>
            <div className="hw-gallery-sizes" role="tablist" aria-label={t('widgets.gallerySizeAria')}>
              {(['S', 'M', 'L'] as WidgetSizeId[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  role="tab"
                  aria-selected={size === s}
                  className={size === s ? 'on' : ''}
                  onClick={() => setSize(s)}
                  title={t(`widgets.size${s}`)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="hw-gallery-scroll">
              <div className="hw-gallery-grid">
                {allTypes.map((type) => {
                  const meta = WIDGET_REGISTRY[type];
                  const already = used.has(type);
                  return (
                    <div
                      key={type}
                      className={`hw-gallery-card ${already ? 'is-added' : ''}`}
                    >
                      <div className="hw-gallery-card-preview">
                        <WidgetPreview type={type} size={size} />
                      </div>
                      <strong>{meta.label}</strong>
                      <span className="hw-gallery-desc">{meta.description}</span>
                      <div className="hw-gallery-meta">
                        <span className="hw-gallery-badge">{size}</span>
                        {already ? (
                          <span className="hw-gallery-badge added">{t('widgets.galleryAdded')}</span>
                        ) : (
                          <button
                            type="button"
                            className="hw-gallery-add"
                            onClick={() => addType(type)}
                          >
                            <Plus size={13} strokeWidth={2} />
                            {t('common.add')}
                          </button>
                        )}
                      </div>
                      {!already && (
                        <button
                          type="button"
                          className="hw-gallery-card-hit"
                          aria-label={t('widgets.galleryAddAria', { name: meta.label })}
                          onClick={() => addType(type)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
