import { RefreshCw, TriangleAlert } from 'lucide-react';

type Props = {
  url: string;
  errorCode: number;
  description?: string;
  onRetry: () => void;
};

export function ErrorPage({ url, errorCode, description, onRetry }: Props) {
  let headline = 'Nie udało się załadować strony';
  if (errorCode === -105) headline = 'Brak połączenia z internetem';
  else if (errorCode === -106) headline = 'Połączenie przerwane';
  else if (errorCode === -501) headline = 'Nieobsługiwany protokół';

  return (
    <div className="page-error-overlay" role="alert">
      <div className="page-error-card">
        <TriangleAlert size={32} strokeWidth={1.6} className="page-error-icon" />
        <h2>{headline}</h2>
        {description ? <p className="page-error-desc">{description}</p> : null}
        <code className="page-error-url">{url || 'about:blank'}</code>
        <p className="page-error-code muted">Kod błędu: {errorCode}</p>
        <button type="button" className="sbtn" onClick={onRetry}>
          <RefreshCw size={14} strokeWidth={1.75} />
          Spróbuj ponownie
        </button>
      </div>
    </div>
  );
}
