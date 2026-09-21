import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { showIntercomLauncher } from '../intercomApi';
import { formatSc } from '../../utils/currency';
import { ChimeLogoHeader } from '../payment/ChimeLogo';
import './ChimeDepositModal.css';

/**
 * Modal: guided Chime deposit — amount, QR / pay-to tag, sender username, submit.
 */
export function ChimeDepositModal({
  open,
  onClose,
  currency,
  depositMin,
  amountNum,
  submitting,
  onSubmit,
  destinationUsername,
  destinationQrUrl,
  destinationAppLink,
  destinationLoading,
  destinationError,
  /** When true, close/back are hidden until onboarding allows dismiss (submit success or skip tutorial). */
  closeDisabled = false,
  /** Stack above onboarding overlay (z-[100]) so the modal stays interactive during the tour. */
  elevateForOnboarding = false
}) {
  const [username, setUsername] = useState('');
  const [payToCopied, setPayToCopied] = useState(false);
  const [amountCopied, setAmountCopied] = useState(false);
  /** 1 = send payment, 2 = username, 3 = submit */
  const [activeStep, setActiveStep] = useState(1);
  const [step1Done, setStep1Done] = useState(false);
  /** True after username stayed non-empty for 3s without further edits. */
  const [step2Complete, setStep2Complete] = useState(false);
  /** Reminder after Open Chime App / Copy: come back and tap Next. */
  const [comeBackNoticeOpen, setComeBackNoticeOpen] = useState(false);
  const [comeBackNoticeKind, setComeBackNoticeKind] = useState('copy'); // 'copy' | 'open'
  const copyBtnRef = useRef(null);
  const nameInputRef = useRef(null);
  const step3Ref = useRef(null);
  const step2Ref = useRef(null);
  const step2AdvanceTimerRef = useRef(null);

  const hasQr = !!(destinationQrUrl || '').trim();
  const amountLabel = formatSc(amountNum);
  const payTo = (destinationUsername || '').trim();

  const focusCopy = useCallback(() => {
    window.requestAnimationFrame(() => {
      copyBtnRef.current?.focus?.();
    });
  }, []);

  const completeStep1 = useCallback(() => {
    setStep1Done(true);
    setActiveStep(2);
    window.requestAnimationFrame(() => {
      step2Ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      nameInputRef.current?.focus?.();
    });
  }, []);

  /** Next advances to step 2 (username). */
  const goToStep2 = useCallback(() => {
    setComeBackNoticeOpen(false);
    completeStep1();
  }, [completeStep1]);

  useEffect(() => {
    if (open) {
      setUsername('');
      setActiveStep(1);
      setStep1Done(false);
      setStep2Complete(false);
      setAmountCopied(false);
      setPayToCopied(false);
      setComeBackNoticeOpen(false);
      setComeBackNoticeKind('copy');
    }
    return () => {
      if (step2AdvanceTimerRef.current) {
        window.clearTimeout(step2AdvanceTimerRef.current);
        step2AdvanceTimerRef.current = null;
      }
    };
  }, [open]);

  // Hide the Intercom launcher while the modal is open so it doesn't overlap the modal.
  useEffect(() => {
    if (!open) return undefined;
    document.body.classList.add('hide-intercom-launcher');
    return () => {
      document.body.classList.remove('hide-intercom-launcher');
      showIntercomLauncher();
    };
  }, [open]);

  useEffect(() => {
    setPayToCopied(false);
  }, [destinationUsername, open]);

  /** During onboarding: focus copy when pay-to loads; focus name field after copy step. */
  useEffect(() => {
    if (!open || !elevateForOnboarding) return;
    const onCopyStep = () => focusCopy();
    const onFormStep = () => {
      completeStep1();
      window.requestAnimationFrame(() => nameInputRef.current?.focus?.());
    };
    window.addEventListener('onboarding:chime-focus-copy', onCopyStep);
    window.addEventListener('onboarding:chime-focus-form', onFormStep);
    return () => {
      window.removeEventListener('onboarding:chime-focus-copy', onCopyStep);
      window.removeEventListener('onboarding:chime-focus-form', onFormStep);
    };
  }, [open, elevateForOnboarding, focusCopy, completeStep1]);

  useEffect(() => {
    if (!open || !elevateForOnboarding || !destinationUsername || destinationLoading || destinationError) return;
    focusCopy();
  }, [open, elevateForOnboarding, destinationUsername, destinationLoading, destinationError, focusCopy]);

  const trimmedUsername = (username || '').trim();
  const usernameOk = trimmedUsername.length >= 1;
  const step3Unlocked = step1Done && usernameOk;

  /** After username is entered, wait 3s (resetting on each keystroke), then focus step 3. */
  useEffect(() => {
    if (step2AdvanceTimerRef.current) {
      window.clearTimeout(step2AdvanceTimerRef.current);
      step2AdvanceTimerRef.current = null;
    }

    if (!step1Done || !usernameOk) {
      setStep2Complete(false);
      if (step1Done) setActiveStep(2);
      return undefined;
    }

    setStep2Complete(false);
    setActiveStep(2);

    step2AdvanceTimerRef.current = window.setTimeout(() => {
      step2AdvanceTimerRef.current = null;
      setStep2Complete(true);
      setActiveStep(3);
      window.requestAnimationFrame(() => {
        step3Ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      });
    }, 3000);

    return () => {
      if (step2AdvanceTimerRef.current) {
        window.clearTimeout(step2AdvanceTimerRef.current);
        step2AdvanceTimerRef.current = null;
      }
    };
  }, [step1Done, username, usernameOk]);

  /** Enable only after step 2 has advanced (3s debounce). Amount was already validated before the modal opened. */
  const canSubmit =
    step2Complete &&
    usernameOk &&
    Number.isFinite(Number(amountNum)) &&
    Number(amountNum) > 0 &&
    !submitting &&
    !destinationLoading &&
    !destinationError &&
    !!payTo;

  const banner = useMemo(() => {
    if (step2Complete) {
      return {
        num: '3',
        text: 'Tap Submit request below',
        sub: 'Almost done — this sends your info to staff'
      };
    }
    if (step1Done) {
      return {
        num: '2',
        text: 'Type the Chime name you sent from',
        sub: 'This lets staff match your payment to your account'
      };
    }
    return {
      num: '1',
      text: hasQr
        ? `Send $${amountLabel} using the QR code below`
        : `Send $${amountLabel} to the Chime tag below`,
      sub: hasQr
        ? 'Tap the green button or scan the code with Chime'
        : 'Copy the Chime tag and send the exact amount'
    };
  }, [step2Complete, step1Done, amountLabel, hasQr]);

  const copyAmount = () => {
    const text = String(amountNum);
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setAmountCopied(true);
        window.setTimeout(() => setAmountCopied(false), 2500);
      })
      .catch(() => {});
  };

  const showComeBackNotice = useCallback((kind) => {
    setComeBackNoticeKind(kind);
    setComeBackNoticeOpen(true);
  }, []);

  const dismissComeBackNotice = useCallback(() => {
    const link = (destinationAppLink || '').trim();
    if (comeBackNoticeKind === 'open' && link) {
      window.open(link, '_blank', 'noopener,noreferrer');
    }
    setComeBackNoticeOpen(false);
    completeStep1();
  }, [comeBackNoticeKind, destinationAppLink, completeStep1]);

  const copyTag = () => {
    if (!payTo) return;

    const afterCopy = () => {
      showComeBackNotice('copy');
    };

    if (!navigator.clipboard?.writeText) {
      afterCopy();
      return;
    }

    navigator.clipboard
      .writeText(payTo)
      .then(() => {
        setPayToCopied(true);
        window.setTimeout(() => setPayToCopied(false), 2000);
        try {
          window.dispatchEvent(new CustomEvent('onboarding:chime-copy-done'));
        } catch (_) {}
        afterCopy();
      })
      .catch(() => {
        afterCopy();
      });
  };

  const handleOpenApp = () => {
    showComeBackNotice('open');
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const raw = (username || '').trim().replace(/^\$+/, '');
    onSubmit({
      sourceUsername: raw ? `$${raw}` : '',
      destinationUsername: payTo
    });
  };

  if (!open) return null;

  const shellZ = elevateForOnboarding ? 'z-[10050]' : 'z-[10080]';
  const step1State = step1Done ? 'done' : 'active';
  const step2State = !step1Done ? 'locked' : step2Complete ? 'done' : 'active';
  const step3State = !step3Unlocked ? 'locked' : step2Complete ? 'active' : 'ready';

  return createPortal(
    <div
      className={`dash-chime-modal-root fixed inset-0 ${shellZ} flex items-start justify-center p-4 dash-chime-modal-backdrop overflow-y-auto${
        elevateForOnboarding ? ' dash-chime-modal-root--onboarding' : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Chime Deposit"
    >
      <div className={`dash-chime-modal-shell${elevateForOnboarding ? ' shrink-0 md:my-auto' : ''}`}>
        {!elevateForOnboarding && (
          <div className="dash-chime-guide-banner" id="chime-guide-banner">
            <div className="dash-chime-guide-dot" aria-hidden>
              {banner.num}
            </div>
            <p className="dash-chime-guide-text">
              {banner.text}
              <span className="dash-chime-guide-sub">{banner.sub}</span>
            </p>
          </div>
        )}

        <div className="dash-chime-progress" aria-hidden>
          <div className={`dash-chime-progress-seg${step1Done ? ' done' : ' active'}`}>
            <div className="dash-chime-progress-fill" />
          </div>
          <div className={`dash-chime-progress-seg${step2Complete ? ' done' : ''}${step1Done && !step2Complete ? ' active' : ''}`}>
            <div className="dash-chime-progress-fill" />
          </div>
          <div className={`dash-chime-progress-seg${step2Complete ? ' active' : ''}`}>
            <div className="dash-chime-progress-fill" />
          </div>
        </div>

        <div className="dash-chime-modal-card">
          <header className="dash-chime-modal-header">
            <div className="dash-chime-modal-header-main">
              <ChimeLogoHeader className="dash-chime-modal-logo" />
              <h2 id="chime-deposit-modal-title" className="sr-only">
                Chime Deposit
              </h2>
            </div>
            {!closeDisabled && (
              <button type="button" onClick={onClose} className="dash-chime-modal-header-close">
                Close
              </button>
            )}
          </header>

          <div className="dash-chime-modal-body">
            {destinationLoading ? (
              <p className="dash-chime-payto-status">Loading pay-to account…</p>
            ) : destinationError ? (
              <p className="dash-chime-payto-error">{destinationError}</p>
            ) : (
              <>
                <section className="dash-chime-amount-card">
                  <div className="dash-chime-amount-card-label">Amount to send</div>
                  <div className="dash-chime-amount-card-amt">${amountLabel}</div>
                  <div className="dash-chime-amount-card-warn">
                    Send this exact amount, or the package deal won&apos;t apply.
                  </div>
                  <button
                    type="button"
                    className={`dash-chime-copy-amt${amountCopied ? ' copied' : ''}`}
                    onClick={copyAmount}
                  >
                    {amountCopied ? '✓ Copied — now paste it in Chime' : 'Copy amount'}
                  </button>
                </section>

                {/* STEP 1 */}
                <section className={`dash-chime-step ${step1State}`} id="chime-step-1">
                  <div className="dash-chime-step-head">
                    <div className="dash-chime-step-num" aria-hidden>
                      1
                    </div>
                    <div>
                      <div className="dash-chime-step-title">Send the payment</div>
                      <div className="dash-chime-step-sub">
                        {hasQr
                          ? 'Scan the QR with your Chime app, or tap the button'
                          : 'Copy the tag below and send from your Chime app'}
                      </div>
                    </div>
                  </div>

                  {hasQr ? (
                    <div className="dash-chime-qr-wrap">
                      <img src={destinationQrUrl} alt="Chime deposit QR code" className="dash-chime-qr-image" />
                    </div>
                  ) : null}

                  <button type="button" className="dash-chime-btn-green" onClick={handleOpenApp}>
                    {destinationAppLink || hasQr ? 'Open Chime App' : "I've opened Chime"}
                  </button>

                  <div className="dash-chime-tag-row">
                    <div className="dash-chime-tag-value">{payTo || '—'}</div>
                    {payTo ? (
                      <button
                        ref={copyBtnRef}
                        type="button"
                        className="onboarding-chime-copy-btn dash-chime-tag-copy"
                        onClick={copyTag}
                        title={payToCopied ? 'Copied' : 'Copy Chime tag'}
                        aria-label={payToCopied ? 'Copied to clipboard' : 'Copy Chime tag to clipboard'}
                      >
                        {payToCopied ? '✓' : 'Copy'}
                      </button>
                    ) : null}
                  </div>

                  {!step1Done ? (
                    <div className="dash-chime-step-next-wrap">
                      <button
                        type="button"
                        className="dash-chime-btn-next"
                        onClick={goToStep2}
                        disabled={destinationLoading || !!destinationError || !payTo}
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </section>

                {/* STEP 2 */}
                <section ref={step2Ref} className={`dash-chime-step ${step2State}`} id="chime-step-2">
                  <div className="dash-chime-step-head">
                    <div className="dash-chime-step-num" aria-hidden>
                      2
                    </div>
                    <div>
                      <div className="dash-chime-step-title">Type your Chime username</div>
                      <div className="dash-chime-step-sub">
                        The name you just paid FROM — not your Chime tag
                      </div>
                    </div>
                  </div>
                  <div
                    className={`dash-chime-username-field dash-chime-username-field--prefixed dash-chime-uname-wrap${!step1Done ? ' is-disabled' : ''}`}
                  >
                    <span className="dash-chime-username-prefix" aria-hidden>
                      $
                    </span>
                    <input
                      ref={nameInputRef}
                      id="chime-source-username"
                      type="text"
                      autoComplete="off"
                      placeholder="e.g. Suddi"
                      value={username}
                      disabled={!step1Done}
                      onChange={(e) => {
                        setUsername(e.target.value.replace(/^\$+/, ''));
                        try {
                          window.dispatchEvent(new CustomEvent('onboarding:chime-name-input'));
                        } catch (_) {}
                      }}
                      className="onboarding-chime-name-input dash-chime-uname"
                      aria-label="Chime username"
                    />
                  </div>
                  <p className="dash-chime-hint">Use the exact spelling so staff can match your payment.</p>
                  {step2Complete ? <p className="dash-chime-check">✓ Looks good</p> : null}
                </section>

                {/* STEP 3 */}
                <section ref={step3Ref} className={`dash-chime-step ${step3State}`} id="chime-step-3">
                  <div className="dash-chime-step-head">
                    <div className="dash-chime-step-num" aria-hidden>
                      3
                    </div>
                    <div>
                      <div className="dash-chime-step-title">Submit your request</div>
                      <div className="dash-chime-step-sub">Staff will confirm your deposit shortly after</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!canSubmit}
                    className={`onboarding-chime-submit dash-chime-submit${canSubmit ? ' ready' : ''}`}
                    onClick={handleSubmit}
                  >
                    {submitting ? 'Submitting…' : 'Submit request'}
                  </button>
                </section>
              </>
            )}

            {!closeDisabled && (
              <div className="dash-chime-footer-link">
                <button type="button" onClick={onClose} className="dash-chime-back-link">
                  Back
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {comeBackNoticeOpen ? (
        <div
          className="dash-chime-comeback-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="chime-comeback-title"
        >
          <div className="dash-chime-comeback-card">
            <h3 id="chime-comeback-title" className="dash-chime-comeback-title">
              {comeBackNoticeKind === 'open' ? 'Before you continue' : 'Tag copied'}
            </h3>
            <p className="dash-chime-comeback-text">
              {comeBackNoticeKind === 'open'
                ? 'Complete your payment in Chime, then come back here to continue. Tap Got it to open Chime.'
                : 'Complete your payment in Chime, then come back here and tap Got it to continue.'}
            </p>
            <button
              type="button"
              className="dash-chime-comeback-btn"
              onClick={dismissComeBackNotice}
            >
              Got it
            </button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}

/** Enable submit as soon as the user has entered any non-empty text. */
function usernameEntered(u) {
  return (u || '').trim().length >= 1;
}
