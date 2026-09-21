const NAV_OFFSET_PX = 72;
const RETRY_MS = 100;
const MAX_RETRIES = 40;

function getScrollParent(el) {
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = window.getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Smooth-scroll to a page section by element id.
 * Uses .dash-main when Orionstars-style split scroll is active.
 */
export function scrollToSectionById(id, { offset = 16, behavior = 'smooth' } = {}) {
  if (!id) return;

  const scroll = () => {
    const el = document.getElementById(id);
    if (!el) return false;

    const scroller = el.closest('.dash-main') || getScrollParent(el);
    if (scroller) {
      const scrollerTop = scroller.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      const nextTop = scroller.scrollTop + (elTop - scrollerTop) - offset;
      scroller.scrollTo({ top: Math.max(0, nextTop), behavior });
      return true;
    }

    const top =
      el.getBoundingClientRect().top +
      (window.scrollY || document.documentElement.scrollTop) -
      NAV_OFFSET_PX;
    window.scrollTo({ top: Math.max(0, top), behavior });
    return true;
  };

  if (scroll()) return;

  let attempts = 0;
  const idTimer = window.setInterval(() => {
    attempts += 1;
    if (scroll() || attempts >= MAX_RETRIES) {
      window.clearInterval(idTimer);
    }
  }, RETRY_MS);
}

/**
 * Scroll the home page to the Games section title (#games).
 * Retries while lazy-loaded content mounts.
 */
export function scrollToGamesSection() {
  scrollToSectionById('games', { offset: 16 });
}
