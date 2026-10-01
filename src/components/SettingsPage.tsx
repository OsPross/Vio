import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  Activity,
  Gauge,
  Home,
  KeyRound,
  LayoutGrid,
  Monitor,
  PanelLeft,
  Plus,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wrench,
} from 'lucide-react';
import { Segmented, Switch } from './ui';
import { Input } from './ui/Input';
import {
  SEARCH_ENGINES,
  THEMES,
  applyPerfPreset,
  migrateHomeWidgets,
  normalizeHomeWidgets,
  useStore,
  type BgStyle,
  type HomeAlign,
  type HomeDensity,
  type HomeLayout,
  type HomeAppsStyle,
  type PerfMode,
  type SearchEngine,
  type ThemeId,
  type UiDensity,
} from '../store';
import { PasswordsPanel } from './PasswordsPanel';
import { ResourcesPanel } from './metrics/ResourcesPanel';

type TabId =
  | 'general'
  | 'home'
  | 'search'
  | 'look'
  | 'sidebar'
  | 'shortcuts'
  | 'privacy'
  | 'passwords'
  | 'performance'
  | 'resources'
  | 'advanced';

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
  resources: { title: 'Zasoby', desc: 'Zużycie systemu i przeglądarki · Shift+Esc.' },
  advanced: { title: 'Zaawansowane', desc: 'Status techniczny, skróty klawiszowe i reset.' },
};

