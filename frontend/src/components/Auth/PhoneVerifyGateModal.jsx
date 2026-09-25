import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import * as phoneApi from '../../api/phone';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PhoneNumberField } from './PhoneNumberField';
import { isCompleteNational, parseE164 } from './phoneCountry';
import { phoneOtpErrorMessage } from '../../utils/phoneOtpErrors';
import { notifyDepositEligibilityChanged } from '../../utils/depositRequired';
import './auth-dragonfury.css';
import './PhoneVerifyGateModal.css';

/**
 * Phone OTP gate modal.
 * - Deposit / closable: pass `onClose` for X button; user can dismiss and retry later.
 * - Forced gate: omit `onClose` to keep logout-only exit.
 */
export function PhoneVerifyGateModal({ open, onClose, onVerified }) {
  const { user, refreshUser, refreshBalance, logout, patchUser } = useAuth();
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const closable = typeof onClose === 'function';

  const finishVerified = useCallback(() => {
    try {
      window.dispatchEvent(new Event('wallet:refresh'));
    } catch {
      /* ignore */
    }
    refreshBalance?.().catch(() => {});
    notifyDepositEligibilityChanged();
    onVerified?.();
    if (closable) onClose?.();
  }, [closable, onClose, onVerified, refreshBalance]);

  useEffect(() => {
    if (!open) return;
    setPhone(user?.phone || '');
    setCode('');
    setSent(false);
  }, [open, user?.phone, user?.userId]);

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
    if (sending) return;
    if (!phoneReady) {
      toast.error('Enter a valid 10-digit Phone number.');
      return;
    }
    setSending(true);
    try {
      const res = await phoneApi.sendPhoneOtp(phone.trim());
      if (res?.skipped || res?.required === false) {
        finishVerified();
        return;
      }
      setPhone(res?.phone || phone.trim());
      setSent(true);
      setCode('');
      toast.success('Verification code sent.');
    } catch (err) {
      if (err?.code === 'PHONE_NOT_REQUIRED' || err?.body?.code === 'PHONE_NOT_REQUIRED') {
        finishVerified();
        return;
      }
      toast.error(phoneOtpErrorMessage(err));
    } finally {
      setSending(false);
    }
  }, [finishVerified, phone, phoneReady, sending, toast]);

  const handleEditPhone = useCallback(() => {
    if (sending || verifying) return;
    setSent(false);
    setCode('');
  }, [sending, verifying]);

  const handleVerify = useCallback(async () => {
    if (verifying) return;
    setVerifying(true);
    try {
      const verifiedPhone = phone.trim();
      const res = await phoneApi.checkPhoneOtp(verifiedPhone, code.trim());
      if (res?.skipped || res?.required === false) {
        finishVerified();
        return;
      }
      // Optimistically clear the purchase gate before refreshUser finishes.
      patchUser?.({
        phone: verifiedPhone,
        isPhoneVerified: true,
        phoneVerificationRequired: false,
        phoneVerification: {
          required: true,
          verified: true,
          needsVerification: false,
          phone: verifiedPhone
        }
      });
      finishVerified();
      toast.success('Phone verified.');
      refreshUser?.().catch(() => {});
    } catch (err) {
      if (err?.code === 'PHONE_NOT_REQUIRED' || err?.body?.code === 'PHONE_NOT_REQUIRED') {
        finishVerified();
        return;
      }
      toast.error(err.message || 'Could not verify code.');
    } finally {
      setVerifying(false);
    }
  }, [code, finishVerified, patchUser, phone, refreshUser, toast, verifying]);

  if (!open) return null;

  const phoneLocked = sent;

  const modal = (
    <div className="pj-verify-overlay phone-otp-overlay">
      <div className="pj-verify-wrap phone-otp-wrap">
        <div
          className="pj-verify-modal phone-otp-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="phone-gate-title"
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

          {closable ? (
            <button type="button" className="pj-verify-close dragonfury-close-button" onClick={onClose} aria-label="Close" />
          ) : null}

          <div className="pj-verify-body">
            <div className="pj-verify-icon" aria-hidden>
              {sent ? '💬' : '📱'}
            </div>

            <h2 id="phone-gate-title" className="pj-verify-title">
              {sent ? 'Enter Verification Code' : 'Phone Verification Required'}
            </h2>

            <div className="pj-verify-status" role="status">
              <p className="pj-verify-status-label">
                {sent ? 'Verification code was sent' : 'Verify your US Phone number'}
              </p>
              <p className="pj-verify-status-text">
                {sent
                  ? 'Enter the SMS code we sent to secure your account.'
                  : 'Confirm your Phone number once. We’ll text you a short code.'}
              </p>

              <div className="phone-otp-fields">
                <label className="phone-otp-label" htmlFor="phone-gate-phone">
                  Phone number
                </label>
                <div className="phone-otp-phone-row">
                  <PhoneNumberField
                    id="phone-gate-phone"
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
                    <label className="phone-otp-label" htmlFor="phone-gate-code">
                      Verification code
                    </label>
                    <input
                      id="phone-gate-code"
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
                  <span className="pj-btn-txt">✓ VERIFY PHONE</span>
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

            {closable ? (
              <button type="button" className="phone-otp-logout" onClick={onClose}>
                Close
              </button>
            ) : (
              <button type="button" className="phone-otp-logout" onClick={() => logout?.()}>
                Sign out
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
