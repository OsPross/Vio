import { useMemo } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  ArrowLeft,
  Filter,
  Gauge,
  Home,
  Info,
  KeyRound,
  LayoutGrid,
  Lock,
  Monitor,
  PanelLeft,
  Search,
  SlidersHorizontal,
  Sun,
} from 'lucide-react';
import { useT } from '../../i18n';
import { useStore, type SettingsTab } from '../../store';
import { isMotionOff, sectionTransition } from '../../lib/motionPresets';
import { PasswordsPanel } from '../PasswordsPanel';
import { ResourcesPanel } from '../metrics/ResourcesPanel';
import { AdblockSection } from './sections/AdblockSection';
import { AdvancedSection } from './sections/AdvancedSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { GeneralSection } from './sections/GeneralSection';
import { HomeSection } from './sections/HomeSection';
import { PerformanceSection } from './sections/PerformanceSection';
import { PrivacySection } from './sections/PrivacySection';
import { SearchSection } from './sections/SearchSection';
import { ShortcutsSection } from './sections/ShortcutsSection';
import { SidebarSection } from './sections/SidebarSection';

type TabId = SettingsTab;

export function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const settingsTab = useStore((s) => s.settingsTab);
  const setView = useStore((s) => s.setView);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const t = useT();

  const nav = useMemo(
    () => [
      {
        id: 'browser',
        items: [
          {
            id: 'general' as TabId,
            label: t('settings.nav.general'),
            icon: SlidersHorizontal,
          },
          {
            id: 'home' as TabId,
            label: t('settings.nav.home'),
            icon: Home,
          },
          {
            id: 'search' as TabId,
            label: t('settings.nav.search'),
            icon: Search,
          },
        ],
      },
      {
        id: 'interface',
        items: [
          {
            id: 'look' as TabId,
            label: t('settings.nav.look'),
            icon: Sun,
          },
          {
            id: 'sidebar' as TabId,
            label: t('settings.nav.sidebar'),
            icon: PanelLeft,
          },
          {
            id: 'shortcuts' as TabId,
            label: t('settings.nav.shortcuts'),
            icon: LayoutGrid,
          },
        ],
      },
      {
        id: 'system',
        items: [
          {
            id: 'privacy' as TabId,
            label: t('settings.nav.privacy'),
            icon: Lock,
          },
          {
            id: 'adblock' as TabId,
            label: t('settings.nav.adblock'),
            icon: Filter,
          },
          {
            id: 'passwords' as TabId,
            label: t('settings.nav.passwords'),
            icon: KeyRound,
          },
          {
            id: 'performance' as TabId,
            label: t('settings.nav.performance'),
            icon: Gauge,
          },
          {
            id: 'resources' as TabId,
            label: t('settings.nav.resources'),
            icon: Monitor,
          },
          {
            id: 'advanced' as TabId,
            label: t('settings.nav.advanced'),
            icon: Info,
          },
        ],
      },
    ],
    [t],
  );

  const titles = useMemo(
    () =>
      ({
        general: t('settings.titles.general'),
        home: t('settings.titles.home'),
        search: t('settings.titles.search'),
        look: t('settings.titles.look'),
        sidebar: t('settings.titles.sidebar'),
        shortcuts: t('settings.titles.shortcuts'),
        privacy: t('settings.titles.privacy'),
        adblock: t('settings.titles.adblock'),
        passwords: t('settings.titles.passwords'),
        performance: t('settings.titles.performance'),
        resources: t('settings.titles.resources'),
        advanced: t('settings.titles.advanced'),
      }) satisfies Record<TabId, string>,
    [t],
  );

  const head = titles[settingsTab] ?? titles.general;
  const motionOff = isMotionOff(settings);
  const sectionMotion = sectionTransition(motionOff);

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <button type="button" className="settings-back" onClick={() => setView('browser')}>
          <ArrowLeft size={16} strokeWidth={1.6} />
          {t('settings.backToBrowser')}
        </button>

        <div className="settings-brand">
          <div>
            <strong>{t('settings.brand')}</strong>
            <span>{settings.appName || 'Vio'}</span>
          </div>
        </div>

        <nav className="settings-nav-groups" aria-label={t('settings.brand')}>
          <LayoutGroup id="settings-nav">
            {nav.map((group) => (
              <div key={group.id} className="settings-nav-group">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const on = settingsTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`settings-nav-item ${on ? 'active' : ''}`}
                      onClick={() => setSettingsTab(item.id)}
                    >
                      {on && !motionOff && (
                        <motion.span
                          className="settings-nav-indicator"
                          layoutId="settings-nav-active"
                          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                        />
                      )}
                      {on && motionOff && <span className="settings-nav-indicator" />}
                      <Icon size={16} strokeWidth={1.6} aria-hidden />
                      <strong>{item.label}</strong>
                    </button>
                  );
                })}
              </div>
            ))}
          </LayoutGroup>
        </nav>
      </aside>

      <div className="settings-body">
        <header className="settings-hero">
          <h2>{head}</h2>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={settingsTab}
            className="settings-section-fade"
            initial={sectionMotion.initial}
            animate={sectionMotion.animate}
            exit={sectionMotion.exit}
            transition={sectionMotion.transition}
          >
            {settingsTab === 'general' && <GeneralSection />}
            {settingsTab === 'home' && <HomeSection />}
            {settingsTab === 'search' && <SearchSection />}
            {settingsTab === 'look' && <AppearanceSection />}
            {settingsTab === 'sidebar' && <SidebarSection />}
            {settingsTab === 'shortcuts' && <ShortcutsSection />}
            {settingsTab === 'privacy' && <PrivacySection />}
            {settingsTab === 'adblock' && <AdblockSection />}
            {settingsTab === 'passwords' && (
              <div className="settings-stack">
                <PasswordsPanel />
              </div>
            )}
            {settingsTab === 'performance' && <PerformanceSection />}
            {settingsTab === 'resources' && <ResourcesPanel active={settingsTab === 'resources'} />}
            {settingsTab === 'advanced' && <AdvancedSection />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
