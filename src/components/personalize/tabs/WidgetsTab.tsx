import { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import {
  layoutWidgetsInCenteredRow,
  normalizeHomeChrome,
  normalizeHomeWidgets,
  placeNewHomeWidget,
  useStore,
  type HomeWidget,
  type HomeWidgetSize,
  type HomeWidgetType,
} from '../../../store';
import { WIDGET_REGISTRY } from '../../../widgets/registry';
import { Segmented, Switch } from '../../ui';
import { useT } from '../../../i18n';

const CATALOG: HomeWidgetType[] = [
  'weather',
  'spotify',
  'resources',
  'notes',
  'todo',
  'calendar',
];
const SIZES: HomeWidgetSize[] = ['S', 'M', 'L'];

export function WidgetsTab({
  onEditOnPage,
}: {
  onEditOnPage: () => void;
  reduced: boolean;
}) {
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

  const setWidgets = (next: HomeWidget[]) => {
    patchSettings({ homeWidgets: normalizeHomeWidgets(next) });
  };

  const sizeFor = (type: HomeWidgetType) =>
    draftSize[type] || byType.get(type)?.size || WIDGET_REGISTRY[type].defaultSize;

  const toggleType = (type: HomeWidgetType, on: boolean) => {
    if (on) {
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
      return;
    }
    setWidgets(widgets.filter((w) => w.type !== type));
  };

  const setSize = (type: HomeWidgetType, size: HomeWidgetSize) => {
    setDraftSize((d) => ({ ...d, [type]: size }));
    if (!byType.has(type)) return;
    setWidgets(widgets.map((w) => (w.type === type ? { ...w, size } : w)));
  };

  const arrangeOnScreen = () => {
    if (!widgets.length) return;
    setWidgets(layoutWidgetsInCenteredRow(widgets));
    onEditOnPage();
  };

  return (
    <div className="pz-tab-pane">
      <section className="pz-section">
        <div className="pz-section-head">
          <h3>{t('home.personalize.widgets')}</h3>
        </div>
        <div className="pz-widget-catalog">
          {CATALOG.map((type) => {
            const meta = WIDGET_REGISTRY[type];
            const on = byType.has(type);
            const size = sizeFor(type);
            return (
              <div key={type} className={`pz-widget-cat-card${on ? ' on' : ''}`}>
                <div className="pz-widget-cat-top">
                  <div className="pz-widget-cat-copy">
                    <strong>{meta.label}</strong>
                    <span>{meta.description}</span>
                  </div>
                  <Switch
                    on={on}
                    onChange={(v) => toggleType(type, v)}
                    aria-label={t('home.personalize.toggleWidget', { name: meta.label })}
                  />
                </div>
                <div className="pz-widget-cat-size">
                  <span>{t('widgets.ui.size')}</span>
                  <Segmented
                    value={size}
                    options={SIZES.map((s) => ({ id: s, label: s }))}
                    onChange={(v) => setSize(type, v as HomeWidgetSize)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        className="pz-primary-btn"
        disabled={widgets.length === 0}
        onClick={arrangeOnScreen}
      >
        {t('home.personalize.arrangeOnScreen')}
      </button>

      <button type="button" className="pz-secondary-btn" onClick={onEditOnPage}>
        <Pencil size={14} strokeWidth={1.75} />
        {t('home.personalize.editOnPage')}
      </button>
    </div>
  );
}
