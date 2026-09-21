import { DEVICE_SIGNUP_BLOCKED_MESSAGE } from '../fingerprint/client';

export const DEVICE_SIGNUP_ERROR_CODE = 'DEVICE_ALREADY_REGISTERED';

export function isDeviceSignupBlockedError(error) {
  const code = typeof error?.code === 'string' ? error.code : error?.body?.code;
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return (
    code === DEVICE_SIGNUP_ERROR_CODE ||
    message.includes('only one account is allowed per device') ||
    message.includes('already been created on this device')
  );
}

export function isDeviceBlockQueryError(errorCode) {
  return errorCode === 'device_already_registered';
}

export function extractRegisteredEmailFromError(error) {
  const email =
    error?.registeredEmail ||
    error?.body?.registeredEmail ||
    error?.body?.data?.registeredEmail ||
    error?.data?.registeredEmail;
  return typeof email === 'string' ? email.trim() : '';
}

export function getDeviceSignupBlockedMessage(error) {
  if (typeof error?.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return DEVICE_SIGNUP_BLOCKED_MESSAGE;
}
