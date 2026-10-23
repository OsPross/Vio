import { ScaledPreview } from '../components/ScaledPreview';
import type { HomeWidget, HomeWidgetType } from '../store';
import { HOME_GRID_PX, widgetSizeCells } from '../store';
import { useT } from '../i18n';
import { sizePx, WIDGET_REGISTRY, type WidgetSizeId } from './registry';
import { WidgetBody, WIDGET_ICONS } from './WidgetStrip';
import { WidgetFrame } from './WidgetFrame';

export function widgetPreviewDims(size: WidgetSizeId, type?: HomeWidgetType) {
  const cells = widgetSizeCells(size, type);
  return {
    width: type === 'spotify' ? cells.w * HOME_GRID_PX : sizePx(size),
    height: cells.h * HOME_GRID_PX,
  };
}

export function WidgetPreview({
  type,
  size,
  className,
}: {
  type: HomeWidgetType;
  size: WidgetSizeId;
  className?: string;
}) {
  const t = useT();
  const meta = WIDGET_REGISTRY[type];
  const Icon = WIDGET_ICONS[type];
  const { width, height } = widgetPreviewDims(size, type);
  const widget: HomeWidget = {
    id: `preview-${type}`,
    type,
    size,
    anchor: 'center',
    x: 0,
    y: 0,
    settings: type === 'weather' ? { location: t('widgets.ui.weather.demoCity') } : {},
  };

  return (
    <div
      className={['hw-gallery-preview-wrap', className || ''].filter(Boolean).join(' ')}
      aria-hidden
    >
      <ScaledPreview width={width} height={height}>
        <div
          className="hw-preview-virtual home-preview-virtual"
          style={{ width, height, position: 'relative' }}
        >
          <WidgetFrame title={meta.label} icon={Icon} size={size} className="hw-preview-frame">
            <WidgetBody widget={widget} size={size} preview reduced />
          </WidgetFrame>
        </div>
      </ScaledPreview>
    </div>
  );
}
