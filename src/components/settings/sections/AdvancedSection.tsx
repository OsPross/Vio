import { useCallback, useEffect, useState } from 'react';
import { Input } from '../../ui/Input';
import { useT } from '../../../i18n';
import { useStore } from '../../../store';
import { FieldRow, Row, SettingsGroup, Toggle } from '../SettingsControls';
import { SoulLog } from './SoulLog';

type DevSyncCommit = { hash: string; author: string; subject: string };
type DevSyncCheck = {
  ok: boolean;
  error?: string;
  dirty?: boolean;
  behind?: number;
  ahead?: number;
  canFastForward?: boolean;
  message?: string;
  commits?: DevSyncCommit[];
};

export function AdvancedSection() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const resetSettings = useStore((s) => s.resetSettings);
  const t = useT();

  const [devSyncOn, setDevSyncOn] = useState(false);
  const [devBusy, setDevBusy] = useState(false);
  const [devMsg, setDevMsg] = useState<string | null>(null);
  const [devCheck, setDevCheck] = useState<DevSyncCheck | null>(null);

  const [updBusy, setUpdBusy] = useState(false);
  const [updMsg, setUpdMsg] = useState<string | null>(null);
  const [updReady, setUpdReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const info = await window.shell?.appInfo?.();
      const av = await window.shell?.devSyncAvailable?.();
      if (cancelled) return;
      setDevSyncOn(Boolean(av?.available) && info?.packaged === false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const off = window.shell?.onUpdateStatus?.((p) => {
      if (p.status === 'downloaded') {
        setUpdReady(true);
        setUpdMsg(t('settings.advanced.updateDownloaded'));
      } else if (p.status === 'available') {
        setUpdMsg(t('settings.advanced.updateAvailable'));
      } else if (p.status === 'not-available') {
        setUpdMsg(t('settings.advanced.updateNotAvailable'));
      } else if (p.status === 'error') {
        setUpdMsg(String(p.error || t('settings.advanced.updateError')));
      }
    });
    return () => off?.();
  }, [t]);

  const onDevCheck = useCallback(async () => {
    setDevBusy(true);
    setDevMsg(null);
    try {
      const r = (await window.shell?.devSyncCheck?.()) as DevSyncCheck;
      setDevCheck(r || null);
      setDevMsg(r?.error || r?.message || null);
    } finally {
      setDevBusy(false);
    }
  }, []);

  const onDevApply = useCallback(async () => {
    if (!devCheck?.canFastForward) return;
    const n = devCheck.behind || 0;
    const authorsList = [...new Set((devCheck.commits || []).map((c) => c.author))].join(', ');
    const authors = authorsList ? t('settings.advanced.devPullAuthors', { authors: authorsList }) : '';
    const ok = confirm(t('settings.advanced.devPullConfirm', { n, authors }));
    if (!ok) return;
    setDevBusy(true);
    setDevMsg(null);
    try {
      const r = await window.shell?.devSyncApply?.();
      setDevMsg(r?.error || r?.message || null);
      if (!r?.ok) setDevBusy(false);
    } catch (err) {
      setDevMsg(String((err as Error)?.message || err));
      setDevBusy(false);
    }
  }, [devCheck, t]);

  const onUpdateCheck = useCallback(async () => {
    setUpdBusy(true);
    setUpdMsg(null);
    try {
      const r = await window.shell?.updateCheck?.();
      if (!r?.ok) setUpdMsg(r?.error || t('settings.advanced.updateCheckFail'));
      else if (r.status) setUpdMsg(t('settings.advanced.updateStatus', { status: r.status }));
    } finally {
      setUpdBusy(false);
    }
  }, [t]);

  const onUpdateInstall = useCallback(async () => {
    setUpdBusy(true);
    try {
      const r = await window.shell?.updateInstall?.();
      if (!r?.ok) setUpdMsg(r?.error || t('settings.advanced.updateInstallFail'));
    } finally {
      setUpdBusy(false);
    }
  }, [t]);

  return (
    <div className="settings-stack">
      <SettingsGroup title={t('settings.advanced.status')}>
        <FieldRow label={t('settings.advanced.currentEngine')}>
          <Input readOnly value={settings.searchEngine} />
        </FieldRow>
        <FieldRow label={t('settings.advanced.proxyNormal')}>
          <Input readOnly value={t('settings.advanced.proxyValue')} />
        </FieldRow>
        <p className="snote">{t('settings.advanced.shortcutsNote')}</p>
      </SettingsGroup>
      <SettingsGroup title={t('settings.advanced.devtools')}>
        <Toggle
          label={t('settings.advanced.allowInspect')}
          hint={t('settings.advanced.allowInspectHint')}
          on={settings.allowInspect}
          onChange={(v) => patchSettings({ allowInspect: v })}
        />
      </SettingsGroup>
      <SettingsGroup title={t('settings.advanced.soul')}>
        <Toggle
          label={t('settings.advanced.automationEnabled')}
          hint={t('settings.advanced.automationHint')}
          on={settings.automationEnabled}
          onChange={(v) => patchSettings({ automationEnabled: v })}
        />
        {settings.automationEnabled && <SoulLog />}
      </SettingsGroup>

      {devSyncOn && (
        <SettingsGroup title={t('settings.advanced.devCollab')}>
          <p className="snote">{t('settings.advanced.devCollabNote')}</p>
          <Row label={t('settings.advanced.checkRemote')}>
            <button type="button" className="sbtn" disabled={devBusy} onClick={() => void onDevCheck()}>
              {t('settings.advanced.checkChanges')}
            </button>
          </Row>
          {devCheck?.commits && devCheck.commits.length > 0 && (
            <ul className="snote" style={{ margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
              {devCheck.commits.map((c) => (
                <li key={c.hash}>
                  <code>{c.hash}</code> · {c.author} — {c.subject}
                </li>
              ))}
            </ul>
          )}
          <Row label={t('settings.advanced.downloadChanges')}>
            <button
              type="button"
              className="sbtn"
              disabled={devBusy || !devCheck?.canFastForward}
              onClick={() => void onDevApply()}
            >
              {t('settings.advanced.fetchChanges')}
            </button>
          </Row>
          {devMsg && <p className="snote">{devMsg}</p>}
        </SettingsGroup>
      )}

      <SettingsGroup title={t('settings.advanced.updates')}>
        <p className="snote">{t('settings.advanced.updatesNote')}</p>
        <Row label={t('settings.advanced.checkUpdates')}>
          <button type="button" className="sbtn" disabled={updBusy} onClick={() => void onUpdateCheck()}>
            {t('settings.advanced.checkUpdatesBtn')}
          </button>
        </Row>
        <Row label={t('settings.advanced.installUpdate')}>
          <button
            type="button"
            className="sbtn"
            disabled={updBusy || !updReady}
            onClick={() => void onUpdateInstall()}
          >
            {t('settings.advanced.restartToInstall')}
          </button>
        </Row>
        {updMsg && <p className="snote">{updMsg}</p>}
      </SettingsGroup>

      <SettingsGroup title={t('settings.advanced.reset')}>
        <Row label={t('settings.advanced.resetAllLabel')}>
          <button
            type="button"
            className="sbtn danger-text"
            onClick={() => {
              if (confirm(t('settings.advanced.resetAllConfirm'))) resetSettings();
            }}
          >
            {t('settings.advanced.resetAll')}
          </button>
        </Row>
      </SettingsGroup>
    </div>
  );
}
