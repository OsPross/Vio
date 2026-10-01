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

const SML: WidgetSizeDef[] = [
  { id: 'S', px: 220, label: 'Mały' },
  { id: 'M', px: 300, label: 'Średni' },
  { id: 'L', px: 460, label: 'Duży' },
];

export const WIDGET_REGISTRY: Record<HomeWidgetType, WidgetMeta> = {
  weather: {
    type: 'weather',
    label: 'Pogoda',
    description: 'Open-Meteo — lokalizacja wpisana ręcznie',
    sizes: SML,
    defaultSize: 'M',
  },
  notes: {
    type: 'notes',
    label: 'Notatki',
    description: 'Szybkie notatki ze strony startowej',
    sizes: SML,
    defaultSize: 'M',
  },
  todo: {
    type: 'todo',
    label: 'Lista zadań',
    description: 'Proste todo na home',
    sizes: SML,
    defaultSize: 'M',
  },
  calendar: {
    type: 'calendar',
    label: 'Kalendarz',
    description: 'Miesiąc bieżący',
    sizes: SML,
    defaultSize: 'M',
  },
  recent: {
    type: 'recent',
    label: 'Ostatnio odwiedzone',
    description: 'Z historii przeglądania',
    sizes: SML,
    defaultSize: 'M',
  },
  downloads: {
    type: 'downloads',
    label: 'Pobrane',
    description: 'Ostatnie pliki',
    sizes: SML,
    defaultSize: 'M',
  },
  resources: {
    type: 'resources',
    label: 'Zasoby',
    description: 'CPU / RAM (tylko gdy widoczny)',
    sizes: SML,
    defaultSize: 'M',
  },
};

export function sizePx(size: WidgetSizeId): number {
  return SML.find((s) => s.id === size)?.px ?? 300;
}

export function sizeForType(
  type: HomeWidgetType,
  size: WidgetSizeId = WIDGET_REGISTRY[type].defaultSize,
) {
  const meta = WIDGET_REGISTRY[type];
  return (
    meta.sizes.find((s) => s.id === size) ?? meta.sizes.find((s) => s.id === meta.defaultSize)!
  );
}
