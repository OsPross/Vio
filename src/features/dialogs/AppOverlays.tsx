import {
  Suspense,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { KeyRound, Puzzle, TriangleAlert } from 'lucide-react';
import { FindBar } from '../../components/FindBar';
import { Switch } from '../../components/ui/Switch';
import type { CertWarn, ExtInstallAsk, HttpsWarn, PermAsk } from '../../hooks/useIpcEvents';
import { useT } from '../../i18n';
import type { SaveOffer } from '../tabs';
import { AboutDialog, ClearDataDialog, QrShareDialog } from './lazy';

function permissionLabel(
  permission: string,
  t: ReturnType<typeof useT>,
): string {
  switch (permission) {
    case 'microphone':
      return t('dialogs.permissionMicrophone');
    case 'camera':
      return t('dialogs.permissionCamera');
    case 'geolocation':
      return t('dialogs.permissionGeolocation');
    case 'notifications':
      return t('dialogs.permissionNotifications');
    case 'display-capture':
      return t('dialogs.permissionDisplayCapture');
    case 'webauthn':
      return t('dialogs.permissionWebauthn');
    default:
      return permission;
  }
}

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
  const t = useT();
  const certHost = certWarn?.host || t('chrome.thisDomain');
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
      {fsToast && htmlFullscreen && (
        <div className="html-fs-toast">{t('chrome.escToExit')}</div>
      )}
      {certWarn && (
        <div className="cert-warn-overlay" role="alertdialog">
          <div className="cert-warn-card">
            <TriangleAlert size={28} strokeWidth={1.6} />
            <h2>{t('chrome.certWarnTitle')}</h2>
            <p>
              {t('chrome.certWarnBody', {
                error: certWarn.error || t('chrome.certErrorFallback'),
              })}
              {certWarn.tor ? t('chrome.certWarnTor') : ''}
            </p>
            {certWarn.issuer ? (
              <p className="muted">{t('chrome.certWarnIssuer', { issuer: certWarn.issuer })}</p>
            ) : null}
            <code className="cert-warn-url">{certWarn.url}</code>
            {!certWarn.tor ? (
              <label className="perm-remember">
                <Switch
                  on={certRemember}
                  onChange={setCertRemember}
                  aria-label={t('chrome.certWarnRememberAria', { host: certHost })}
                />
                {t('chrome.certWarnRemember', { host: certHost })}
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
                {t('common.cancel')}
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
                {t('chrome.certWarnProceed')}
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
  const t = useT();
  if (!crashOffer) return null;
  return (
    <div className="session-crash-banner" role="alertdialog">
      <div className="session-crash-text">
        <strong>{t('dialogs.crashRestoreClosed')}</strong>
        <span> {t('dialogs.crashRestoreQuestion')}</span>
      </div>
      <div className="session-crash-actions">
        <button type="button" className="sbtn" onClick={onAccept}>
          {t('dialogs.crashRestoreYes')}
        </button>
        <button type="button" className="sbtn danger-text" onClick={onDecline}>
          {t('dialogs.crashRestoreNo')}
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
  const t = useT();
  if (!httpsWarn) return null;
  return (
    <div className="https-warn-overlay" role="alertdialog" aria-label={t('dialogs.httpsWarnAria')}>
      <div className="https-warn-card">
        <TriangleAlert size={28} strokeWidth={1.6} />
        <h2>{t('dialogs.httpsWarnTitle')}</h2>
        <p>{t('dialogs.httpsWarnDesc')}</p>
        <code className="https-warn-url">{httpsWarn.httpUrl}</code>
        <div className="https-warn-actions">
          <button type="button" className="sbtn ghost" onClick={() => setHttpsWarn(null)}>
            {t('common.cancel')}
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
            {t('dialogs.httpsWarnProceed')}
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
  const t = useT();
  return (
    <>
      {extInstallAsk && (
        <div className="perm-bar ext-install-bar" role="alertdialog">
          <Puzzle size={16} strokeWidth={1.75} aria-hidden />
          <span>
            {t('dialogs.extInstallInVio')} <strong>Vio</strong>?
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
              {t('dialogs.extInstallConfirm')}
            </button>
            <button
              type="button"
              className="sbtn ghost"
              onClick={() => {
                void window.shell?.extensionsInstallRespond?.(extInstallAsk.askId, false);
                setExtInstallAsk(null);
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
      {permAsk && (
        <div className="perm-bar" role="alertdialog">
          <span>
            <strong>{permAsk.origin.replace(/^https:\/\//, '')}</strong> {t('dialogs.permissionWants')}{' '}
            {permissionLabel(permAsk.permission, t)}
          </span>
          <label className="perm-remember">
            <Switch
              on={permRemember}
              onChange={setPermRemember}
              aria-label={t('dialogs.permissionRemember')}
            />
            {t('dialogs.permissionRemember')}
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
              {t('dialogs.permissionAllow')}
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
              {t('dialogs.permissionBlock')}
            </button>
          </div>
        </div>
      )}
      {saveOffer && passwordsOfferSave && !activeIsTor && (
        <div className="pw-save-bar" role="status">
          <KeyRound size={14} strokeWidth={1.75} />
          <span>
            {t('dialogs.savePasswordFor', {
              action:
                saveOffer.mode === 'update'
                  ? t('dialogs.savePasswordUpdate')
                  : t('dialogs.savePasswordCreate'),
              origin: saveOffer.origin.replace(/^https:\/\//, ''),
              user: saveOffer.username ? ` (${saveOffer.username})` : '',
            })}
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
              {t('dialogs.savePasswordSave')}
            </button>
            <button
              type="button"
              className="sbtn ghost"
              onClick={() => {
                void window.shell?.passwordsDismissSave?.();
                setSaveOffer(null);
              }}
            >
              {t('dialogs.savePasswordNotNow')}
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
              {t('dialogs.savePasswordNever')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
