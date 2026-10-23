import { useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Segmented } from '../ui';
import { sectionTransition } from '../../lib/motionPresets';
import { useT } from '../../i18n';
import { LookTab } from './tabs/LookTab';
import { LayoutTab } from './tabs/LayoutTab';
import { WidgetsTab } from './tabs/WidgetsTab';
import { SoundsTab } from './tabs/SoundsTab';

type TabId = 'look' | 'widgets' | 'layout' | 'sounds';

const EASE_STUDIO = [0.22, 1, 0.36, 1] as const;

/** Floating glass panel on the right; the real home page stays visible and interactive. */
export function PersonalizeSheet({
  open,
  onClose,
  onEditOnPage,
  reduced,
}: {
  open: boolean;
  onClose: () => void;
  onEditOnPage: () => void;
  reduced: boolean;
}) {
  const t = useT();
  const [tab, setTab] = useState('look' as TabId);
  const [top, setTop] = useState(56);
  const sectionMotion = sectionTransition(reduced);

  /* Sit below the browser chrome (tabs + omnibox), whatever its current height. */
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const home = document.querySelector('.home');
      const y = home ? home.getBoundingClientRect().top : 0;
      setTop(Math.max(56, Math.round(y) + 16));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  const tabOptions = useMemo(
    () => [
      { id: 'look' as const, label: t('home.personalize.tabLook') },
      { id: 'widgets' as const, label: t('home.personalize.tabWidgets') },
      { id: 'layout' as const, label: t('home.personalize.tabLayout') },
      { id: 'sounds' as const, label: t('home.personalize.tabSounds') },
    ],
    [t],
  );

  const slide = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: 48 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: 48 },
      };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.aside
          key="pz-studio"
          className="pz-studio"
          role="dialog"
          aria-labelledby="pz-studio-title"
          style={{ ['--pz-top' as string]: `${top}px` } as CSSProperties}
          initial={slide.initial}
          animate={slide.animate}
          exit={slide.exit}
          transition={{ duration: reduced ? 0.12 : 0.42, ease: EASE_STUDIO }}
        >
          <header className="pz-studio-head">
            <h2 id="pz-studio-title">{t('home.personalize.title')}</h2>
            <button type="button" className="pz-studio-done" onClick={onClose}>
              {t('common.done')}
            </button>
          </header>

          <div className="pz-studio-tabs">
            <Segmented
              value={tab}
              options={tabOptions}
              onChange={(id) => setTab(id as TabId)}
              aria-label={t('home.personalize.sectionAria')}
            />
          </div>

          <div className="pz-studio-scroll">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={tab}
                className="pz-studio-pane"
                initial={sectionMotion.initial}
                animate={sectionMotion.animate}
                exit={sectionMotion.exit}
                transition={sectionMotion.transition}
              >
                {tab === 'look' && <LookTab />}
                {tab === 'widgets' && <WidgetsTab onEditOnPage={onEditOnPage} />}
                {tab === 'layout' && <LayoutTab reduced={reduced} />}
                {tab === 'sounds' && <SoundsTab />}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
}
