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
  SlidersHorizontal,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { useStore, type SettingsTab } from '../../store';
import { isMotionOff, sectionTransition } from '../../lib/motionPresets';
import { PasswordsPanel } from '../PasswordsPanel';
import { ResourcesPanel } from '../metrics/ResourcesPanel';
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

const NAV: {
  title: string;
  items: { id: TabId; label: string; icon: typeof Home; hint: string }[];
}[] = [
  {
    title: 'Przeglądarka',
    items: [
      { id: 'general', label: 'Ogólne', icon: SlidersHorizontal, hint: 'Start i zachowanie' },
      { id: 'home', label: 'Strona startowa', icon: Home, hint: 'Nowa karta' },
      { id: 'search', label: 'Wyszukiwanie', icon: Search, hint: 'Silniki, bangs, Tryb Tor' },
    ],
  },
  {
    title: 'Interfejs',
    items: [
      { id: 'look', label: 'Wygląd', icon: Sparkles, hint: 'Motywy i glass' },
      { id: 'sidebar', label: 'Sidebar', icon: PanelLeft, hint: 'Rail i aplikacje' },
      { id: 'shortcuts', label: 'Skróty', icon: LayoutGrid, hint: 'Ikony na home' },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'privacy', label: 'Prywatność', icon: Shield, hint: 'Adblock i historia' },
      { id: 'passwords', label: 'Hasła', icon: KeyRound, hint: 'Sejf i autouzupełnianie' },
      { id: 'performance', label: 'Wydajność', icon: Gauge, hint: 'RAM, CPU, karty' },
      { id: 'resources', label: 'Zasoby', icon: Activity, hint: 'Menedżer zadań' },
      { id: 'advanced', label: 'Zaawansowane', icon: Wrench, hint: 'Diagnostyka' },
    ],
  },
];

const TITLES: Record<TabId, { title: string; desc: string }> = {
  general: { title: 'Ogólne', desc: 'Nazwa aplikacji, strona startowa i zachowanie okna.' },
  home: { title: 'Strona startowa', desc: 'Teksty, układ i elementy nowej karty.' },
  search: { title: 'Wyszukiwanie', desc: 'Silniki web, prywatne, onion oraz własne bangs.' },
  look: { title: 'Wygląd', desc: 'Motywy, akcent, glass i gęstość interfejsu.' },
  sidebar: { title: 'Sidebar', desc: 'Rail aplikacji bocznych i szerokość panelu.' },
  shortcuts: { title: 'Skróty', desc: 'Ikony na stronie startowej i w railu.' },
  privacy: { title: 'Prywatność', desc: 'Blokada reklam, trackerów i lokalna historia.' },
  passwords: { title: 'Hasła', desc: 'Zaszyfrowany sejf, generator, audyt i autouzupełnianie.' },
  performance: { title: 'Wydajność', desc: 'RAM, CPU, cache i zachowanie kart.' },
  resources: { title: 'Zasoby', desc: 'Zużycie systemu i przeglądarki (Shift+Esc).' },
  advanced: { title: 'Zaawansowane', desc: 'Status techniczny, skróty klawiszowe i reset.' },
};

export function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const settingsTab = useStore((s) => s.settingsTab);
  const setView = useStore((s) => s.setView);
  const setSettingsTab = useStore((s) => s.setSettingsTab);

  const head = TITLES[settingsTab] ?? TITLES.general;
  const motionOff = isMotionOff(settings);
  const sectionMotion = sectionTransition(motionOff);

  return (
    <div className="settings-page">
      <aside className="settings-nav">
        <button type="button" className="settings-back" onClick={() => setView('browser')}>
          <ArrowLeft size={16} strokeWidth={1.75} />
          Wróć do przeglądarki
        </button>

        <div className="settings-brand">
          <Monitor size={16} strokeWidth={1.75} />
          <div>
            <strong>Ustawienia</strong>
            <span>{settings.appName || 'Vio'}</span>
          </div>
        </div>

        <nav className="settings-nav-groups">
          <LayoutGroup id="settings-nav">
            {NAV.map((group) => (
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
