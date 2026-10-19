import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { useT } from '../../../i18n';
import { useStore } from '../../../store';
import {
  CompactToggle,
  Row,
  SettingsDisclosure,
  SettingsGroup,
  Toggle,
} from '../SettingsControls';

type ListRow = {
  id: string;
  name: string;
  enabled: boolean;
  updatedAt: number | null;
};

type BuiltinRow = {
  id: string;
  pattern: string;
  pathPrefix: string | null;
  enabled: boolean;
};

type BuiltinGroupId = 'google' | 'access' | 'captcha' | 'payments' | 'other';

/** Built-in allowlist meta: i18n label key (or brand string) + stable group id. */
const BUILTIN_META: Record<string, { labelKey?: string; brand?: string; group: BuiltinGroupId }> = {
  'consent.google.com': { labelKey: 'settings.adblock.bConsentGoogle', group: 'google' },
  'consent.youtube.com': { labelKey: 'settings.adblock.bConsentYoutube', group: 'google' },
  'accounts.google.com': { labelKey: 'settings.adblock.bLoginGoogle', group: 'google' },
  'accounts.youtube.com': { labelKey: 'settings.adblock.bLoginYoutube', group: 'google' },
  'myaccount.google.com': { labelKey: 'settings.adblock.bAccountGoogle', group: 'google' },
  '*.gstatic.com': { labelKey: 'settings.adblock.bGstatic', group: 'google' },
  '*.googleapis.com': { labelKey: 'settings.adblock.bGoogleApis', group: 'google' },
  'login.microsoftonline.com': { labelKey: 'settings.adblock.bLoginMs365', group: 'access' },
  'login.live.com': { labelKey: 'settings.adblock.bLoginMicrosoft', group: 'access' },
  'appleid.apple.com': { brand: 'Apple ID', group: 'access' },
  'github.com/login': { labelKey: 'settings.adblock.bLoginGithub', group: 'access' },
  'challenges.cloudflare.com': { labelKey: 'settings.adblock.bCloudflare', group: 'captcha' },
  'hcaptcha.com': { brand: 'hCaptcha', group: 'captcha' },
  '*.recaptcha.net': { brand: 'reCAPTCHA (recaptcha.net)', group: 'captcha' },
  'google.com/recaptcha': { brand: 'reCAPTCHA (Google)', group: 'captcha' },
  '*.paypal.com': { brand: 'PayPal', group: 'payments' },
  '*.stripe.com': { brand: 'Stripe', group: 'payments' },
  '*.przelewy24.pl': { brand: 'Przelewy24', group: 'payments' },
  '*.payu.com': { brand: 'PayU', group: 'payments' },
  '*.blik.com': { brand: 'BLIK', group: 'payments' },
};

const GROUP_ORDER: BuiltinGroupId[] = ['google', 'access', 'captcha', 'payments', 'other'];

const GROUP_KEYS: Record<BuiltinGroupId, string> = {
  google: 'settings.adblock.groupGoogle',
  access: 'settings.adblock.groupAccess',
  captcha: 'settings.adblock.groupCaptcha',
  payments: 'settings.adblock.groupPayments',
  other: 'settings.adblock.groupOther',
};

