import { extractRegisteredEmailFromError, isDeviceSignupBlockedError } from './deviceSignupErrors';

export const DEVICE_SIGNUP_BLOCKED_EVENT = 'dragonfury:device-signup-blocked';

let pendingDetail = null;

function normalizeDetail({ registeredEmail } = {}) {
  return {
    registeredEmail: typeof registeredEmail === 'string' ? registeredEmail.trim() : ''
  };
}

export function showDeviceBlockModal({ registeredEmail } = {}) {
  if (typeof window === 'undefined') return;

  const detail = normalizeDetail({ registeredEmail });
  pendingDetail = detail;

  window.dispatchEvent(
    new CustomEvent(DEVICE_SIGNUP_BLOCKED_EVENT, {
      detail
    })
  );
}

export function consumePendingDeviceBlockModal() {
  const detail = pendingDetail;
  pendingDetail = null;
  return detail;
}

export function handleDeviceSignupBlockedError(error) {
  if (!isDeviceSignupBlockedError(error)) return false;
  showDeviceBlockModal({
    registeredEmail: extractRegisteredEmailFromError(error)
  });
  return true;
}
