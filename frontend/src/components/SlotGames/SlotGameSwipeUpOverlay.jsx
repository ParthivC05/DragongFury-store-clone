export function SlotGameSwipeUpOverlay({ onExit }) {
  return (
    <div
      className="sg-swipe-up-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sg-swipe-up-title"
    >
      <div className="sg-swipe-up-overlay__inner">
        <button
          type="button"
          className="sg-swipe-up-exit"
          onClick={onExit}
          onTouchStart={(e) => e.stopPropagation()}
        >
          Exit Full Screen mode
        </button>

        <p className="sg-swipe-up-divider" aria-hidden>
          — Or —
        </p>

        <h2 id="sg-swipe-up-title" className="sg-swipe-up-title">
          Please Swipe Up for Full Screen mode
        </h2>

        <div className="sg-swipe-up-chevron" aria-hidden>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m7 11 5-5 5 5" />
            <path d="m7 18 5-5 5 5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
