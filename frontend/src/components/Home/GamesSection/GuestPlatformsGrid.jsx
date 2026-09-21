import { useNavigate, useLocation } from 'react-router-dom';
import { GameImage } from '../../Games/GameImage';
import { getGameDisplayName } from '../../../utils/gameDisplay';

const PLATFORM_ACCENTS = [
  { border: 'rgba(0, 255, 224, 0.5)', glow: 'rgba(0, 255, 224, 0.12)' },
  { border: 'rgba(255, 215, 0, 0.5)', glow: 'rgba(255, 215, 0, 0.12)' },
  { border: 'rgba(168, 85, 247, 0.5)', glow: 'rgba(168, 85, 247, 0.12)' },
  { border: 'rgba(56, 189, 248, 0.5)', glow: 'rgba(56, 189, 248, 0.12)' },
  { border: 'rgba(244, 114, 182, 0.5)', glow: 'rgba(244, 114, 182, 0.12)' },
  { border: 'rgba(52, 211, 153, 0.5)', glow: 'rgba(52, 211, 153, 0.12)' },
];

function gameHash(game) {
  const key = String(game?.id ?? game?.name ?? 'game');
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) & 0xffff;
  }
  return hash;
}

function getPlatformAccent(game) {
  return PLATFORM_ACCENTS[gameHash(game) % PLATFORM_ACCENTS.length];
}

function getPlatformBadge(game, index, priorityLobby) {
  if (priorityLobby) {
    return game?.isNew ? { type: 'new', label: 'NEW' } : null;
  }
  if (index < 3) return { type: 'hot', label: 'Hot' };
  const mod = gameHash(game) % 7;
  if (mod === 0) return { type: 'new', label: 'New' };
  return null;
}

function GuestPlatformTile({ game, index, onSelect, priorityLobby = false }) {
  const accent = getPlatformAccent(game);
  const badge = getPlatformBadge(game, index, priorityLobby);

  return (
    <button
      type="button"
      className={`dash-platform-tile${priorityLobby ? ' dash-platform-tile--priority' : ''}`}
      style={
        priorityLobby
          ? undefined
          : {
              '--platform-accent': accent.border,
              '--platform-glow': accent.glow,
            }
      }
      onClick={() => onSelect(game)}
    >
      {badge ? (
        <span className={`dash-platform-badge dash-platform-badge--${badge.type}`}>{badge.label}</span>
      ) : null}
      <div className={`dash-platform-art${priorityLobby ? ' dash-platform-art--priority' : ''}`}>
        <GameImage
          game={game}
          className="dash-platform-img"
          loading="eager"
          fetchPriority={index < 8 ? 'high' : 'auto'}
          width={320}
          height={280}
        />
      </div>
      <div className={`dash-platform-name${priorityLobby ? ' dash-platform-name--priority' : ''}`}>
        <span>{getGameDisplayName(game)}</span>
        {priorityLobby ? <small className="dash-platform-sub">Sign up &amp; Play</small> : null}
      </div>
    </button>
  );
}

export function GuestPlatformsGridSkeleton({ count = 8, priorityLobby = false }) {
  return (
    <div
      className={`dash-platforms-grid${priorityLobby ? ' dash-platforms-grid--priority' : ''}`}
      aria-busy="true"
      aria-label="Loading platforms"
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`dash-platform-tile dash-platform-tile--skeleton${
            priorityLobby ? ' dash-platform-tile--priority' : ''
          }`}
          style={{ '--dash-skel-delay': `${i * 0.06}s` }}
          aria-hidden
        />
      ))}
    </div>
  );
}

export function GuestPlatformsGrid({
  games,
  showFooterCta = true,
  onSelectPlatform,
  footerCtaLabel = 'Sign Up to Play All Platforms',
  initialVisible = null,
  collapsing = false,
  priorityLobby = false,
}) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const signupTo = `/register${search || ''}`;

  function handleSelect(game) {
    if (typeof onSelectPlatform === 'function') {
      onSelectPlatform(game);
      return;
    }
    navigate(signupTo);
  }

  return (
    <div className="dash-platforms-wrap">
      <div
        className={`dash-platforms-grid${priorityLobby ? ' dash-platforms-grid--priority' : ''}`}
        role="list"
        aria-label="Game platforms"
      >
        {games.map((game, i) => {
          const isExtra = initialVisible != null && i >= initialVisible;
          const animClass = collapsing && isExtra
            ? 'dash-animate-out'
            : `dash-animate-in dash-delay-${Math.min((i % 6) + 1, 6)}`;

          return (
            <div
              key={game.id ?? `platform-${i}`}
              className={`dash-platform-wrap ${animClass}${isExtra ? ' dash-platform-wrap--extra' : ''}`}
              role="listitem"
            >
              <GuestPlatformTile
                game={game}
                index={i}
                onSelect={handleSelect}
                priorityLobby={priorityLobby}
              />
            </div>
          );
        })}
      </div>

      {showFooterCta ? (
        <button type="button" className="dash-platforms-cta" onClick={() => handleSelect()}>
          {footerCtaLabel}
        </button>
      ) : null}
    </div>
  );
}
