/** Skeleton placeholder matching dashboard game card layout. */
export function GameCardSkeleton() {
  return (
    <article className="dash-game-card dash-skeleton-game" aria-hidden>
      <div className="dash-gc-inner">
        <div className="dash-skeleton-header">
          <div className="dash-skeleton-thumb" />
          <div className="dash-skeleton-lines">
            <div className="dash-skeleton-line dash-skeleton-line-sm" />
            <div className="dash-skeleton-line dash-skeleton-line-lg" />
            <div className="dash-skeleton-line dash-skeleton-line-md" />
          </div>
        </div>
        <div className="dash-skeleton-actions">
          <div className="dash-skeleton-btn" />
          <div className="dash-skeleton-btn dash-skeleton-btn-sm" />
        </div>
      </div>
    </article>
  );
}
