import { memo } from 'react';
import { Link2PlaySectionLabel } from './Link2PlaySectionLabel';
import { Link2PlayGameCard } from './Link2PlayGameCard';

export const Link2PlayGameList = memo(function Link2PlayGameList({
  label,
  count,
  games,
  mutedCount = false,
  emptyMessage = null,
  priorityCount = 0,
}) {
  if (!games?.length) {
    if (!emptyMessage) return null;
    return (
      <section className="l2p-section" aria-label={label}>
        <Link2PlaySectionLabel label={label} count={0} muted={mutedCount} />
        <p className="l2p-empty" role="status">
          {emptyMessage}
        </p>
      </section>
    );
  }

  return (
    <section className="l2p-section" aria-label={label}>
      <Link2PlaySectionLabel label={label} count={count ?? games.length} muted={mutedCount} />
      <div className="l2p-list" role="list">
        {games.map((game, index) => (
          <div key={game.id} className="l2p-list-item" role="listitem">
            <Link2PlayGameCard game={game} priority={index < priorityCount} />
          </div>
        ))}
      </div>
    </section>
  );
});
