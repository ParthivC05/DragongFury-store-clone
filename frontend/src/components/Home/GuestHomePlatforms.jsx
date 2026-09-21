import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { buildGuestPlatformGames } from '../../config/featuredPlatformGames';
import { GuestPlatformsGrid } from './GamesSection/GuestPlatformsGrid';
import { scrollToSectionById } from '../../utils/scrollToGames';

const GUEST_PLATFORMS = buildGuestPlatformGames([]);
const INITIAL_VISIBLE = 9;
const COLLAPSE_MS = 320;

/** Guest home platforms from the bundled list — no catalog or casino API. */
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
  const canToggle = total > INITIAL_VISIBLE;

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
    <section
      id="games"
      className="dash-games-section dash-games-section--guest dash-priority-lobby dash-animate-in"
    >
      <div className="dash-priority-lobby-head">
        <div className="dash-priority-lobby-copy">
          <p className="dash-priority-lobby-kick">Priority lobby</p>
          <h2 className="dash-priority-lobby-title">Top Game Platforms</h2>
        </div>
        <button
          type="button"
          className="dash-priority-lobby-signup"
          onClick={() => navigate(signupTo)}
        >
          Sign Up to Play All →
        </button>
      </div>

      <GuestPlatformsGrid
        games={visibleGames}
        initialVisible={INITIAL_VISIBLE}
        collapsing={collapsing}
        showFooterCta={false}
        priorityLobby
        onSelectPlatform={() => navigate(signupTo)}
      />

      {canToggle ? (
        <button
          type="button"
          className="dash-platforms-toggle"
          aria-expanded={expanded && !collapsing}
          disabled={collapsing}
          onClick={handleToggle}
        >
          {expanded && !collapsing ? '▴ Show Less' : `▾ Show All ${total} Platforms`}
        </button>
      ) : null}
    </section>
  );
}
