import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check } from 'lucide-react';
import { Segmented } from '../ui';
import { HomeLivePreview } from './HomeLivePreview';
import { LookTab } from './tabs/LookTab';
import { LayoutTab } from './tabs/LayoutTab';
import { WidgetsTab } from './tabs/WidgetsTab';
import { ClockSearchTab } from './tabs/ClockSearchTab';

const TABS = [
  { id: 'look', label: 'Wygląd' },
  { id: 'layout', label: 'Układ' },
  { id: 'widgets', label: 'Widżety' },
  { id: 'clock', label: 'Zegar i wyszukiwarka' },
] as const;

type TabId = (typeof TABS)[number]['id'];

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
  const [tab, setTab] = useState<TabId>('look');
  const dur = reduced ? 0 : 0.18;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="pz-sheet-scrim"
            aria-label="Zamknij personalizację"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: dur }}
            onClick={onClose}
          />
          <motion.div
            className="pz-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pz-sheet-title"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
            transition={{ duration: dur, ease: [0.16, 1, 0.3, 1] }}
          >
            <header className="pz-sheet-head">
              <div>
                <h2 id="pz-sheet-title">Personalizacja</h2>
                <p>Strona startowa</p>
              </div>
              <button type="button" className="pz-done" onClick={onClose}>
                <Check size={14} strokeWidth={2} />
                Gotowe
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
                    options={TABS.map((t) => ({ id: t.id, label: t.label }))}
                    onChange={(id) => setTab(id as TabId)}
                    aria-label="Sekcja personalizacji"
                  />
                </div>
                <div className="pz-sheet-scroll">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={tab}
                      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      transition={{ duration: reduced ? 0 : 0.14 }}
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
    </AnimatePresence>
  );
}
