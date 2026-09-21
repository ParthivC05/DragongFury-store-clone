import { useEffect, useMemo, useState } from 'react';

const PLACEHOLDER = '/logo.webp';

function getGameIconUrls(game, usePlaceholder) {
  const urls = [game.iconurl1, game.iconurl2, game.iconurl, game.thumbnailUrl, game.image]
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter((url) => url && !url.toLowerCase().includes('gamevault') && url !== PLACEHOLDER);

  if (usePlaceholder && !urls.includes(PLACEHOLDER)) {
    urls.push(PLACEHOLDER);
  }

  return urls;
}

export function SlotGameCard({
  game,
  onPlay,
  playing,
  usePlaceholder = true,
  showTitle = false,
  imageFit = 'contain',
}) {
  const iconUrls = useMemo(() => getGameIconUrls(game, usePlaceholder), [game, usePlaceholder]);
  const [iconIndex, setIconIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const imgSrc = (!failed && iconUrls[Math.min(iconIndex, Math.max(iconUrls.length - 1, 0))]) || PLACEHOLDER;
  const isLogo = Boolean(imgSrc) && (failed || imgSrc === PLACEHOLDER);
  const coverFill = imageFit === 'cover';
  const name = game.name || game.title || 'Untitled';
  const vendor = game.vendorid || '';

  useEffect(() => {
    setIconIndex(0);
    setFailed(false);
  }, [game.gameid, game.symbol, iconUrls]);

  const handleImgError = () => {
    setIconIndex((current) => {
      if (current + 1 < iconUrls.length) return current + 1;
      setFailed(true);
      return current;
    });
  };

  const handleClick = () => {
    if (onPlay && game.gameid != null) {
      onPlay(game);
    }
  };

  return (
    <article
      className={`dash-slot-game-card dash-animate-in${onPlay ? ' dash-slot-game-card--clickable' : ''}${playing ? ' dash-slot-game-card--playing' : ''}`}
    >
      <button
        type="button"
        className="dash-slot-game-card-btn"
        onClick={handleClick}
        disabled={!onPlay || playing}
        aria-label={`Play ${name}`}
      >
        <div className={`dash-slot-game-card-art${coverFill ? ' dash-slot-game-card-art--cover' : ''}`}>
          {imgSrc ? (
            <>
              {isLogo || coverFill ? null : (
                <img
                  src={imgSrc}
                  alt=""
                  aria-hidden
                  className="dash-slot-game-card-img dash-slot-carousel-card-img--blur"
                  loading="lazy"
                  decoding="async"
                />
              )}
              <img
                src={imgSrc}
                alt=""
                className={`dash-slot-game-card-img${isLogo ? ' dash-slot-carousel-card-img--logo' : ''}`}
                loading="lazy"
                decoding="async"
                onError={handleImgError}
              />
            </>
          ) : (
            <span className="dash-slot-game-card-title dash-slot-game-card-title--hero">{name}</span>
          )}
          {vendor ? (
            <span className="dash-slot-game-card-vendor" title={vendor}>
              {vendor}
            </span>
          ) : null}
          {showTitle && imgSrc ? (
            <span className="dash-slot-game-card-title">{name}</span>
          ) : null}
        </div>
      </button>
    </article>
  );
}
