import { openSupportWidget } from '../intercomApi';

/**
 * Floating Help launcher — opens themed Help Desk / chat modal (matches live).
 */
export function DragonFuryHelpLauncher() {
  return (
    <button
      type="button"
      className="df-help-launcher"
      aria-label="Help"
      aria-haspopup="dialog"
      onClick={openSupportWidget}
    >
      <span className="df-help-launcher__mark" aria-hidden>
        ?
      </span>
      <span className="df-help-launcher__label">Help</span>
    </button>
  );
}
