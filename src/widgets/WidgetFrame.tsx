import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useT } from '../i18n';
import type { HomeWidgetSize } from '../store';

/** Lucide icons or custom SVGs that accept the same size/className props. */
export type WidgetFrameIcon = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean | 'true';
}>;

const SIZES: HomeWidgetSize[] = ['S', 'M', 'L'];

export function WidgetFrame({
  title,
  icon: _Icon,
  editMode,
  locked,
  size,
  onRemove,
  onOpenSettings,
  onCycleSize,
  onSetSize,
  children,
  className,
  bare,
}: {
  title: string;
  icon: WidgetFrameIcon;
  editMode?: boolean;
  locked?: boolean;
  size?: HomeWidgetSize;
  onRemove?: () => void;
  onOpenSettings?: (anchor: HTMLElement) => void;
  /** Legacy cycle — preferred: onSetSize */
  onCycleSize?: () => void;
  onSetSize?: (size: HomeWidgetSize) => void;
  children: ReactNode;
  className?: string;
  /** No card chrome — only for clock/search/shortcuts outside edit outlines */
  bare?: boolean;
}) {
  const t = useT();
  const showEditChrome = !!editMode && !locked;

  if (bare && !showEditChrome) {
    return <div className={['hw-bare', className || ''].filter(Boolean).join(' ')}>{children}</div>;
  }

  if (bare && showEditChrome) {
    return (
      <div
        className={['hw-bare', 'hw-bare-edit', className || ''].filter(Boolean).join(' ')}
        style={{ cursor: 'grab' }}
      >
        <div className="hw-bare-edit-label">{title}</div>
        {onOpenSettings && (
          <button
            type="button"
            className="hw-ios-gear"
            title={t('common.settings')}
            aria-label={t('widgets.ui.settingsAria', { title })}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => onOpenSettings(e.currentTarget)}
          >
            ···
          </button>
        )}
        <div className="hw-bare-edit-body">{children}</div>
      </div>
    );
  }

  return (
    <div
      className={['hw-frame', editMode ? 'is-edit' : '', className || ''].filter(Boolean).join(' ')}
      style={showEditChrome ? { cursor: 'grab' } : undefined}
    >
      {showEditChrome && onRemove && (
        <button
          type="button"
          className="hw-ios-minus"
          title={t('common.remove')}
          aria-label={t('common.remove')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          −
        </button>
      )}
      <div className="hw-frame-body">{children}</div>
      {showEditChrome && (onSetSize || onCycleSize) && (
        <div
          className="hw-ios-size-pill"
          role="group"
          aria-label={t('widgets.ui.cycleSize')}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={size === s ? 'on' : ''}
              onClick={(e) => {
                e.stopPropagation();
                if (onSetSize) onSetSize(s);
                else onCycleSize?.();
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function WidgetEmpty({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="hw-empty">
      <Icon size={22} strokeWidth={1.5} aria-hidden />
      <p>{text}</p>
    </div>
  );
}
