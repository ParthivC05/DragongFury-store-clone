import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { prefetchLobbySlotGames } from './DashboardSlotGamesSection';
import { getCachedProviderSlotGames } from '../../utils/dashboardSlotGamesCache';
import { getGameLobbyCategoryLabel, resolveLaunchGameId } from '../../utils/gitslotparkLandingGames';
import { useLaunchDashboardSlotGame } from '../../hooks/useLaunchDashboardSlotGame';
import { DepositRequiredModal } from '../Games/DepositRequiredModal';

const ONEGAMEHUB_CACHE_KEY = 'onegamehub-v7';
const BONA_CACHE_KEY = 'bona';
const MARQUEE_COUNT = 10;
const MARQUEE_SPEED = 0.5;
const DRAG_CLICK_THRESHOLD_PX = 8;
const RESUME_AUTO_SCROLL_MS = 280;

const PROVIDER_KEYS = [
  ONEGAMEHUB_CACHE_KEY,
  BONA_CACHE_KEY,
  'pragmatic',
  'pgsoft',
  'jili',
];

function collectAllCachedGames() {
  const out = [];
  const seen = new Set();
  for (const key of PROVIDER_KEYS) {
    for (const game of getCachedProviderSlotGames(key) || []) {
      const id = String(game?.gameid || game?.id || game?.title || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(game);
    }
  }
  return out;
}

function collectMarqueeGames() {
  const all = collectAllCachedGames();
  if (!all.length) return [];

  const buckets = new Map();
  for (const game of all) {
    const label = getGameLobbyCategoryLabel(game);
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push(game);
  }

  const labels = [...buckets.keys()];
  const out = [];
  let round = 0;

  while (out.length < MARQUEE_COUNT && labels.some((label) => buckets.get(label).length)) {
    const label = labels[round % labels.length];
    const list = buckets.get(label);
    if (list?.length) out.push(list.shift());
    round += 1;
    if (round > MARQUEE_COUNT * labels.length) break;
  }

  return out.length ? out : all.slice(0, MARQUEE_COUNT);
}

function gameImage(game) {
  if (typeof game?.image === 'string' && game.image.trim()) return game.image.trim();
  const icons = Array.isArray(game?.iconUrls) ? game.iconUrls : [];
  const first = icons.find((u) => typeof u === 'string' && u.trim());
  return first || '';
}

function marqueeBadge(index, total) {
  if (index === 0) return '#1 HOT';
  if (index === 1) return '🔥 TRENDING';
  if (index === total - 1 && total > 2) return 'NEW';
  return null;
}

/**
 * Logged-in home cross-sell: spotlight casino games + CTA into /casino.
 */
export function CasinoCrossSellPanel() {
  const [games, setGames] = useState(() => collectMarqueeGames());
  const [liveCount, setLiveCount] = useState(2406);
  const marqueeRef = useRef(null);
  const userScrollingRef = useRef(false);
  const resumeTimerRef = useRef(0);
  const pointerRef = useRef({ active: false, moved: false, startX: 0 });
  const {
    handlePlayGame,
    launchingGameId,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    activationBonusType,
  } = useLaunchDashboardSlotGame();

  useEffect(() => {
    let cancelled = false;
    let pollId = 0;

    prefetchLobbySlotGames().finally(() => {
      if (cancelled) return;
      setGames(collectMarqueeGames());
    });

    pollId = window.setInterval(() => {
      const next = collectMarqueeGames();
      if (next.length) {
        setGames(next);
        window.clearInterval(pollId);
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLiveCount((n) => {
        const delta = Math.floor(Math.random() * 17) - 6;
        return Math.max(1800, Math.min(4200, n + delta));
      });
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  const marqueeGames = useMemo(() => {
    if (!games.length) return [];
    return [...games, ...games];
  }, [games]);

  useEffect(() => {
    const viewport = marqueeRef.current;
    if (!viewport || marqueeGames.length === 0) return undefined;

    let loopWidth = 0;
    const measure = () => {
      loopWidth = viewport.scrollWidth / 2;
    };
    measure();

    let raf = 0;
    const tick = () => {
      if (!userScrollingRef.current && loopWidth > 0) {
        viewport.scrollLeft += MARQUEE_SPEED;
        if (viewport.scrollLeft >= loopWidth) {
          viewport.scrollLeft -= loopWidth;
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);

    const pauseAutoScroll = () => {
      userScrollingRef.current = true;
      window.clearTimeout(resumeTimerRef.current);
    };

    const scheduleResumeAutoScroll = () => {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = window.setTimeout(() => {
        userScrollingRef.current = false;
      }, RESUME_AUTO_SCROLL_MS);
    };

    const onWheel = () => {
      pauseAutoScroll();
      scheduleResumeAutoScroll();
    };
    const onPointerDown = (e) => {
      pointerRef.current = { active: true, moved: false, startX: e.clientX };
      pauseAutoScroll();
    };
    const onPointerMove = (e) => {
      if (!pointerRef.current.active) return;
      if (Math.abs(e.clientX - pointerRef.current.startX) > DRAG_CLICK_THRESHOLD_PX) {
        pointerRef.current.moved = true;
      }
    };
    const onPointerUp = () => {
      pointerRef.current.active = false;
      scheduleResumeAutoScroll();
    };

    viewport.addEventListener('wheel', onWheel, { passive: true });
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);
    viewport.addEventListener('touchstart', pauseAutoScroll, { passive: true });
    viewport.addEventListener('touchend', scheduleResumeAutoScroll, { passive: true });

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(viewport);
    window.addEventListener('resize', measure);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(resumeTimerRef.current);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', onPointerUp);
      viewport.removeEventListener('pointercancel', onPointerUp);
      viewport.removeEventListener('touchstart', pauseAutoScroll);
      viewport.removeEventListener('touchend', scheduleResumeAutoScroll);
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [marqueeGames.length]);

  const handleCardClick = useCallback(
    (game) => {
      if (pointerRef.current.moved) {
        pointerRef.current.moved = false;
        return;
      }
      handlePlayGame(game);
    },
    [handlePlayGame]
  );

  return (
    <section className="dash-xsell dash-animate-in" aria-label="Casino games for you">
      <div className="dash-xsell-top">
        <span className="dash-xsell-tag">🎰 CASINO · NEW FOR YOU</span>
        <div className="dash-xsell-live">
          <span className="dash-xsell-live-dot" aria-hidden />
          <span id="liveCount">{liveCount.toLocaleString('en-US')}</span>
          <span> playing now</span>
        </div>
      </div>

      {marqueeGames.length > 0 ? (
        <div className="dash-xsell-marquee" ref={marqueeRef}>
          <div className="dash-xsell-track">
            {marqueeGames.map((game, index) => {
              const src = gameImage(game);
              const title = game.title || 'Casino game';
              const cat = getGameLobbyCategoryLabel(game);
              const baseIndex = index % games.length;
              const badge = marqueeBadge(baseIndex, games.length);
              const gameId = resolveLaunchGameId(game);
              const isLaunching = gameId && launchingGameId === gameId;

              return (
                <button
                  key={`${game.gameid || game.id || title}-${index}`}
                  type="button"
                  className={`dash-xsell-card${isLaunching ? ' dash-xsell-card--loading' : ''}`}
                  onClick={() => handleCardClick(game)}
                  disabled={Boolean(isLaunching)}
                  aria-label={`Play ${title}`}
                >
                  {badge ? <span className="dash-xsell-badge">{badge}</span> : null}
                  <span className="dash-xsell-art">
                    {src ? (
                      <img src={src} alt="" loading="eager" decoding="async" draggable={false} />
                    ) : (
                      <span aria-hidden>🎰</span>
                    )}
                  </span>
                  <span className="dash-xsell-cat">{cat}</span>
                  <b className="dash-xsell-name">{title}</b>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="dash-xsell-marquee dash-xsell-marquee--loading" aria-hidden>
          <div className="dash-xsell-track">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="dash-xsell-card dash-xsell-card--skel" />
            ))}
          </div>
        </div>
      )}

      <div className="dash-xsell-cta">
        <Link to="/casino" className="dash-xsell-cta-btn no-underline">
          🎰 Explore Casino Games →
        </Link>
        <span className="dash-xsell-note">✓ Same balance — no new account</span>
      </div>

      <DepositRequiredModal
        open={depositRequiredModalOpen}
        onClose={closeDepositRequiredModal}
        activationBonusType={activationBonusType}
      />
    </section>
  );
}
