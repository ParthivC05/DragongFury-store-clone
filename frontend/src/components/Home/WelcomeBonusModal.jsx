import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { lockBodyScroll } from '../../utils/bodyScrollLock';
import { beginAnimatedClose } from '../../utils/dfCloseAnimation';

export function WelcomeBonusModal({ open, onClose, imageReady = false, imageSrc }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const signupTo = `/register${search || ''}`;
  const [revealed, setRevealed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const src = typeof imageSrc === 'string' ? imageSrc.trim() : '';

  const requestClose = useCallback(() => {
    beginAnimatedClose(exiting, setExiting, onClose);
  }, [exiting, onClose]);

  const handleClaim = useCallback(() => {
    beginAnimatedClose(exiting, setExiting, () => {
      onClose();
      navigate(signupTo);
    });
  }, [exiting, navigate, onClose, signupTo]);

  useEffect(() => {
    if (!open) {
      setRevealed(false);
      setExiting(false);
      return undefined;
    }
    const releaseScrollLock = lockBodyScroll({
      lockHtml: true,
      reserveScrollPosition: true,
    });
    document.body.classList.add('welcome-modal-open', 'df-promo-open');
    const onKey = (e) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      document.body.classList.remove('welcome-modal-open', 'df-promo-open');
      window.dispatchEvent(new Event('welcome-modal-closed'));
      window.removeEventListener('keydown', onKey);
    };
  }, [open, requestClose]);

  useEffect(() => {
    if (!open || !imageReady) {
      setRevealed(false);
      return undefined;
    }

    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [imageReady, open]);

  if (!open || !src) return null;

  const showImage = imageReady && revealed;

  return createPortal(
    <div
      className={`df-promo-backdrop${exiting ? ' is-exiting' : ''}`}
      role="presentation"
      onClick={requestClose}
    >
      <div
        className="df-promo-modal df-promo-modal--welcome"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome bonus offer"
        aria-busy={!showImage}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="df-promo-close dragonfury-close-button"
          onClick={requestClose}
          aria-label="Close"
        >
          <img src="/df-online/wallet-close.webp" alt="" width={44} height={44} draggable={false} />
        </button>
        <button
          type="button"
          className="df-promo-art"
          onClick={handleClaim}
          aria-label="Claim free welcome bonus — sign up"
        >
          {!showImage ? <span className="df-promo-art-skel" aria-hidden /> : null}
          {imageReady ? (
            <img
              src={src}
              alt="Get 100% extra on your first deposit"
              className={`df-promo-image${showImage ? ' is-ready' : ''}`}
              draggable={false}
              decoding="async"
            />
          ) : null}
        </button>
      </div>
    </div>,
    document.body,
  );
}
