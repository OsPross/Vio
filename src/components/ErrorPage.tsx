import { RefreshCw, TriangleAlert } from 'lucide-react';

type Props = {
  url: string;
  errorCode: number;
  description?: string;
  onRetry: () => void;
  /** crash | network */
  kind?: 'crash' | 'network';
};

function headlineFor(errorCode: number, kind?: string, description?: string): string {
  if (kind === 'crash' || errorCode === -9001) return 'Ta strona przestała działać';
  if (errorCode === -105 || errorCode === -106 || errorCode === -137)
    return 'Brak połączenia z internetem';
  if (errorCode === -7 || errorCode === -118) return 'Przekroczono limit czasu połączenia';
  if (
    errorCode === -200 ||
    errorCode === -201 ||
    errorCode === -202 ||
    errorCode === -203 ||
    errorCode === -324 ||
    /CERT|SSL|CERTIFICATE/i.test(description || '')
  ) {
    return 'Problem z certyfikatem bezpieczeństwa';
  }
  if (errorCode === -501) return 'Nieobsługiwany protokół';
  if (errorCode === -300 || errorCode === -302) return 'Nieprawidłowy adres';
  return 'Nie udało się załadować strony';
}

export function ErrorPage({ url, errorCode, description, onRetry, kind }: Props) {
  const headline = headlineFor(errorCode, kind, description);

  return (
    <div className="page-error-overlay" role="alert">
      <div className="page-error-card">
        <TriangleAlert size={32} strokeWidth={1.6} className="page-error-icon" />
        <h2>{headline}</h2>
        {description ? <p className="page-error-desc">{description}</p> : null}
        <code className="page-error-url">{url || 'about:blank'}</code>
        {kind !== 'crash' ? <p className="page-error-code muted">Kod błędu: {errorCode}</p> : null}
        <button type="button" className="sbtn" onClick={onRetry}>
          <RefreshCw size={14} strokeWidth={1.75} />
          Odśwież
        </button>
      </div>
    </div>
  );
}
