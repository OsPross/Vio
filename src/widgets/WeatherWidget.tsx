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
import { useT, useUiLocale } from '../i18n';
import { t as tCore } from '../i18n/core';
import { WidgetEmpty } from './WidgetFrame';

const WMO_KEYS: Record<number, string> = {
  0: 'widgets.ui.weather.clear',
  1: 'widgets.ui.weather.mostlyClear',
  2: 'widgets.ui.weather.partlyCloudy',
  3: 'widgets.ui.weather.overcast',
  45: 'widgets.ui.weather.fog',
  48: 'widgets.ui.weather.rimeFog',
  51: 'widgets.ui.weather.drizzle',
  61: 'widgets.ui.weather.rain',
  63: 'widgets.ui.weather.rain',
  65: 'widgets.ui.weather.heavyRain',
  71: 'widgets.ui.weather.snow',
  73: 'widgets.ui.weather.snow',
  75: 'widgets.ui.weather.heavySnow',
  80: 'widgets.ui.weather.showers',
  95: 'widgets.ui.weather.thunderstorm',
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

type WeatherData = Awaited<ReturnType<NonNullable<Window['shell']>['weatherFetch']>>;

export const WEATHER_DEMO: WeatherData = {
  ok: true,
  place: {
    name: tCore('widgets.ui.weather.demoCity'),
    country: tCore('widgets.ui.weather.demoCountry'),
    admin1: tCore('widgets.ui.weather.demoAdmin'),
    lat: 52.23,
    lon: 21.01,
  },
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
  const t = useT();
  const locale = useUiLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'pl-PL';
  const allowNet = useStore((s) => s.settings.privacyAllowAppNetwork);
  const location = String(widget.settings.location || '');
  const savedLat = typeof widget.settings.lat === 'number' ? widget.settings.lat : undefined;
  const savedLon = typeof widget.settings.lon === 'number' ? widget.settings.lon : undefined;

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
        setErr(
          res?.error === 'not_found'
            ? t('widgets.ui.weather.notFound')
            : t('widgets.ui.weather.networkError'),
        );
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
      setErr(t('widgets.ui.weather.networkError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (preview) return;
    if (location.trim()) void fetchWx({ location, lat: savedLat, lon: savedLon });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, allowNet, preview]);

  if (!location.trim()) {
    return (
      <div className={`hw-weather hw-weather-setup hw-size-${size}`}>
        <div className="hw-weather-setup-inner">
          <MapPin size={28} strokeWidth={1.5} className="hw-weather-pin" />
          <p className="hw-weather-setup-title">{t('widgets.ui.weather.setCity')}</p>
          <p className="hw-muted">
            {preview
              ? t('widgets.ui.weather.setCityHint')
              : t('widgets.ui.weather.setCityHintLive')}
          </p>
        </div>
      </div>
    );
  }

  if (err === 'privacy') {
    return <WidgetEmpty icon={MapPin} text={t('widgets.ui.weather.privacyOff')} />;
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
          {t('widgets.ui.retry')}
        </button>
      </div>
    );
  }

  const temp = data?.current?.temperature_2m;
  const code = data?.current?.weather_code ?? 0;
  const wmoKey = WMO_KEYS[code] || WMO_KEYS[Math.floor(code / 10) * 10];
  const label = wmoKey ? t(wmoKey) : t('widgets.ui.weather.fallback');
  const Icon = weatherIcon(code);
  const tmax = data?.daily?.temperature_2m_max?.[0];
  const tmin = data?.daily?.temperature_2m_min?.[0];

  const hour = new Date().getHours();
  const dayPart = hour < 6 || hour >= 20 ? 'night' : hour < 11 ? 'morning' : hour < 17 ? 'day' : 'eve';

  return (
    <div className={`hw-weather hw-weather-ios hw-size-${size} hw-weather-${dayPart}`}>
      <div className="hw-weather-main">
        <div className="hw-weather-place">
          <em>{data?.place?.name || location}</em>
          {!preview && (
            <button
              type="button"
              className="hw-icon-btn"
              title={t('widgets.ui.weather.changeCity')}
              onClick={() => {
                onPatchSettings?.({ location: '', lat: undefined, lon: undefined });
                setData(null);
              }}
            >
              <RefreshCw size={12} />
            </button>
          )}
        </div>
        <strong className="hw-weather-temp">{temp != null ? `${Math.round(temp)}°` : '—'}</strong>
        <div className="hw-weather-cond">
          <Icon size={16} strokeWidth={1.6} className="hw-weather-ico" aria-hidden />
          <span>{label}</span>
        </div>
        {(tmax != null || tmin != null) && (
          <span className="hw-weather-range">
            H:{tmax != null ? Math.round(tmax) : '—'}° · L:{tmin != null ? Math.round(tmin) : '—'}°
          </span>
        )}
      </div>

      {size === 'M' && data?.daily?.time && (
        <ul className="hw-weather-days">
          {data.daily.time.slice(0, 3).map((day, i) => (
            <li key={day}>
              <span>{new Date(day).toLocaleDateString(dateLocale, { weekday: 'short' })}</span>
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
              {data.hourly.time.slice(0, 6).map((hour, i) => (
                <li key={hour}>
                  <span>
                    {new Date(hour).toLocaleTimeString(dateLocale, {
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
                  <span>{new Date(day).toLocaleDateString(dateLocale, { weekday: 'short' })}</span>
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
