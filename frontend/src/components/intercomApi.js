import { useEffect } from 'react';

export const OPEN_INTERCOM_EVENT = 'dragonfury:intercom-open';
export const OPEN_SUPPORT_WIDGET_EVENT = 'dragonfury:support-open';
export const SHOW_INTERCOM_LAUNCHER_EVENT = 'dragonfury:intercom-show-launcher';

let pendingChatOpen = false;
let pendingSupportOpen = false;

export function consumePendingChatOpen() {
  const value = pendingChatOpen;
  pendingChatOpen = false;
  return value;
}

export function consumePendingSupportOpen() {
  const value = pendingSupportOpen;
  pendingSupportOpen = false;
  return value;
}

export function showIntercomLauncher() {
  document.body.classList.remove('hide-intercom-launcher');
  window.dispatchEvent(new CustomEvent(SHOW_INTERCOM_LAUNCHER_EVENT));
}

/** Open Intercom messenger directly (Messages). */
export function openIntercomChat() {
  pendingChatOpen = true;
  document.body.classList.remove('hide-intercom-launcher');
  window.dispatchEvent(new CustomEvent(OPEN_INTERCOM_EVENT));
}

/** Open the custom Support panel first (sidebar / footer entry point). */
export function openSupportWidget() {
  pendingSupportOpen = true;
  window.dispatchEvent(new CustomEvent(OPEN_SUPPORT_WIDGET_EVENT));
}

export function useHideIntercomForGameTransferModal(open) {
  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('game-transfer-modal-open');
    return () => {
      document.body.classList.remove('game-transfer-modal-open');
      showIntercomLauncher();
    };
  }, [open]);
}
