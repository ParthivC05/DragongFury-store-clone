import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { lockBodyScroll } from '../../utils/bodyScrollLock';

export function WelcomeBonusModal({ open, onClose, imageReady = false, imageSrc }) {
  const navigate = useNavigate();
  const { search } = useLocation();
  const signupTo = `/register${search || ''}`;
  const [revealed, setRevealed] = useState(false);
  const src = typeof imageSrc === 'string' ? imageSrc.trim() : '';

  const handleClaim = useCallback(() => {
    onClose();
    navigate(signupTo);
  }, [navigate, onClose, signupTo]);

  useEffect(() => {
    if (!open) {
      setRevealed(false);
      return undefined;
    }
    const releaseScrollLock = lockBodyScroll();
    document.body.classList.add('welcome-modal-open');
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      document.body.classList.remove('welcome-modal-open');
      window.dispatchEvent(new Event('welcome-modal-closed'));
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

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
    <div className="fdb-backdrop wbm-backdrop" role="presentation" onClick={onClose}>
      <div
        className="wbm-modal fdb-modal-enter"
        role="dialog"
        aria-modal="true"
        aria-label="Welcome bonus offer"
        aria-busy={!showImage}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="fdb-close wbm-close" onClick={onClose} aria-label="Close" />
        <button
          type="button"
          className="wbm-image-btn"
          onClick={handleClaim}
          aria-label="Claim free welcome bonus — sign up"
        >
          {!showImage ? <span className="wbm-image-placeholder" aria-hidden /> : null}
          {imageReady ? (
            <img
              src={src}
              alt="Free welcome bonus for new players"
              className={`wbm-image${showImage ? ' wbm-image--ready' : ''}`}
              draggable={false}
              decoding="async"
              fetchpriority="high"
            />
          ) : null}
        </button>
      </div>
    </div>,
    document.body
  );
}
