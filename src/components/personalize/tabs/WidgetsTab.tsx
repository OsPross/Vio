import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { GripVertical, MoreHorizontal, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
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
import { AddWidgetGallery } from '../../../widgets/AddWidgetGallery';
import { WidgetPreview } from '../../../widgets/WidgetPreview';
import { WeatherCityField } from '../../../widgets/WeatherCityField';
import { useT } from '../../../i18n';

const RECOMMENDED: HomeWidgetType[] = ['weather', 'notes', 'todo', 'calendar'];
const SIZES: HomeWidgetSize[] = ['S', 'M', 'L'];

function WidgetMoreMenu({
  open,
  anchor,
  widget,
  onClose,
  onSize,
  onOpenSettings,
  onRemove,
}: {
  open: boolean;
  anchor: DOMRect | null;
  widget: HomeWidget;
  onClose: () => void;
  onSize: (size: HomeWidgetSize) => void;
  onOpenSettings: () => void;
  onRemove: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!open || !anchor) return;
    const w = 200;
    const left = Math.min(Math.max(8, anchor.right - w), window.innerWidth - w - 8);
    const top = Math.min(anchor.bottom + 6, window.innerHeight - 200);
    setPos({ left, top });
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !anchor) return null;

  return createPortal(
    <div
      ref={ref}
      className="pz-widget-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      aria-label={t('home.personalize.widgetMenuAria', {
        name: WIDGET_REGISTRY[widget.type].label,
      })}
    >
      <div className="pz-widget-menu-label">{t('widgets.ui.size')}</div>
      <div className="pz-widget-menu-sizes" role="group">
        {SIZES.map((s) => (
          <button
            key={s}
            type="button"
            role="menuitemradio"
            aria-checked={widget.size === s}
            className={widget.size === s ? 'on' : ''}
            onClick={() => {
              onSize(s);
              onClose();
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <button
        type="button"
        role="menuitem"
        className="pz-widget-menu-item"
        onClick={() => {
          onClose();
          onOpenSettings();
        }}
      >
        <Settings2 size={14} strokeWidth={1.75} />
        {t('common.settings')}
      </button>
      <button
        type="button"
        role="menuitem"
        className="pz-widget-menu-item danger"
        onClick={() => {
          onClose();
          onRemove();
        }}
      >
        <Trash2 size={14} strokeWidth={1.75} />
        {t('common.remove')}
      </button>
    </div>,
    document.body,
  );
}

function SortableWidgetTile({
  widget,
  onSize,
  onRemove,
  onPatchSettings,
}: {
  widget: HomeWidget;
  onSize: (size: HomeWidgetSize) => void;
  onRemove: () => void;
  onPatchSettings: (settings: Record<string, unknown>) => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  });
  const meta = WIDGET_REGISTRY[widget.type];
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.88 : 1,
  };
  const city = String(widget.settings.location || '');
  const needsCity = widget.type === 'weather' && !city.trim();

  return (
    <div ref={setNodeRef} className="pz-widget-tile" style={style}>
      <button
        type="button"
        className="pz-widget-grip"
        {...attributes}
        {...listeners}
        title={t('home.personalize.drag')}
        aria-label={t('home.personalize.drag')}
      >
        <GripVertical size={14} />
      </button>
      <div className="pz-widget-tile-preview" aria-hidden>
        <WidgetPreview type={widget.type} size={widget.size} />
      </div>
      <div className="pz-widget-tile-meta">
        <strong>{meta.label}</strong>
        <span>
          {widget.size}
          {needsCity ? ` · ${t('widgets.ui.weather.needsCity')}` : ''}
        </span>
      </div>
      <button
        ref={moreRef}
        type="button"
        className="pz-widget-more-btn"
        aria-label={t('home.personalize.widgetMenuAria', { name: meta.label })}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => {
          const r = moreRef.current?.getBoundingClientRect() || null;
          setMenuAnchor(r);
          setMenuOpen((v) => !v);
        }}
      >
        <MoreHorizontal size={15} strokeWidth={1.75} />
      </button>

      <WidgetMoreMenu
        open={menuOpen}
        anchor={menuAnchor}
        widget={widget}
        onClose={() => setMenuOpen(false)}
        onSize={onSize}
        onOpenSettings={() => setSettingsOpen(true)}
        onRemove={onRemove}
      />

      {settingsOpen && (
        <div className="pz-widget-settings-sheet">
          <div className="pz-widget-settings-card" role="dialog" aria-label={t('common.settings')}>
            <header>
              <strong>{meta.label}</strong>
              <button type="button" className="pz-text-btn" onClick={() => setSettingsOpen(false)}>
                {t('common.done')}
              </button>
            </header>
            <div className="pz-widget-settings-body">
              <div className="pz-widget-settings-row">
                <span>{t('widgets.ui.size')}</span>
                <div className="pz-widget-menu-sizes">
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={widget.size === s ? 'on' : ''}
                      onClick={() => onSize(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              {widget.type === 'weather' && (
                <WeatherCityField
                  location={city}
                  autoFocus
                  onChange={(next) => onPatchSettings(next)}
                />
              )}
              {widget.type !== 'weather' && (
                <p className="pz-widget-settings-hint">{t('home.personalize.noExtraSettings')}</p>
              )}
            </div>
          </div>
        </div>
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
          <button type="button" className="pz-text-btn" onClick={() => setGalleryOpen(true)}>
            <Plus size={13} strokeWidth={2} />
            {t('home.addWidget')}
          </button>
        </div>

        {widgets.length === 0 ? (
          <div className="pz-widgets-empty">
            <p className="pz-empty">{t('home.personalize.widgetsEmpty')}</p>
            <button type="button" className="pz-primary-btn" onClick={() => setGalleryOpen(true)}>
              <Plus size={15} strokeWidth={2} />
              {t('home.personalize.addFirstWidget')}
            </button>
            <div className="pz-rec-grid">
              {RECOMMENDED.map((type) => {
                const meta = WIDGET_REGISTRY[type];
                return (
                  <div key={type} className="pz-rec-card">
                    <WidgetPreview type={type} size="M" className="pz-rec-preview" />
                    <strong>{meta.label}</strong>
                    <span className="pz-rec-desc">{meta.description}</span>
                    <button type="button" className="pz-rec-add" onClick={() => addType(type)}>
                      {t('common.add')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="pz-widget-tiles">
                {widgets.map((w) => (
                  <SortableWidgetTile
                    key={w.id}
                    widget={w}
                    onSize={(size) =>
                      setWidgets(widgets.map((x) => (x.id === w.id ? { ...x, size } : x)))
                    }
                    onRemove={() => setWidgets(widgets.filter((x) => x.id !== w.id))}
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
