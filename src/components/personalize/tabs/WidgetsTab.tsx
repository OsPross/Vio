import { useMemo, useState } from 'react';
import {
  CalendarDays,
  CloudSun,
  Cpu,
  ListChecks,
  Move,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import {
  normalizeHomeChrome,
  normalizeHomeWidgets,
  placeNewHomeWidget,
  useStore,
  type HomeWidget,
  type HomeWidgetSize,
  type HomeWidgetStyle,
  type HomeWidgetType,
} from '../../../store';
import { PzSection } from './PzRows';
import { WIDGET_REGISTRY } from '../../../widgets/registry';
import { SpotifyGlyph } from '../../../widgets/SpotifyGlyph';
import { Segmented, Switch } from '../../ui';
import { useT } from '../../../i18n';

const CATALOG: { type: HomeWidgetType; icon: LucideIcon | null; tint: string }[] = [
  { type: 'weather', icon: CloudSun, tint: '#4da3ff' },
  { type: 'spotify', icon: null, tint: '#1db954' },
  { type: 'resources', icon: Cpu, tint: '#8e7cf0' },
  { type: 'notes', icon: StickyNote, tint: '#f2b630' },
  { type: 'todo', icon: ListChecks, tint: '#ff7a59' },
  { type: 'calendar', icon: CalendarDays, tint: '#ff5a6e' },
];
const SIZES: HomeWidgetSize[] = ['S', 'M', 'L'];
const STYLES: { id: HomeWidgetStyle; label: string }[] = [
  { id: 'transparent', label: 'home.personalize.styleTransparent' },
  { id: 'glass', label: 'home.personalize.styleGlass' },
  { id: 'solid', label: 'home.personalize.styleSolid' },
];

export function WidgetsTab({ onEditOnPage }: { onEditOnPage: () => void }) {
  const t = useT();
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const widgets = useMemo(() => normalizeHomeWidgets(settings.homeWidgets), [settings.homeWidgets]);
  const byType = useMemo(() => {
    const m = new Map<HomeWidgetType, HomeWidget>();
    for (const w of widgets) m.set(w.type, w);
    return m;
  }, [widgets]);
  const [draftSize, setDraftSize] = useState<Partial<Record<HomeWidgetType, HomeWidgetSize>>>({});

  const setWidgets = (next: HomeWidget[]) => patchSettings({ homeWidgets: normalizeHomeWidgets(next) });

  const sizeFor = (type: HomeWidgetType) =>
    draftSize[type] || byType.get(type)?.size || WIDGET_REGISTRY[type].defaultSize;

  const toggleType = (type: HomeWidgetType, on: boolean) => {
    if (!on) {
      setWidgets(widgets.filter((w) => w.type !== type));
      return;
    }
    if (byType.has(type)) return;
    const chrome = normalizeHomeChrome(settings.homeChrome);
    setWidgets([
      ...widgets,
      placeNewHomeWidget(widgets, chrome, {
        id: `w-${Math.random().toString(36).slice(2, 10)}`,
        type,
        size: sizeFor(type),
        settings: {},
      }),
    ]);
  };

  const setSize = (type: HomeWidgetType, size: HomeWidgetSize) => {
    setDraftSize((d) => ({ ...d, [type]: size }));
    if (byType.has(type)) setWidgets(widgets.map((w) => (w.type === type ? { ...w, size } : w)));
  };

  return (
    <>
      <button
        type="button"
        className="pz-arrange"
        disabled={widgets.length === 0}
        onClick={onEditOnPage}
      >
        <Move size={15} strokeWidth={1.75} />
        <span>
          <strong>{t('home.personalize.arrangeOnScreen')}</strong>
          <em>{t('home.personalize.arrangeHint')}</em>
        </span>
      </button>

      <PzSection title={t('home.personalize.widgetCardStyle')}>
        <div className="pz-wstyles" role="radiogroup" aria-label={t('home.personalize.widgetCardStyle')}>
          {STYLES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={settings.homeWidgetStyle === id}
              className={`pz-wstyle${settings.homeWidgetStyle === id ? ' on' : ''}`}
              onClick={() => patchSettings({ homeWidgetStyle: id })}
            >
              <span className={`pz-wstyle-tile pz-wstyle-${id}`}>
                <i />
              </span>
              <span className="pz-wstyle-name">{t(label)}</span>
            </button>
          ))}
        </div>
      </PzSection>

      <div className="pz-widgets">
        {CATALOG.map(({ type, icon: Icon, tint }) => {
          const meta = WIDGET_REGISTRY[type];
          const on = byType.has(type);
          return (
            <div key={type} className={`pz-widget${on ? ' on' : ''}`}>
              <div className="pz-widget-top">
                <span className="pz-widget-ico" style={{ color: tint, background: `${tint}1f` }}>
                  {Icon ? <Icon size={17} strokeWidth={1.75} /> : <SpotifyGlyph size={17} />}
                </span>
                <span className="pz-widget-copy">
                  <strong>{meta.label}</strong>
                  <em>{meta.description}</em>
                </span>
                <Switch
                  on={on}
                  onChange={(v) => toggleType(type, v)}
                  aria-label={t('home.personalize.toggleWidget', { name: meta.label })}
                />
              </div>
              <div className="pz-widget-size">
                <span>{t('widgets.ui.size')}</span>
                <Segmented
                  size="sm"
                  value={sizeFor(type)}
                  options={SIZES.map((s) => ({ id: s, label: s }))}
                  onChange={(v) => setSize(type, v as HomeWidgetSize)}
                  aria-label={t('home.personalize.sizeAria', { name: meta.label })}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
