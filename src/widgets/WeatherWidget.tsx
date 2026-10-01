import { useEffect, useState } from 'react';
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  RefreshCw,
  Sun,
} from 'lucide-react';
import { useStore, type HomeWidget } from '../store';
import { WidgetEmpty } from './WidgetFrame';

const WMO: Record<number, string> = {
  0: 'Bezchmurnie',
  1: 'Prawie bezchmurnie',
  2: 'Częściowe zachmurzenie',
  3: 'Pochmurnie',
  45: 'Mgła',
  48: 'Mgła szronowa',
  51: 'Mżawka',
  61: 'Deszcz',
  63: 'Deszcz',
  65: 'Ulewny deszcz',
  71: 'Śnieg',
  73: 'Śnieg',
  75: 'Intensywny śnieg',
  80: 'Przelotny deszcz',
  95: 'Burza',
};

function weatherIcon(code: number) {
  if (code === 0 || code === 1) return Sun;
  if (code === 2) return CloudSun;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 71 && code < 80) return CloudSnow;
  if (code >= 95) return CloudLightning;
  if (code >= 51) return CloudRain;
  return CloudSun;
}

type Place = {
  name: string;
  country: string;
  admin1: string;
  lat: number;
  lon: number;
  label: string;
};
type WeatherData = Awaited<ReturnType<NonNullable<Window['shell']>['weatherFetch']>>;

export const WEATHER_DEMO: WeatherData = {
  ok: true,
  place: { name: 'Warszawa', country: 'Polska', admin1: 'Mazowieckie', lat: 52.23, lon: 21.01 },
  current: { temperature_2m: 18, weather_code: 2, wind_speed_10m: 12, relative_humidity_2m: 55 },
  daily: {
    time: ['2026-03-30', '2026-03-31', '2026-04-01'],
    temperature_2m_max: [20, 17, 15],
    temperature_2m_min: [11, 9, 8],
    weather_code: [2, 3, 61],
  },
  hourly: {
    time: Array.from({ length: 6 }, (_, i) => `2026-03-30T${10 + i}:00`),
    temperature_2m: [16, 17, 18, 18, 17, 16],
    weather_code: [2, 2, 1, 1, 2, 3],
  },
};

