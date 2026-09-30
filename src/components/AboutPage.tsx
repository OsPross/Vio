import { useEffect, useState } from 'react';
import { Copy, ExternalLink, FolderOpen } from 'lucide-react';
import { InternalPage } from './InternalPage';
import { CHROME_SHORTCUTS } from '../lib/shortcutsRegistry';

type AppInfo = {
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  v8?: string;
  userData?: string;
};

export function AboutPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void window.shell?.appInfo?.().then((r) => {
      if (r && typeof r === 'object') setInfo(r as AppInfo);
    });
  }, []);

  const lines = info
    ? [
        `djxxr ${info.appVersion}`,
        `Electron ${info.electron}`,
        `Chromium ${info.chrome}`,
        `Node ${info.node}`,
        info.v8 ? `V8 ${info.v8}` : null,
        `Platform ${info.platform}`,
        info.userData ? `Profil ${info.userData}` : null,
      ].filter(Boolean)
    : [];

  const copy = async () => {
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <InternalPage
      title="O djxxr"
      subtitle="Wersje, skróty i ścieżki profilu"
      toolbar={
        <button type="button" className="sbtn ghost" onClick={() => void copy()}>
          <Copy size={14} strokeWidth={1.75} />
          {copied ? 'Skopiowano' : 'Kopiuj informacje o wersji'}
        </button>
      }
    >
      <div className="about-page">
        <div className="about-hero">
          <div className="about-logo" aria-hidden>
            dx
          </div>
          <div>
            <h2>djxxr</h2>
            <p className="muted">Prywatna przeglądarka na Electronie</p>
          </div>
        </div>

        <dl className="about-dl">
          <div>
            <dt>Wersja aplikacji</dt>
            <dd>{info?.appVersion ?? '…'}</dd>
          </div>
          <div>
            <dt>Electron</dt>
            <dd>{info?.electron ?? '…'}</dd>
          </div>
          <div>
            <dt>Chromium</dt>
            <dd>{info?.chrome ?? '…'}</dd>
          </div>
          <div>
            <dt>Node</dt>
            <dd>{info?.node ?? '…'}</dd>
          </div>
          {info?.v8 ? (
            <div>
              <dt>V8</dt>
              <dd>{info.v8}</dd>
            </div>
          ) : null}
          <div>
            <dt>Platforma</dt>
            <dd>{info?.platform ?? '…'}</dd>
          </div>
          {info?.userData ? (
            <div>
              <dt>Profil</dt>
              <dd className="about-path">{info.userData}</dd>
            </div>
          ) : null}
        </dl>

        <div className="about-actions">
          <button
            type="button"
            className="sbtn ghost"
            onClick={() => void window.shell?.openUserData?.()}
          >
            <FolderOpen size={14} strokeWidth={1.75} />
            Otwórz folder profilu
          </button>
          <button
            type="button"
            className="sbtn ghost"
            onClick={() => void window.shell?.openLogsFolder?.()}
          >
            <ExternalLink size={14} strokeWidth={1.75} />
            Folder logów
          </button>
        </div>

        <h3 className="about-h3">Skróty klawiszowe</h3>
        <ul className="about-shortcuts">
          {CHROME_SHORTCUTS.map((s) => (
            <li key={s.id}>
              <span>{s.description || s.id}</span>
              <kbd>{s.accelerator}</kbd>
            </li>
          ))}
        </ul>
      </div>
    </InternalPage>
  );
}
