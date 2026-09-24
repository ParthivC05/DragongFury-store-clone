import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '../ui/Dialog';
import * as walletApi from '../../api/wallet';

const inputClass = 'dash-input-field w-full';
const inputClassReadonly = `${inputClass} dash-input-field--readonly pr-10`;
const labelClass = 'dash-field-label';

function returnPath(returnTo) {
  if (returnTo === 'deposit') return '/deposit';
  if (returnTo === 'withdraw') return '/redeem';
  return null;
}

function isNoPaymentAccountMessage(message) {
  return String(message || '').toLowerCase().includes('no account found for this email and store code');
}

function LinkPaymentAccountForm({
  onSuccess,
  toast,
  returnTo,
  navigate,
  defaultEmail = '',
  otpOnly = false,
  autoSendOtp = false
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [otp, setOtp] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const autoSendOtpTriedRef = useRef(false);

  useEffect(() => {
    if (!email.trim() && defaultEmail) {
      setEmail(defaultEmail);
    }
  }, [defaultEmail, email]);

  const handleForgotPassword = useCallback(async () => {
    const emailTrim = (email || defaultEmail || '').trim().toLowerCase();
    if (!emailTrim) {
      toast?.error('Please enter your payment email first.');
      return;
    }
    setRequestingOtp(true);
    try {
      const res = await walletApi.requestPaymentAccountPasswordResetOtp(emailTrim);
      if (res?.success === false) {
        if (otpOnly && isNoPaymentAccountMessage(res.message)) {
          const createRes = await walletApi.createPaymentAccount();
          toast?.success(createRes?.message || 'Payment account created. You can continue your deposit.');
          await onSuccess?.();
          return;
        }
        throw new Error(res.message || 'Could not send verification code.');
      }
      setResetEmail(emailTrim);
      setOtp('');
      setResetModalOpen(true);
      toast?.success(res?.message || 'Verification code sent to your email.');
    } catch (err) {
      if (otpOnly && isNoPaymentAccountMessage(err.message)) {
        try {
          const createRes = await walletApi.createPaymentAccount();
          toast?.success(createRes?.message || 'Payment account created. You can continue your deposit.');
          await onSuccess?.();
          return;
        } catch (createErr) {
          toast?.error(createErr.message || 'Could not create payment account.');
          return;
        }
      }
      toast?.error(err.message || 'Could not send verification code.');
    } finally {
      setRequestingOtp(false);
    }
  }, [email, defaultEmail, otpOnly, onSuccess, toast]);

  useEffect(() => {
    if (!autoSendOtp || !otpOnly || autoSendOtpTriedRef.current) return;
    const emailTrim = (email || defaultEmail || '').trim();
    if (!emailTrim) return;
    autoSendOtpTriedRef.current = true;
    handleForgotPassword();
  }, [autoSendOtp, otpOnly, email, defaultEmail, handleForgotPassword]);

  async function handleSubmit(e) {
    e.preventDefault();
    const emailTrim = (email || '').trim();
    if (!emailTrim || !password) {
      toast?.error('Please enter your payment email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await walletApi.linkPaymentAccount(emailTrim, password);
      toast?.success('Payment account linked! You can deposit now.');
      setPassword('');
      await onSuccess?.();
      const path = returnPath(returnTo);
      if (path) navigate(path, { replace: true });
    } catch (err) {
      toast?.error(err.message || 'Could not link account. Check your email and password.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpOnlySubmit(e) {
    e.preventDefault();
    await handleForgotPassword();
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    const emailTrim = (resetEmail || email || '').trim().toLowerCase();
    const otpTrim = (otp || '').trim();
    if (!emailTrim || !otpTrim) {
      toast?.error('Please enter the verification code.');
      return;
    }
    setVerifyingOtp(true);
    try {
      await walletApi.verifyPaymentAccountPasswordResetOtp(emailTrim, otpTrim);
      const res = await walletApi.confirmPaymentAccountPasswordReset(emailTrim);
      toast?.success(otpOnly ? 'Verification successful. You can continue your deposit.' : (res?.message || 'Password reset successful. You can deposit now.'));
      setPassword('');
      setResetModalOpen(false);
      setOtp('');
      await onSuccess?.();
    } catch (err) {
      toast?.error(err.message || 'Could not verify the code.');
    } finally {
      setVerifyingOtp(false);
    }
  }

  return (
    <>
      <form onSubmit={otpOnly ? handleOtpOnlySubmit : handleSubmit} className="dash-payment-link-form">
        <div className={`dash-payment-link-fields${otpOnly ? ' dash-payment-link-fields--single' : ''}`}>
          <div className="min-w-0">
            <label htmlFor="payment-link-email" className={labelClass}>
              Payment email
            </label>
            <input
              id="payment-link-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your payment email"
              className={inputClass}
              autoComplete="off"
            />
          </div>
          {!otpOnly && (
            <div className="min-w-0">
              <div className="dash-payment-password-label-row">
                <label htmlFor="payment-link-password" className={labelClass}>
                  Payment password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={requestingOtp || !email.trim()}
                  className="dash-payment-forgot-link"
                >
                  {requestingOtp ? 'Sending…' : 'Forgot password?'}
                </button>
              </div>
              <input
                id="payment-link-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your payment password"
                className={inputClass}
                autoComplete="new-password"
              />
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={otpOnly ? requestingOtp || !email.trim() : submitting || !email.trim() || !password}
          className="dash-btn-cta dash-payment-link-submit disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {otpOnly
            ? requestingOtp ? 'Sending OTP…' : 'Send OTP'
            : submitting ? 'Linking your account…' : 'Link Payment Account'}
        </button>
      </form>

      <Dialog.Root open={resetModalOpen} onOpenChange={(open) => !verifyingOtp && setResetModalOpen(open)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[10090] dash-chime-modal-backdrop" />
          <Dialog.Content
            className="dash-payment-otp-modal dash-modal fixed left-1/2 top-1/2 z-[10091] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl shadow-xl p-5"
            onEscapeKeyDown={(event) => verifyingOtp && event.preventDefault()}
            onPointerDownOutside={(event) => verifyingOtp && event.preventDefault()}
          >
            <div className="dash-payment-otp-icon" aria-hidden>✉</div>
            <Dialog.Title className="dash-payment-otp-title">Verify your email</Dialog.Title>
            <Dialog.Description className="dash-payment-otp-desc">
              We sent a 6-digit code to <strong>{resetEmail || email}</strong>. Enter it below to connect your payment account and continue your deposit.
            </Dialog.Description>
            <form onSubmit={handleVerifyOtp} className="dash-payment-otp-form">
              <div>
                <label htmlFor="payment-reset-otp" className={labelClass}>
                  Verification code
                </label>
                <input
                  id="payment-reset-otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="dash-payment-otp-input"
                  autoComplete="one-time-code"
                />
                <p className="dash-payment-otp-hint">The code expires in 5 minutes.</p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetModalOpen(false)}
                  disabled={verifyingOtp}
                  className="dash-btn-outline text-sm px-4 py-2.5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifyingOtp || otp.trim().length !== 6}
                  className={`dash-btn-cta dash-payment-otp-submit text-sm px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed${
                    otp.trim().length === 6 ? ' dash-payment-otp-submit--ready' : ''
                  }`}
                >
                  {verifyingOtp ? 'Checking code…' : 'Verify code'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

export function PaymentAccountSection({
  user,
  refreshUser,
  toast,
  returnTo = null,
  sectionId = 'payment-account',
  otpOnly = false,
  forceRelink = false,
  autoSendOtp = false,
}) {
  const navigate = useNavigate();
  const [paymentPasswordRevealed, setPaymentPasswordRevealed] = useState(null);
  const [paymentPasswordLoading, setPaymentPasswordLoading] = useState(false);

  const hasPaymentAccount = user?.hasPaymentAccount === true;

  // When forceRelink is set, always show the link/OTP form even if an account is already
  // linked (used when the stored payment credentials became invalid at the provider).
  if (hasPaymentAccount && !forceRelink) {
    return (
      <section id={sectionId} className="dash-panel dash-payment-panel dash-animate-in min-w-0">
        <div className="dash-payment-panel-body">
          <div className="dash-payment-connected-head">
            <h2 className="dash-panel-title mb-0">Payment Account Connected</h2>
            <span className="dash-settings-linked-badge">Linked</span>
          </div>
          <p className="dash-payment-connected-sub">You&apos;re all set — deposits and withdrawals can use this account.</p>
          <div className="dash-payment-link-fields">
            <div className="min-w-0">
              <label className={labelClass}>Payment email</label>
              <input
                type="text"
                readOnly
                value={user?.paymentEmail ?? ''}
                className={inputClassReadonly}
              />
            </div>
            {user?.paymentAccountCreatedByPlatform ? (
              <div className="min-w-0">
                <label className={labelClass}>Password</label>
                <div className="flex flex-wrap gap-2 items-center">
                  {paymentPasswordRevealed != null ? (
                    <>
                      <input
                        type="text"
                        readOnly
                        value={paymentPasswordRevealed}
                        className={`${inputClassReadonly} flex-1 min-w-[140px] font-mono text-sm`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (paymentPasswordRevealed && navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(paymentPasswordRevealed);
                            toast.success('Password copied.');
                          }
                        }}
                        className="dash-btn-cta text-sm px-4 py-2.5"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentPasswordRevealed(null)}
                        className="dash-btn-outline text-sm px-4 py-2.5"
                      >
                        Hide
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        setPaymentPasswordLoading(true);
                        setPaymentPasswordRevealed(null);
                        try {
                          const res = await walletApi.revealPaymentPassword();
                          setPaymentPasswordRevealed(res?.password ?? null);
                        } catch (err) {
                          toast.error(err.message || 'Could not load password.');
                        } finally {
                          setPaymentPasswordLoading(false);
                        }
                      }}
                      disabled={paymentPasswordLoading}
                      className="dash-btn-cta text-sm px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {paymentPasswordLoading ? 'Loading…' : 'Show password'}
                    </button>
                  )}
                </div>
                <p className="dash-field-hint">This account was created for you at signup. Save your password somewhere safe.</p>
              </div>
            ) : (
              <div className="min-w-0">
                <p className="dash-field-hint m-0">You linked an existing payment account. Your password is not stored here.</p>
              </div>
            )}
          </div>
          {returnPath(returnTo) && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => navigate(returnPath(returnTo), { replace: true })}
                className="dash-btn-cta"
              >
                Continue to {returnTo === 'withdraw' ? 'Withdraw' : 'Deposit'}
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id={sectionId} className="dash-panel dash-payment-panel dash-animate-in min-w-0">
      <div className="dash-payment-panel-body">
        <LinkPaymentAccountForm
          onSuccess={refreshUser}
          toast={toast}
          returnTo={returnTo}
          navigate={navigate}
          defaultEmail={user?.paymentEmail || user?.email || ''}
          otpOnly={otpOnly}
          autoSendOtp={autoSendOtp}
        />

        {!otpOnly && (
        <div className="dash-payment-steps-wrap">
          <p className="dash-payment-steps-heading">How it works</p>
          <ol className="dash-payment-steps" aria-label="How to link your payment account">
            <li className="dash-payment-step">
              <span className="dash-payment-step-num" aria-hidden>1</span>
              <div>
                <strong>{otpOnly ? 'Confirm your payment email' : 'Enter your details above'}</strong>
                <p>
                  {otpOnly
                    ? 'Use the email shown above and request a verification code.'
                    : 'Type your payment email and password in the form at the top of this page.'}
                </p>
              </div>
            </li>
            <li className="dash-payment-step">
              <span className="dash-payment-step-num" aria-hidden>2</span>
              <div>
                <strong>{otpOnly ? 'Verify OTP' : 'Tap Link Payment Account'}</strong>
                <p>{otpOnly ? 'After verification, you can continue your deposit.' : 'Once linked, you can go straight to deposit.'}</p>
              </div>
            </li>
          </ol>
        </div>
        )}
      </div>
    </section>
  );
}
