import type { CSSProperties, ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
  maxWidth?: number;
  /** Optional leading icon in the page title */
  icon?: ReactNode;
};

export function InternalPage({
  title,
  subtitle,
  toolbar,
  children,
  className,
  maxWidth = 880,
  icon,
}: Props) {
  const style = { '--internal-page-max': `${maxWidth}px` } as CSSProperties;

  return (
    <div className={`internal-page${className ? ` ${className}` : ''}`} style={style}>
      <header className="internal-page-head">
        <div className="internal-page-head-text">
          <h1>
            {icon ? <span className="internal-page-ico">{icon}</span> : null}
            {title}
          </h1>
          {subtitle != null ? <div className="internal-page-subtitle">{subtitle}</div> : null}
        </div>
        {toolbar ? <div className="internal-page-toolbar">{toolbar}</div> : null}
      </header>
      <div className="internal-page-body">{children}</div>
    </div>
  );
}
