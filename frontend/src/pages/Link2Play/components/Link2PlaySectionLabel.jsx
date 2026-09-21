export function Link2PlaySectionLabel({ label, count, muted = false }) {
  return (
    <div className={`l2p-section-label${muted ? ' l2p-section-label--muted' : ''}`}>
      <span>{label}</span>
      {count != null ? <span className="l2p-section-count">{count}</span> : null}
    </div>
  );
}
