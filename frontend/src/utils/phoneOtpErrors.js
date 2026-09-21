/** User-facing message when Didit blocks a send (often VoIP / temp numbers). */
export const OTP_BLOCKED_MESSAGE =
  'Temporary or virtual numbers are not allowed. Please use a real mobile number.';

export function phoneOtpErrorMessage(err, fallback = 'Could not send code.') {
  if (err?.code === 'OTP_BLOCKED' || err?.body?.code === 'OTP_BLOCKED') {
    return OTP_BLOCKED_MESSAGE;
  }
  return err?.message || fallback;
}