export function SettingsPage() {
  const settings = useStore((s) => s.settings);
  const settingsTab = useStore((s) => s.settingsTab);
  const bangs = useStore((s) => s.bangs);
  const shortcuts = useStore((s) => s.shortcuts);
  const sideApps = useStore((s) => s.sideApps);
  const setView = useStore((s) => s.setView);
  const setSettingsTab = useStore((s) => s.setSettingsTab);
  const patchSettings = useStore((s) => s.patchSettings);
  const clearHistory = useStore((s) => s.clearHistory);
  const addBang = useStore((s) => s.addBang);
  const removeBang = useStore((s) => s.removeBang);
  const addShortcut = useStore((s) => s.addShortcut);
  const removeShortcut = useStore((s) => s.removeShortcut);
  const addSideApp = useStore((s) => s.addSideApp);
  const removeSideApp = useStore((s) => s.removeSideApp);
  const resetSettings = useStore((s) => s.resetSettings);

  const [bangKey, setBangKey] = useState('');
  const [bangLabel, setBangLabel] = useState('');
  const [bangUrl, setBangUrl] = useState('');
  const [scLabel, setScLabel] = useState('');
  const [scUrl, setScUrl] = useState('');
  const [saLabel, setSaLabel] = useState('');
  const [saUrl, setSaUrl] = useState('');
  const [queryCount, setQueryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void window.shell?.historyStatus?.().then((st) => {
        if (!cancelled && typeof st?.queries === 'number') setQueryCount(st.queries);
      });
    };
    refresh();
    const t = window.setInterval(refresh, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [settingsTab]);

  const engineMeta = SEARCH_ENGINES.find((e) => e.id === settings.searchEngine);
  const head = TITLES[settingsTab] ?? TITLES.general;
  const motionOff =
    settings.perfReduceMotion ||
    !settings.uiMotion ||
    (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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
            <span>{settings.appName || 'Przeglądarka'}</span>
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
            initial={motionOff ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={motionOff ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: motionOff ? 0.1 : 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {settingsTab === 'general' && (
              <div className="settings-stack">
                <SettingsGroup title="Aplikacja">
                  <FieldRow label="Nazwa aplikacji">
                    <Input
                      value={settings.appName}
                      onChange={(e) => patchSettings({ appName: e.target.value })}
                    />
                  </FieldRow>
                  <FieldRow label="Strona startowa" desc="about:home = wbudowana strona startowa">
                    <Input
                      value={settings.homepage}
                      onChange={(e) => patchSettings({ homepage: e.target.value })}
                      placeholder="about:home"
                    />
                  </FieldRow>
                  <FieldRow label="Placeholder omniboxa">
                    <Input
                      value={settings.omniboxPlaceholder}
                      onChange={(e) => patchSettings({ omniboxPlaceholder: e.target.value })}
                    />
                  </FieldRow>
                </SettingsGroup>

                <SettingsGroup title="Pobieranie">
                  <Toggle
                    label="Zawsze pytaj, gdzie zapisać"
                    hint="Karty Tor zawsze pytają"
                    on={settings.downloadsAskWhere}
                    onChange={(v) => patchSettings({ downloadsAskWhere: v })}
                  />
                  <FieldRow label="Folder pobierania" desc="Puste = folder Pobrane systemu">
                    <Input
                      value={settings.downloadsFolder || ''}
                      onChange={(e) => patchSettings({ downloadsFolder: e.target.value })}
                      placeholder="np. C:\\Users\\…\\Downloads"
                    />
                  </FieldRow>
                </SettingsGroup>

                <SettingsGroup title="Zachowanie">
                  <FieldRow label="Przy starcie">
                    <select
                      value={settings.startupMode || 'session'}
                      onChange={(e) =>
                        patchSettings({
                          startupMode: e.target.value as 'session' | 'newtab' | 'pages',
                        })
                      }
                    >
                      <option value="session">Otwórz poprzednie karty</option>
                      <option value="newtab">Otwórz nową kartę</option>
                      <option value="pages">Otwórz konkretne strony</option>
                    </select>
                  </FieldRow>
                  {(settings.startupMode || 'session') === 'pages' && (
                    <FieldRow label="Strony startowe" desc="Jedna URL na linię">
                      <textarea
                        rows={4}
                        value={settings.startupPages || ''}
                        onChange={(e) => patchSettings({ startupPages: e.target.value })}
                        placeholder={'https://example.com\nhttps://wikipedia.org'}
                      />
                    </FieldRow>
                  )}
                  <Toggle
                    label="Nowa karta otwiera wyszukiwarkę"
                    on={settings.newTabIsSearch}
                    onChange={(v) => patchSettings({ newTabIsSearch: v })}
                  />
                  <Toggle
                    label="Szukanie z omniboxa w nowej karcie"
                    on={settings.openSearchInNewTab}
                    onChange={(v) => patchSettings({ openSearchInNewTab: v })}
                  />
                  <Toggle
                    label="Linki zewnętrzne w aplikacji"
                    hint="Zamiast systemowej przeglądarki"
                    on={settings.openExternalInApp}
                    onChange={(v) => patchSettings({ openExternalInApp: v })}
                  />
                  <Toggle
                    label="Obraz w obrazie przy zmianie karty"
                    hint="Gdy wychodzisz z karty z odtwarzanym wideo, włącz PiP (Alt+P lub ikona omniboxa). PiP pozostaje na poziomie systemu po ukryciu karty."
                    on={settings.autoPipOnTabSwitch}
                    onChange={(v) => patchSettings({ autoPipOnTabSwitch: v })}
                  />
                </SettingsGroup>
              </div>
            )}

            {settingsTab === 'home' && (
              <div className="settings-stack">
                <SettingsGroup title="Teksty">
                  <FieldRow label="Nagłówek" desc="Puste = powitanie według godziny">
                    <Input
                      value={settings.homeHeadline}
                      onChange={(e) => patchSettings({ homeHeadline: e.target.value })}
                      placeholder="np. Do roboty"
                    />
                  </FieldRow>
                  <FieldRow label="Podtytuł" desc="Puste = info o silniku">
                    <Input
                      value={settings.homeSubline}
                      onChange={(e) => patchSettings({ homeSubline: e.target.value })}
                      placeholder="Opcjonalnie"
                    />
                  </FieldRow>
                  <FieldRow label="Placeholder w polu szukania">
                    <Input
                      value={settings.homePlaceholder}
                      onChange={(e) => patchSettings({ homePlaceholder: e.target.value })}
                    />
                  </FieldRow>
                </SettingsGroup>

                <SettingsGroup title="Układ">
                  <Row label="Układ">
                    <select
                      value={settings.homeLayout}
                      onChange={(e) => patchSettings({ homeLayout: e.target.value as HomeLayout })}
                    >
                      <option value="dashboard">Wyśrodkowany</option>
                      <option value="minimal">Tylko szukaj</option>
                      <option value="stack">Do lewej</option>
                      <option value="split">Dwie kolumny</option>
                    </select>
                  </Row>
                  <Row label="Wyrównanie">
                    <Segmented
                      value={settings.homeAlign}
                      options={[
                        { id: 'left', label: 'Lewa' },
                        { id: 'center', label: 'Środek' },
                      ]}
                      onChange={(v) => patchSettings({ homeAlign: v as HomeAlign })}
                    />
                  </Row>
                  <Row label="Gęstość">
                    <Segmented
                      value={settings.homeDensity}
                      options={[
                        { id: 'compact', label: 'Kompaktowa' },
                        { id: 'comfortable', label: 'Normalna' },
                        { id: 'spacious', label: 'Przestronna' },
                      ]}
                      onChange={(v) => patchSettings({ homeDensity: v as HomeDensity })}
                    />
                  </Row>
                  <Row label="Styl skrótów">
                    <Segmented
                      value={settings.homeAppsStyle}
                      options={[
                        { id: 'icons', label: 'Ikony' },
                        { id: 'list', label: 'Lista' },
                      ]}
                      onChange={(v) => patchSettings({ homeAppsStyle: v as HomeAppsStyle })}
                    />
                  </Row>
                  <Row label="Tło home">
                    <select
                      value={settings.bgStyle}
                      onChange={(e) => patchSettings({ bgStyle: e.target.value as BgStyle })}
                    >
                      <option value="solid">Jednolite</option>
                      <option value="soft">Delikatny gradient</option>
                      <option value="panel">Panel</option>
                      <option value="mesh">Mesh (głębia)</option>
                      <option value="vignette">Winieta</option>
                    </select>
                  </Row>
                </SettingsGroup>

                <SettingsGroup title="Elementy">
                  <Toggle
                    label="Powitanie (gdy brak własnego nagłówka)"
                    on={settings.homeShowGreeting}
                    onChange={(v) => patchSettings({ homeShowGreeting: v })}
                  />
                  <Toggle
                    label="Zegar"
                    on={settings.homeShowClock}
                    onChange={(v) => patchSettings({ homeShowClock: v })}
                  />
                  <Toggle
                    label="Data"
                    on={settings.homeShowDate}
                    onChange={(v) => patchSettings({ homeShowDate: v })}
                  />
                  <Toggle
                    label="Zegar 24h"
                    on={settings.clock24h}
                    onChange={(v) => patchSettings({ clock24h: v })}
                  />
                  <Toggle
                    label="Nazwa aplikacji"
                    on={settings.homeShowBrand}
                    onChange={(v) => patchSettings({ homeShowBrand: v })}
                  />
                  <Toggle
                    label="Nazwa silnika"
                    on={settings.homeShowEngine}
                    onChange={(v) => patchSettings({ homeShowEngine: v })}
                  />
                  <Toggle
                    label="Skróty / aplikacje"
                    on={settings.homeShowApps}
                    onChange={(v) => patchSettings({ homeShowApps: v })}
                  />
                  <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                    Ostatnie / notatki / zasoby — dodaj widżet z FAB na stronie startowej (lub
                    poniżej).
                  </p>
                  <Toggle
                    label="Widżet: ostatnio odwiedzone"
                    on={settings.homeWidgets.some((w) => w.type === 'recent')}
                    onChange={(v) => {
                      const cur = settings.homeWidgets.length
                        ? normalizeHomeWidgets(settings.homeWidgets)
                        : migrateHomeWidgets(settings);
                      patchSettings({
                        homeShowRecent: v,
                        homeWidgets: v
                          ? cur.some((w) => w.type === 'recent')
                            ? cur
                            : [
                                ...cur,
                                {
                                  id: `w-${Date.now().toString(36)}`,
                                  type: 'recent',
                                  size: 'M',
                                  anchor: 'center',
                                  x: 0,
                                  y: 2,
                                  settings: {},
                                },
                              ]
                          : cur.filter((w) => w.type !== 'recent'),
                      });
                    }}
                  />
                  <Toggle
                    label="Widżet: notatki"
                    on={settings.homeWidgets.some((w) => w.type === 'notes')}
                    onChange={(v) => {
                      const cur = settings.homeWidgets.length
                        ? normalizeHomeWidgets(settings.homeWidgets)
                        : migrateHomeWidgets(settings);
                      patchSettings({
                        homeShowNotes: v,
                        homeWidgets: v
                          ? cur.some((w) => w.type === 'notes')
                            ? cur
                            : [
                                ...cur,
                                {
                                  id: `w-${Date.now().toString(36)}`,
                                  type: 'notes',
                                  size: 'M',
                                  anchor: 'center',
                                  x: 0,
                                  y: 2,
                                  settings: {},
                                },
                              ]
                          : cur.filter((w) => w.type !== 'notes'),
                      });
                    }}
                  />
                  <Toggle
                    label="Widżet: zasoby systemu"
                    hint="CPU / RAM — próbkowanie tylko gdy widoczny"
                    on={settings.homeWidgets.some((w) => w.type === 'resources')}
                    onChange={(v) => {
                      const cur = settings.homeWidgets.length
                        ? normalizeHomeWidgets(settings.homeWidgets)
                        : migrateHomeWidgets(settings);
                      patchSettings({
                        homeShowStats: v,
                        homeWidgets: v
                          ? cur.some((w) => w.type === 'resources')
                            ? cur
                            : [
                                ...cur,
                                {
                                  id: `w-${Date.now().toString(36)}`,
                                  type: 'resources',
                                  size: 'M',
                                  anchor: 'center',
                                  x: 0,
                                  y: 2,
                                  settings: {},
                                },
                              ]
                          : cur.filter((w) => w.type !== 'resources'),
                      });
                    }}
                  />
                  <Toggle
                    label="Bangs w podpowiedziach (!yt…)"
                    on={settings.homeShowBangs}
                    onChange={(v) => patchSettings({ homeShowBangs: v, suggestBangs: v })}
                  />
                </SettingsGroup>
              </div>
            )}

            {settingsTab === 'search' && (
              <div className="settings-stack">
                <SettingsGroup title="Silnik domyślny">
                  <Row label="Silnik">
                    <select
                      value={settings.searchEngine}
                      onChange={(e) =>
                        patchSettings({ searchEngine: e.target.value as SearchEngine })
                      }
                    >
                      <optgroup label="Web">
                        {SEARCH_ENGINES.filter((e) => e.group === 'web').map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Prywatność">
                        {SEARCH_ENGINES.filter((e) => e.group === 'privacy').map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Onion / darknet (clearnet)">
                        {SEARCH_ENGINES.filter((e) => e.group === 'onion').map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Lokalne / własne">
                        {SEARCH_ENGINES.filter(
                          (e) => e.group === 'local' || e.group === 'custom',
                        ).map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </Row>
                  {engineMeta?.hint && <p className="snote">{engineMeta.hint}</p>}
                  {settings.searchEngine === 'searx' && (
                    <FieldRow label="URL SearXNG">
                      <Input
                        value={settings.searxUrl}
                        onChange={(e) => patchSettings({ searxUrl: e.target.value })}
                        placeholder="http://127.0.0.1:8080"
                      />
                    </FieldRow>
                  )}
                  {settings.searchEngine === 'custom' && (
                    <FieldRow
                      label="Własny URL wyszukiwania"
                      desc="Użyj %s jako placeholder zapytania"
                    >
                      <Input
                        value={settings.customSearchUrl}
                        onChange={(e) => patchSettings({ customSearchUrl: e.target.value })}
                        placeholder="https://example.com/search?q=%s"
                      />
                    </FieldRow>
                  )}
                </SettingsGroup>

                <SettingsGroup title="Tryb Tor">
                  <p className="tor-settings-note">
                    <strong>Tryb Tor</strong> ukrywa IP i izoluje sesję (osobna partycja w pamięci,
                    bez wspólnych ciasteczek z normalnymi kartami).{' '}
                    <strong>To nie jest Tor Browser</strong> — nie daje takiej ochrony przed
                    fingerprintingiem. Do spraw wrażliwych używaj oficjalnego Tor Browsera. Nie
                    nazywamy tego trybu „anonimowym”.
                  </p>
                  <p className="tor-settings-note" style={{ marginTop: 8 }}>
                    Na tym PC: <strong>Tor Browser</strong> (pulpit) do spraw wrażliwych oraz
                    opcjonalny lokalny daemon SOCKS (<code>127.0.0.1:9050</code> / wbudowany Expert
                    Bundle na <code>19050</code>). Autostart daemona w Windows jest{' '}
                    <strong>wyłączony domyślnie</strong>.
                  </p>
                  <FieldRow
                    label="Preferowany SOCKS"
                    desc="9050 = daemon / system · 9150 = Tor Browser · 19050 = wbudowany Expert Bundle"
                  >
                    <Input
                      value={settings.torProxyUrl}
                      onChange={(e) => patchSettings({ torProxyUrl: e.target.value })}
                      placeholder="socks5://127.0.0.1:9050"
                    />
                  </FieldRow>
                  <Toggle
                    label="Autostart daemona Tor (Windows)"
                    hint="Skrót w folderze Autostart — tylko jeśli świadomie włączysz. Domyślnie wyłączone."
                    on={settings.torDaemonAutostart}
                    onChange={(v) => {
                      patchSettings({ torDaemonAutostart: v });
                      void window.shell
                        ?.torDaemonAutostart?.(v)
                        .then((r: { ok?: boolean; error?: string }) => {
                          if (r && r.ok === false && v) {
                            patchSettings({ torDaemonAutostart: false });
                            window.alert(r.error || 'Nie udało się włączyć autostartu Tora');
                          }
                        });
                    }}
                  />
                  <Row
                    label="Otwórz kartę Tor"
                    desc="Ctrl+Shift+N — fail-closed jeśli Tor nie wstanie"
                  >
                    <button
                      type="button"
                      className="sbtn primary"
                      onClick={() => {
                        setView('browser');
                        window.dispatchEvent(new CustomEvent('djxxr-open-tor'));
                      }}
                    >
                      Nowa karta Tor
                    </button>
                  </Row>
                  <FieldRow
                    label="Mosty (embedded Tor)"
                    desc="Bez Moat — wbudowana lista z Tor Browser (2026-03-30) lub własne linie. Zmiana restartuje daemona."
                  >
                    <select
                      value={settings.torBridgeMode}
                      onChange={(e) => {
                        const mode = e.target.value as typeof settings.torBridgeMode;
                        patchSettings({ torBridgeMode: mode });
                        void window.shell?.torBridges?.({
                          mode,
                          customLines:
                            mode === 'custom'
                              ? settings.torBridgeLines
                                  .split(/\r?\n/)
                                  .map((l) => l.trim())
                                  .filter(Boolean)
                              : undefined,
                        });
                      }}
                    >
                      <option value="none">Bez mostów (domyślnie)</option>
                      <option value="obfs4">obfs4 (wbudowane)</option>
                      <option value="snowflake">Snowflake</option>
                      <option value="meek">meek</option>
                      <option value="custom">Własne mosty</option>
                    </select>
                  </FieldRow>
                  {settings.torBridgeMode === 'custom' && (
                    <FieldRow
                      label="Linie mostów"
                      desc="Jeden most na linię (obfs4 / snowflake / meek_lite)"
                    >
                      <textarea
                        rows={5}
                        value={settings.torBridgeLines}
                        onChange={(e) => patchSettings({ torBridgeLines: e.target.value })}
                        onBlur={() => {
                          void window.shell?.torBridges?.({
                            mode: 'custom',
                            customLines: settings.torBridgeLines
                              .split(/\r?\n/)
                              .map((l) => l.trim())
                              .filter(Boolean),
                          });
                        }}
                        placeholder={'obfs4 IP:PORT FINGERPRINT cert=… iat-mode=0'}
                        spellCheck={false}
                        style={{
                          width: '100%',
                          fontFamily: 'var(--mono, monospace)',
                          fontSize: 12,
                        }}
                      />
                    </FieldRow>
                  )}
                  <p
                    className="muted"
                    style={{ margin: '8px 2px 0', fontSize: 12, lineHeight: 1.4 }}
                  >
                    DNS: Chromium przy SOCKS5 wysyła hostname do proxy (≈ socks5h). Nowa tożsamość:
                    Ctrl+Shift+U — zamyka karty Tor, wipe sesji, SIGNAL NEWNYM. Izolacja SOCKS Auth
                    per domena niedostępna w Electron.
                  </p>
                </SettingsGroup>

                <SettingsGroup title="Podpowiedzi">
                  <Toggle
                    label="Podpowiedzi z historii"
                    on={settings.suggestHistory}
                    onChange={(v) => patchSettings({ suggestHistory: v })}
                  />
                  <Toggle
                    label="Podpowiadaj bangs przy !"
                    on={settings.suggestBangs}
                    onChange={(v) => patchSettings({ suggestBangs: v })}
                  />
                </SettingsGroup>

                <SettingsGroup title="Bangs">
                  <div className="slist">
                    {bangs.map((b) => (
                      <div key={b.key} className="slist-row">
                        <code>!{b.key}</code>
                        <span className="grow">{b.label}</span>
                        <span className="muted mono truncate">{b.url}</span>
                        <button
                          type="button"
                          className="icon-btn sm"
                          onClick={() => removeBang(b.key)}
                          title="Usuń"
                        >
                          <Trash2 size={14} strokeWidth={1.75} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="sform">
                    <Input
                      placeholder="klucz"
                      value={bangKey}
                      onChange={(e) => setBangKey(e.target.value)}
                    />
                    <Input
                      placeholder="nazwa"
                      value={bangLabel}
                      onChange={(e) => setBangLabel(e.target.value)}
                    />
                    <Input
                      className="grow"
                      placeholder="https://…?q=%s"
                      value={bangUrl}
                      onChange={(e) => setBangUrl(e.target.value)}
                    />
                    <button
                      type="button"
                      className="sbtn primary"
                      onClick={() => {
                        if (!bangKey.trim() || !bangUrl.includes('%s')) return;
                        addBang({
                          key: bangKey.trim(),
                          label: bangLabel.trim() || bangKey,
                          url: bangUrl.trim(),
                        });
                        setBangKey('');
                        setBangLabel('');
                        setBangUrl('');
                      }}
                    >
                      <Plus size={14} strokeWidth={1.75} /> Dodaj
                    </button>
                  </div>
                </SettingsGroup>
              </div>
            )}

            {settingsTab === 'look' && (
              <div className="settings-stack">
                <SettingsGroup title="Motyw">
                  <div className="stheme-grid">
                    {(Object.keys(THEMES) as ThemeId[]).map((id) => {
                      const t = THEMES[id];
                      const on = settings.theme === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`stheme ${on ? 'on' : ''}`}
                          onClick={() =>
                            patchSettings({
                              theme: id,
                              ...(settings.useThemeAccent ? { accent: t.accent } : {}),
                            })
                          }
                        >
                          <span className="stheme-win" style={{ background: t.bg, color: t.fg2 }}>
                            {on && (
                              <span className="stheme-check">
                                <Check size={10} strokeWidth={2.5} />
                              </span>
                            )}
                            <span className="stheme-chrome">
                              <span className="stheme-titlebar" style={{ background: t.elev }}>
                                <i className="stheme-dot" />
                                <i className="stheme-dot" />
                                <i className="stheme-dot" />
                              </span>
                              <span className="stheme-body">
                                <span className="stheme-rail" style={{ background: t.side }} />
                                <span className="stheme-main" style={{ background: t.bg }}>
                                  <span className="stheme-omnibox" style={{ background: t.fg3 }} />
                                  <span className="stheme-content" style={{ background: t.elev }}>
                                    <i className="stheme-accent" style={{ background: t.accent }} />
                                  </span>
                                </span>
                              </span>
                            </span>
                          </span>
                          <span className="stheme-name">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <Toggle
                    label="Akcent z motywu"
                    hint="Wyłącz, żeby ustawić własny kolor"
                    on={settings.useThemeAccent}
                    onChange={(v) => {
                      const t = THEMES[settings.theme];
                      patchSettings({ useThemeAccent: v, ...(v ? { accent: t.accent } : {}) });
                    }}
                  />
                  {!settings.useThemeAccent && (
                    <Row label="Kolor akcentu">
                      <div className="sswatches">
                        {[
                          '#6b9eff',
                          '#e8eaef',
                          '#7dcea0',
                          '#e7a067',
                          '#c39bd3',
                          '#5dade2',
                          '#f1948a',
                          '#85929e',
                          '#4db6e2',
                          '#b388ff',
                        ].map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`sswatch ${settings.accent === c ? 'on' : ''}`}
                            style={{ background: c }}
                            onClick={() => patchSettings({ accent: c })}
                          />
                        ))}
                        <input
                          type="color"
                          value={settings.accent}
                          onChange={(e) => patchSettings({ accent: e.target.value })}
                        />
                      </div>
                    </Row>
                  )}
                </SettingsGroup>

                <SettingsGroup title="Glass i UI">
                  <Toggle
                    label="Ciemne paski przewijania na stronach"
                    on={settings.darkPageScrollbars}
                    onChange={(v) => patchSettings({ darkPageScrollbars: v })}
                  />
                  <Toggle
                    label="Efekt glass (blur + przezroczystość)"
                    on={settings.uiGlass}
                    onChange={(v) => patchSettings({ uiGlass: v })}
                  />
                  <SliderRow
                    label="Siła blur"
                    value={`${settings.glassBlur} px`}
                    min={8}
                    max={32}
                    valueNum={settings.glassBlur}
                    disabled={!settings.uiGlass}
                    onChange={(n) => patchSettings({ glassBlur: n })}
                  />
                  <SliderRow
                    label="Krycie szkła"
                    value={`${Math.round(settings.glassOpacity * 100)}%`}
                    min={25}
                    max={85}
                    valueNum={Math.round(settings.glassOpacity * 100)}
                    disabled={!settings.uiGlass}
                    onChange={(n) => patchSettings({ glassOpacity: n / 100 })}
                  />
                  <Toggle
                    label="Płynne przejścia"
                    on={settings.uiMotion}
                    onChange={(v) => patchSettings({ uiMotion: v })}
                  />
                  <Row label="Gęstość UI">
                    <Segmented
                      value={settings.uiDensity}
                      options={[
                        { id: 'comfortable', label: 'Komfort' },
                        { id: 'compact', label: 'Zwarta' },
                      ]}
                      onChange={(v) => patchSettings({ uiDensity: v as UiDensity })}
                    />
                  </Row>
                </SettingsGroup>
              </div>
            )}

            {settingsTab === 'sidebar' && (
              <div className="settings-stack">
                <SettingsGroup title="Rail">
                  <Toggle
                    label="Pokaż sidebar"
                    hint="Ctrl+B · Ctrl+Shift+M · Ctrl+Shift+G"
                    on={settings.showSidebar}
                    onChange={(v) =>
                      patchSettings({ showSidebar: v, ...(v ? {} : { sidePanelOpen: false }) })
                    }
                  />
                  <SliderRow
                    label="Szerokość panelu aplikacji"
                    value={`${settings.sidePanelWidth} px`}
                    min={320}
                    max={560}
                    valueNum={settings.sidePanelWidth}
                    disabled={!settings.showSidebar}
                    onChange={(n) => patchSettings({ sidePanelWidth: n })}
                  />
                </SettingsGroup>

                <SettingsGroup title="Aplikacje boczne">
                  <div className="slist">
                    {sideApps.map((s) => (
                      <div key={s.id} className="slist-row">
                        <strong>{s.label}</strong>
                        <span className="grow muted mono truncate">{s.url}</span>
                        <button
                          type="button"
                          className="icon-btn sm"
                          onClick={() => removeSideApp(s.id)}
                        >
                          <Trash2 size={14} strokeWidth={1.75} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="sform">
                    <Input
                      placeholder="Nazwa"
                      value={saLabel}
                      onChange={(e) => setSaLabel(e.target.value)}
                    />
                    <Input
                      className="grow"
                      placeholder="https://"
                      value={saUrl}
                      onChange={(e) => setSaUrl(e.target.value)}
                    />
                    <button
                      type="button"
                      className="sbtn primary"
                      onClick={() => {
                        if (!saLabel.trim() || !saUrl.trim()) return;
                        addSideApp({ label: saLabel.trim(), url: saUrl.trim() });
                        setSaLabel('');
                        setSaUrl('');
                      }}
                    >
                      <Plus size={14} strokeWidth={1.75} /> Dodaj
                    </button>
                  </div>
                </SettingsGroup>
              </div>
            )}

            {settingsTab === 'shortcuts' && (
              <div className="settings-stack">
                <SettingsGroup title="Skróty">
                  <div className="slist">
                    {shortcuts.map((s) => (
                      <div key={s.id} className="slist-row">
                        <strong>{s.label}</strong>
                        <span className="grow muted mono truncate">{s.url}</span>
                        <button
                          type="button"
                          className="icon-btn sm"
                          onClick={() => removeShortcut(s.id)}
                        >
                          <Trash2 size={14} strokeWidth={1.75} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="sform">
                    <Input
                      placeholder="Nazwa"
                      value={scLabel}
                      onChange={(e) => setScLabel(e.target.value)}
                    />
                    <Input
                      className="grow"
                      placeholder="https://"
                      value={scUrl}
                      onChange={(e) => setScUrl(e.target.value)}
                    />
                    <button
                      type="button"
                      className="sbtn primary"
                      onClick={() => {
                        if (!scLabel.trim() || !scUrl.trim()) return;
                        addShortcut({ label: scLabel.trim(), url: scUrl.trim() });
                        setScLabel('');
                        setScUrl('');
                      }}
                    >
                      <Plus size={14} strokeWidth={1.75} /> Dodaj
                    </button>
                  </div>
                </SettingsGroup>
              </div>
            )}

            {settingsTab === 'privacy' && (
              <div className="settings-stack">
                <SettingsGroup title="Preset prywatności">
                  <div className="privacy-preset-seg" role="tablist">
                    {(
                      [
                        ['standard', 'Standardowa'],
                        ['strict', 'Ścisła'],
                        ['custom', 'Własna'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={settings.privacyPreset === id ? 'on' : ''}
                        onClick={() => {
                          if (id === 'custom') {
                            patchSettings({ privacyPreset: 'custom' });
                            return;
                          }
                          const preset =
                            id === 'strict'
                              ? {
                                  privacyPreset: 'strict' as const,
                                  adblockEnabled: true,
                                  adblockNetwork: true,
                                  adblockCosmetic: true,
                                  adblockTrackers: true,
                                  adblockUpdateLists: true,
                                  privacyStripTracking: true,
                                  privacySecGpc: true,
                                  privacyDnt: true,
                                  privacyReferrerPolicy: true,
                                  privacyThirdPartyCookies: 'all' as const,
                                  privacyHttpsOnly: 'block' as const,
                                  privacyDoh: 'quad9' as const,
                                  privacyChromeUa: true,
                                  privacyWebRtc: 'disable_udp' as const,
                                  privacyFingerprint: true,
                                  privacySearchSuggest: false,
                                }
                              : {
                                  privacyPreset: 'standard' as const,
                                  adblockEnabled: true,
                                  adblockNetwork: true,
                                  adblockCosmetic: true,
                                  adblockTrackers: true,
                                  adblockUpdateLists: true,
                                  privacyStripTracking: true,
                                  privacySecGpc: true,
                                  privacyDnt: false,
                                  privacyReferrerPolicy: true,
                                  privacyThirdPartyCookies: 'trackers' as const,
                                  privacyHttpsOnly: 'upgrade' as const,
                                  privacyDoh: 'automatic' as const,
                                  privacyChromeUa: true,
                                  privacyWebRtc: 'public_only' as const,
                                  privacyFingerprint: false,
                                  privacySearchSuggest: true,
                                };
                          patchSettings(preset);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>
                    Standardowa chroni przed reklamami i trackerami, ale zostawia SSO, YouTube,
                    płatności i captchę. Ścisła jest mocniejsza i może psuć logowanie / banki —
                    wtedy użyj tarczy: „Wyłącz ochronę dla tej strony”.
                  </p>
                </SettingsGroup>

                <SettingsGroup title="Blokada reklam i trackerów">
                  <Toggle
                    label="Włącz blokadę"
                    hint="EasyList, EasyPrivacy, uBlock, Peter Lowe (Ghostery) · Standardowa + Ścisła"
                    on={settings.adblockEnabled}
                    onChange={(v) => patchSettings({ adblockEnabled: v })}
                  />
                  <Toggle
                    label="Aktualizuj listy filtrów (1×/dzień)"
                    hint="Pobiera listy z internetu — jedyne zapytanie sieciowe ochrony"
                    on={settings.adblockUpdateLists}
                    onChange={(v) => patchSettings({ adblockUpdateLists: v })}
                  />
                  <Toggle
                    label="Blokuj żądania reklam"
                    on={settings.adblockNetwork}
                    onChange={(v) => patchSettings({ adblockNetwork: v })}
                  />
                  <Toggle
                    label="Blokuj trackery"
                    on={settings.adblockTrackers}
                    onChange={(v) => patchSettings({ adblockTrackers: v })}
                  />
                  <Toggle
                    label="Filtry kosmetyczne (CSS)"
                    on={settings.adblockCosmetic}
                    onChange={(v) => patchSettings({ adblockCosmetic: v })}
                  />
                  <FieldRow label="Własne reguły" desc="Jedna na linię">
                    <textarea
                      className="stextarea"
                      rows={4}
                      value={settings.adblockCustomRules}
                      onChange={(e) => patchSettings({ adblockCustomRules: e.target.value })}
                      spellCheck={false}
                    />
                  </FieldRow>
                </SettingsGroup>

                <SettingsGroup title="Ciasteczka i śledzenie">
                  <FieldRow
                    label="Ciasteczka stron trzecich"
                    desc="trackers = Standardowa · all = Ścisła (może psuć SSO)"
                  >
                    <select
                      value={settings.privacyThirdPartyCookies}
                      onChange={(e) =>
                        patchSettings({
                          privacyThirdPartyCookies: e.target.value as 'trackers' | 'all' | 'allow',
                        })
                      }
                    >
                      <option value="trackers">Tylko trackery</option>
                      <option value="all">Wszystkie 3P</option>
                      <option value="allow">Zezwalaj</option>
                    </select>
                  </FieldRow>
                  <Toggle
                    label="Czyść parametry śledzące z URL"
                    hint="utm_*, fbclid, gclid… · omija banki/logowanie"
                    on={settings.privacyStripTracking}
                    onChange={(v) => patchSettings({ privacyStripTracking: v })}
                  />
                  <Toggle
                    label="Sec-GPC: 1"
                    on={settings.privacySecGpc}
                    onChange={(v) => patchSettings({ privacySecGpc: v })}
                  />
                  <Toggle
                    label="DNT: 1"
                    hint="Tylko Ścisła — większość serwisów i tak ignoruje"
                    on={settings.privacyDnt}
                    onChange={(v) => patchSettings({ privacyDnt: v })}
                  />
                  <Toggle
                    label="Referer: strict-origin-when-cross-origin"
                    on={settings.privacyReferrerPolicy}
                    onChange={(v) => patchSettings({ privacyReferrerPolicy: v })}
                  />
                  <Toggle
                    label="Czyść dane przy zamknięciu aplikacji"
                    hint="Domyślnie wyłączone"
                    on={settings.privacyClearOnQuit}
                    onChange={(v) => patchSettings({ privacyClearOnQuit: v })}
                  />
                  {settings.privacyClearOnQuit && (
                    <FieldRow
                      label="Wyjątki przy czyszczeniu"
                      desc="Domeny do zachowania (jedna na linię)"
                    >
                      <textarea
                        className="stextarea"
                        rows={3}
                        value={(settings.privacyClearOnQuitKeep || []).join('\n')}
                        onChange={(e) =>
                          patchSettings({
                            privacyClearOnQuitKeep: e.target.value
                              .split(/\r?\n/)
                              .map((l) => l.trim())
                              .filter(Boolean),
                          })
                        }
                        spellCheck={false}
                        placeholder="accounts.google.com"
                      />
                    </FieldRow>
                  )}
                </SettingsGroup>

                <SettingsGroup title="Szyfrowanie i DNS">
                  <FieldRow
                    label="HTTPS-Only"
                    desc="upgrade = Standardowa · block = Ścisła (ostrzeżenie)"
                  >
                    <select
                      value={settings.privacyHttpsOnly}
                      onChange={(e) =>
                        patchSettings({
                          privacyHttpsOnly: e.target.value as 'upgrade' | 'block' | 'off',
                        })
                      }
                    >
                      <option value="upgrade">Podnoś do HTTPS (cichy fallback)</option>
                      <option value="block">Wymagaj HTTPS (ostrzejsze)</option>
                      <option value="off">Wyłączone</option>
                    </select>
                  </FieldRow>
                  <FieldRow
                    label="DNS over HTTPS"
                    desc="automatic = Standardowa (fallback firmowy/hotel)"
                  >
                    <select
                      value={settings.privacyDoh}
                      onChange={(e) =>
                        patchSettings({
                          privacyDoh: e.target.value as typeof settings.privacyDoh,
                        })
                      }
                    >
                      <option value="automatic">Automatic (Quad9 + Cloudflare)</option>
                      <option value="quad9">Quad9 (secure)</option>
                      <option value="cloudflare">Cloudflare</option>
                      <option value="mullvad">Mullvad</option>
                      <option value="nextdns">NextDNS</option>
                      <option value="custom">Własny</option>
                      <option value="off">Wyłączone</option>
                    </select>
                  </FieldRow>
                  {settings.privacyDoh === 'custom' && (
                    <FieldRow label="Własny DoH URL">
                      <Input
                        value={settings.privacyDohCustom}
                        onChange={(e) => patchSettings({ privacyDohCustom: e.target.value })}
                        placeholder="https://dns.example/dns-query"
                      />
                    </FieldRow>
                  )}
                </SettingsGroup>

                <SettingsGroup title="Fingerprinting i WebRTC">
                  <Toggle
                    label="User-Agent jak Chrome (bez Electron/djxxr)"
                    on={settings.privacyChromeUa}
                    onChange={(v) => patchSettings({ privacyChromeUa: v })}
                  />
                  <FieldRow label="WebRTC IP handling">
                    <select
                      value={settings.privacyWebRtc}
                      onChange={(e) =>
                        patchSettings({
                          privacyWebRtc: e.target.value as typeof settings.privacyWebRtc,
                        })
                      }
                    >
                      <option value="public_only">Tylko publiczny interfejs (Standardowa)</option>
                      <option value="disable_udp">Wyłącz non-proxied UDP (Ścisła)</option>
                      <option value="default">Domyślny Chromium</option>
                    </select>
                  </FieldRow>
                  <Toggle
                    label="Ochrona fingerprint (canvas/WebGL/CPU)"
                    hint="Ścisła / ręcznie — może psuć captchę i banki"
                    on={settings.privacyFingerprint}
                    onChange={(v) => patchSettings({ privacyFingerprint: v })}
                  />
                  <Toggle
                    label="Sugestie wyszukiwania (silnik)"
                    hint="Ścisła: wyłączone — tylko lokalna historia"
                    on={settings.privacySearchSuggest}
                    onChange={(v) => patchSettings({ privacySearchSuggest: v })}
                  />
                  <Toggle
                    label="Zezwalaj na aktualizacje list / DoH sieci aplikacji"
                    on={settings.privacyAllowAppNetwork}
                    onChange={(v) => patchSettings({ privacyAllowAppNetwork: v })}
                  />
                </SettingsGroup>

                <SettingsGroup title="Wyjątki ochrony">
                  <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
                    Domeny z wyłączoną ochroną (tarcza w omniboxie).
                  </p>
                  <div className="slist">
                    {(settings.privacySiteExceptions || []).map((d) => (
                      <div key={d} className="slist-row">
                        <span className="grow">{d}</span>
                        <button
                          type="button"
                          className="icon-btn sm"
                          onClick={() => {
                            patchSettings({
                              privacySiteExceptions: settings.privacySiteExceptions.filter(
                                (x) => x !== d,
                              ),
                            });
                            void window.shell?.privacyExceptionRemove?.(d);
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                    {!settings.privacySiteExceptions?.length && (
                      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
                        Brak wyjątków
                      </p>
                    )}
                  </div>
                </SettingsGroup>

                <SettingsGroup title="Historia przeglądania">
                  <Row label="Retencja historii">
                    <select
                      value={settings.historyRetention || '90'}
                      onChange={(e) =>
                        patchSettings({
                          historyRetention: e.target.value as '7' | '30' | '90' | 'always' | 'off',
                        })
                      }
                    >
                      <option value="7">7 dni</option>
                      <option value="30">30 dni</option>
                      <option value="90">90 dni</option>
                      <option value="always">Zawsze</option>
                      <option value="off">Nie zapisuj</option>
                    </select>
                  </Row>
                  <Row label="Zapisane zapytania (omnibox)">
                    <span className="sr-value">{queryCount}</span>
                  </Row>
                  <Row label="Otwórz historię">
                    <button
                      type="button"
                      className="sbtn"
                      onClick={() => {
                        const st = useStore.getState();
                        const tab = st.tabs.find((t) => t.id === st.activeId);
                        if (tab?.mode === 'tor') {
                          st.newTab('about:history');
                          st.setView('browser');
                          return;
                        }
                        st.updateTab(st.activeId, {
                          url: 'about:history',
                          title: 'Historia',
                        });
                        st.setView('browser');
                      }}
                    >
                      about:history (Ctrl+H)
                    </button>
                  </Row>
                  <Row label="Wyczyść dane">
                    <button
                      type="button"
                      className="sbtn danger-text"
                      onClick={() => {
                        if (!confirm('Wyczyścić historię przeglądania i zapytania?')) return;
                        clearHistory();
                        setQueryCount(0);
                      }}
                    >
                      Wyczyść historię
                    </button>
                  </Row>
                </SettingsGroup>

                <SitePermissionsSection />

                <SettingsGroup title="Reset">
                  <Row label="Przywróć domyślne ustawienia, bangs i skróty">
                    <button
                      type="button"
                      className="sbtn"
                      onClick={() => {
                        if (confirm('Przywrócić domyślne ustawienia, bangs i skróty?'))
                          resetSettings();
                      }}
                    >
                      Reset ustawień
                    </button>
                  </Row>
                </SettingsGroup>
              </div>
            )}

            {settingsTab === 'passwords' && (
              <div className="settings-stack">
                <PasswordsPanel />
              </div>
            )}

            {settingsTab === 'performance' && (
              <PerformanceSection settings={settings} patchSettings={patchSettings} />
            )}

            {settingsTab === 'resources' && <ResourcesPanel active={settingsTab === 'resources'} />}

            {settingsTab === 'advanced' && (
              <div className="settings-stack">
                <SettingsGroup title="Status">
                  <FieldRow label="Aktualny silnik">
                    <Input readOnly value={settings.searchEngine} />
                  </FieldRow>
                  <FieldRow label="Proxy (normalne karty)">
                    <Input readOnly value="system — Tor tylko na kartach Tor" />
                  </FieldRow>
                  <p className="snote">
                    Skróty: <code>Ctrl+,</code> ustawienia · <code>Ctrl+B</code> sidebar ·{' '}
                    <code>Ctrl+T</code> karta · <code>Ctrl+L</code> omnibox · <code>Shift+Esc</code>{' '}
                    menedżer zadań.
                  </p>
                </SettingsGroup>
                <SettingsGroup title="Narzędzia deweloperskie">
                  <Toggle
                    label="„Zbadaj element” w menu kontekstowym"
                    hint="F12 / Ctrl+Shift+I zawsze otwierają DevTools. Ten przełącznik steruje tylko pozycją „Zbadaj” w PPM."
                    on={settings.allowInspect}
                    onChange={(v) => patchSettings({ allowInspect: v })}
                  />
                </SettingsGroup>
                <SettingsGroup title="Reset">
                  <Row label="Przywraca fabryczne ustawienia, bangs i skróty">
                    <button
                      type="button"
                      className="sbtn danger-text"
                      onClick={() => {
                        if (confirm('Przywrócić wszystko do fabryki?')) resetSettings();
                      }}
                    >
                      Reset wszystkiego
                    </button>
                  </Row>
                </SettingsGroup>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sg">
      <span className="sg-label">{title}</span>
      <div className="sg-block">{children}</div>
    </section>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="sr">
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {desc && <span className="sr-desc">{desc}</span>}
      </div>
      <div className="sr-control">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="sr sr-field">
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {desc && <span className="sr-desc">{desc}</span>}
      </div>
      <div className="sr-control">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={`sr ${on ? 'on' : ''}`}>
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {hint && <span className="sr-desc">{hint}</span>}
      </div>
      <div className="sr-control">
        <Switch on={on} onChange={onChange} aria-label={label} />
      </div>
    </div>
  );
}

function SliderRow({
  label,
  desc,
  value,
  valueNum,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  desc?: string;
  value: string;
  valueNum: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div className={`sr ${disabled ? 'is-disabled' : ''}`}>
      <div className="sr-copy">
        <span className="sr-title">{label}</span>
        {desc && <span className="sr-desc">{desc}</span>}
      </div>
      <div className="sr-control">
        <div className="sslider">
          <input
            type="range"
            min={min}
            max={max}
            step={step ?? 1}
            value={valueNum}
            disabled={disabled}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
        <span className="sr-value">{value}</span>
      </div>
    </div>
  );
}

function SitePermissionsSection() {
  const [list, setList] = useState<Record<string, Record<string, string>>>({});

  const refresh = () => {
    void window.shell?.permissionsList?.().then((l) => {
      if (l && typeof l === 'object') setList(l as Record<string, Record<string, string>>);
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  const entries = Object.entries(list);
  return (
    <SettingsGroup title="Uprawnienia stron">
      {entries.length === 0 && (
        <p className="snote">Brak zapisanych decyzji (kamera, mikrofon, lokalizacja…).</p>
      )}
      {entries.map(([origin, perms]) => (
        <div key={origin} className="slist-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span className="grow mono">{origin}</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {Object.entries(perms)
              .map(([k, v]) => `${k}:${v}`)
              .join(' · ')}
          </span>
          <button
            type="button"
            className="sbtn danger-text"
            onClick={() => {
              void window.shell?.permissionsRevoke?.(origin).then(() => refresh());
            }}
          >
            Cofnij
          </button>
        </div>
      ))}
      {entries.length > 0 && (
        <div className="slist-row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="sbtn ghost" onClick={() => refresh()}>
            Odśwież
          </button>
        </div>
      )}
    </SettingsGroup>
  );
}

function PerformanceSection({
  settings,
  patchSettings,
}: {
  settings: import('../store').Settings;
  patchSettings: (p: Partial<import('../store').Settings>) => void;
}) {
  const [mem, setMem] = useState<{ workingSetMb: number; processes: number } | null>(null);
  const [cacheMsg, setCacheMsg] = useState('');
  const [restartHint, setRestartHint] = useState(false);

  useEffect(() => {
    let alive = true;
    const pull = () => {
      void window.shell?.perfMemory?.().then((m) => {
        if (alive && m) setMem({ workingSetMb: m.workingSetMb, processes: m.processes });
      });
    };
    pull();
    const t = setInterval(pull, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="settings-stack">
      <SettingsGroup title="Profil i status">
        {mem && (
          <Row label="Pamięć robocza">
            <span className="sr-value">
              {mem.workingSetMb} MB · {mem.processes} proc.
            </span>
          </Row>
        )}
        <Row label="Profil">
          <select
            value={settings.perfMode}
            onChange={(e) => {
              const mode = e.target.value as PerfMode;
              patchSettings(applyPerfPreset(mode));
              setRestartHint(true);
            }}
          >
            <option value="saver">Oszczędzanie</option>
            <option value="balanced">Zrównoważony</option>
            <option value="performance">Wydajność</option>
          </select>
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Pamięć i karty">
        <Toggle
          label="Leniwe ładowanie kart"
          hint="Przy starcie nieaktywne karty sesji śpią do pierwszego kliknięcia. Link otwarty w tle ładuje się od razu; po odwiedzeniu karta zostaje żywa (jak Chrome)."
          on={settings.perfLazyTabs}
          onChange={(v) => patchSettings({ perfLazyTabs: v })}
        />
        <Toggle
          label="Wyrzucaj nieaktywne karty"
          hint="Odmontowuje kartę po czasie bezczynności (nigdy przy audio/PiP/formularzu)"
          on={settings.perfDiscardTabs}
          onChange={(v) => patchSettings({ perfDiscardTabs: v })}
        />
        <SliderRow
          label="Wyrzuć po"
          value={`${settings.perfDiscardMinutes} min`}
          min={2}
          max={60}
          valueNum={settings.perfDiscardMinutes}
          disabled={!settings.perfDiscardTabs}
          onChange={(n) => patchSettings({ perfDiscardMinutes: n })}
        />
        <SliderRow
          label="Limit cache"
          value={`${settings.perfCacheMb} MB`}
          min={64}
          max={1024}
          step={32}
          valueNum={settings.perfCacheMb}
          onChange={(n) => {
            patchSettings({ perfCacheMb: n });
            void window.shell?.perfApplySession?.({ cacheMb: n });
          }}
        />
      </SettingsGroup>

      <SettingsGroup title="CPU / render">
        <Toggle
          label="Przyspieszanie sprzętowe (GPU)"
          hint="Zmiana wymaga restartu"
          on={settings.perfHardwareAcceleration}
          onChange={(v) => {
            patchSettings({ perfHardwareAcceleration: v });
            void window.shell?.perfBoot?.({ hardwareAcceleration: v });
            setRestartHint(true);
          }}
        />
        <Toggle
          label="Throttling w tle"
          hint="Spowalnia karty gdy okno jest zminimowane / przykryte"
          on={settings.perfBackgroundThrottling}
          onChange={(v) => {
            patchSettings({ perfBackgroundThrottling: v });
            void window.shell?.perfBoot?.({ backgroundThrottling: v });
            void window.shell?.perfApplySession?.({ backgroundThrottling: v });
          }}
        />
        <Toggle
          label="Płynne przewijanie"
          hint="Wyłącz przy słabszym CPU (restart)"
          on={settings.perfSmoothScrolling}
          onChange={(v) => {
            patchSettings({ perfSmoothScrolling: v });
            void window.shell?.perfBoot?.({ smoothScrolling: v });
            setRestartHint(true);
          }}
        />
        <Toggle
          label="Ogranicz animacje UI"
          on={settings.perfReduceMotion}
          onChange={(v) => patchSettings({ perfReduceMotion: v, uiMotion: !v })}
        />
        <Toggle
          label="Oszczędny zegar na home"
          hint="Aktualizacja co 30 s + pauza gdy okno ukryte"
          on={settings.perfLowPowerClock}
          onChange={(v) => patchSettings({ perfLowPowerClock: v })}
        />
        <Toggle
          label="Blokuj ciężkie media w tle (eksperymentalne)"
          hint="Mniej autoplay / ciężkich zasobów w UI"
          on={settings.perfBlockHeavyMedia}
          onChange={(v) => patchSettings({ perfBlockHeavyMedia: v })}
        />
        <Toggle
          label="Sprawdzanie pisowni"
          hint="pl + en-US (wyłączone w oknach Tor — słowniki nie pobierają się poza siecią Tor)"
          on={settings.perfSpellcheck}
          onChange={(v) => patchSettings({ perfSpellcheck: v })}
        />
      </SettingsGroup>

      <SettingsGroup title="Narzędzia">
        <Row label="Cache sesji">
          <button
            type="button"
            className="sbtn"
            onClick={() => {
              void window.shell?.perfClearCache?.().then(() => {
                setCacheMsg('Cache wyczyszczony');
                setTimeout(() => setCacheMsg(''), 2500);
              });
            }}
          >
            Wyczyść cache
          </button>
        </Row>
        <Row label="Pamięć">
          <button
            type="button"
            className="sbtn text"
            onClick={() => {
              void window.shell?.perfMemory?.().then((m) => {
                if (m) setMem({ workingSetMb: m.workingSetMb, processes: m.processes });
              });
            }}
          >
            Odśwież RAM
          </button>
        </Row>
        {cacheMsg && <p className="snote">{cacheMsg}</p>}
        {restartHint && (
          <p className="snote warn">
            Niektóre zmiany (GPU, scroll, limity procesów) wymagają pełnego restartu aplikacji.
          </p>
        )}
      </SettingsGroup>
    </div>
  );
}
