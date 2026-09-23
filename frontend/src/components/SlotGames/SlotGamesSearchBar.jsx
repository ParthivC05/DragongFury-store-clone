import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, SearchIcon } from '../../assets/icons';
import './slot-games-search.css';

function getNavHeightPx() {
  if (typeof window === 'undefined') return 56;
  const nav = document.querySelector('.dash-nav');
  if (nav) {
    const bottom = nav.getBoundingClientRect().bottom;
    if (bottom > 0) return Math.ceil(bottom);
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue('--dash-nav-h')
    .trim();
  const fromRoot = document.querySelector('.dash-root');
  const fromDash = fromRoot
    ? getComputedStyle(fromRoot).getPropertyValue('--dash-nav-h').trim()
    : '';
  const parsed = parseFloat(fromDash || raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 56;
}

/**
 * Only treat `.dash-main` as a scroll root when it is the styled scroll
 * container (desktop split-scroll). Do not walk arbitrary overflow:auto
 * ancestors — non-scrolling overflow:auto parents break sticky detection.
 */
function getScrollRoot(el) {
  const main = el?.closest?.('.dash-main');
  if (!main) return null;
  const { overflowY } = window.getComputedStyle(main);
  if (!/(auto|scroll|overlay)/.test(overflowY)) return null;
  return main;
}

function getStickyColumn(el) {
  return el?.closest?.('.dash-main') || el?.parentElement || null;
}

function applyPendingSelection(pending, inputEl) {
  if (!pending || !inputEl) return;
  inputEl.focus({ preventScroll: true });
  if (typeof pending.start === 'number' && typeof pending.end === 'number') {
    try {
      inputEl.setSelectionRange(pending.start, pending.end);
    } catch {
      /* selectionRange unsupported for some input types */
    }
  }
}

/**
 * Sticky dashboard search bar (slots lobby + platform games).
 *
 * Renders in-flow until the sentinel scrolls under the nav, then portals a
 * fixed clone to document.body. This avoids ancestors with transform /
 * overflow:clip (e.g. .dash-animate-in, .dash-root) which break position:fixed.
 */
export function SlotGamesSearchBar({
  value,
  onChange,
  onClear,
  resultCount = null,
  disabled = false,
  placeholder = 'Search games by name…',
  ariaLabel = 'Search casino games',
  resultNoun = 'game',
  enableSticky = true,
}) {
  const inputId = useId();
  const inputRef = useRef(null);
  const stickyInputRef = useRef(null);
  const rootRef = useRef(null);
  const stickyRootRef = useRef(null);
  const sentinelRef = useRef(null);
  const isStickyRef = useRef(false);
  const spacerHRef = useRef(0);
  const pendingSelectionRef = useRef(null);
  const [isSticky, setIsSticky] = useState(false);
  const [spacerH, setSpacerH] = useState(0);
  const [portalReady, setPortalReady] = useState(false);
  const hasQuery = String(value || '').trim().length > 0;

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || !hasQuery) return;
      const active = document.activeElement;
      const inInline = active === inputRef.current || inputRef.current?.contains(active);
      const inSticky =
        active === stickyInputRef.current || stickyInputRef.current?.contains(active);
      if (!inInline && !inSticky) return;
      event.preventDefault();
      onClear?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasQuery, onClear]);

  const updateSpacerH = useCallback((next) => {
    const height = Math.max(0, Math.round(next || 0));
    if (height === spacerHRef.current) return;
    spacerHRef.current = height;
    setSpacerH(height);
  }, []);

  const syncFixedGeometry = useCallback(() => {
    const stickyRoot = stickyRootRef.current;
    const flowRoot = rootRef.current;
    if (!stickyRoot || !isStickyRef.current) return;

    const column = getStickyColumn(flowRoot || sentinelRef.current);
    if (!column) return;

    const rect = column.getBoundingClientRect();
    const navBottom = getNavHeightPx();
    stickyRoot.style.top = `${navBottom}px`;
    stickyRoot.style.left = `${Math.max(0, rect.left)}px`;
    stickyRoot.style.width = `${rect.width}px`;
    document.documentElement.style.setProperty('--slots-search-nav-bottom', `${navBottom}px`);
    document.documentElement.style.setProperty(
      '--slots-search-sticky-h',
      `${stickyRoot.offsetHeight}px`
    );
    updateSpacerH(stickyRoot.offsetHeight || flowRoot?.offsetHeight || 0);
  }, [updateSpacerH]);

  const capturePendingSelection = useCallback((fromInput, target) => {
    if (!fromInput || document.activeElement !== fromInput) {
      pendingSelectionRef.current = null;
      return;
    }
    pendingSelectionRef.current = {
      target,
      start: fromInput.selectionStart,
      end: fromInput.selectionEnd,
    };
  }, []);

  const applyStickyState = useCallback(
    (sticky) => {
      if (isStickyRef.current === sticky) {
        if (sticky) syncFixedGeometry();
        return;
      }

      // Capture caret before React unmounts the active field.
      if (sticky) {
        capturePendingSelection(inputRef.current, 'sticky');
      } else {
        capturePendingSelection(stickyInputRef.current, 'inline');
      }

      isStickyRef.current = sticky;
      setIsSticky(sticky);
      document.body.classList.toggle('slots-search-sticky', sticky);

      if (sticky) {
        updateSpacerH(rootRef.current?.offsetHeight || spacerHRef.current || 58);
      } else {
        updateSpacerH(0);
        document.documentElement.style.removeProperty('--slots-search-sticky-h');
        document.documentElement.style.removeProperty('--slots-search-nav-bottom');
      }
    },
    [capturePendingSelection, syncFixedGeometry, updateSpacerH]
  );

  useLayoutEffect(() => {
    if (!enableSticky) {
      applyStickyState(false);
      return undefined;
    }
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;

    const scrollRoot = getScrollRoot(sentinel);

    const measureSticky = () => {
      const navBottom = getNavHeightPx();
      const top = sentinel.getBoundingClientRect().top;
      applyStickyState(top <= navBottom + 1);
    };

    measureSticky();

    const observer = new IntersectionObserver(() => measureSticky(), {
      root: scrollRoot,
      threshold: [0, 1],
      rootMargin: scrollRoot ? '0px' : `-${getNavHeightPx()}px 0px 0px 0px`,
    });
    observer.observe(sentinel);

    const onScrollOrResize = () => measureSticky();
    // Always listen on window: mobile home/slots scroll the document.
    // Also listen on dash-main when it is the live split-scroll container.
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    scrollRoot?.addEventListener('scroll', onScrollOrResize, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      if (!isStickyRef.current) return;
      syncFixedGeometry();
    });
    if (rootRef.current) resizeObserver.observe(rootRef.current);
    const column = getStickyColumn(sentinel);
    if (column) resizeObserver.observe(column);
    const nav = document.querySelector('.dash-nav');
    if (nav) resizeObserver.observe(nav);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      scrollRoot?.removeEventListener('scroll', onScrollOrResize);
      isStickyRef.current = false;
      spacerHRef.current = 0;
      pendingSelectionRef.current = null;
      document.body.classList.remove('slots-search-sticky');
      document.documentElement.style.removeProperty('--slots-search-sticky-h');
      document.documentElement.style.removeProperty('--slots-search-nav-bottom');
    };
  }, [applyStickyState, enableSticky, syncFixedGeometry]);

  useLayoutEffect(() => {
    if (isSticky) {
      syncFixedGeometry();
    }

    const pending = pendingSelectionRef.current;
    if (pending) {
      pendingSelectionRef.current = null;
      if (pending.target === 'sticky') {
        applyPendingSelection(pending, stickyInputRef.current);
      } else if (pending.target === 'inline') {
        applyPendingSelection(pending, inputRef.current);
      }
    }

    if (!isSticky) return undefined;
    const stickyRoot = stickyRootRef.current;
    if (!stickyRoot) return undefined;
    const resizeObserver = new ResizeObserver(() => syncFixedGeometry());
    resizeObserver.observe(stickyRoot);
    return () => resizeObserver.disconnect();
  }, [isSticky, hasQuery, resultCount, syncFixedGeometry]);

  const renderField = (opts) => {
    const { id, hidden } = opts;
    return (
      <div
        ref={opts.rootRef}
        className={`dash-slot-search${hasQuery ? ' dash-slot-search--active' : ''}${
          opts.sticky ? ' dash-slot-search--sticky' : ''
        }${hidden ? ' dash-slot-search--flow-hidden' : ''}`}
        aria-hidden={hidden || undefined}
      >
        <label className="dash-slot-search-field" htmlFor={id}>
          <span className="dash-slot-search-icon" aria-hidden>
            <SearchIcon className="dash-slot-search-icon-svg" />
          </span>
          <input
            ref={opts.inputRef}
            id={id}
            type="search"
            className="dash-slot-search-input"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="search"
            disabled={disabled}
            aria-label={ariaLabel}
            tabIndex={hidden ? -1 : undefined}
          />
          {hasQuery ? (
            <button
              type="button"
              className="dash-slot-search-clear"
              tabIndex={hidden ? -1 : undefined}
              onClick={() => {
                onClear?.();
                (opts.sticky ? stickyInputRef : inputRef).current?.focus();
              }}
              aria-label="Clear search"
            >
              <CloseIcon className="dash-slot-search-clear-icon" />
            </button>
          ) : null}
        </label>

        {hasQuery && resultCount != null ? (
          <p className="dash-slot-search-meta" aria-live={hidden ? undefined : 'polite'}>
            {resultCount === 0
              ? `No matching ${resultNoun}s`
              : `${resultCount.toLocaleString()} ${resultNoun}${resultCount === 1 ? '' : 's'} found`}
          </p>
        ) : null}
      </div>
    );
  };

  const stickyPortal =
    portalReady && isSticky
      ? createPortal(
          renderField({
            rootRef: stickyRootRef,
            inputRef: stickyInputRef,
            id: `${inputId}-sticky`,
            sticky: true,
            hidden: false,
          }),
          document.body
        )
      : null;

  return (
    <>
      <div ref={sentinelRef} className="dash-slot-search-sentinel" aria-hidden />
      {isSticky ? (
        <div
          className="dash-slot-search-spacer"
          style={{ height: spacerH || 58 }}
          aria-hidden
        />
      ) : null}
      {renderField({
        rootRef,
        inputRef,
        id: inputId,
        sticky: false,
        hidden: isSticky,
      })}
      {stickyPortal}
    </>
  );
}