function formatUpdated(at: number | null, noLocal: string) {
  if (!at) return noLocal;
  try {
    return new Date(at).toLocaleString('pl-PL', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

function builtinDetail(b: BuiltinRow): string {
  return b.pathPrefix ? `${b.pattern}${b.pathPrefix}` : b.pattern;
}

export function AdblockSection() {
  const settings = useStore((s) => s.settings);
  const patchSettings = useStore((s) => s.patchSettings);
  const t = useT();

  const [lists, setLists] = useState<ListRow[]>([]);
  const [builtins, setBuiltins] = useState<BuiltinRow[]>([]);
  const [blockedToday, setBlockedToday] = useState(0);
  const [blockedCount, setBlockedCount] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [exceptionDraft, setExceptionDraft] = useState('');

  const refreshStatus = useCallback(() => {
    void window.shell?.adblockStatus?.().then((st) => {
      if (!st) return;
      if (typeof st.blockedToday === 'number') setBlockedToday(st.blockedToday);
      if (typeof st.blockedCount === 'number') setBlockedCount(st.blockedCount);
      if (Array.isArray(st.lists)) setLists(st.lists as ListRow[]);
    });
    void window.shell?.adblockConfig?.().then((st) => {
      if (!st) return;
      if (Array.isArray(st.lists)) setLists(st.lists as ListRow[]);
      if (Array.isArray(st.builtinExceptions)) setBuiltins(st.builtinExceptions as BuiltinRow[]);
      if (typeof st.blockedToday === 'number') setBlockedToday(st.blockedToday);
      if (typeof st.blockedCount === 'number') setBlockedCount(st.blockedCount);
    });
  }, []);

  useEffect(() => {
    refreshStatus();
    const t = window.setInterval(refreshStatus, 5000);
    return () => window.clearInterval(t);
  }, [refreshStatus]);

  const pushEngine = (patch: Record<string, unknown>) => {
    const rules = (patch.customRules as string[] | undefined) ??
      settings.adblockCustomRules
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
    void window.shell
      ?.adblockConfig?.({
        enabled: settings.adblockEnabled,
        network: settings.adblockNetwork,
        cosmetic: settings.adblockCosmetic,
        trackers: settings.adblockTrackers,
        level: settings.adblockLevel,
        exceptions: settings.adblockExceptions,
        builtinDisabled: settings.adblockBuiltinDisabled,
        listsEnabled: settings.adblockListsEnabled,
        customRules: rules,
        ...patch,
      })
      .then(() => refreshStatus());
  };

  const addException = () => {
    const host = exceptionDraft.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!host) return;
    if (settings.adblockExceptions.includes(host)) {
      setExceptionDraft('');
      return;
    }
    const next = [...settings.adblockExceptions, host];
    patchSettings({ adblockExceptions: next });
    pushEngine({ exceptions: next });
    setExceptionDraft('');
  };

  const builtinGroups = useMemo(() => {
    const map = new Map<BuiltinGroupId, BuiltinRow[]>();
    for (const b of builtins) {
      const group = BUILTIN_META[b.id]?.group ?? 'other';
      const list = map.get(group) ?? [];
      list.push(b);
      map.set(group, list);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      id: g,
      name: t(GROUP_KEYS[g]),
      items: map.get(g)!,
    }));
  }, [builtins, t]);

  const builtinsOn = builtins.filter((b) => b.enabled).length;
  const customCount = settings.adblockExceptions?.length ?? 0;
  const listsOn = lists.filter((l) => settings.adblockListsEnabled?.[l.id] !== false).length;

  return (
    <div className="settings-stack">
      <SettingsGroup title={t('settings.adblock.blocking')}>
        <Toggle
          label={t('settings.adblock.enable')}
          hint={t('settings.adblock.enableHint')}
          on={settings.adblockEnabled}
          onChange={(v) => {
            patchSettings({ adblockEnabled: v });
            pushEngine({ enabled: v });
          }}
        />
        <Row label={t('settings.adblock.level')} desc={t('settings.adblock.levelDesc')}>
          <Select
            aria-label={t('settings.adblock.level')}
            value={settings.adblockLevel || 'standard'}
            onChange={(v) => {
              const level = v as 'standard' | 'strict';
              patchSettings({ adblockLevel: level });
              pushEngine({ level });
            }}
            options={[
              { value: 'standard', label: t('settings.adblock.levelStandard') },
              { value: 'strict', label: t('settings.adblock.levelStrict') },
            ]}
          />
        </Row>
        <Toggle
          label={t('settings.adblock.networkBlock')}
          on={settings.adblockNetwork}
          onChange={(v) => {
            patchSettings({ adblockNetwork: v });
            pushEngine({ network: v });
          }}
        />
        <Toggle
          label={t('settings.adblock.trackers')}
          on={settings.adblockTrackers}
          onChange={(v) => {
            patchSettings({ adblockTrackers: v });
            pushEngine({ trackers: v });
          }}
        />
        <Toggle
          label={t('settings.adblock.cosmetic')}
          hint={t('settings.adblock.cosmeticHint')}
          on={settings.adblockCosmetic}
          onChange={(v) => {
            patchSettings({ adblockCosmetic: v });
            pushEngine({ cosmetic: v });
          }}
        />
        <Toggle
          label={t('settings.adblock.updateDaily')}
          on={settings.adblockUpdateLists}
          onChange={(v) => {
            patchSettings({ adblockUpdateLists: v });
            pushEngine({ updateLists: v });
          }}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.adblock.lists')}>
        {lists.length === 0 ? (
          <p className="snote">{t('settings.adblock.listsLoading')}</p>
        ) : (
          <SettingsDisclosure
            title={t('settings.adblock.activeLists')}
            summary={t('settings.adblock.activeListsSummary')}
            badge={`${listsOn}/${lists.length}`}
            defaultOpen={lists.length <= 4}
          >
            <div className="sdense">
              {lists.map((l) => (
                <CompactToggle
                  key={l.id}
                  label={l.name}
                  detail={t('settings.adblock.listUpdated', {
                    date: formatUpdated(l.updatedAt, t('settings.adblock.noLocalCopy')),
                  })}
                  on={settings.adblockListsEnabled?.[l.id] !== false}
                  onChange={(v) => {
                    const listsEnabled = { ...settings.adblockListsEnabled, [l.id]: v };
                    patchSettings({ adblockListsEnabled: listsEnabled });
                    pushEngine({ listsEnabled, forceLists: true });
                  }}
                />
              ))}
            </div>
          </SettingsDisclosure>
        )}
        <Row label={t('settings.adblock.fetchListsNow')}>
          <button
            type="button"
            className="sbtn"
            disabled={updating}
            onClick={() => {
              setUpdating(true);
              void window.shell
                ?.adblockUpdateLists?.()
                .then(() => refreshStatus())
                .finally(() => setUpdating(false));
            }}
          >
            {updating ? t('settings.adblock.updating') : t('settings.adblock.update')}
          </button>
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('settings.adblock.exceptions')}>
        <p className="snote">{t('settings.adblock.exceptionsHelp')}</p>

        <SettingsDisclosure
          title={t('settings.adblock.defaultExceptions')}
          summary={t('settings.adblock.defaultExceptionsSummary')}
          badge={builtins.length ? `${builtinsOn}/${builtins.length}` : '…'}
          defaultOpen={false}
        >
          {!builtins.length ? (
            <p className="snote">{t('settings.adblock.builtinsLoading')}</p>
          ) : (
            builtinGroups.map((g) => (
              <div key={g.id} className="sdense-group">
                <span className="sdense-group-label">{g.name}</span>
                <div className="sdense">
                  {g.items.map((b) => (
                    <CompactToggle
                      key={b.id}
                      label={
                        BUILTIN_META[b.id]?.labelKey
                          ? t(BUILTIN_META[b.id]!.labelKey!)
                          : (BUILTIN_META[b.id]?.brand ?? b.id)
                      }
                      detail={builtinDetail(b)}
                      on={b.enabled}
                      onChange={(v) => {
                        const disabled = new Set(settings.adblockBuiltinDisabled || []);
                        if (v) disabled.delete(b.id);
                        else disabled.add(b.id);
                        const builtinDisabled = [...disabled];
                        patchSettings({ adblockBuiltinDisabled: builtinDisabled });
                        pushEngine({ builtinDisabled });
                      }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </SettingsDisclosure>

        <SettingsDisclosure
          title={t('settings.adblock.yourExceptions')}
          summary={t('settings.adblock.yourExceptionsSummary')}
          badge={customCount}
          defaultOpen={customCount > 0 && customCount <= 8}
        >
          <div className="sdense">
            {(settings.adblockExceptions || []).map((d) => (
              <div key={d} className="sdense-row">
                <span className="sdense-label mono truncate grow">{d}</span>
                <button
                  type="button"
                  className="icon-btn sm"
                  title={t('common.remove')}
                  aria-label={t('settings.privacy.removeExceptionAria', { domain: d })}
                  onClick={() => {
                    const next = settings.adblockExceptions.filter((x) => x !== d);
                    patchSettings({ adblockExceptions: next });
                    pushEngine({ exceptions: next });
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {!customCount ? (
              <p className="snote">{t('settings.adblock.noCustomExceptions')}</p>
            ) : null}
          </div>
          <div className="sfold-footer">
            <Input
              value={exceptionDraft}
              onChange={(e) => setExceptionDraft(e.target.value)}
              placeholder={t('settings.adblock.exceptionPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addException();
                }
              }}
            />
            <button type="button" className="sbtn" onClick={addException}>
              {t('common.add')}
            </button>
          </div>
        </SettingsDisclosure>
      </SettingsGroup>

      <SettingsGroup title={t('settings.adblock.stats')}>
        <Row label={t('settings.adblock.blockedToday')}>
          <span className="sr-value">{blockedToday}</span>
        </Row>
        <Row label={t('settings.adblock.blockedTotal')}>
          <span className="sr-value">{blockedCount}</span>
        </Row>
        <Row label={t('settings.adblock.clearStats')}>
          <button
            type="button"
            className="sbtn danger-text"
            onClick={() => {
              void window.shell?.adblockClearStats?.().then((st) => {
                if (st) {
                  setBlockedToday(st.blockedToday ?? 0);
                  setBlockedCount(st.blockedCount ?? 0);
                }
                refreshStatus();
              });
            }}
          >
            {t('common.clear')}
          </button>
        </Row>
      </SettingsGroup>

      <SettingsGroup title={t('settings.adblock.advanced')}>
        <SettingsDisclosure
          title={t('settings.adblock.customRules')}
          summary={t('settings.adblock.customRulesSummary')}
          defaultOpen={Boolean(settings.adblockCustomRules?.trim())}
        >
          <div className="sfold-pad">
            <textarea
              className="stextarea"
              rows={5}
              value={settings.adblockCustomRules}
              onChange={(e) => {
                const value = e.target.value;
                patchSettings({ adblockCustomRules: value });
                const rules = value
                  .split(/\r?\n/)
                  .map((l) => l.trim())
                  .filter(Boolean);
                pushEngine({ customRules: rules });
              }}
              spellCheck={false}
              placeholder={'||ads.example.com^\n##.ad-banner'}
            />
          </div>
        </SettingsDisclosure>
      </SettingsGroup>
    </div>
  );
}
