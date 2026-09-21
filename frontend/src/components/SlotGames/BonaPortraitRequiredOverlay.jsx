/**
 * Non-dismissible mobile overlay for Bona games in landscape.
 * Stays up until the device is rotated back to portrait.
 */
export function BonaPortraitRequiredOverlay() {
  return (
    <div
      className="bona-portrait-gate"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="bona-portrait-gate-title"
      aria-describedby="bona-portrait-gate-desc"
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
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M12 18h.01" />
          </svg>
        </div>
        <h2 id="bona-portrait-gate-title" className="bona-portrait-gate__title">
          Rotate to Portrait
        </h2>
        <p id="bona-portrait-gate-desc" className="bona-portrait-gate__desc">
          This game only works in portrait mode. Please rotate your device to continue playing.
        </p>
      </div>
    </div>
  );
}
