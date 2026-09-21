import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as kycApi from '../../api/kyc';
import '../deposit/SecurePaymentModal.css';
import './KycIdentityGateModal.css';

/**
 * Full-screen Didit KYC iframe. Close returns to the page; status still polls while open.
 */
export function KycVerificationModal({ open, url, onClose, onComplete }) {
  const iframeRef = useRef(null);
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const finishedRef = useRef(false);

  const finish = useCallback(
    (result) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      if (typeof onComplete === 'function') onComplete(result);
      if (typeof onClose === 'function') onClose(result);
    },
    [onClose, onComplete]
  );

  const handleClose = useCallback(() => {
    if (typeof onClose === 'function') onClose({ closed: true });
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      finishedRef.current = false;
      setIframeBlocked(false);
      return undefined;
    }
    document.body.classList.add('payment-iframe-active');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.classList.remove('payment-iframe-active');
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, handleClose]);

  useEffect(() => {
    if (!open || !url) return undefined;
    let cancelled = false;

    const tick = async () => {
      try {
        const res = await kycApi.getKycStatus({ refresh: '1' });
        if (cancelled || finishedRef.current) return;
        if (res?.approved || res?.kycStatus === 'approved') {
          finish({ approved: true, kyc: res });
          return;
        }
        if (res?.kycStatus === 'declined') {
          finish({ approved: false, declined: true, kyc: res });
          return;
        }
        if (res?.kycStatus === 'in_review') {
          finish({ approved: false, inReview: true, kyc: res });
        }
      } catch {
        /* keep polling */
      }
    };

    tick();
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open, url, finish]);

  useEffect(() => {
    if (!open) return undefined;
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'KYC_COMPLETE' || data.type === 'kyc-complete') {
        finish({
          approved: Boolean(data.approved),
          declined: Boolean(data.declined),
          inReview: Boolean(data.inReview),
          fromCallback: true
        });
      }
      if (data.type === 'KYC_CLOSE' || data.type === 'CLOSE_MODAL') {
        handleClose();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open, finish, handleClose]);

  const openExternal = useCallback(() => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, [url]);

  if (!open) return null;

  const modal = (
    <div
      className="secure-payment-modal secure-payment-modal--iframe-only kyc-verify-modal fixed inset-0 z-[10080] flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Identity verification"
    >
      <header className="spm-iframe-header kyc-verify-modal__header">
        <span className="spm-iframe-header-title">Identity verification</span>
        <button type="button" onClick={handleClose} className="spm-iframe-header-close">
          Close
        </button>
      </header>

      <div className="relative flex-1 min-h-0 w-full flex flex-col overflow-hidden">
        {iframeBlocked ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center bg-[#0f1419]">
            <p className="text-gray-200 text-base max-w-md">
              Verification could not load in this window. Open it in a new tab to continue.
            </p>
            <button
              type="button"
              onClick={openExternal}
              className="py-3 px-6 rounded-xl font-semibold text-[#0b1220] bg-gradient-to-r from-[#ffd700] to-[#ffa500] hover:brightness-110"
            >
              Open verification
            </button>
            <button type="button" onClick={handleClose} className="text-sm text-gray-400 hover:text-gray-200">
              Close
            </button>
          </div>
        ) : (
          <div className="spm-iframe-shell flex-1 min-h-0 flex flex-col">
            <iframe
              ref={iframeRef}
              title="Identity verification"
              src={url || 'about:blank'}
              className="spm-iframe flex-1 w-full min-h-0 border-0 bg-white"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation allow-downloads"
              allow="camera; microphone; fullscreen; autoplay"
              onError={() => setIframeBlocked(true)}
            />
            <div className="spm-iframe-terms shrink-0 flex items-center justify-center gap-3 px-3 py-2.5 text-center">
              <button
                type="button"
                onClick={openExternal}
                className="spm-iframe-terms-link focus:outline-none focus:ring-2 focus:ring-[var(--dash-gold)]/50 rounded"
              >
                Open in new tab
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
