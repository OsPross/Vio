import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
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

/** Human labels + groups for built-in allowlist (id → meta). */
const BUILTIN_META: Record<string, { label: string; group: string }> = {
  'consent.google.com': { label: 'Zgoda cookies (Google)', group: 'Google i YouTube' },
  'consent.youtube.com': { label: 'Zgoda cookies (YouTube)', group: 'Google i YouTube' },
  'accounts.google.com': { label: 'Logowanie Google', group: 'Google i YouTube' },
  'accounts.youtube.com': { label: 'Logowanie YouTube', group: 'Google i YouTube' },
  'myaccount.google.com': { label: 'Konto Google', group: 'Google i YouTube' },
  '*.gstatic.com': { label: 'Zasoby Google (gstatic)', group: 'Google i YouTube' },
  '*.googleapis.com': { label: 'API Google', group: 'Google i YouTube' },
  'login.microsoftonline.com': { label: 'Logowanie Microsoft 365', group: 'Kontrola dostępu' },
  'login.live.com': { label: 'Logowanie Microsoft', group: 'Kontrola dostępu' },
  'appleid.apple.com': { label: 'Apple ID', group: 'Kontrola dostępu' },
  'github.com/login': { label: 'Logowanie GitHub', group: 'Kontrola dostępu' },
  'challenges.cloudflare.com': { label: 'Weryfikacja Cloudflare', group: 'Captcha i boty' },
  'hcaptcha.com': { label: 'hCaptcha', group: 'Captcha i boty' },
  '*.recaptcha.net': { label: 'reCAPTCHA (recaptcha.net)', group: 'Captcha i boty' },
  'google.com/recaptcha': { label: 'reCAPTCHA (Google)', group: 'Captcha i boty' },
  '*.paypal.com': { label: 'PayPal', group: 'Płatności' },
  '*.stripe.com': { label: 'Stripe', group: 'Płatności' },
  '*.przelewy24.pl': { label: 'Przelewy24', group: 'Płatności' },
  '*.payu.com': { label: 'PayU', group: 'Płatności' },
  '*.blik.com': { label: 'BLIK', group: 'Płatności' },
};

const GROUP_ORDER = ['Google i YouTube', 'Kontrola dostępu', 'Captcha i boty', 'Płatności', 'Inne'];

