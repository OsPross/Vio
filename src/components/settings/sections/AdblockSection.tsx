import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { useStore } from '../../../store';
import { FieldRow, Row, SettingsGroup, Toggle } from '../SettingsControls';

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
        <FieldRow
          label="Poziom"
          desc="Standardowy nie blokuje żądań tej samej domeny (eTLD+1). Ścisły stosuje też jawne filtry first-party z list."
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
        </FieldRow>
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
          label="Filtry kosmetyczne (ukrywaj elementy na stronie)"
          on={settings.adblockCosmetic}
          onChange={(v) => {
            patchSettings({ adblockCosmetic: v });
            pushEngine({ cosmetic: v });
          }}
        />
        <Toggle
          label="Aktualizuj listy filtrów raz dziennie"
          on={settings.adblockUpdateLists}
          onChange={(v) => {
            patchSettings({ adblockUpdateLists: v });
            pushEngine({ updateLists: v });
          }}
        />
      </SettingsGroup>

      <SettingsGroup title="Listy filtrów">
        {lists.length === 0 && (
          <p className="snote">Brak danych o listach — silnik jeszcze się ładuje.</p>
        )}
        {lists.map((l) => (
          <div key={l.id} className="slist-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <Toggle
              label={l.name}
              hint={`Aktualizacja: ${formatUpdated(l.updatedAt)}`}
              on={settings.adblockListsEnabled?.[l.id] !== false}
              onChange={(v) => {
                const listsEnabled = { ...settings.adblockListsEnabled, [l.id]: v };
                patchSettings({ adblockListsEnabled: listsEnabled });
                pushEngine({ listsEnabled, forceLists: true });
              }}
            />
          </div>
        ))}
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
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
          Adblock nie blokuje żądań do tych domen — ochrona prywatności dalej działa.
        </p>
        <p className="muted" style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 600 }}>
          Domyślne (wyłączalne)
        </p>
        <div className="slist">
          {builtins.map((b) => (
            <div key={b.id} className="slist-row">
              <Toggle
                label={b.id}
                hint={b.pathPrefix ? `${b.pattern}${b.pathPrefix}` : b.pattern}
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
            </div>
          ))}
          {!builtins.length && (
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Załaduj silnik, aby zobaczyć listę domyślną.
            </p>
          )}
        </div>

        <p className="muted" style={{ margin: '12px 0 6px', fontSize: 12, fontWeight: 600 }}>
          Twoje wyjątki
        </p>
        <div className="slist">
          {(settings.adblockExceptions || []).map((d) => (
            <div key={d} className="slist-row">
              <span className="grow">{d}</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Usuń"
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
          {!settings.adblockExceptions?.length && (
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Brak własnych wyjątków
            </p>
          )}
        </div>
        <FieldRow label="Dodaj wyjątek" desc="Domena, np. example.com lub *.cdn.example.com">
          <div style={{ display: 'flex', gap: 8, width: '100%' }}>
            <Input
              value={exceptionDraft}
              onChange={(e) => setExceptionDraft(e.target.value)}
              placeholder="example.com"
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
        </FieldRow>

        <p className="muted" style={{ margin: '12px 0 6px', fontSize: 12, fontWeight: 600 }}>
          Wyłączone z tarczy (ochrona per domena)
        </p>
        <div className="slist">
          {(settings.privacySiteExceptions || []).map((d) => (
            <div key={d} className="slist-row">
              <span className="grow">{d}</span>
              <button
                type="button"
                className="icon-btn sm"
                title="Usuń wyjątek tarczy"
                onClick={() => {
                  patchSettings({
                    privacySiteExceptions: settings.privacySiteExceptions.filter((x) => x !== d),
                  });
                  void window.shell?.privacyExceptionRemove?.(d);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {!settings.privacySiteExceptions?.length && (
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Brak — dodawane z popupu tarczy
            </p>
          )}
        </div>
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

      <SettingsGroup title="Własne reguły">
        <FieldRow label="Filtry" desc="Jedna reguła na linię (składnia EasyList)">
          <textarea
            className="stextarea"
            rows={4}
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
          />
        </FieldRow>
      </SettingsGroup>
    </div>
  );
}
