import { ChevronDown, ChevronUp, X } from 'lucide-react';

type Props = {
  query: string;
  activeMatch: number;
  matchCount: number;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  onNext: (backward?: boolean) => void;
};

export function FindBar({ query, activeMatch, matchCount, onQueryChange, onClose, onNext }: Props) {
  const counter =
    matchCount > 0 ? `${activeMatch}/${matchCount}` : query.trim() ? '0/0' : '—';

  return (
    <div className="find-bar" role="search">
      <input
        autoFocus
        id="find-in-page-input"
        value={query}
        placeholder="Znajdź na stronie…"
        aria-label="Znajdź na stronie"
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            onNext(e.shiftKey);
          }
        }}
      />
      <span className="find-bar-count" aria-live="polite">
        {counter}
      </span>
      <button
        type="button"
        className="icon-btn sm"
        title="Poprzednie (Shift+Enter)"
        disabled={!query.trim()}
        onClick={() => onNext(true)}
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        className="icon-btn sm"
        title="Następne (Enter)"
        disabled={!query.trim()}
        onClick={() => onNext(false)}
      >
        <ChevronDown size={14} />
      </button>
      <button type="button" className="icon-btn sm" title="Zamknij (Esc)" onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}
