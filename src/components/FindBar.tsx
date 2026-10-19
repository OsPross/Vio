import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useT } from '../i18n';

type Props = {
  query: string;
  activeMatch: number;
  matchCount: number;
  onQueryChange: (q: string) => void;
  onClose: () => void;
  onNext: (backward?: boolean) => void;
};

export function FindBar({ query, activeMatch, matchCount, onQueryChange, onClose, onNext }: Props) {
  const t = useT();
  const counter = matchCount > 0 ? `${activeMatch}/${matchCount}` : query.trim() ? '0/0' : '—';

  return (
    <div className="find-bar" role="search">
      <input
        autoFocus
        id="find-in-page-input"
        value={query}
        placeholder={t('chrome.findPlaceholder')}
        aria-label={t('chrome.find')}
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
        title={t('chrome.findPrev')}
        disabled={!query.trim()}
        onClick={() => onNext(true)}
      >
        <ChevronUp size={14} />
      </button>
      <button
        type="button"
        className="icon-btn sm"
        title={t('chrome.findNext')}
        disabled={!query.trim()}
        onClick={() => onNext(false)}
      >
        <ChevronDown size={14} />
      </button>
      <button type="button" className="icon-btn sm" title={t('chrome.findCloseEsc')} onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}
