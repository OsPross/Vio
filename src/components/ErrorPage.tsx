import { RefreshCw, TriangleAlert } from 'lucide-react';
import { useT } from '../i18n';

type Props = {
  url: string;
  errorCode: number;
  description?: string;
  onRetry: () => void;
  /** crash | network */
  kind?: 'crash' | 'network';
};

function headlineFor(
  errorCode: number,
  t: (key: string) => string,
  kind?: string,
  description?: string,
): string {
  if (kind === 'crash' || errorCode === -9001) return t('errors.crash');
  if (errorCode === -105 || errorCode === -106 || errorCode === -137) return t('errors.noInternet');
  if (errorCode === -7 || errorCode === -118) return t('errors.timeout');
  if (
    errorCode === -200 ||
    errorCode === -201 ||
    errorCode === -202 ||
    errorCode === -203 ||
    errorCode === -324 ||
    /CERT|SSL|CERTIFICATE/i.test(description || '')
  ) {
    return t('errors.certificate');
  }
  if (errorCode === -501) return t('errors.unsupportedProtocol');
  if (errorCode === -300 || errorCode === -302) return t('errors.invalidAddress');
  return t('errors.loadFailed');
}

export function ErrorPage({ url, errorCode, description, onRetry, kind }: Props) {
  const t = useT();
  const headline = headlineFor(errorCode, t, kind, description);

  return (
    <div className="page-error-overlay" role="alert">
      <div className="page-error-card">
        <TriangleAlert size={32} strokeWidth={1.6} className="page-error-icon" />
        <h2>{headline}</h2>
        {description ? <p className="page-error-desc">{description}</p> : null}
        <code className="page-error-url">{url || 'about:blank'}</code>
        {kind !== 'crash' ? (
          <p className="page-error-code muted">{t('errors.errorCode', { code: errorCode })}</p>
        ) : null}
        <button type="button" className="sbtn" onClick={onRetry}>
          <RefreshCw size={14} strokeWidth={1.75} />
          {t('common.refresh')}
        </button>
      </div>
    </div>
  );
}
