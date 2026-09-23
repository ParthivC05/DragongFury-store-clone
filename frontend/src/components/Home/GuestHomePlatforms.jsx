import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildGuestPlatformGames } from '../../config/featuredPlatformGames';
import { GameImage } from '../Games/GameImage';
import { getGameDisplayName } from '../../utils/gameDisplay';
import { scrollToSectionById } from '../../utils/scrollToGames';

const GUEST_PLATFORMS = buildGuestPlatformGames([]);
const INITIAL_VISIBLE = 12;
const COLLAPSE_MS = 320;

export function GuestHomePlatforms() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const signupTo = `/register${search || ''}`;
  const [expanded, setExpanded] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const collapseTimerRef = useRef(null);

  const total = GUEST_PLATFORMS.length;
  const showAll = expanded || collapsing;
  const visibleGames = showAll ? GUEST_PLATFORMS : GUEST_PLATFORMS.slice(0, INITIAL_VISIBLE);
  const remaining = Math.max(0, total - INITIAL_VISIBLE);
  const canToggle = total > INITIAL_VISIBLE;

  const goSignup = useCallback(() => {
    navigate(signupTo);
  }, [navigate, signupTo]);

  const handleToggle = useCallback(() => {
    if (collapseTimerRef.current) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }

    if (expanded && !collapsing) {
      setCollapsing(true);
      scrollToSectionById('games', { offset: 12 });
      collapseTimerRef.current = window.setTimeout(() => {
        setExpanded(false);
        setCollapsing(false);
        collapseTimerRef.current = null;
      }, COLLAPSE_MS);
      return;
    }

    setCollapsing(false);
    setExpanded(true);
  }, [collapsing, expanded]);

  useEffect(() => {
    return () => {
      if (collapseTimerRef.current) window.clearTimeout(collapseTimerRef.current);
    };
  }, []);

  return (
    <section className="df-other-games" id="games" aria-labelledby="df-other-games-title">
      <p className="df-games-eyebrow">Also on your account</p>
      <h2 className="df-games-title" id="df-other-games-title">
        TRY OTHER GAMES
      </h2>
      <p className="df-games-sub">
        Dragon Fury is the main event. One <strong>DragonFury.casino</strong> account also opens
        these web platforms.
      </p>

      <ul className="df-other-games__list">
        {visibleGames.map((game, index) => {
          const name = getGameDisplayName(game);
          return (
            <li key={game.id ?? `${name}-${index}`}>
              <button
                type="button"
                className="df-other-games__tile"
                aria-label={`${name} (secondary platform)`}
                onClick={goSignup}
              >
                <span className="df-other-games__ring">
                  {game.isNew ? <span className="df-other-games__new">NEW</span> : null}
                  <GameImage
                    game={game}
                    className="df-other-games__art"
                    loading="lazy"
                    fetchPriority={index < 8 ? 'high' : 'auto'}
                    width={160}
                    height={160}
                  />
                </span>
                <span className="df-other-games__name">{name}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {canToggle ? (
        <div className="df-games-more df-games-more--toggle">
          <button
            className="df-games-view-all"
            type="button"
            aria-expanded={expanded && !collapsing}
            disabled={collapsing}
            onClick={handleToggle}
          >
            {expanded && !collapsing ? 'SHOW LESS' : `VIEW ALL (${remaining} MORE)`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
