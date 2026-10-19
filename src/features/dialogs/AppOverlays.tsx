import {
  Suspense,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { KeyRound, Puzzle, TriangleAlert } from 'lucide-react';
import { FindBar } from '../../components/FindBar';
import { Switch } from '../../components/ui/Switch';
import type { CertWarn, ExtInstallAsk, HttpsWarn, PermAsk } from '../../hooks/useIpcEvents';
import type { SaveOffer } from '../tabs';
import { AboutDialog, ClearDataDialog, QrShareDialog } from './lazy';

export type AboutInfo = {
  appVersion: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
};

export type ChromeOverlaysProps = {
  findOpen: boolean;
  findQuery: string;
  findActive: number;
  findTotal: number;
  setFindQuery: Dispatch<SetStateAction<string>>;
  runFind: (q: string, backward?: boolean) => void;
  closeFind: () => void;
  fsToast: boolean;
  htmlFullscreen: boolean;
  certWarn: CertWarn | null;
  setCertWarn: Dispatch<SetStateAction<CertWarn | null>>;
  certRemember: boolean;
  setCertRemember: Dispatch<SetStateAction<boolean>>;
  qrOpen: boolean;
  setQrOpen: Dispatch<SetStateAction<boolean>>;
  pageUrlForShare: string;
  clearDataOpen: boolean;
  setClearDataOpen: Dispatch<SetStateAction<boolean>>;
  aboutInfo: AboutInfo | null;
  setAboutInfo: Dispatch<SetStateAction<AboutInfo | null>>;
};

/** Dialogs / bars rendered above the stage (find, cert, QR, clear data, about). */
export function ChromeOverlays({
  findOpen,
  findQuery,
  findActive,
  findTotal,
  setFindQuery,
  runFind,
  closeFind,
  fsToast,
  htmlFullscreen,
  certWarn,
  setCertWarn,
  certRemember,
  setCertRemember,
  qrOpen,
  setQrOpen,
  pageUrlForShare,
  clearDataOpen,
  setClearDataOpen,
  aboutInfo,
  setAboutInfo,
}: ChromeOverlaysProps) {
  return (
    <>
      {findOpen && (
        <FindBar
          query={findQuery}
          activeMatch={findActive}
          matchCount={findTotal}
          onQueryChange={(q) => {
            setFindQuery(q);
            runFind(q);
          }}
          onClose={closeFind}
          onNext={(backward) => runFind(findQuery, backward)}
        />
      )}
      {fsToast && htmlFullscreen && <div className="html-fs-toast">Esc aby wyjść</div>}
      {certWarn && (
        <div className="cert-warn-overlay" role="alertdialog">
          <div className="cert-warn-card">
            <TriangleAlert size={28} strokeWidth={1.6} />
            <h2>Ostrzeżenie certyfikatu</h2>
            <p>
              Połączenie nie jest zaufane ({certWarn.error || 'błąd certyfikatu'}).
              {certWarn.tor ? ' Tryb Tor — kontynuuj tylko jeśli ufasz tej stronie.' : ''}
            </p>
            {certWarn.issuer ? <p className="muted">Wystawca: {certWarn.issuer}</p> : null}
            <code className="cert-warn-url">{certWarn.url}</code>
            {!certWarn.tor ? (
              <label className="perm-remember">
                <Switch
                  on={certRemember}
                  onChange={setCertRemember}
                  aria-label={`Zapamiętaj wyjątek dla ${certWarn.host || 'tej domeny'}`}
                />
                Zapamiętaj wyjątek dla {certWarn.host || 'tej domeny'}
              </label>
            ) : null}
            <div className="cert-warn-actions">
              <button
                type="button"
                className="sbtn ghost"
                onClick={() => {
                  void window.shell?.certificateRespond?.(certWarn.webContentsId, false, false);
                  setCertWarn(null);
                }}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="sbtn danger-text"
                onClick={() => {
                  void window.shell?.certificateRespond?.(
                    certWarn.webContentsId,
                    true,
                    certRemember && !certWarn.tor,
                  );
                  setCertWarn(null);
                }}
              >
                Kontynuuj mimo to
              </button>
            </div>
          </div>
        </div>
      )}
      {qrOpen && pageUrlForShare && (
        <Suspense fallback={null}>
          <QrShareDialog url={pageUrlForShare} onClose={() => setQrOpen(false)} />
        </Suspense>
      )}
      {clearDataOpen && (
        <Suspense fallback={null}>
          <ClearDataDialog
            open={clearDataOpen}
            onClose={() => setClearDataOpen(false)}
            onConfirm={async (range) => {
              await window.shell?.historyClear?.({ range });
              setClearDataOpen(false);
            }}
          />
        </Suspense>
      )}
      {aboutInfo && (
        <Suspense fallback={null}>
          <AboutDialog info={aboutInfo} onClose={() => setAboutInfo(null)} />
        </Suspense>
      )}
    </>
  );
}

export type CrashRestoreOfferProps = {
  crashOffer: boolean;
  onAccept: () => void;
  onDecline: () => void;
};

export function CrashRestoreOffer({ crashOffer, onAccept, onDecline }: CrashRestoreOfferProps) {
  if (!crashOffer) return null;
  return (
    <div className="session-crash-banner" role="alertdialog">
      <div className="session-crash-text">
        <strong>Vio została nieoczekiwanie zamknięta.</strong>
        <span> Przywrócić karty?</span>
      </div>
      <div className="session-crash-actions">
        <button type="button" className="sbtn" onClick={onAccept}>
          Przywróć
        </button>
        <button type="button" className="sbtn danger-text" onClick={onDecline}>
          Nie
        </button>
      </div>
    </div>
  );
}

export type HttpsWarnOverlayProps = {
  httpsWarn: HttpsWarn | null;
  setHttpsWarn: Dispatch<SetStateAction<HttpsWarn | null>>;
  navigateActive: (url: string, query?: string, opts?: { typed?: boolean }) => void;
};

export function HttpsWarnOverlay({
  httpsWarn,
  setHttpsWarn,
  navigateActive,
}: HttpsWarnOverlayProps) {
  if (!httpsWarn) return null;
  return (
    <div className="https-warn-overlay" role="alertdialog" aria-label="Ostrzeżenie HTTPS">
      <div className="https-warn-card">
        <TriangleAlert size={28} strokeWidth={1.6} />
        <h2>Połączenie nie jest bezpieczne</h2>
        <p>
          Strona nie odpowiada przez HTTPS. W trybie ścisłym możesz wejść mimo to — ruch będzie
          nieszyfrowany.
        </p>
        <code className="https-warn-url">{httpsWarn.httpUrl}</code>
        <div className="https-warn-actions">
          <button type="button" className="sbtn ghost" onClick={() => setHttpsWarn(null)}>
            Anuluj
          </button>
          <button
            type="button"
            className="sbtn"
            onClick={() => {
              const u = httpsWarn.httpUrl;
              setHttpsWarn(null);
              navigateActive(u);
            }}
          >
            Wejdź mimo to
          </button>
        </div>
      </div>
    </div>
  );
}

export type StageOverlaysProps = {
  permAsk: PermAsk | null;
  setPermAsk: Dispatch<SetStateAction<PermAsk | null>>;
  extInstallAsk: ExtInstallAsk | null;
  setExtInstallAsk: Dispatch<SetStateAction<ExtInstallAsk | null>>;
  permRemember: boolean;
  setPermRemember: Dispatch<SetStateAction<boolean>>;
  saveOffer: SaveOffer | null;
  setSaveOffer: Dispatch<SetStateAction<SaveOffer | null>>;
  passwordsOfferSave: boolean;
  activeIsTor: boolean;
  setPwForPage: Dispatch<SetStateAction<number>>;
};

/** Permission ask + save-password prompts (after Tor banners in stage). */
export function StageOverlays({
  permAsk,
  setPermAsk,
  extInstallAsk,
  setExtInstallAsk,
  permRemember,
  setPermRemember,
  saveOffer,
  setSaveOffer,
  passwordsOfferSave,
  activeIsTor,
  setPwForPage,
}: StageOverlaysProps) {
  return (
    <>
      {extInstallAsk && (
        <div className="perm-bar ext-install-bar" role="alertdialog">
          <Puzzle size={16} strokeWidth={1.75} aria-hidden />
          <span>
            Zainstalować rozszerzenie w <strong>Vio</strong>?
            <span className="ext-install-id" title={extInstallAsk.extensionId}>
              {extInstallAsk.extensionId.slice(0, 8)}…
            </span>
          </span>
          <div className="pw-save-actions">
            <button
              type="button"
              className="sbtn primary"
              onClick={() => {
                void window.shell?.extensionsInstallRespond?.(extInstallAsk.askId, true);
                setExtInstallAsk(null);
              }}
            >
              Zainstaluj
            </button>
            <button
              type="button"
              className="sbtn ghost"
              onClick={() => {
                void window.shell?.extensionsInstallRespond?.(extInstallAsk.askId, false);
                setExtInstallAsk(null);
              }}
            >
              Anuluj
            </button>
          </div>
        </div>
      )}
      {permAsk && (
        <div className="perm-bar" role="alertdialog">
          <span>
            <strong>{permAsk.origin.replace(/^https:\/\//, '')}</strong> chce użyć:{' '}
            {permAsk.permission === 'microphone'
              ? 'mikrofonu'
              : permAsk.permission === 'camera'
                ? 'kamery'
                : permAsk.permission === 'geolocation'
                  ? 'lokalizacji'
                  : permAsk.permission === 'notifications'
                    ? 'powiadomień'
                    : permAsk.permission === 'display-capture'
                      ? 'ekranu'
                      : permAsk.permission === 'webauthn'
                        ? 'klucza / passkey'
                        : permAsk.permission}
          </span>
          <label className="perm-remember">
            <Switch on={permRemember} onChange={setPermRemember} aria-label="Zapamiętaj" />
            Zapamiętaj
          </label>
          <div className="pw-save-actions">
            <button
              type="button"
              className="sbtn"
              onClick={() => {
                void window.shell?.permissionsRespond?.(
                  permAsk.askId,
                  true,
                  permRemember,
                  permAsk.origin,
                  permAsk.permission,
                );
                setPermAsk(null);
              }}
            >
              Zezwól
            </button>
            <button
              type="button"
              className="sbtn ghost"
              onClick={() => {
                void window.shell?.permissionsRespond?.(
                  permAsk.askId,
                  false,
                  permRemember,
                  permAsk.origin,
                  permAsk.permission,
                );
                setPermAsk(null);
              }}
            >
              Zablokuj
            </button>
          </div>
        </div>
      )}
      {saveOffer && passwordsOfferSave && !activeIsTor && (
        <div className="pw-save-bar" role="status">
          <KeyRound size={14} strokeWidth={1.75} />
          <span>
            {saveOffer.mode === 'update' ? 'Zaktualizować' : 'Zapisać'} hasło dla{' '}
            <strong>{saveOffer.origin.replace(/^https:\/\//, '')}</strong>
            {saveOffer.username ? ` (${saveOffer.username})` : ''}?
          </span>
          <div className="pw-save-actions">
            <button
              type="button"
              className="sbtn"
              onClick={() => {
                void window.shell?.passwordsConfirmSave?.().then(() => {
                  setSaveOffer(null);
                  setPwForPage((n) => n + (saveOffer.mode === 'create' ? 1 : 0));
                });
              }}
            >
              Zapisz
            </button>
            <button
              type="button"
              className="sbtn ghost"
              onClick={() => {
                void window.shell?.passwordsDismissSave?.();
                setSaveOffer(null);
              }}
            >
              Nie teraz
            </button>
            <button
              type="button"
              className="sbtn danger-text"
              onClick={() => {
                void window.shell?.passwordsNeverAdd?.(saveOffer.origin);
                void window.shell?.passwordsDismissSave?.();
                setSaveOffer(null);
              }}
            >
              Nigdy dla tej strony
            </button>
          </div>
        </div>
      )}
    </>
  );
}
