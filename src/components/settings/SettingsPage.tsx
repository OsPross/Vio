import { useMemo } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  Activity,
  ArrowLeft,
  Gauge,
  Home,
  KeyRound,
  LayoutGrid,
  Monitor,
  PanelLeft,
  Search,
  Shield,
  ShieldBan,
  SlidersHorizontal,
  Sparkles,
  Wrench,
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
        title: t('settings.nav.browser'),
        items: [
          {
            id: 'general' as TabId,
            label: t('settings.nav.general'),
            icon: SlidersHorizontal,
            hint: t('settings.nav.generalHint'),
          },
          {
            id: 'home' as TabId,
            label: t('settings.nav.home'),
            icon: Home,
            hint: t('settings.nav.homeHint'),
          },
          {
            id: 'search' as TabId,
            label: t('settings.nav.search'),
            icon: Search,
            hint: t('settings.nav.searchHint'),
          },
        ],
      },
      {
        title: t('settings.nav.interface'),
        items: [
          {
            id: 'look' as TabId,
            label: t('settings.nav.look'),
            icon: Sparkles,
            hint: t('settings.nav.lookHint'),
          },
          {
            id: 'sidebar' as TabId,
            label: t('settings.nav.sidebar'),
            icon: PanelLeft,
            hint: t('settings.nav.sidebarHint'),
          },
          {
            id: 'shortcuts' as TabId,
            label: t('settings.nav.shortcuts'),
            icon: LayoutGrid,
            hint: t('settings.nav.shortcutsHint'),
          },
        ],
      },
      {
        title: t('settings.nav.system'),
        items: [
          {
            id: 'privacy' as TabId,
            label: t('settings.nav.privacy'),
            icon: Shield,
            hint: t('settings.nav.privacyHint'),
          },
          {
            id: 'adblock' as TabId,
            label: t('settings.nav.adblock'),
            icon: ShieldBan,
            hint: t('settings.nav.adblockHint'),
          },
          {
            id: 'passwords' as TabId,
            label: t('settings.nav.passwords'),
            icon: KeyRound,
            hint: t('settings.nav.passwordsHint'),
          },
          {
            id: 'performance' as TabId,
            label: t('settings.nav.performance'),
            icon: Gauge,
            hint: t('settings.nav.performanceHint'),
          },
          {
            id: 'resources' as TabId,
            label: t('settings.nav.resources'),
            icon: Activity,
            hint: t('settings.nav.resourcesHint'),
          },
          {
            id: 'advanced' as TabId,
            label: t('settings.nav.advanced'),
            icon: Wrench,
            hint: t('settings.nav.advancedHint'),
          },
        ],
      },
    ],
    [t],
  );

  const titles = useMemo(
    () =>
      ({
        general: { title: t('settings.titles.general'), desc: t('settings.titles.generalDesc') },
        home: { title: t('settings.titles.home'), desc: t('settings.titles.homeDesc') },
        search: { title: t('settings.titles.search'), desc: t('settings.titles.searchDesc') },
        look: { title: t('settings.titles.look'), desc: t('settings.titles.lookDesc') },
        sidebar: { title: t('settings.titles.sidebar'), desc: t('settings.titles.sidebarDesc') },
        shortcuts: {
          title: t('settings.titles.shortcuts'),
          desc: t('settings.titles.shortcutsDesc'),
        },
        privacy: { title: t('settings.titles.privacy'), desc: t('settings.titles.privacyDesc') },
        adblock: { title: t('settings.titles.adblock'), desc: t('settings.titles.adblockDesc') },
        passwords: {
          title: t('settings.titles.passwords'),
          desc: t('settings.titles.passwordsDesc'),
        },
        performance: {
          title: t('settings.titles.performance'),
          desc: t('settings.titles.performanceDesc'),
        },
        resources: {
          title: t('settings.titles.resources'),
          desc: t('settings.titles.resourcesDesc'),
        },
        advanced: { title: t('settings.titles.advanced'), desc: t('settings.titles.advancedDesc') },
      }) satisfies Record<TabId, { title: string; desc: string }>,
    [t],
  );

  const head = titles[settingsTab] ?? titles.general;
  const motionOff = isMotionOff(settings);
  const sectionMotion = sectionTransition(motionOff);

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <button type="button" className="settings-back" onClick={() => setView('browser')}>
          <ArrowLeft size={16} strokeWidth={1.75} />
          {t('settings.backToBrowser')}
        </button>

        <div className="settings-brand">
          <Monitor size={16} strokeWidth={1.75} />
          <div>
            <strong>{t('settings.brand')}</strong>
            <span>{settings.appName || 'Vio'}</span>
          </div>
        </div>

        <nav className="settings-nav-groups">
          <LayoutGroup id="settings-nav">
            {nav.map((group) => (
              <div key={group.title} className="settings-nav-group">
                <span className="settings-nav-label">{group.title}</span>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const on = settingsTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`settings-nav-item ${on ? 'active' : ''}`}
                      title={item.hint}
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
                      <span className="sn-ico">
                        <Icon size={16} strokeWidth={1.75} />
                      </span>
                      <span>
                        <strong>{item.label}</strong>
                      </span>
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
          <h2>{head.title}</h2>
          <p>{head.desc}</p>
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
