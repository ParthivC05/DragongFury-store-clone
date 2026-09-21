import { useState } from 'react';
import * as phoneApi from '../../api/phone';
import { useToast } from '../../context/ToastContext';
import { PhoneNumberField } from './PhoneNumberField';
import { isCompleteNational, parseE164 } from './phoneCountry';
import { phoneOtpErrorMessage } from '../../utils/phoneOtpErrors';
import './PhoneVerifyGateModal.css';

/**
 * Signup phone OTP step — send + verify before account create.
 */
export function SignupPhoneOtpPanel({
  phone,
  onPhoneChange,
  onVerified,
  disabled = false
}) {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const phoneParts = parseE164(phone);
  const phoneReady = isCompleteNational(phoneParts.countryIso, phoneParts.national);

  const handleSend = async () => {
    if (sending || disabled) return;
    if (!phoneReady) {
      toast.error('Enter a valid 10-digit Phone number.');
      return;
    }
    setSending(true);
    try {
      const res = await phoneApi.sendPhoneOtp(phone.trim());
      onPhoneChange?.(res?.phone || phone.trim());
      setSent(true);
      toast.success('Verification code sent.');
    } catch (err) {
      toast.error(phoneOtpErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async () => {
    if (verifying || disabled) return;
    setVerifying(true);
    try {
      const res = await phoneApi.checkPhoneOtp(phone.trim(), code.trim());
      if (!res?.phoneVerificationToken) {
        toast.error('Verification failed. Please try again.');
        return;
      }
      onPhoneChange?.(res.phone || phone.trim());
      onVerified?.({
        phone: res.phone || phone.trim(),
        phoneVerificationToken: res.phoneVerificationToken
      });
      toast.success('Phone verified.');
    } catch (err) {
      toast.error(err.message || 'Could not verify code.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="signup-phone-otp">
      <label className="phone-gate__label" htmlFor="signup-phone">
        Phone number
      </label>
      <div className="phone-gate__phone-row">
        <PhoneNumberField
          id="signup-phone"
          variant="gate"
          value={phone}
          onChange={(e164) => {
            setSent(false);
            onPhoneChange?.(e164);
          }}
          disabled={disabled || verifying}
        />
      </div>

      {sent ? (
        <>
          <label className="phone-gate__label" htmlFor="signup-otp">
            Verification code
          </label>
          <input
            id="signup-otp"
            className="phone-gate__input"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            disabled={disabled || verifying}
          />
          <button
            type="button"
            className="phone-gate__cta"
            disabled={disabled || verifying || code.length < 4}
            onClick={handleVerify}
          >
            {verifying ? 'Verifying…' : 'Verify & continue'}
          </button>
          <button
            type="button"
            className="phone-gate__cta phone-gate__cta--secondary"
            disabled={disabled || sending}
            onClick={handleSend}
          >
            {sending ? 'Sending…' : 'Resend code'}
          </button>
        </>
      ) : (
        <button
          type="button"
          className="phone-gate__cta"
          disabled={disabled || sending || !phoneReady}
          onClick={handleSend}
        >
          {sending ? 'Sending…' : 'Send verification code'}
        </button>
      )}
    </div>
  );
}