function formatUpdated(at: number | null) {
  if (!at) return 'brak lokalnej kopii';
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
    const map = new Map<string, BuiltinRow[]>();
    for (const b of builtins) {
      const group = BUILTIN_META[b.id]?.group ?? 'Inne';
      const list = map.get(group) ?? [];
      list.push(b);
      map.set(group, list);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      name: g,
      items: map.get(g)!,
    }));
  }, [builtins]);

  const builtinsOn = builtins.filter((b) => b.enabled).length;
  const customCount = settings.adblockExceptions?.length ?? 0;
  const listsOn = lists.filter((l) => settings.adblockListsEnabled?.[l.id] !== false).length;

  return (
    <div className="settings-stack">
      <SettingsGroup title="Blokada reklam">
        <Toggle
          label="Włącz adblock"
          hint="Listy EasyList, EasyPrivacy, uBlock i Peter Lowe"
          on={settings.adblockEnabled}
          onChange={(v) => {
            patchSettings({ adblockEnabled: v });
            pushEngine({ enabled: v });
          }}
        />
        <Row
          label="Poziom"
          desc="Standardowy omija first-party. Ścisły stosuje też jawne filtry tej samej domeny."
        >
          <Select
            aria-label="Poziom adblocka"
            value={settings.adblockLevel || 'standard'}
            onChange={(v) => {
              const level = v as 'standard' | 'strict';
              patchSettings({ adblockLevel: level });
              pushEngine({ level });
            }}
            options={[
              { value: 'standard', label: 'Standardowy' },
              { value: 'strict', label: 'Ścisły' },
            ]}
          />
        </Row>
        <Toggle
          label="Blokuj żądania sieciowe"
          on={settings.adblockNetwork}
          onChange={(v) => {
            patchSettings({ adblockNetwork: v });
            pushEngine({ network: v });
          }}
        />
        <Toggle
          label="Blokuj trackery"
          on={settings.adblockTrackers}
          onChange={(v) => {
            patchSettings({ adblockTrackers: v });
            pushEngine({ trackers: v });
          }}
        />
        <Toggle
          label="Filtry kosmetyczne"
          hint="Ukrywa elementy reklamowe na stronie"
          on={settings.adblockCosmetic}
          onChange={(v) => {
            patchSettings({ adblockCosmetic: v });
            pushEngine({ cosmetic: v });
          }}
        />
        <Toggle
          label="Aktualizuj listy raz dziennie"
          on={settings.adblockUpdateLists}
          onChange={(v) => {
            patchSettings({ adblockUpdateLists: v });
            pushEngine({ updateLists: v });
          }}
        />
      </SettingsGroup>

      <SettingsGroup title="Listy filtrów">
        {lists.length === 0 ? (
          <p className="snote">Brak danych o listach — silnik jeszcze się ładuje.</p>
        ) : (
          <SettingsDisclosure
            title="Aktywne listy"
            summary="Włącz lub wyłącz źródła filtrów"
            badge={`${listsOn}/${lists.length}`}
            defaultOpen={lists.length <= 4}
          >
            <div className="sdense">
              {lists.map((l) => (
                <CompactToggle
                  key={l.id}
                  label={l.name}
                  detail={`Aktualizacja: ${formatUpdated(l.updatedAt)}`}
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
        <Row label="Pobierz listy teraz">
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
            {updating ? 'Aktualizacja…' : 'Aktualizuj'}
          </button>
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Wyjątki">
        <p className="snote">
          Te domeny nie są blokowane przez adblock — logowanie, captcha i płatności działają
          normalnie. Ochrona prywatności (tarcza) działa osobno.
        </p>

        <SettingsDisclosure
          title="Domyślne wyjątki"
          summary="Logowanie, captcha, płatności — możesz wyłączyć pojedynczo"
          badge={builtins.length ? `${builtinsOn}/${builtins.length}` : '…'}
          defaultOpen={false}
        >
          {!builtins.length ? (
            <p className="snote">Załaduj silnik, aby zobaczyć listę domyślną.</p>
          ) : (
            builtinGroups.map((g) => (
              <div key={g.name} className="sdense-group">
                <span className="sdense-group-label">{g.name}</span>
                <div className="sdense">
                  {g.items.map((b) => (
                    <CompactToggle
                      key={b.id}
                      label={BUILTIN_META[b.id]?.label ?? b.id}
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
          title="Twoje wyjątki"
          summary="Domeny, które sam dodałeś"
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
                  title="Usuń"
                  aria-label={`Usuń wyjątek ${d}`}
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
              <p className="snote">Brak własnych wyjątków — dodaj domenę poniżej.</p>
            ) : null}
          </div>
          <div className="sfold-footer">
            <Input
              value={exceptionDraft}
              onChange={(e) => setExceptionDraft(e.target.value)}
              placeholder="example.com lub *.cdn.example.com"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addException();
                }
              }}
            />
            <button type="button" className="sbtn" onClick={addException}>
              Dodaj
            </button>
          </div>
        </SettingsDisclosure>
      </SettingsGroup>

      <SettingsGroup title="Statystyki">
        <Row label="Zablokowane dziś">
          <span className="sr-value">{blockedToday}</span>
        </Row>
        <Row label="Zablokowane łącznie">
          <span className="sr-value">{blockedCount}</span>
        </Row>
        <Row label="Wyczyść statystyki">
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
            Wyczyść
          </button>
        </Row>
      </SettingsGroup>

      <SettingsGroup title="Zaawansowane">
        <SettingsDisclosure
          title="Własne reguły filtrów"
          summary="Składnia EasyList — jedna reguła na linię"
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
