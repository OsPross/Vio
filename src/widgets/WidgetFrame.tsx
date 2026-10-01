import type { ReactNode } from 'react';
import { Settings2, X, type LucideIcon } from 'lucide-react';

export function WidgetFrame({
  title,
  icon: Icon,
  editMode,
  locked,
  onRemove,
  onOpenSettings,
  children,
  className,
  bare,
}: {
  title: string;
  icon: LucideIcon;
  editMode?: boolean;
  locked?: boolean;
  onRemove?: () => void;
  onOpenSettings?: (anchor: HTMLElement) => void;
  children: ReactNode;
  className?: string;
  /** No card chrome — only for clock/search/shortcuts outside edit outlines */
  bare?: boolean;
}) {
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
          <Icon size={14} strokeWidth={1.75} className="hw-frame-ico" aria-hidden />
          <span className="hw-frame-title">{title}</span>
          {showEditChrome && (
            <div className="hw-frame-edit-chrome" onPointerDown={(e) => e.stopPropagation()}>
              {onOpenSettings && (
                <button
                  type="button"
                  className="hw-icon-btn"
                  title="Ustawienia"
                  aria-label={`Ustawienia: ${title}`}
                  onClick={(e) => onOpenSettings(e.currentTarget)}
                >
                  <Settings2 size={13} />
                </button>
              )}
              {onRemove && (
                <button type="button" className="hw-icon-btn" title="Usuń" onClick={onRemove}>
                  <X size={13} />
                </button>
              )}
            </div>
          )}
        </header>
        <div className="hw-frame-body">{children}</div>
      </div>
    );
  }

  /* bare + edit: dashed outline + gear */
  return (
    <div className={['hw-bare', 'hw-bare-edit', className || ''].filter(Boolean).join(' ')}>
      {showEditChrome && (
        <header className="hw-frame-head" style={{ cursor: 'grab' }}>
          <Icon size={14} strokeWidth={1.75} className="hw-frame-ico" aria-hidden />
          <span className="hw-frame-title">{title}</span>
          <div className="hw-frame-edit-chrome" onPointerDown={(e) => e.stopPropagation()}>
            {onOpenSettings && (
              <button
                type="button"
                className="hw-icon-btn"
                title="Ustawienia"
                aria-label={`Ustawienia: ${title}`}
                onClick={(e) => onOpenSettings(e.currentTarget)}
              >
                <Settings2 size={13} />
              </button>
            )}
            {onRemove && (
              <button type="button" className="hw-icon-btn" title="Usuń" onClick={onRemove}>
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
