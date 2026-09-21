import * as Dialog from '../ui/Dialog';
import './auth-dragonfury.css';

export function EmailVerificationModal({ open, email, onClose, onResend, resendLoading }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="pj-verify-overlay" />
        <div className="pj-verify-wrap">
          <Dialog.Content
            className="pj-verify-modal"
            onEscapeKeyDown={onClose}
            onPointerDownOutside={onClose}
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

            <Dialog.Close className="pj-verify-close" aria-label="Close" onClick={onClose}>
              &#215;
            </Dialog.Close>

            <div className="pj-verify-body">
              <div className="pj-verify-icon" aria-hidden>
                📧
              </div>

              <Dialog.Title className="pj-verify-title">Email Verification Required</Dialog.Title>

              <div
                className="pj-verify-status"
                role="status"
                aria-live="polite"
              >
                <p className="pj-verify-status-label">Verification email was sent</p>
                <p className="pj-verify-status-text">
                  We sent a link to{' '}
                  <span className="pj-email-highlight">{email || 'your email'}</span>. Check your inbox and spam
                  folder, then click the link to verify.
                </p>
              </div>

              <p className="pj-verify-footnote">
                Didn’t receive it? Check spam first, or{' '}
                <button
                  type="button"
                  onClick={() => onResend()}
                  disabled={resendLoading}
                  className="pj-verify-resend"
                >
                  {resendLoading ? 'sending…' : 'resend'}
                </button>{' '}
                only if needed.
              </p>

              <button type="button" onClick={onClose} className="pj-btn-login pj-btn-login-link">
                <span className="pj-btn-txt">✓ GOT IT</span>
              </button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
