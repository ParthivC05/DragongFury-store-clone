import { memo } from 'react';
import { GameImage } from '../../../components/Games/GameImage';
import { getGameDisplayName } from '../../../utils/gameDisplay';
import { getLink2PlayArtVariant } from '../../../config/link2playGames';
import { Link2PlayActions } from './Link2PlayActions';
import { Link2PlayNotifyButton } from './Link2PlayNotifyButton';

export const Link2PlayGameCard = memo(function Link2PlayGameCard({ game, priority = false }) {
  const label = getGameDisplayName(game);
  const isSoon = game.status === 'soon';
  const artVariant = getLink2PlayArtVariant(game);
  // Category badges (Live / Popular) only for admin-managed catalog rows.
  const showCategoryBadges = Boolean(game.fromAdmin);
  const showLiveBadge = showCategoryBadges && !isSoon && Boolean(game.isLive);
  const showPopularBadge = showCategoryBadges && !isSoon && Boolean(game.popular || game.isPopular);
  // Single badge always sits on the left; with both, Live left + Popular right.
  const popularAlone = showPopularBadge && !showLiveBadge;

  return (
    <article
      className={`l2p-card${isSoon ? ' l2p-card--unavailable' : ''}`}
      aria-label={label}
    >
      <div className={`l2p-art l2p-art--${artVariant}`}>
        {isSoon ? (
          <span className="l2p-status-chip l2p-status-chip--soon">SOON</span>
        ) : null}
        {showLiveBadge ? (
          <span className="l2p-status-chip l2p-status-chip--live">
            <span className="l2p-status-dot" aria-hidden />
            LIVE
          </span>
        ) : null}
        {showPopularBadge ? (
          <span className={`l2p-hot-ribbon${popularAlone ? ' l2p-hot-ribbon--left' : ''}`}>
            ★ POPULAR
          </span>
        ) : null}
        <div className="l2p-art-media" aria-hidden>
          <GameImage
            game={game}
            className="l2p-art-img"
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
          />
        </div>
        <div className="l2p-art-title">{label}</div>
      </div>

      <div className="l2p-card-body">
        <h3 className="l2p-card-name">{label}</h3>
        {isSoon ? (
          <Link2PlayNotifyButton gameName={label} />
        ) : (
          <Link2PlayActions game={game} gameName={label} />
        )}
      </div>
    </article>
  );
});