export function WeatherWidget({
  widget,
  size,
  onPatchSettings,
  preview,
}: {
  widget: HomeWidget;
  size: 'S' | 'M' | 'L';
  onPatchSettings?: (settings: Record<string, unknown>) => void;
  preview?: boolean;
}) {
  const allowNet = useStore((s) => s.settings.privacyAllowAppNetwork);
  const location = String(widget.settings.location || '');
  const savedLat = typeof widget.settings.lat === 'number' ? widget.settings.lat : undefined;
  const savedLon = typeof widget.settings.lon === 'number' ? widget.settings.lon : undefined;

  const [draft, setDraft] = useState(location);
  const [suggests, setSuggests] = useState<Place[]>([]);
  const [data, setData] = useState<WeatherData | null>(preview ? WEATHER_DEMO : null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchWx = async (opts: { location: string; lat?: number; lon?: number }) => {
    if (preview) return;
    if (!allowNet) {
      setErr('privacy');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await window.shell?.weatherFetch?.(opts);
      if (!res?.ok) {
        setErr(res?.error === 'not_found' ? 'Nie znaleziono lokalizacji' : 'Błąd sieci');
        setData(null);
      } else {
        setData(res);
        onPatchSettings?.({
          location: res.place?.name || opts.location,
          lat: res.place?.lat,
          lon: res.place?.lon,
        });
      }
    } catch {
      setErr('Błąd sieci');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (preview) return;
    if (location.trim()) void fetchWx({ location, lat: savedLat, lon: savedLon });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, allowNet, preview]);

  useEffect(() => {
    if (preview || location) return;
    const q = draft.trim();
    if (q.length < 2 || !allowNet) {
      setSuggests([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void window.shell?.weatherSuggest?.({ q }).then((res) => {
        if (!cancelled && res?.places) setSuggests(res.places);
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [draft, location, allowNet, preview]);

  if (!location && !preview) {
    return null;
  }

  if (!location && preview) {
    return (
      <div className={`hw-weather hw-weather-setup hw-size-${size}`}>
        <div className="hw-weather-setup-inner">
          <MapPin size={28} strokeWidth={1.5} className="hw-weather-pin" />
          <p className="hw-weather-setup-title">Ustaw miasto</p>
          <p className="hw-muted">Ustaw miasto w Personalizacja → Widżety.</p>
        </div>
      </div>
    );
  }

  if (err === 'privacy') {
    return (
      <WidgetEmpty
        icon={MapPin}
        text="Zapytania aplikacji wyłączone — włącz je w Ustawieniach → Prywatność."
      />
    );
  }

  if (loading && !data) {
    return (
      <div className={`hw-weather hw-size-${size}`}>
        <div className="hw-skeleton hw-skel-temp" />
        <div className="hw-skeleton hw-skel-line" />
        <div className="hw-skeleton hw-skel-line short" />
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="hw-empty">
        <CloudSun size={22} strokeWidth={1.5} />
        <p>{err}</p>
        <button
          type="button"
          className="hw-btn"
          onClick={() => void fetchWx({ location, lat: savedLat, lon: savedLon })}
        >
          Ponów
        </button>
      </div>
    );
  }

  const temp = data?.current?.temperature_2m;
  const code = data?.current?.weather_code ?? 0;
  const label = WMO[code] || WMO[Math.floor(code / 10) * 10] || 'Pogoda';
  const Icon = weatherIcon(code);
  const tmax = data?.daily?.temperature_2m_max?.[0];
  const tmin = data?.daily?.temperature_2m_min?.[0];

  return (
    <div className={`hw-weather hw-size-${size}`}>
      <div className="hw-weather-main">
        <Icon size={size === 'S' ? 22 : 28} strokeWidth={1.5} className="hw-weather-ico" />
        <strong className="hw-weather-temp">{temp != null ? `${Math.round(temp)}°` : '—'}</strong>
        <div className="hw-weather-meta">
          <em>{data?.place?.name || location}</em>
          <span>{label}</span>
          {(tmax != null || tmin != null) && (
            <span className="hw-weather-range">
              {tmax != null ? Math.round(tmax) : '—'}° / {tmin != null ? Math.round(tmin) : '—'}°
            </span>
          )}
        </div>
        {!preview && (
          <button
            type="button"
            className="hw-icon-btn"
            title="Zmień miasto"
            onClick={() => {
              onPatchSettings?.({ location: '', lat: undefined, lon: undefined });
              setDraft('');
              setData(null);
            }}
          >
            <RefreshCw size={13} />
          </button>
        )}
      </div>

      {size === 'M' && data?.daily?.time && (
        <ul className="hw-weather-days">
          {data.daily.time.slice(0, 3).map((day, i) => (
            <li key={day}>
              <span>{new Date(day).toLocaleDateString('pl-PL', { weekday: 'short' })}</span>
              <strong>
                {Math.round(data.daily!.temperature_2m_max?.[i] ?? 0)}°/
                {Math.round(data.daily!.temperature_2m_min?.[i] ?? 0)}°
              </strong>
            </li>
          ))}
        </ul>
      )}

      {size === 'L' && (
        <>
          {data?.hourly?.time && (
            <ul className="hw-weather-hours">
              {data.hourly.time.slice(0, 6).map((t, i) => (
                <li key={t}>
                  <span>
                    {new Date(t).toLocaleTimeString('pl-PL', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <strong>{Math.round(data.hourly!.temperature_2m?.[i] ?? 0)}°</strong>
                </li>
              ))}
            </ul>
          )}
          {data?.daily?.time && (
            <ul className="hw-weather-days">
              {data.daily.time.slice(0, 5).map((day, i) => (
                <li key={day}>
                  <span>{new Date(day).toLocaleDateString('pl-PL', { weekday: 'short' })}</span>
                  <strong>
                    {Math.round(data.daily!.temperature_2m_max?.[i] ?? 0)}°/
                    {Math.round(data.daily!.temperature_2m_min?.[i] ?? 0)}°
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {err && data && <p className="hw-muted">{err}</p>}
    </div>
  );
}
