import { useMemo } from 'react';
import { buildQrSvg, canEncodeQr } from '../lib/miniQr';

type Props = {
  url: string;
  onClose: () => void;
};

export function QrShareDialog({ url, onClose }: Props) {
  const svg = useMemo(() => (canEncodeQr(url) ? buildQrSvg(url, 200) : null), [url]);

  return (
    <div className="app-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="app-dialog"
        role="dialog"
        aria-label="Kod QR"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>Udostępnij stronę</h2>
        <p className="app-dialog-sub">Lokalny kod — bez zapytań do sieci.</p>
        {svg ? (
          <div className="qr-frame" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <p className="app-dialog-note">Adres jest zbyt długi na kompaktowy kod — skopiuj link.</p>
        )}
        <code className="app-dialog-url">{url}</code>
        <div className="app-dialog-actions">
          <button
            type="button"
            className="sbtn ghost"
            onClick={() => {
              void navigator.clipboard.writeText(url);
            }}
          >
            Kopiuj link
          </button>
          <button type="button" className="sbtn" onClick={onClose}>
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}

type AboutProps = {
  info: { appVersion: string; electron: string; chrome: string; node: string; platform: string };
  onClose: () => void;
};

export function AboutDialog({ info, onClose }: AboutProps) {
  return (
    <div className="app-dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="app-dialog"
        role="dialog"
        aria-label="O djxxr"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>djxxr</h2>
        <p className="app-dialog-sub">Prywatna przeglądarka na Electronie</p>
        <dl className="about-dl">
          <div>
            <dt>Wersja aplikacji</dt>
            <dd>{info.appVersion}</dd>
          </div>
          <div>
            <dt>Electron</dt>
            <dd>{info.electron}</dd>
          </div>
          <div>
            <dt>Chromium</dt>
            <dd>{info.chrome}</dd>
          </div>
          <div>
            <dt>Node</dt>
            <dd>{info.node}</dd>
          </div>
          <div>
            <dt>Platforma</dt>
            <dd>{info.platform}</dd>
          </div>
        </dl>
        <div className="app-dialog-actions">
          <button type="button" className="sbtn" onClick={onClose}>
            Zamknij
          </button>
        </div>
      </div>
    </div>
  );
}
