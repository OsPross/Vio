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
import { useT } from '../../../i18n';

const RECOMMENDED: HomeWidgetType[] = ['weather', 'notes', 'todo', 'calendar'];

function SortableWidgetRow({
  widget,
  onSize,
  onToggle,
  onPatchSettings,
}: {
  widget: HomeWidget;
  onSize: (size: HomeWidgetSize) => void;
  onToggle: (on: boolean) => void;
  onPatchSettings: (settings: Record<string, unknown>) => void;
}) {
  const t = useT();
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
  const city = String(widget.settings.location || '');

  return (
    <div ref={setNodeRef} className="pz-widget-row-wrap" style={style}>
      <div className="pz-widget-row">
        <button
          type="button"
          className="pz-widget-grip"
          {...attributes}
          {...listeners}
          title={t('home.personalize.drag')}
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
          aria-label={t('home.personalize.sizeAria', { name: meta.label })}
        />
        <Switch
          on={true}
          onChange={onToggle}
          aria-label={t('home.personalize.visibilityAria', { name: meta.label })}
        />
        <span className="pz-widget-more" aria-hidden>
          <MoreHorizontal size={14} />
        </span>
      </div>
      {widget.type === 'weather' && (
        <label className="pz-widget-city">
          <span>{t('home.personalize.city')}</span>
          <input
            className="ui-input"
            value={city}
            placeholder={t('home.personalize.cityPlaceholder')}
            spellCheck={false}
            onChange={(e) => onPatchSettings({ location: e.target.value })}
            onBlur={(e) => onPatchSettings({ location: e.target.value.trim() })}
          />
        </label>
      )}
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
  const t = useT();
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
          <h3>{t('home.personalize.widgets')}</h3>
          {widgets.length > 0 && (
            <button type="button" className="pz-text-btn" onClick={() => setGalleryOpen(true)}>
              <Plus size={13} strokeWidth={2} />
              {t('home.addWidget')}
            </button>
          )}
        </div>

        {widgets.length === 0 ? (
          <>
            <p className="pz-empty">{t('home.personalize.widgetsEmpty')}</p>
            <div className="pz-rec-grid">
              {RECOMMENDED.map((type) => {
                const meta = WIDGET_REGISTRY[type];
                return (
                  <div key={type} className="pz-rec-card">
                    <WidgetPreview type={type} size="M" className="pz-rec-preview" />
                    <strong>{meta.label}</strong>
                    <button type="button" className="pz-rec-add" onClick={() => addType(type)}>
                      {t('common.add')}
                    </button>
                  </div>
                );
              })}
            </div>
            <button type="button" className="pz-text-btn" onClick={() => setGalleryOpen(true)}>
              {t('home.personalize.allWidgets')}
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
                    onPatchSettings={(next) =>
                      setWidgets(
                        widgets.map((x) =>
                          x.id === w.id ? { ...x, settings: { ...x.settings, ...next } } : x,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <button type="button" className="pz-secondary-btn" onClick={onEditOnPage}>
        <Pencil size={14} strokeWidth={1.75} />
        {t('home.personalize.editOnPage')}
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
