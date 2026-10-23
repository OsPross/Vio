import type { ComponentType, ReactNode } from 'react';
import { Settings2, X, type LucideIcon } from 'lucide-react';
import { useT } from '../i18n';

/** Lucide icons or custom SVGs that accept the same size/className props. */
export type WidgetFrameIcon = ComponentType<{
  size?: number;
  strokeWidth?: number;
  className?: string;
  'aria-hidden'?: boolean | 'true';
}>;

export function WidgetFrame({
  title,
  icon: _Icon,
  editMode,
  locked,
  onRemove,
  onOpenSettings,
  onCycleSize,
  children,
  className,
  bare,
}: {
  title: string;
  icon: WidgetFrameIcon;
  editMode?: boolean;
  locked?: boolean;
  onRemove?: () => void;
  onOpenSettings?: (anchor: HTMLElement) => void;
  /** Corner control: cycle S → M → L while editing */
  onCycleSize?: () => void;
  children: ReactNode;
  className?: string;
  /** No card chrome — only for clock/search/shortcuts outside edit outlines */
  bare?: boolean;
}) {
  const t = useT();
  const showEditChrome = !!editMode && !locked;

  /* bare chrome (clock/search/shortcuts): no card outside edit */
  if (bare && !showEditChrome) {
    return <div className={['hw-bare', className || ''].filter(Boolean).join(' ')}>{children}</div>;
  }

  /* Regular widgets ALWAYS show full card + header (icon + name), even outside edit */
  if (!bare) {
    return (
      <div
        className={['hw-frame', editMode ? 'is-edit' : '', className || '']
          .filter(Boolean)
          .join(' ')}
      >
        <header className="hw-frame-head" style={showEditChrome ? { cursor: 'grab' } : undefined}>
          <span className="hw-frame-title">{title}</span>
          {showEditChrome && (
            <div className="hw-frame-edit-chrome" onPointerDown={(e) => e.stopPropagation()}>
              {onOpenSettings && (
                <button
                  type="button"
                  className="hw-icon-btn"
                  title={t('common.settings')}
                  aria-label={t('widgets.ui.settingsAria', { title })}
                  onClick={(e) => onOpenSettings(e.currentTarget)}
                >
                  <Settings2 size={13} />
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  className="hw-icon-btn"
                  title={t('common.remove')}
                  aria-label={t('common.remove')}
                  onClick={onRemove}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}
        </header>
        <div className="hw-frame-body">{children}</div>
        {showEditChrome && onCycleSize && (
          <button
            type="button"
            className="hw-size-handle"
            title={t('widgets.ui.cycleSize')}
            aria-label={t('widgets.ui.cycleSize')}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onCycleSize();
            }}
          />
        )}
      </div>
    );
  }

  /* bare + edit: dashed outline + gear */
  return (
    <div className={['hw-bare', 'hw-bare-edit', className || ''].filter(Boolean).join(' ')}>
      {showEditChrome && (
        <header className="hw-frame-head" style={{ cursor: 'grab' }}>
          <span className="hw-frame-title">{title}</span>
          <div className="hw-frame-edit-chrome" onPointerDown={(e) => e.stopPropagation()}>
            {onOpenSettings && (
              <button
                type="button"
                className="hw-icon-btn"
                title={t('common.settings')}
                aria-label={t('widgets.ui.settingsAria', { title })}
                onClick={(e) => onOpenSettings(e.currentTarget)}
              >
                <Settings2 size={13} />
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                className="hw-icon-btn"
                title={t('common.remove')}
                onClick={onRemove}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </header>
      )}
      <div>{children}</div>
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
