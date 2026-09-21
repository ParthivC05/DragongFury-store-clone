import { GameCardSkeleton } from '../Games/GameCardSkeleton';

export function GamesGridSkeleton({ count = 6, threeColumns = true }) {
  const gridClass = `dash-games-grid${threeColumns ? ' dash-games-grid--3' : ''}`;
  return (
    <div className={gridClass} aria-busy="true" aria-label="Loading games">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="dash-game-wrap dash-skeleton-wrap"
          style={{ '--dash-skel-delay': `${i * 0.08}s` }}
        >
          <GameCardSkeleton />
        </div>
      ))}
    </div>
  );
}
