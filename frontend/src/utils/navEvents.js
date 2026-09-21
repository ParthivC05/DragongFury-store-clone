/** Cross-component nav events (BottomBar drawer, page headers, etc.). */
export const OPEN_MOBILE_MENU_EVENT = 'dragonfury:open-mobile-menu';

export function openMobileMenu() {
  window.dispatchEvent(new CustomEvent(OPEN_MOBILE_MENU_EVENT));
}
