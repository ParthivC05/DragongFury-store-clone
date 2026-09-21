import { useId } from 'react';
import { CloseIcon, SearchIcon } from '../../../assets/icons';

export function Link2PlaySearch({
  value,
  onChange,
  onClear,
  placeholder = 'Find a game…',
  resultCount = null,
  resultNoun = 'game',
}) {
  const inputId = useId();
  const hasQuery = String(value || '').trim().length > 0;

  return (
    <div className="l2p-search-wrap">
      <label className="l2p-search" htmlFor={inputId}>
        <SearchIcon className="l2p-search-icon" width={16} height={16} />
        <input
          id={inputId}
          type="search"
          className="l2p-search-input"
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-label="Find a game"
        />
        {hasQuery ? (
          <button
            type="button"
            className="l2p-search-clear"
            onClick={onClear}
            aria-label="Clear search"
          >
            <CloseIcon width={14} height={14} />
          </button>
        ) : null}
      </label>
      {hasQuery && resultCount != null ? (
        <p className="l2p-search-meta" aria-live="polite">
          {resultCount === 0
            ? `No matching ${resultNoun}s`
            : `${resultCount.toLocaleString()} ${resultNoun}${resultCount === 1 ? '' : 's'} found`}
        </p>
      ) : null}
    </div>
  );
}
