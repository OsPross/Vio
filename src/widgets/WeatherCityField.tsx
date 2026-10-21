import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useStore } from '../store';

export type WeatherPlace = {
  name: string;
  country: string;
  admin1: string;
  lat: number;
  lon: number;
  label: string;
};

export function WeatherCityField({
  location,
  onChange,
  autoFocus,
}: {
  location: string;
  onChange: (next: { location: string; lat?: number; lon?: number }) => void;
  autoFocus?: boolean;
}) {
  const t = useT();
  const allowNet = useStore((s) => s.settings.privacyAllowAppNetwork !== false);
  const listId = useId();
  const [q, setQ] = useState(location);
  const [places, setPlaces] = useState<WeatherPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQ(location);
  }, [location]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const runSuggest = (value: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    const trimmed = value.trim();
    if (!trimmed) {
      setPlaces([]);
      setHint(t('widgets.ui.weather.cityDefaultHint'));
      setOpen(false);
      setBusy(false);
      return;
    }
    if (!allowNet) {
      setPlaces([]);
      setHint(t('widgets.ui.weather.cityOffline'));
      setOpen(false);
      return;
    }
    setBusy(true);
    debounce.current = setTimeout(() => {
      void (async () => {
        try {
          const res = await window.shell?.weatherSuggest?.({ q: trimmed });
          if (!res?.ok) {
            setPlaces([]);
            setHint(t('widgets.ui.weather.citySuggestFail'));
            setOpen(false);
            return;
          }
          const list = res.places || [];
          setPlaces(list);
          setHint(list.length ? '' : t('widgets.ui.weather.cityNoResults'));
          setOpen(list.length > 0);
        } catch {
          setPlaces([]);
          setHint(t('widgets.ui.weather.citySuggestFail'));
          setOpen(false);
        } finally {
          setBusy(false);
        }
      })();
    }, 280);
  };

  const commitFreeText = () => {
    const trimmed = q.trim();
    if (trimmed) onChange({ location: trimmed });
    else onChange({ location: '', lat: undefined, lon: undefined });
    if (!trimmed) setHint(t('widgets.ui.weather.cityDefaultHint'));
  };

  return (
    <div className="hw-city-field" ref={wrapRef}>
      <label className="hw-city-label" htmlFor={listId}>
        {t('widgets.ui.weather.cityLabel')}
      </label>
      <input
        id={listId}
        className="ui-input hw-city-input"
        value={q}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${listId}-list`}
        placeholder=""
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          runSuggest(v);
        }}
        onFocus={() => {
          if (!q.trim()) setHint(t('widgets.ui.weather.cityDefaultHint'));
          else runSuggest(q);
        }}
        onBlur={() => {
          window.setTimeout(() => commitFreeText(), 120);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (places[0]) {
              const p = places[0];
              setQ(p.label || p.name);
              onChange({ location: p.name, lat: p.lat, lon: p.lon });
              setOpen(false);
              setPlaces([]);
              setHint('');
            } else {
              commitFreeText();
              setOpen(false);
            }
          }
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {(hint || busy) && (
        <p className="hw-city-hint" role="status">
          {busy ? t('widgets.ui.weather.citySearching') : hint}
        </p>
      )}
      {open && places.length > 0 && (
        <ul id={`${listId}-list`} className="hw-city-suggest" role="listbox">
          {places.map((p) => (
            <li key={`${p.lat},${p.lon},${p.label}`}>
              <button
                type="button"
                role="option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setQ(p.label || p.name);
                  onChange({ location: p.name, lat: p.lat, lon: p.lon });
                  setOpen(false);
                  setPlaces([]);
                  setHint('');
                }}
              >
                <strong>{p.name}</strong>
                <span>
                  {[p.admin1, p.country].filter(Boolean).join(', ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
