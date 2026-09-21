export const DEPOSIT_REQUIRED_CODE = 'DEPOSIT_REQUIRED';
export const PHONE_VERIFY_REQUIRED_CODE = 'PHONE_VERIFY_REQUIRED';
export const DEPOSIT_ELIGIBILITY_CHANGED_EVENT = 'deposit:eligibility-changed';

export function isDepositRequiredError(err) {
  const code = err?.body?.code || err?.code;
  return code === DEPOSIT_REQUIRED_CODE || code === PHONE_VERIFY_REQUIRED_CODE;
}

/** Call after a wallet deposit completes so play gates unlock without waiting on cache TTL. */
export function notifyDepositEligibilityChanged() {
  try {
    window.dispatchEvent(new Event(DEPOSIT_ELIGIBILITY_CHANGED_EVENT));
  } catch {
    void 0;
  }
}
