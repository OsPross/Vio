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
  SkipBack,
  SkipForward,
  Volume2,
} from 'lucide-react';
import type { HomeWidget, HomeWidgetSize } from '../store';
import { useT } from '../i18n';
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
  const t = useT();
  const [status, setStatus] = useState<{
    connected: boolean;
    configured: boolean;
    needsAuthorSetup?: boolean;
    displayName?: string | null;
    redirectUri: string;
    needReconnect?: boolean;
  } | null>(
    preview ? { connected: true, configured: true, displayName: null, redirectUri: '' } : null,
  );
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
      setMsg(t('widgets.ui.spotify.noApi'));
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
          needReconnect: Boolean(s.needReconnect),
        });
        if (s.needReconnect) {
          setMsg(t('widgets.ui.spotify.reconnectScopes'));
        }
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
      setMsg(t('widgets.ui.spotify.statusError'));
    }
  }, [preview, t]);

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
      | Promise<
          | {
              ok: boolean;
              error?: string;
              premium?: boolean;
              noDevice?: boolean;
              needReconnect?: boolean;
              restricted?: boolean;
            }
          | undefined
        >
      | undefined,
  ) => {
    if (preview) return;
    setBusy(true);
    setMsg('');
    try {
      const r = await fn();
      if (r && !r.ok) {
        if (r.needReconnect) {
          setMsg(t('widgets.ui.spotify.reconnectScopes'));
          try {
            await window.shell?.spotifyLogout?.();
          } catch {
            /* */
          }
          setPlayback(null);
          await refreshStatus();
          return;
        }
        if (r.premium) setMsg(t('widgets.ui.spotify.premiumRequired'));
        else if (r.noDevice) setMsg(t('widgets.ui.spotify.noActiveDevice'));
        else if (r.restricted) setMsg(t('widgets.ui.spotify.restrictionViolated'));
        else setMsg(r.error || t('widgets.ui.spotify.error'));
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
      setMsg(t('widgets.ui.spotify.copiedRedirect'));
    } catch {
      setMsg(uri);
    }
  };

  const doLogin = async () => {
    if (!window.shell?.spotifyLogin) {
      setMsg(t('widgets.ui.spotify.restartForLogin'));
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const r = await window.shell.spotifyLogin();
      if (!r?.ok) setMsg(r?.error || t('widgets.ui.spotify.loginFailed'));
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
          <p className="hw-spotify-setup-title">{t('widgets.spotify')}</p>
          <p className="hw-muted">{t('widgets.ui.spotify.noClientId')}</p>
          <button type="button" className="hw-btn" onClick={() => setShowAdvanced(true)}>
            {t('widgets.ui.spotify.customClientId')}
          </button>
        </div>
      </div>
    );
  }

  if (!preview && showAdvanced && (!status || !status.connected)) {
    return (
      <div className={`hw-spotify hw-spotify-setup hw-size-${size}`}>
        <div className="hw-spotify-setup-inner">
          <p className="hw-spotify-setup-title">{t('widgets.ui.spotify.customClientId')}</p>
          <div className="hw-spotify-redirect">
            <code>{status?.redirectUri || 'http://127.0.0.1:47831/callback'}</code>
            <button
              type="button"
              className="hw-icon-btn"
              title={t('common.copy')}
              onClick={() => void copyRedirect()}
            >
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
              if (!r?.ok) setMsg(r?.error || t('widgets.ui.spotify.error'));
              else {
                setMsg('');
                setShowAdvanced(false);
                await refreshStatus();
              }
            }}
          >
            {t('common.save')}
          </button>
          <button
            type="button"
            className="hw-btn hw-btn-ghost"
            onClick={() => setShowAdvanced(false)}
          >
            {t('widgets.ui.spotify.goBack')}
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
          <p className="hw-spotify-setup-title">{t('widgets.ui.spotify.connectTitle')}</p>
          <p className="hw-muted">{t('widgets.ui.spotify.connectHint')}</p>
          <button
            type="button"
            className="hw-btn hw-spotify-login-btn"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void doLogin();
            }}
          >
            {busy ? t('widgets.ui.spotify.loggingIn') : t('widgets.ui.spotify.login')}
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
          <p className="hw-spotify-setup-title">{t('widgets.ui.spotify.nothingPlaying')}</p>
          <p className="hw-muted">{t('widgets.ui.spotify.playSomething')}</p>
          <div className="hw-spotify-actions">
            <button
              type="button"
              className="hw-btn"
              disabled={busy}
              onClick={() => void refreshPlayback()}
            >
              {t('common.refresh')}
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
              {t('widgets.ui.spotify.logout')}
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
              title={t('widgets.ui.spotify.openInSpotify')}
              onClick={() => onGo?.(item.url!)}
            >
              <ExternalLink size={13} />
            </button>
          ) : null}
          {!preview && (
            <button
              type="button"
              className="hw-icon-btn"
              title={t('widgets.ui.spotify.logout')}
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
          aria-label={t('widgets.ui.spotify.scrub')}
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
        <button
          type="button"
          className="hw-icon-btn"
          title={t('widgets.ui.spotify.previous')}
          disabled={busy}
          onClick={() => void run(() => window.shell?.spotifyPrev?.())}
        >
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          className="hw-spotify-play"
          title={
            playback?.playing ? t('widgets.ui.spotify.pause') : t('widgets.ui.spotify.play')
          }
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
          title={t('widgets.ui.spotify.next')}
          disabled={busy}
          onClick={() => void run(() => window.shell?.spotifyNext?.())}
        >
          <SkipForward size={16} />
        </button>
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
