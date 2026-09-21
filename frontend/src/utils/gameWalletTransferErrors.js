/** Pass through API redeem min-balance messages (percentage is dynamic per store). */
export function formatRedeemMinimumBalanceAlertMessage(message) {
  return message;
}

/** Never surface timeout / rate-limit / transport wording on topup/redeem. */
export function isSilentGameWalletTransferError(error) {
  if (!error) return false;
  const status = Number(error.status);
  if (status === 429 || status === 408 || status === 504) return true;
  const msg = String(error.message || '').trim().toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('timeout')
    || msg.includes('timed out')
    || msg.includes('econnaborted')
    || msg.includes('etimedout')
    || msg.includes('rate limit')
    || msg.includes('too many request')
    || msg.includes('too many attempts')
    || msg.includes('checked too often')
    || msg.includes('try again later')
    || msg.includes('please wait a few minutes')
  );
}

/**
 * Game topup/redeem errors: the UI intentionally hides most bot failures (manual mode).
 * For user-action / validation messages (e.g. Wager Bonus opt-in), we must show the server text.
 * @param {Error & { status?: number }} error
 * @returns {boolean}
 */
export function shouldToastGameWalletTransferMessage(error) {
  if (!error || !error.message) return false;
  if (isSilentGameWalletTransferError(error)) return false;
  const msg = String(error.message).trim();
  if (!msg) return false;
  const status = error.status;
  const lower = msg.toLowerCase();
  if (status === 400) return true;
  if (
    lower.includes('wager bonus program') ||
    lower.includes('midnight party program') ||
    (lower.includes('deposit again') && lower.includes('selecting')) ||
    lower.includes('player is still in the game') ||
    lower.includes('return to the game lobby') ||
    (lower.includes('customer is playing') &&
      (lower.includes('can not purchase') || lower.includes('cannot purchase'))) ||
    (lower.includes('drawer') &&
      (lower.includes('initial amount') ||
        lower.includes('must filled') ||
        lower.includes('must be filled')))
  ) {
    return true;
  }
  return false;
}
