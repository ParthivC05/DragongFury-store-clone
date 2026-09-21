import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STORE_CODE } from '../config/site';
import { getShuffledStoreWinnerNames, getStoreToastProfiles } from '../utils/storeWinnerNames';

const TOAST_PROFILES = getStoreToastProfiles(STORE_CODE);

const ENTER_MS = 380;
const VISIBLE_MS = 4200;
const EXIT_MS = 380;

function parseWinnerPrize(prize) {
  return Number.parseInt(String(prize).replace(/[^\d]/g, ''), 10) || 0;
}

function formatWinAmount(amount) {
  return `$${Math.max(1, amount).toLocaleString('en-US')}`;
}

function formatTimeAgo(minutes) {
  if (minutes < 1) return 'Just now';
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? '1 hr ago' : `${hours} hr ago`;
}

function pickNameForGender(gender, slotIndex, pools) {
  const pool = gender === 'female' ? pools.female : pools.male;
  return pool[slotIndex % pool.length];
}

function buildToastItems(rows, pools) {
  const source = (rows || []).slice(0, 8);
  if (!source.length) return [];

  const namePools = pools || getShuffledStoreWinnerNames(STORE_CODE);

  let femaleSlot = 0;
  let maleSlot = 0;

  return source.map((row, index) => {
    const profile = TOAST_PROFILES[index % TOAST_PROFILES.length];
    const isFemale = profile.gender === 'female';
    const name = isFemale
      ? pickNameForGender('female', femaleSlot++, namePools)
      : pickNameForGender('male', maleSlot++, namePools);
    const amount = parseWinnerPrize(row.prize);
    const minutesAgo = Math.max(1, 2 + index * 2 + (amount % 5));

    return {
      id: `winner-toast-${index}-${profile.avatar}`,
      name,
      avatar: profile.avatar,
      gender: profile.gender,
      amount: formatWinAmount(amount),
      time: formatTimeAgo(minutesAgo),
      game: row.game || 'Platform game',
    };
  });
}

function useAboveBottomNavOffset() {
  const [offset, setOffset] = useState(118);

  useEffect(() => {
    const measure = () => {
      const nav = document.querySelector('.dash-bottom-wrap');
      if (!nav) {
        setOffset(118);
        return;
      }
      const homeBtn = nav.querySelector('.dash-nav-home-btn') || nav.querySelector('.dash-nav-item--home');
      const topEdge = (homeBtn || nav).getBoundingClientRect().top;
      const gap = 20;
      const fromBottom = Math.round(window.innerHeight - topEdge);
      setOffset(Math.max(96, fromBottom) + gap);
    };

    measure();
    const retryId = window.setTimeout(measure, 120);
    const nav = document.querySelector('.dash-bottom-wrap');
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (nav && ro) ro.observe(nav);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);

    return () => {
      window.clearTimeout(retryId);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
    };
  }, []);

  return offset;
}

/**
 * Compact winner toast, always visible on mobile, pinned just above the bottom nav.
 */
export function LandingWinnerToasts({ rows }) {
  const [toastIndex, setToastIndex] = useState(0);
  const [phase, setPhase] = useState('hidden');
  const [mounted, setMounted] = useState(false);
  const cycleRef = useRef(null);
  const itemsRef = useRef([]);
  const identitiesRef = useRef(null);
  const namePoolsRef = useRef(null);
  const bottomOffset = useAboveBottomNavOffset();

  if (!namePoolsRef.current) {
    namePoolsRef.current = getShuffledStoreWinnerNames(STORE_CODE);
  }

  const rowCount = (rows || []).slice(0, 8).length;

  const identities = useMemo(() => {
    if (!rowCount) {
      identitiesRef.current = null;
      return [];
    }
    if (identitiesRef.current?.length === rowCount) {
      return identitiesRef.current;
    }
    let femaleSlot = 0;
    let maleSlot = 0;
    const next = Array.from({ length: rowCount }, (_, index) => {
      const profile = TOAST_PROFILES[index % TOAST_PROFILES.length];
      const isFemale = profile.gender === 'female';
      return {
        id: `winner-toast-${index}-${profile.avatar}`,
        name: isFemale
          ? pickNameForGender('female', femaleSlot++, namePoolsRef.current)
          : pickNameForGender('male', maleSlot++, namePoolsRef.current),
        avatar: profile.avatar,
        gender: profile.gender,
      };
    });
    identitiesRef.current = next;
    return next;
  }, [rowCount]);

  const items = useMemo(() => {
    const source = (rows || []).slice(0, 8);
    return identities.map((identity, index) => {
      const row = source[index] || {};
      const amount = parseWinnerPrize(row.prize);
      const minutesAgo = Math.max(1, 2 + index * 2 + (amount % 5));
      return {
        ...identity,
        amount: formatWinAmount(amount),
        time: formatTimeAgo(minutesAgo),
        game: row.game || 'Platform game',
      };
    });
  }, [identities, rows]);

  itemsRef.current = items;

  const activeItem = items.length ? items[toastIndex % items.length] : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (cycleRef.current) {
      window.clearTimeout(cycleRef.current);
      cycleRef.current = null;
    }

    if (items.length === 0) {
      setPhase('hidden');
      return undefined;
    }

    let cancelled = false;

    const schedule = (fn, ms) => {
      cycleRef.current = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    const runCycle = () => {
      const count = itemsRef.current.length;
      if (!count) return;

      setPhase('enter');
      schedule(() => {
        setPhase('show');
        schedule(() => {
          setPhase('exit');
          schedule(() => {
            setToastIndex((i) => (i + 1) % count);
            runCycle();
          }, EXIT_MS);
        }, VISIBLE_MS);
      }, ENTER_MS);
    };

    runCycle();

    return () => {
      cancelled = true;
      if (cycleRef.current) {
        window.clearTimeout(cycleRef.current);
        cycleRef.current = null;
      }
    };
  }, [items.length]);

  useEffect(() => {
    if (toastIndex >= items.length && items.length > 0) {
      setToastIndex(0);
    }
  }, [items.length, toastIndex]);

  if (!mounted || typeof document === 'undefined' || !activeItem || phase === 'hidden') {
    return null;
  }

  return createPortal(
    <div
      className="lp-winner-toast-host lp-winner-toast-host--bar is-active"
      style={{ bottom: `${bottomOffset}px` }}
      aria-live="polite"
      aria-atomic="true"
    >
      <article
        key={`${activeItem.id}-${toastIndex}`}
        className={`lp-winner-toast lp-winner-toast--${phase} lp-winner-toast--bar`}
      >
        <img
          key={`${toastIndex}-${activeItem.avatar}`}
          src={activeItem.avatar}
          alt=""
          className="lp-winner-toast-avatar"
          loading="eager"
          decoding="async"
        />
        <span className="lp-winner-toast-win-badge" aria-hidden>🏆</span>
        <div className="lp-winner-toast-body">
          <p className="lp-winner-toast-name">{activeItem.name}</p>
          <p className="lp-winner-toast-amount">Won {activeItem.amount}</p>
          <p className="lp-winner-toast-meta">
            <span>{activeItem.game}</span>
            <span className="lp-winner-toast-dot" aria-hidden>·</span>
            <span>{activeItem.time}</span>
          </p>
        </div>
      </article>
    </div>,
    document.body
  );
}

export { buildToastItems };
