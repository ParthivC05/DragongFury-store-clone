/**
 * Non-dismissible mobile overlay for 1GameHub fishing games in portrait.
 * Stays up until the device is rotated to landscape.
 */
export function FishingLandscapeRequiredOverlay() {
  return (
    <div
      className="bona-portrait-gate"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="fishing-landscape-gate-title"
      aria-describedby="fishing-landscape-gate-desc"
    >
      <div className="bona-portrait-gate__inner">
        <div className="bona-portrait-gate__icon" aria-hidden>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="7" width="20" height="10" rx="2" />
            <path d="M18 12h.01" />
          </svg>
        </div>
        <h2 id="fishing-landscape-gate-title" className="bona-portrait-gate__title">
          Rotate to Landscape
        </h2>
        <p id="fishing-landscape-gate-desc" className="bona-portrait-gate__desc">
          This fishing game only works in landscape mode. Please rotate your device to continue playing.
        </p>
      </div>
    </div>
  );
}
