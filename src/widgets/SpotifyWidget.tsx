import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RE,
} from 'react';
import {
  Copy,
  ExternalLink,
  LogOut,
  Pause,
  Play,
  Repeat,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';
import type { HomeWidget, HomeWidgetSize } from '../store';
import { SpotifyGlyph } from './SpotifyGlyph';

type Playback = Awaited<ReturnType<NonNullable<Window['shell']>['spotifyPlayback']>>;

function fmtMs(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

const PREVIEW_PLAYBACK: Playback = {
  ok: true,
  playing: true,
  progressMs: 72_000,
  durationMs: 210_000,
  shuffle: true,
  repeat: 'off',
  device: { name: 'Vio', volume: 65, supportsVolume: true },
  item: {
    id: 'preview',
    uri: 'spotify:track:preview',
    name: 'Blinding Lights',
    artists: ['The Weeknd'],
    album: 'After Hours',
    art: null,
    url: 'https://open.spotify.com',
    type: 'track',
  },
  fetchedAt: Date.now(),
};

export function SpotifyWidget({
  size,
  preview,
  onGo,
}: {
  widget: HomeWidget;
  size: HomeWidgetSize;
  preview?: boolean;
  onPatchSettings?: (settings: Record<string, unknown>) => void;
  onGo?: (url: string) => void;
}) {
  const [status, setStatus] = useState<{
    connected: boolean;
    configured: boolean;
    needsAuthorSetup?: boolean;
    displayName?: string | null;
    redirectUri: string;
  } | null>(preview ? { connected: true, configured: true, displayName: 'Ty', redirectUri: '' } : null);
  const [clientIdDraft, setClientIdDraft] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [playback, setPlayback] = useState<Playback | null>(preview ? PREVIEW_PLAYBACK : null);
  const [progress, setProgress] = useState(preview ? 72_000 : 0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [scrubbing, setScrubbing] = useState(false);
  const baseRef = useRef({ progressMs: 0, fetchedAt: 0, playing: false, durationMs: 0 });
  const barRef = useRef<HTMLDivElement>(null);

  const refreshStatus = useCallback(async () => {
    if (preview) return;
    if (!window.shell?.spotifyStatus) {
      setStatus({
        connected: false,
        configured: true,
        redirectUri: 'http://127.0.0.1:47831/callback',
      });
      setMsg('Zrestartuj Vio — brak API Spotify w tej sesji');
      return;
    }
    try {
      const s = await window.shell.spotifyStatus();
      if (s?.ok) {
        setStatus({
          connected: s.connected,
          configured: s.configured,
          needsAuthorSetup: s.needsAuthorSetup,
          displayName: s.displayName,
          redirectUri: s.redirectUri,
        });
      } else {
        setStatus({
          connected: false,
          configured: true,
          redirectUri: 'http://127.0.0.1:47831/callback',
        });
      }
    } catch {
      setStatus({
        connected: false,
        configured: true,
        redirectUri: 'http://127.0.0.1:47831/callback',
      });
      setMsg('Nie udało się odczytać statusu Spotify');
    }
  }, [preview]);

  const refreshPlayback = useCallback(async () => {
    if (preview) return;
    const p = await window.shell?.spotifyPlayback?.();
    if (!p) return;
    setPlayback(p);
    if (p.ok && !scrubbing) {
      const prog = p.progressMs || 0;
      setProgress(prog);
      baseRef.current = {
        progressMs: prog,
        fetchedAt: p.fetchedAt || Date.now(),
        playing: Boolean(p.playing),
        durationMs: p.durationMs || 0,
      };
    }
    if (p.ok === false && p.error) setMsg(p.error);
  }, [preview, scrubbing]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (preview || !status?.connected) return;
    void refreshPlayback();
    const id = window.setInterval(() => void refreshPlayback(), 2500);
    return () => window.clearInterval(id);
  }, [preview, status?.connected, refreshPlayback]);

  // Smooth local progress between polls
  useEffect(() => {
    if (preview || scrubbing) return;
    const id = window.setInterval(() => {
      const b = baseRef.current;
      if (!b.playing || !b.durationMs) return;
      const elapsed = Date.now() - b.fetchedAt;
      const next = Math.min(b.durationMs, b.progressMs + elapsed);
      setProgress(next);
    }, 200);
    return () => window.clearInterval(id);
  }, [preview, scrubbing, playback?.item?.id, playback?.playing]);

  const run = async (
    fn: () =>
      | Promise<{ ok: boolean; error?: string; premium?: boolean } | undefined>
      | undefined,
  ) => {
    if (preview) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await fn();
      if (r && !r.ok) {
        setMsg(r.premium ? 'Wymaga Spotify Premium do sterowania' : r.error || 'Błąd');
      }
      await refreshPlayback();
    } finally {
      setBusy(false);
    }
  };

  const seekFromClientX = (clientX: number) => {
    const el = barRef.current;
    const dur = playback?.durationMs || baseRef.current.durationMs || 0;
    if (!el || !dur) return 0;
    const rect = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.floor(t * dur);
  };

  const onBarPointerDown = (e: RE<HTMLDivElement>) => {
    if (preview || !playback?.item) return;
    e.preventDefault();
    e.stopPropagation();
    setScrubbing(true);
    const ms = seekFromClientX(e.clientX);
    setProgress(ms);
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
    const onMove = (ev: PointerEvent) => {
      setProgress(seekFromClientX(ev.clientX));
    };
    const onUp = async (ev: PointerEvent) => {
      target.removeEventListener('pointermove', onMove);
      target.removeEventListener('pointerup', onUp);
      target.removeEventListener('pointercancel', onUp);
      const finalMs = seekFromClientX(ev.clientX);
      setProgress(finalMs);
      setScrubbing(false);
      baseRef.current = {
        ...baseRef.current,
        progressMs: finalMs,
        fetchedAt: Date.now(),
      };
      await run(() => window.shell?.spotifySeek?.(finalMs));
    };
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onUp);
  };

  const copyRedirect = async () => {
    const uri = status?.redirectUri || '';
    try {
      await navigator.clipboard.writeText(uri);
      setMsg('Skopiowano Redirect URI');
    } catch {
      setMsg(uri);
    }
  };

  const doLogin = async () => {
    if (!window.shell?.spotifyLogin) {
      setMsg('Zrestartuj Vio (Electron), żeby włączyć logowanie Spotify');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const r = await window.shell.spotifyLogin();
      if (!r?.ok) setMsg(r?.error || 'Nie udało się zalogować');
      else {
        await refreshStatus();
        await refreshPlayback();
      }
    } catch (e) {
      setMsg(String((e as Error)?.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (!preview && status?.needsAuthorSetup && !showAdvanced) {
    return (
      <div className={`hw-spotify hw-spotify-setup hw-size-${size}`}>
        <div className="hw-spotify-setup-inner">
          <SpotifyGlyph size={32} />
          <p className="hw-spotify-setup-title">Spotify</p>
          <p className="hw-muted">Brak Client ID w aplikacji.</p>
          <button type="button" className="hw-btn" onClick={() => setShowAdvanced(true)}>
            Własny Client ID
          </button>
        </div>
      </div>
    );
  }

  if (!preview && showAdvanced && (!status || !status.connected)) {
    return (
      <div className={`hw-spotify hw-spotify-setup hw-size-${size}`}>
        <div className="hw-spotify-setup-inner">
          <p className="hw-spotify-setup-title">Własny Client ID</p>
          <div className="hw-spotify-redirect">
            <code>{status?.redirectUri || 'http://127.0.0.1:47831/callback'}</code>
            <button type="button" className="hw-icon-btn" title="Kopiuj" onClick={() => void copyRedirect()}>
              <Copy size={12} />
            </button>
          </div>
          <input
            className="hw-input hw-spotify-input"
            value={clientIdDraft}
            placeholder="Client ID"
            spellCheck={false}
            onChange={(e) => setClientIdDraft(e.target.value)}
          />
          <button
            type="button"
            className="hw-btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await window.shell?.spotifySetClientId?.(clientIdDraft.trim());
              setBusy(false);
              if (!r?.ok) setMsg(r?.error || 'Błąd');
              else {
                setMsg('');
                setShowAdvanced(false);
                await refreshStatus();
              }
            }}
          >
            Zapisz
          </button>
          <button type="button" className="hw-btn hw-btn-ghost" onClick={() => setShowAdvanced(false)}>
            Wróć
          </button>
          {msg ? <p className="hw-spotify-err">{msg}</p> : null}
        </div>
      </div>
    );
  }

  /* Niezalogowany / ładowanie — duży Zaloguj, zawsze klikalny */
  if (!preview && (!status || !status.connected)) {
    return (
      <div className={`hw-spotify hw-spotify-setup hw-size-${size}`}>
        <div className="hw-spotify-setup-inner" onPointerDown={(e) => e.stopPropagation()}>
          <span className="hw-spotify-badge">
            <SpotifyGlyph size={36} />
          </span>
          <p className="hw-spotify-setup-title">Połącz Spotify</p>
          <p className="hw-muted">Zobaczysz to, czego słuchasz — play, pauza, przewijanie.</p>
          <button
            type="button"
            className="hw-btn hw-spotify-login-btn"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void doLogin();
            }}
          >
            {busy ? 'Logowanie…' : 'Zaloguj'}
          </button>
          {msg ? <p className="hw-spotify-err">{msg}</p> : null}
        </div>
      </div>
    );
  }

  const item = playback?.item;
  const dur = playback?.durationMs || 0;
  const pct = dur > 0 ? Math.min(100, (progress / dur) * 100) : 0;
  const vol = playback?.device?.volume ?? 50;
  const idle = !item;

  if (!preview && idle) {
    return (
      <div className={`hw-spotify hw-spotify-setup hw-size-${size}`}>
        <div className="hw-spotify-setup-inner" onPointerDown={(e) => e.stopPropagation()}>
          <span className="hw-spotify-badge">
            <SpotifyGlyph size={32} />
          </span>
          <p className="hw-spotify-setup-title">Nic nie gra</p>
          <p className="hw-muted">Odtwórz coś w aplikacji Spotify, potem odśwież.</p>
          <div className="hw-spotify-actions">
            <button type="button" className="hw-btn" disabled={busy} onClick={() => void refreshPlayback()}>
              Odśwież
            </button>
            <button
              type="button"
              className="hw-btn hw-btn-ghost"
              onClick={async () => {
                await window.shell?.spotifyLogout?.();
                setPlayback(null);
                await refreshStatus();
              }}
            >
              Wyloguj
            </button>
          </div>
          {msg ? <p className="hw-spotify-err">{msg}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={`hw-spotify hw-spotify-now hw-size-${size}`}>
      <div className="hw-spotify-now-row">
        <div className="hw-spotify-art" aria-hidden>
          {item?.art ? (
            <img src={item.art} alt="" draggable={false} />
          ) : (
            <SpotifyGlyph size={size === 'S' ? 20 : 24} />
          )}
        </div>
        <div className="hw-spotify-meta">
          <strong className="hw-spotify-title">{item?.name}</strong>
          <span className="hw-spotify-artists">{item?.artists?.join(', ') || '—'}</span>
          {size === 'L' && playback?.device?.name ? (
            <em className="hw-spotify-device">{playback.device.name}</em>
          ) : null}
        </div>
        <div className="hw-spotify-now-actions" onPointerDown={(e) => e.stopPropagation()}>
          {item?.url ? (
            <button
              type="button"
              className="hw-icon-btn"
              title="Otwórz w Spotify"
              onClick={() => onGo?.(item.url!)}
            >
              <ExternalLink size={13} />
            </button>
          ) : null}
          {!preview && (
            <button
              type="button"
              className="hw-icon-btn"
              title="Wyloguj"
              onClick={async () => {
                await window.shell?.spotifyLogout?.();
                setPlayback(null);
                await refreshStatus();
              }}
            >
              <LogOut size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="hw-spotify-progress">
        <div
          ref={barRef}
          className={`hw-spotify-seek ${scrubbing ? 'is-scrub' : ''}`}
          style={{ '--pct': `${pct}%` } as CSSProperties}
          onPointerDown={onBarPointerDown}
          role="slider"
          aria-valuemin={0}
          aria-valuemax={dur}
          aria-valuenow={progress}
          aria-label="Przewijanie"
          tabIndex={0}
        >
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="hw-spotify-times">
          <span>{fmtMs(progress)}</span>
          <span>{fmtMs(dur)}</span>
        </div>
      </div>

      <div className="hw-spotify-controls" onPointerDown={(e) => e.stopPropagation()}>
        {size !== 'S' && (
          <button
            type="button"
            className={`hw-icon-btn ${playback?.shuffle ? 'on' : ''}`}
            title="Losowo"
            disabled={busy}
            onClick={() => void run(() => window.shell?.spotifyShuffle?.(!playback?.shuffle))}
          >
            <Shuffle size={14} />
          </button>
        )}
        <button
          type="button"
          className="hw-icon-btn"
          title="Poprzedni"
          disabled={busy}
          onClick={() => void run(() => window.shell?.spotifyPrev?.())}
        >
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          className="hw-spotify-play"
          title={playback?.playing ? 'Pauza' : 'Odtwarzaj'}
          disabled={busy}
          onClick={() =>
            void run(() =>
              playback?.playing ? window.shell?.spotifyPause?.() : window.shell?.spotifyPlay?.(),
            )
          }
        >
          {playback?.playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          type="button"
          className="hw-icon-btn"
          title="Następny"
          disabled={busy}
          onClick={() => void run(() => window.shell?.spotifyNext?.())}
        >
          <SkipForward size={16} />
        </button>
        {size !== 'S' && (
          <button
            type="button"
            className={`hw-icon-btn ${playback?.repeat && playback.repeat !== 'off' ? 'on' : ''}`}
            title="Powtarzaj"
            disabled={busy}
            onClick={() => {
              const cur = playback?.repeat || 'off';
              const next = cur === 'off' ? 'context' : cur === 'context' ? 'track' : 'off';
              void run(() => window.shell?.spotifyRepeat?.(next as 'off' | 'track' | 'context'));
            }}
          >
            <Repeat size={14} />
          </button>
        )}
      </div>

      {size === 'L' && playback?.device?.supportsVolume !== false && (
        <div className="hw-spotify-vol" onPointerDown={(e) => e.stopPropagation()}>
          <Volume2 size={12} />
          <input
            type="range"
            min={0}
            max={100}
            value={vol ?? 50}
            disabled={busy || preview}
            onChange={(e) => {
              const v = Number(e.target.value);
              setPlayback((p) =>
                p
                  ? { ...p, device: p.device ? { ...p.device, volume: v } : p.device }
                  : p,
              );
            }}
            onPointerUp={(e) => {
              const v = Number((e.target as HTMLInputElement).value);
              void run(() => window.shell?.spotifyVolume?.(v));
            }}
          />
        </div>
      )}
      {msg ? <p className="hw-spotify-err">{msg}</p> : null}
    </div>
  );
}
