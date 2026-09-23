import { useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildGuestPlatformGames } from '../../config/featuredPlatformGames';
import { GameImage } from '../Games/GameImage';
import { getGameDisplayName } from '../../utils/gameDisplay';

const GUEST_PLATFORMS = buildGuestPlatformGames([]);
const PAGE_SIZE = 12;

export function GuestHomePlatforms() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const signupTo = `/register${search || ''}`;
  const [visiblePages, setVisiblePages] = useState(1);

  const total = GUEST_PLATFORMS.length;
  const visibleCount = Math.min(total, PAGE_SIZE * visiblePages);
  const visibleGames = GUEST_PLATFORMS.slice(0, visibleCount);
  const remaining = Math.max(0, total - visibleCount);

  const goSignup = useCallback(() => {
    navigate(signupTo);
  }, [navigate, signupTo]);

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

      {remaining > 0 ? (
        <div className="df-games-more df-games-more--toggle">
          <button
            className="df-games-view-more"
            type="button"
            onClick={() => setVisiblePages((n) => n + 1)}
          >
            VIEW MORE
          </button>
        </div>
      ) : null}
    </section>
  );
}
