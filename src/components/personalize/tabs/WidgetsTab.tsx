import { useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreHorizontal, Pencil, Plus } from 'lucide-react';
import {
  normalizeHomeChrome,
  normalizeHomeWidgets,
  placeNewHomeWidget,
  useStore,
  type HomeWidget,
  type HomeWidgetSize,
  type HomeWidgetType,
} from '../../../store';
import { WIDGET_REGISTRY } from '../../../widgets/registry';
import { WIDGET_ICONS } from '../../../widgets/WidgetStrip';
import { Segmented, Switch } from '../../ui';
import { AddWidgetGallery } from '../../../widgets/AddWidgetGallery';
import { WidgetPreview } from '../../../widgets/WidgetPreview';

const RECOMMENDED: HomeWidgetType[] = ['weather', 'notes', 'todo', 'calendar'];

function SortableWidgetRow({
  widget,
  onSize,
  onToggle,
}: {
  widget: HomeWidget;
  onSize: (size: HomeWidgetSize) => void;
  onToggle: (on: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });
  const meta = WIDGET_REGISTRY[widget.type];
  const Icon = WIDGET_ICONS[widget.type];
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} className="pz-widget-row" style={style}>
      <button
        type="button"
        className="pz-widget-grip"
        {...attributes}
        {...listeners}
        title="Przeciągnij"
      >
        <GripVertical size={14} />
      </button>
      <Icon size={15} strokeWidth={1.75} className="pz-widget-ico" />
      <span className="pz-widget-name">{meta.label}</span>
      <Segmented
        size="sm"
        value={widget.size}
        options={[
          { id: 'S', label: 'S' },
          { id: 'M', label: 'M' },
          { id: 'L', label: 'L' },
        ]}
        onChange={(id) => onSize(id as HomeWidgetSize)}
        aria-label={`Rozmiar ${meta.label}`}
      />
      <Switch on={true} onChange={onToggle} aria-label={`Widoczność ${meta.label}`} />
      <span className="pz-widget-more" aria-hidden>
        <MoreHorizontal size={14} />
      </span>
    </div>
  );
}

export function WidgetsTab({
  onEditOnPage,
  reduced,
}: {
  onEditOnPage: () => void;
  reduced: boolean;
}) {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const widgets = useMemo(() => normalizeHomeWidgets(settings.homeWidgets), [settings.homeWidgets]);
  const ids = widgets.map((w) => w.id);
  const used = useMemo(() => new Set(widgets.map((w) => w.type)), [widgets]);

  const setWidgets = (next: HomeWidget[]) => {
    patchSettings({ homeWidgets: normalizeHomeWidgets(next) });
  };

  const addType = (type: HomeWidgetType) => {
    if (used.has(type)) return;
    const chrome = normalizeHomeChrome(settings.homeChrome);
    const next = [
      ...widgets,
      placeNewHomeWidget(widgets, chrome, {
        id: `w-${Math.random().toString(36).slice(2, 10)}`,
        type,
        size: WIDGET_REGISTRY[type].defaultSize,
        settings: {},
      }),
    ];
    setWidgets(next);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = widgets.findIndex((w) => w.id === active.id);
    const newIndex = widgets.findIndex((w) => w.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    setWidgets(arrayMove(widgets, oldIndex, newIndex));
  };

  return (
    <div className="pz-tab-pane">
      <section className="pz-section">
        <div className="pz-section-head">
          <h3>Widżety</h3>
          {widgets.length > 0 && (
            <button type="button" className="pz-text-btn" onClick={() => setGalleryOpen(true)}>
              <Plus size={13} strokeWidth={2} />
              Dodaj widżet
            </button>
          )}
        </div>

        {widgets.length === 0 ? (
          <>
            <p className="pz-empty">Brak widżetów — wybierz polecane albo otwórz galerię.</p>
            <div className="pz-rec-grid">
              {RECOMMENDED.map((type) => {
                const meta = WIDGET_REGISTRY[type];
                return (
                  <div key={type} className="pz-rec-card">
                    <WidgetPreview type={type} size="M" className="pz-rec-preview" />
                    <strong>{meta.label}</strong>
                    <button type="button" className="pz-rec-add" onClick={() => addType(type)}>
                      Dodaj
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" className="pz-text-btn" onClick={() => setGalleryOpen(true)}>
              Wszystkie widżety
            </button>
          </>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="pz-widget-list">
                {widgets.map((w) => (
                  <SortableWidgetRow
                    key={w.id}
                    widget={w}
                    onSize={(size) =>
                      setWidgets(widgets.map((x) => (x.id === w.id ? { ...x, size } : x)))
                    }
                    onToggle={(on) => {
                      if (!on) setWidgets(widgets.filter((x) => x.id !== w.id));
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <button type="button" className="pz-secondary-btn" onClick={onEditOnPage}>
        <Pencil size={14} strokeWidth={1.75} />
        Edytuj układ na stronie
      </button>

      <AddWidgetGallery
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        widgets={widgets}
        onAdd={(w) => setWidgets([...widgets, w])}
        reduced={reduced}
      />
    </div>
  );
}
