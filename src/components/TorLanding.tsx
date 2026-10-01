import { useEffect, useState } from 'react';
import { ShieldAlert, RefreshCw, UserRound } from 'lucide-react';

export type TorStatusInfo = {
  ok?: boolean;
  active?: boolean;
  isTor?: boolean;
  partition?: string | null;
  exitIp?: string | null;
  exitCountry?: string | null;
  proxyUrl?: string;
  error?: string | null;
  dnsNote?: string;
  embeddedTorNote?: string;
  embedded?: boolean;
  lastCheck?: number | null;
};

type CircuitHop = { fingerprint: string; nickname: string | null };
type Circuit = { id: string; status: string; path: CircuitHop[] };

export function TorLanding({
  info,
  busy,
  error,
  progress,
  onStartBrowse,
  onRefresh,
  onNewIdentity,
  onDismissDisclaimer,
  showDisclaimer,
}: {
  info: TorStatusInfo | null;
  busy?: boolean;
  error?: string | null;
  progress?: string | null;
  onStartBrowse: (url: string) => void;
  onRefresh: () => void;
  onNewIdentity?: () => void;
  onDismissDisclaimer: () => void;
  showDisclaimer: boolean;
}) {
  const [q, setQ] = useState('');
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [circuitNote, setCircuitNote] = useState<string | null>(null);

  useEffect(() => {
    if (!info?.active) {
      setCircuits([]);
      return;
    }
    let cancelled = false;
    void window.shell?.torCircuit?.().then((r) => {
      if (cancelled) return;
      if (r?.circuits) setCircuits(r.circuits.slice(0, 3));
      if (r?.limitation) setCircuitNote(r.limitation);
    });
    return () => {
      cancelled = true;
    };
  }, [info?.active, info?.exitIp, info?.lastCheck]);

  const bootMatch = progress?.match(/(\d+)\s*%/);
  const bootPct = bootMatch ? Number(bootMatch[1]) : null;

  return (
    <div className="tor-landing">
      <div className="tor-landing-inner">
        <div className="tor-badge" aria-hidden>
          <span className="tor-onion">◉</span>
          <strong>Tryb Tor</strong>
        </div>

        {showDisclaimer && (
          <div className="tor-disclaimer" role="note">
            <ShieldAlert size={18} strokeWidth={1.75} />
            <div>
              <p>
                Tryb Tor ukrywa Twój adres IP przed odwiedzanymi stronami i izoluje sesję (osobna
                partycja w pamięci, bez wspólnych ciasteczek z normalnymi kartami).
              </p>
              <p>
                <strong>To nie jest Tor Browser.</strong> Nie chroni przed fingerprintingiem
                (canvas, fonty, WebGL itd.) tak jak oficjalny Tor Browser. Do spraw wrażliwych
                używaj Tor Browsera.
              </p>
              <button type="button" className="sbtn primary" onClick={onDismissDisclaimer}>
                Rozumiem
              </button>
            </div>
          </div>
        )}

        {(error || info?.error) && (
          <div className="tor-error" role="alert">
            {error || info?.error}
          </div>
        )}

        {progress && (
          <div className="tor-boot" role="status">
            <div className="tor-boot-msg">{progress}</div>
            {bootPct != null && (
              <div className="tor-boot-bar" aria-valuenow={bootPct}>
                <i style={{ width: `${bootPct}%` }} />
              </div>
            )}
          </div>
        )}

        <div className="tor-exit">
          <div>
            <span className="muted">IP wyjściowe</span>
            <strong>{info?.exitIp || (busy ? '…' : '—')}</strong>
          </div>
          <div>
            <span className="muted">Kraj</span>
            <strong>{info?.exitCountry || '—'}</strong>
          </div>
          <button
            type="button"
            className="sbtn ghost"
            onClick={onRefresh}
            disabled={busy}
            title="Odśwież check.torproject.org"
          >
            <RefreshCw size={14} strokeWidth={1.75} />
          </button>
          {onNewIdentity && (
            <button
              type="button"
              className="sbtn ghost"
              onClick={onNewIdentity}
              disabled={busy || !info?.active}
              title="Nowa tożsamość (Ctrl+Shift+U)"
            >
              <UserRound size={14} strokeWidth={1.75} />
            </button>
          )}
        </div>

        {circuits.length > 0 && (
          <div className="tor-circuits">
            <span className="muted">Obwód</span>
            {circuits.slice(0, 1).map((c) => (
              <ol key={c.id} className="tor-circuit-path">
                {c.path.map((h, i) => (
                  <li key={`${c.id}-${i}`}>
                    <em>
                      {i === 0 ? 'Strażnik' : i === c.path.length - 1 ? 'Wyjście' : 'Pośredni'}
                    </em>
                    <code title={h.fingerprint}>{h.nickname || h.fingerprint.slice(0, 8)}</code>
                  </li>
                ))}
              </ol>
            ))}
            {circuitNote && <p className="tor-fineprint muted">{circuitNote}</p>}
          </div>
        )}

        <form
          className="tor-search"
          onSubmit={(e) => {
            e.preventDefault();
            const raw = q.trim();
            if (!raw) {
              onStartBrowse('https://check.torproject.org/');
              return;
            }
            if (/^https?:\/\//i.test(raw) || raw.endsWith('.onion')) {
              const url = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
              onStartBrowse(url);
              return;
            }
            onStartBrowse(`https://duckduckgo.com/?q=${encodeURIComponent(raw)}`);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Adres lub wyszukiwanie (przez Tor)…"
            spellCheck={false}
            autoFocus
          />
          <button type="submit" className="sbtn primary" disabled={busy}>
            Idź
          </button>
        </form>

        <div className="tor-quick">
          <button
            type="button"
            className="sbtn"
            onClick={() => onStartBrowse('https://check.torproject.org/')}
          >
            check.torproject.org
          </button>
          <button
            type="button"
            className="sbtn"
            onClick={() => onStartBrowse('https://duckduckgo.com/')}
          >
            DuckDuckGo
          </button>
        </div>

        <p className="tor-fineprint muted">
          Hasła, historia i side-apps są wyłączone. Przy braku zewnętrznego Tora aplikacja pobierze
          i uruchomi wbudowany Tor Expert Bundle (pierwszy raz ~21 MB). To nie zastępuje Tor
          Browsera przy wrażliwych sprawach.
        </p>
      </div>
    </div>
  );
}
