import { t } from '../i18n/core';
import type { HomeWidgetSize, HomeWidgetType } from '../store';

export type WidgetSizeId = HomeWidgetSize;

export type WidgetSizeDef = { id: WidgetSizeId; px: number; label: string };

export type WidgetMeta = {
  type: HomeWidgetType;
  label: string;
  description: string;
  sizes: WidgetSizeDef[];
  defaultSize: WidgetSizeId;
};

function sizeDefs(): WidgetSizeDef[] {
  return [
    { id: 'S', px: 220, label: t('widgets.sizeS') },
    { id: 'M', px: 300, label: t('widgets.sizeM') },
    { id: 'L', px: 460, label: t('widgets.sizeL') },
  ];
}

/** Live registry — labels follow current UI locale. */
export function getWidgetRegistry(): Record<HomeWidgetType, WidgetMeta> {
  const SML = sizeDefs();
  return {
    weather: {
      type: 'weather',
      label: t('widgets.weather'),
      description: t('widgets.weatherDesc'),
      sizes: SML,
      defaultSize: 'M',
    },
    notes: {
      type: 'notes',
      label: t('widgets.notes'),
      description: t('widgets.notesDesc'),
      sizes: SML,
      defaultSize: 'M',
    },
    todo: {
      type: 'todo',
      label: t('widgets.todo'),
      description: t('widgets.todoDesc'),
      sizes: SML,
      defaultSize: 'M',
    },
    calendar: {
      type: 'calendar',
      label: t('widgets.calendar'),
      description: t('widgets.calendarDesc'),
      sizes: SML,
      defaultSize: 'M',
    },
    recent: {
      type: 'recent',
      label: t('widgets.recent'),
      description: t('widgets.recentDesc'),
      sizes: SML,
      defaultSize: 'M',
    },
    downloads: {
      type: 'downloads',
      label: t('widgets.downloads'),
      description: t('widgets.downloadsDesc'),
      sizes: SML,
      defaultSize: 'M',
    },
    resources: {
      type: 'resources',
      label: t('widgets.resources'),
      description: t('widgets.resourcesDesc'),
      sizes: SML,
      defaultSize: 'M',
    },
    spotify: {
      type: 'spotify',
      label: t('widgets.spotify'),
      description: t('widgets.spotifyDesc'),
      sizes: SML,
      defaultSize: 'M',
    },
  };
}

/** @deprecated Prefer getWidgetRegistry() so labels track locale. */
export const WIDGET_REGISTRY: Record<HomeWidgetType, WidgetMeta> = new Proxy(
  {} as Record<HomeWidgetType, WidgetMeta>,
  {
    get(_target, prop: string) {
      return getWidgetRegistry()[prop as HomeWidgetType];
    },
    ownKeys() {
      return Reflect.ownKeys(getWidgetRegistry());
    },
    getOwnPropertyDescriptor(_t, prop) {
      return {
        configurable: true,
        enumerable: true,
        value: getWidgetRegistry()[prop as HomeWidgetType],
      };
    },
  },
);

export function sizePx(size: WidgetSizeId): number {
  const row = sizeDefs().find((s) => s.id === size);
  return row?.px ?? 300;
}

export function widgetTypes(): HomeWidgetType[] {
  return Object.keys(getWidgetRegistry()) as HomeWidgetType[];
}
