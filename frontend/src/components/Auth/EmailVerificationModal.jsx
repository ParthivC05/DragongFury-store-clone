import * as Dialog from '../ui/Dialog';
import './auth-dragonfury.css';

/**
 * Shown after signup PENDING_VERIFICATION or login EMAIL_VERIFICATION_PENDING.
 * Stacked above the DragonFury auth overlay (z-index 120).
 */
export function EmailVerificationModal({ open, email, onClose, onResend, resendLoading }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="pj-verify-overlay df-verify-overlay" />
        <div className="pj-verify-wrap df-verify-wrap">
          <Dialog.Content
            className="pj-verify-modal df-verify-modal"
            onEscapeKeyDown={onClose}
            onPointerDownOutside={onClose}
          >
            <button
              type="button"
              className="pj-verify-close df-verify-close dragonfury-close-button"
              aria-label="Close"
              onClick={onClose}
            >
              <img src="/df-online/wallet-close.webp" alt="" width={44} height={44} draggable={false} />
            </button>

            <div className="pj-verify-body df-verify-body">
              <span className="df-verify-badge">Verify email</span>
              <Dialog.Title className="pj-verify-title df-verify-title">
                Email Verification Required
              </Dialog.Title>

              <div className="pj-verify-status df-verify-status" role="status" aria-live="polite">
                <p className="pj-verify-status-label">Verification email was sent</p>
                <p className="pj-verify-status-text">
                  We sent a link to{' '}
                  <span className="pj-email-highlight">{email || 'your email'}</span>. Check your inbox
                  and spam folder, then click the link to verify.
                </p>
              </div>

              <p className="pj-verify-footnote df-verify-footnote">
                Didn&apos;t receive it? Check spam first, or{' '}
                <button
                  type="button"
                  onClick={() => onResend()}
                  disabled={resendLoading}
                  className="pj-verify-resend df-verify-resend"
                >
                  {resendLoading ? 'sending…' : 'resend'}
                </button>{' '}
                only if needed.
              </p>

              <button type="button" onClick={onClose} className="df-verify-cta">
                Got it
              </button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
