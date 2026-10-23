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
  const allTypes = useMemo(() => widgetTypes(), []);
  const [size, setSize] = useState<WidgetSizeId>('M');
  const [focus, setFocus] = useState<(ReturnType<typeof widgetTypes>)[number] | null>(null);
  const used = useMemo(() => new Set(widgets.map((w) => w.type)), [widgets]);
  const chromeRaw = useStore((s) => s.settings.homeChrome);
  const chrome = useMemo(() => normalizeHomeChrome(chromeRaw), [chromeRaw]);
  const pop = popupTransition(reduced);
  const active =
    (focus && allTypes.includes(focus) ? focus : null) ||
    allTypes.find((ty) => !used.has(ty)) ||
    allTypes[0];

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
            className={`hw-gallery hw-gallery-ios motion-popup ${reduced ? 'reduced' : ''}`}
            role="dialog"
            aria-labelledby="hw-gallery-title"
            initial={pop.initial}
            animate={pop.animate}
            exit={pop.exit}
            transition={pop.transition}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="hw-gallery-head">
              <h2 id="hw-gallery-title">{t('home.addWidget')}</h2>
              <button
                type="button"
                className="hw-icon-btn"
                onClick={onClose}
                aria-label={t('common.close')}
              >
                <X size={16} />
              </button>
            </header>

            <div className="hw-gallery-live">
              {active && (
                <>
                  <WidgetPreview type={active} size={size} className="hw-gallery-live-preview" />
                  <strong className="hw-gallery-live-name">{WIDGET_REGISTRY[active].label}</strong>
                  <div className="hw-gallery-dots" role="tablist" aria-label={t('widgets.gallerySizeAria')}>
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
                  <button
                    type="button"
                    className="hw-gallery-add-screen"
                    disabled={used.has(active)}
                    onClick={() => addType(active)}
                  >
                    <Plus size={15} strokeWidth={2.2} />
                    {used.has(active) ? t('widgets.galleryAdded') : t('widgets.galleryAddScreen')}
                  </button>
                </>
              )}
            </div>

            <div className="hw-gallery-scroll">
              <div className="hw-gallery-rail">
                {allTypes.map((type) => {
                  const meta = WIDGET_REGISTRY[type];
                  const already = used.has(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      className={`hw-gallery-thumb ${active === type ? 'on' : ''} ${already ? 'is-added' : ''}`}
                      onClick={() => setFocus(type)}
                      disabled={already}
                    >
                      <WidgetPreview type={type} size="S" />
                      <span>{meta.label}</span>
                    </button>
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
