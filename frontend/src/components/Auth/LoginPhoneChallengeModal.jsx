import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as phoneApi from '../../api/phone';
import { useToast } from '../../context/ToastContext';
import { PhoneNumberField } from './PhoneNumberField';
import { isCompleteNational, parseE164 } from './phoneCountry';
import { phoneOtpErrorMessage } from '../../utils/phoneOtpErrors';
import './auth-dragonfury.css';
import './PhoneVerifyGateModal.css';

/**
 * Login phone OTP challenge — DragonFury email-verify theme.
 * User is NOT logged in until verify succeeds.
 */
export function LoginPhoneChallengeModal({
  open,
  challenge,
  onClose,
  onSuccess
}) {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhone(challenge?.phone || '');
    setCode('');
    setSent(false);
  }, [open, challenge?.phone, challenge?.phoneChallengeToken]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const phoneParts = parseE164(phone);
  const phoneReady = isCompleteNational(phoneParts.countryIso, phoneParts.national);

  const handleSend = useCallback(async () => {
    if (sending || !challenge?.phoneChallengeToken) return;
    if (!phoneReady) {
      toast.error('Enter a valid 10-digit Phone number.');
      return;
    }
    setSending(true);
    try {
      const res = await phoneApi.sendPhoneOtp(phone.trim(), {
        phoneChallengeToken: challenge.phoneChallengeToken
      });
      setPhone(res?.phone || phone.trim());
      setSent(true);
      setCode('');
      toast.success('Verification code sent.');
    } catch (err) {
      toast.error(phoneOtpErrorMessage(err));
    } finally {
      setSending(false);
    }
  }, [challenge?.phoneChallengeToken, phone, phoneReady, sending, toast]);

  const handleEditPhone = useCallback(() => {
    if (sending || verifying) return;
    setSent(false);
    setCode('');
  }, [sending, verifying]);

  const handleVerify = useCallback(async () => {
    if (verifying || !challenge?.phoneChallengeToken) return;
    setVerifying(true);
    try {
      await onSuccess?.({
        phone: phone.trim(),
        code: code.trim(),
        phoneChallengeToken: challenge.phoneChallengeToken
      });
    } catch (err) {
      toast.error(err.message || 'Could not verify code.');
    } finally {
      setVerifying(false);
    }
  }, [challenge?.phoneChallengeToken, code, onSuccess, phone, toast, verifying]);

  if (!open) return null;

  const phoneLocked = sent;

  const modal = (
    <div className="pj-verify-overlay phone-otp-overlay" aria-hidden={false}>
      <div className="pj-verify-wrap phone-otp-wrap">
        <div
          className="pj-verify-modal phone-otp-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-phone-title"
        >
          <div className="pj-corner tl" aria-hidden>
            ♠
          </div>
          <div className="pj-corner tr" aria-hidden>
            ♥
          </div>
          <div className="pj-corner bl" aria-hidden>
            ♦
          </div>
          <div className="pj-corner br" aria-hidden>
            ♣
          </div>
          <div className="pj-shine" aria-hidden />

          <button type="button" className="pj-verify-close dragonfury-close-button" onClick={onClose} aria-label="Close" />

          <div className="pj-verify-body">
            <div className="pj-verify-icon" aria-hidden>
              {sent ? '💬' : '📱'}
            </div>

            <h2 id="login-phone-title" className="pj-verify-title">
              {sent ? 'Enter Verification Code' : 'Phone Verification Required'}
            </h2>

            <div className="pj-verify-status" role="status">
              <p className="pj-verify-status-label">
                {sent ? 'Verification code was sent' : 'Verify your US Phone number'}
              </p>
              <p className="pj-verify-status-text">
                {sent ? (
                  <>
                    We texted a code to finish signing in
                    {challenge?.email ? (
                      <>
                        {' '}
                        for <span className="pj-email-highlight">{challenge.email}</span>
                      </>
                    ) : null}
                    .
                  </>
                ) : (
                  <>
                    Add your Phone number to finish signing in
                    {challenge?.email ? (
                      <>
                        {' '}
                        for <span className="pj-email-highlight">{challenge.email}</span>
                      </>
                    ) : null}
                    .
                  </>
                )}
              </p>

              <div className="phone-otp-fields">
                <label className="phone-otp-label" htmlFor="login-phone-phone">
                  Phone number
                </label>
                <div className="phone-otp-phone-row">
                  <PhoneNumberField
                    id="login-phone-phone"
                    variant="dragonfury"
                    value={phone}
                    onChange={(e164) => {
                      if (phoneLocked) return;
                      setPhone(e164);
                    }}
                    readOnly={phoneLocked}
                    disabled={sending || verifying}
                  />
                  {phoneLocked ? (
                    <button
                      type="button"
                      className="phone-otp-edit"
                      onClick={handleEditPhone}
                      disabled={sending || verifying}
                    >
                      Edit
                    </button>
                  ) : null}
                </div>

                {sent ? (
                  <>
                    <label className="phone-otp-label" htmlFor="login-phone-code">
                      Verification code
                    </label>
                    <input
                      id="login-phone-code"
                      className="phone-otp-code"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="6-digit code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                      disabled={verifying}
                    />
                  </>
                ) : null}
              </div>
            </div>

            {sent ? (
              <>
                <p className="pj-verify-footnote">
                  Didn’t get it? Check your messages, or{' '}
                  <button
                    type="button"
                    className="pj-verify-resend"
                    disabled={sending}
                    onClick={handleSend}
                  >
                    {sending ? 'sending…' : 'resend'}
                  </button>{' '}
                  only if needed.
                </p>
                <button
                  type="button"
                  className={`pj-btn-login${verifying ? ' ld' : ''}`}
                  disabled={verifying || code.length < 4}
                  onClick={handleVerify}
                >
                  <span className="pj-btn-txt">✓ VERIFY & SIGN IN</span>
                  <span className="pj-spin" aria-hidden />
                </button>
              </>
            ) : (
              <>
                <p className="pj-verify-footnote">
                  We’ll text a one-time code to your US number. Standard message rates may apply.
                </p>
                <button
                  type="button"
                  className={`pj-btn-login${sending ? ' ld' : ''}`}
                  disabled={sending || !phoneReady}
                  onClick={handleSend}
                >
                  <span className="pj-btn-txt">SEND CODE</span>
                  <span className="pj-spin" aria-hidden />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
