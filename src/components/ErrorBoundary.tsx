import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

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
      return (
        <div
          className="error-boundary-fallback"
          role="alert"
          style={{ padding: '12px 16px', fontSize: '13px', lineHeight: 1.45 }}
        >
          <p style={{ margin: '0 0 8px' }}>Ten panel napotkał błąd</p>
          {retry ? (
            <button type="button" className="sbtn ghost" onClick={this.handleRetry}>
              <RefreshCw size={14} strokeWidth={1.75} />
              Spróbuj ponownie
            </button>
          ) : null}
        </div>
      );
    }

    return <Fragment key={resetKey}>{children}</Fragment>;
  }
}
