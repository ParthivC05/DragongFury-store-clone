import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useBlockingOverlayOpen } from '../../hooks/useBlockingOverlayOpen';
import * as gitslotparkApi from '../../api/gitslotpark';
import { getCachedProviderSlotGames } from '../../utils/dashboardSlotGamesCache';
import {
  LIVE_WIN_ACTIONS,
  LIVE_WIN_GAMES,
  LIVE_WIN_SLOT_GAMES_FALLBACK,
  LIVE_WIN_TIMING,
  LIVE_WIN_USERNAME_PREFIXES,
  buildLiveWinItem,
  collectLiveWinSlotGamesFromCache,
  createDeckPicker,
  isSlotsLiveWinPath,
  randomBetween,
} from '../../utils/liveWinPopup';

const {
  initialDelayMin,
  initialDelayMax,
  visibleMs,
  enterMs,
  exitMs,
  gapMin,
  gapMax,
} = LIVE_WIN_TIMING;

function LiveWinThumb({ src }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  if (imgError) {
    return <div className="lwp-thumb-fallback" aria-hidden>🎰</div>;
  }

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      onError={() => setImgError(true)}
    />
  );
}

function readCachedSlotGames() {
  const providers = [
    ...gitslotparkApi.listConfiguredGitslotparkProviders(),
    'bona',
  ];
  return collectLiveWinSlotGamesFromCache(getCachedProviderSlotGames, providers);
}

function LiveWinPopupActive({ games }) {
  const isBlockingOverlay = useBlockingOverlayOpen();
  const enabled = !isBlockingOverlay && Array.isArray(games) && games.length > 0;

  const [active, setActive] = useState(null);
  const [phase, setPhase] = useState('hidden');
  const timersRef = useRef([]);
  const lastItemRef = useRef(null);
  const sessionRef = useRef(0);
  const userPickerRef = useRef(createDeckPicker(LIVE_WIN_USERNAME_PREFIXES));
  const gamePickerRef = useRef(createDeckPicker(games, (game) => game.name));
  const gamesKey = useMemo(
    () => games.map((game) => `${game.name}:${game.image}`).join('|'),
    [games]
  );

  useEffect(() => {
    gamePickerRef.current = createDeckPicker(games, (game) => game.name);
    lastItemRef.current = null;
  }, [gamesKey, games]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  const schedule = useCallback((fn, ms) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const showNext = useCallback((session) => {
    if (session !== sessionRef.current) return;

    const item = buildLiveWinItem(
      userPickerRef.current,
      gamePickerRef.current,
      lastItemRef.current
    );
    lastItemRef.current = item;
    setActive(item);
    setPhase('enter');

    schedule(() => {
      if (session !== sessionRef.current) return;
      setPhase('show');
      schedule(() => {
        if (session !== sessionRef.current) return;
        setPhase('exit');
        schedule(() => {
          if (session !== sessionRef.current) return;
          setPhase('hidden');
          setActive(null);
          schedule(() => showNext(session), randomBetween(gapMin, gapMax));
        }, exitMs);
      }, visibleMs);
    }, enterMs);
  }, [schedule]);

  useEffect(() => {
    if (!enabled) {
      sessionRef.current += 1;
      clearTimers();
      setPhase('hidden');
      setActive(null);
      return undefined;
    }

    const session = sessionRef.current;
    schedule(() => showNext(session), randomBetween(initialDelayMin, initialDelayMax));

    return () => {
      sessionRef.current += 1;
      clearTimers();
    };
  }, [enabled, gamesKey, showNext, schedule, clearTimers]);

  if (!active || phase === 'hidden') return null;

  const actionLabel = LIVE_WIN_ACTIONS.includes(active.action) ? active.action : 'won';

  return createPortal(
    <div className="lwp-host" aria-hidden="true">
      <article className={`lwp-popup lwp-popup--${phase}`}>
        <div className="lwp-thumb">
          <LiveWinThumb src={active.image} />
        </div>
        <div className="lwp-body">
          <div className="lwp-live">
            <span className="lwp-live-dot" aria-hidden />
            <span className="lwp-live-label">LIVE</span>
          </div>
          <p className="lwp-line">
            <span className="lwp-user">{active.username}</span>
            <span className="lwp-action"> {actionLabel} </span>
            <span className="lwp-amount">{active.amount}</span>
            <span className="lwp-sc"> sc</span>
            <span className="lwp-in"> in</span>
          </p>
          <p className="lwp-game">{active.name}</p>
        </div>
      </article>
    </div>,
    document.body
  );
}

/**
 * Intermittent live-win popup for logged-in users on app pages.
 * On /casino, banners use casino catalog games (not platform games).
 * Pauses while modals, overlays, or casino gameplay are active.
 */
export function LiveWinPopup() {
  const { isAuthenticated, loading } = useAuth();
  const { pathname } = useLocation();
  const isSlotsPage = isSlotsLiveWinPath(pathname);
  const [slotGames, setSlotGames] = useState(() =>
    isSlotsPage ? readCachedSlotGames() : []
  );

  useEffect(() => {
    if (!isSlotsPage) {
      setSlotGames([]);
      return undefined;
    }

    const sync = () => {
      const next = readCachedSlotGames();
      setSlotGames((prev) => {
        if (prev.length === next.length && prev.every((g, i) => g.name === next[i].name && g.image === next[i].image)) {
          return prev;
        }
        return next;
      });
    };

    sync();
    const id = window.setInterval(sync, 2000);
    return () => window.clearInterval(id);
  }, [isSlotsPage]);

  const games = useMemo(() => {
    if (!isSlotsPage) return LIVE_WIN_GAMES;
    return slotGames.length > 0 ? slotGames : LIVE_WIN_SLOT_GAMES_FALLBACK;
  }, [isSlotsPage, slotGames]);

  if (!isAuthenticated || loading) return null;
  if (pathname.startsWith('/support/tickets')) return null;

  return <LiveWinPopupActive games={games} />;
}
