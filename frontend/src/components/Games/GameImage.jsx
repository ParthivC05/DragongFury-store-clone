import { useEffect, useRef, useState } from 'react';
import { getGameDisplayName } from '../../utils/gameDisplay';
import { getGameImageUrl } from '../../utils/gameImage';

/**
 * Renders the game image from public/optimized/games or game.image_url,
 * falling back to /games then a placeholder.
 */
export function GameImage({
  game,
  className = 'w-16 h-16 rounded-lg object-cover flex-shrink-0',
  loading = 'lazy',
  fetchPriority = 'auto',
  decoding = 'async',
  width = 88,
  height = 88,
  deferUntilVisible = false,
}) {
  const holderRef = useRef(null);
  const [visible, setVisible] = useState(!deferUntilVisible);
  const [src, setSrc] = useState(() => getGameImageUrl(game || {}));
  const [error, setError] = useState(false);

  useEffect(() => {
    setSrc(getGameImageUrl(game || {}));
    setError(false);
  }, [game?.name, game?.gameKey, game?.image_url, game?.imageUrl]);

  useEffect(() => {
    if (visible || !deferUntilVisible) return undefined;
    const node = holderRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '180px 0px' }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [deferUntilVisible, visible]);

  if (!visible) {
    return <div ref={holderRef} className={className} aria-hidden />;
  }

  if (!src || error) {
    return (
      <div className={`rounded-lg bg-input flex items-center justify-center text-muted ${className}`}>
        <span className="text-2xl" aria-hidden>
          🎮
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={getGameDisplayName(game) || 'Game'}
      className={className}
      width={width}
      height={height}
      loading={loading}
      decoding={decoding}
      fetchPriority={fetchPriority}
      onError={() => {
        if (src.includes('/optimized/games/')) {
          setSrc(src.replace('/optimized/games/', '/games/'));
          return;
        }
        setError(true);
      }}
    />
  );
}
