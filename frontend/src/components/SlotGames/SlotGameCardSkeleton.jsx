export function SlotGameCardSkeleton() {
  return (
    <article className="dash-slot-game-card dash-slot-game-card--skeleton" aria-hidden>
      <div className="dash-slot-game-card-art dash-skeleton-thumb" />
      <div className="dash-slot-game-card-footer">
        <div className="dash-skeleton-line dash-skeleton-line-lg" />
        <div className="dash-skeleton-line dash-skeleton-line-sm" />
      </div>
    </article>
  );
}
