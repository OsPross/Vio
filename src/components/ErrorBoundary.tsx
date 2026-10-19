import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { useT } from '../i18n';

type Props = {
  name?: string;
  children: ReactNode;
  /** Show a retry control that remounts children (default true). */
  retry?: boolean;
};

type State = {
  error: Error | null;
  resetKey: number;
};

function ErrorBoundaryFallback({ retry, onRetry }: { retry: boolean; onRetry: () => void }) {
  const t = useT();
  return (
    <div
      className="error-boundary-fallback"
      role="alert"
      style={{ padding: '12px 16px', fontSize: '13px', lineHeight: 1.45 }}
    >
      <p style={{ margin: '0 0 8px' }}>{t('errors.panelError')}</p>
      {retry ? (
        <button type="button" className="sbtn ghost" onClick={onRetry}>
          <RefreshCw size={14} strokeWidth={1.75} />
          {t('errors.tryAgain')}
        </button>
      ) : null}
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const label = this.props.name ? `[${this.props.name}]` : '';
    console.error(`ErrorBoundary${label}`, error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  render() {
    const { error, resetKey } = this.state;
    const { children, retry = true } = this.props;

    if (error) {
      return <ErrorBoundaryFallback retry={retry} onRetry={this.handleRetry} />;
    }

    return <Fragment key={resetKey}>{children}</Fragment>;
  }
}
