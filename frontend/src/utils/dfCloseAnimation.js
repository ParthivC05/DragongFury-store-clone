/**
 * Shared close press + modal exit helpers matching live dragonfury.online.
 */

export const DF_CLOSE_ANIM_MS = 220;

/** Start exit animation once, then call onClose after the animation window. */
export function beginAnimatedClose(exiting, setExiting, onClose, ms = DF_CLOSE_ANIM_MS) {
  if (exiting) return;
  setExiting(true);
  window.setTimeout(() => {
    onClose?.();
  }, ms);
}
