import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import { Segmented } from '../ui';
import { DURATION, EASE_OUT, popupTransition, sectionTransition } from '../../lib/motionPresets';
import { useT } from '../../i18n';
import { HomeLivePreview } from './HomeLivePreview';
import { LookTab } from './tabs/LookTab';
import { LayoutTab } from './tabs/LayoutTab';
import { WidgetsTab } from './tabs/WidgetsTab';
import { ClockSearchTab } from './tabs/ClockSearchTab';

const TAB_IDS = ['look', 'layout', 'widgets', 'clock'] as const;

type TabId = (typeof TAB_IDS)[number];

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
  const popMotion = popupTransition(reduced);
  const sectionMotion = sectionTransition(reduced);
  const scrimDur = reduced ? 0.08 : DURATION.popup;

  const tabOptions = useMemo(
    () => [
      { id: 'look' as const, label: t('home.personalize.tabLook') },
      { id: 'layout' as const, label: t('home.personalize.tabLayout') },
      { id: 'widgets' as const, label: t('home.personalize.tabWidgets') },
      { id: 'clock' as const, label: t('home.personalize.tabClock') },
    ],
    [t],
  );

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="pz-sheet-scrim"
            aria-label={t('home.personalize.closeAria')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: reduced ? 0.06 : DURATION.popupOut } }}
            transition={{ duration: scrimDur, ease: EASE_OUT }}
            onClick={onClose}
          />
          <motion.div
            className="pz-sheet motion-popup"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pz-sheet-title"
            initial={popMotion.initial}
            animate={popMotion.animate}
            exit={popMotion.exit}
            transition={popMotion.transition}
            style={{ transformOrigin: 'center center' }}
          >
            <header className="pz-sheet-head">
              <div>
                <h2 id="pz-sheet-title">{t('home.personalize.title')}</h2>
                <p>{t('home.personalize.subtitle')}</p>
              </div>
              <button type="button" className="pz-done" onClick={onClose}>
                <Check size={14} strokeWidth={2} />
                {t('common.done')}
              </button>
            </header>

            <div className="pz-sheet-body">
              <aside className="pz-sheet-preview">
                <HomeLivePreview />
              </aside>
              <div className="pz-sheet-controls">
                <div className="pz-sheet-tabs">
                  <Segmented
                    value={tab}
                    options={tabOptions}
                    onChange={(id) => setTab(id as TabId)}
                    aria-label={t('home.personalize.sectionAria')}
                  />
                </div>
                <div className="pz-sheet-scroll">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={tab}
                      initial={sectionMotion.initial}
                      animate={sectionMotion.animate}
                      exit={sectionMotion.exit}
                      transition={sectionMotion.transition}
                    >
                      {tab === 'look' && <LookTab />}
                      {tab === 'layout' && <LayoutTab />}
                      {tab === 'widgets' && (
                        <WidgetsTab onEditOnPage={onEditOnPage} reduced={reduced} />
                      )}
                      {tab === 'clock' && <ClockSearchTab reduced={reduced} />}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
