import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CheckIcon, CloseIcon, CopyIcon, EnvelopeIcon } from '../../assets/icons';
import deviceBlockImg from '../../assets/png/deviceBlock.png';
import './device-block-modal.css';

function LogInIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

export default function DeviceBlockModal({ open, onClose, registeredEmail = '' }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open, registeredEmail]);

  const handleCopyEmail = useCallback(async () => {
    const email = registeredEmail?.trim();
    if (!email) return;

    try {
      if (window.isSecureContext && navigator.clipboard) {
        await navigator.clipboard.writeText(email);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = email;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [registeredEmail]);

  if (!open) return null;

  const email = registeredEmail?.trim();

  return createPortal(
    <div className="device-block-modal-backdrop" role="presentation">
      <div
        className="device-block-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Device signup blocked"
      >
        <div className="device-block-modal__glow" aria-hidden />
        <div className="device-block-modal__card">
          <button
            type="button"
            className="device-block-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon width={20} height={20} />
          </button>

          <div className="device-block-modal__image-wrap">
            <img
              src={deviceBlockImg}
              alt="Signup blocked — one account per device"
              className="device-block-modal__image"
            />
          </div>

          <div className="device-block-modal__footer">
            {email ? (
              <div className="device-block-modal__message">
                <p className="device-block-modal__message-text">
                  You already signed up with this email from this device:
                </p>
                <div className="device-block-modal__email-row">
                  <EnvelopeIcon width={18} height={18} className="device-block-modal__email-icon" />
                  <span className="device-block-modal__email-value">{email}</span>
                  <button
                    type="button"
                    className="device-block-modal__copy-btn"
                    onClick={handleCopyEmail}
                    aria-label={copied ? 'Email copied' : 'Copy email'}
                    title={copied ? 'Copied!' : 'Copy email'}
                  >
                    {copied ? (
                      <CheckIcon width={16} height={16} />
                    ) : (
                      <CopyIcon width={16} height={16} />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <p className="device-block-modal__message-text device-block-modal__message-text--solo">
                An account has already been created on this device. Please log in with your
                existing account.
              </p>
            )}

            <Link to="/login" className="device-block-modal__login-link" onClick={onClose}>
              <LogInIcon />
              Log in to your account
            </Link>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
