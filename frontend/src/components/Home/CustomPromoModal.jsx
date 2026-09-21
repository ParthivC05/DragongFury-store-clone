import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { lockBodyScroll } from '../../utils/bodyScrollLock';

export function CustomPromoModal({ open, onClose, step }) {
  const navigate = useNavigate();
  const src = typeof step?.imageUrl === 'string' ? step.imageUrl.trim() : '';
  const title = step?.title || 'Promotional offer';
  const ctaUrl = step?.ctaUrl ? String(step.ctaUrl).trim() : '';

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleImageClick = useCallback(() => {
    if (!ctaUrl) return;
    handleClose();
    if (ctaUrl.startsWith('/')) {
      navigate(ctaUrl);
    } else {
      window.open(ctaUrl, '_blank', 'noopener,noreferrer');
    }
  }, [ctaUrl, handleClose, navigate]);

  useEffect(() => {
    if (!open) return undefined;
    const releaseScrollLock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [open, handleClose]);

  if (!open || !src) return null;

  const imageInteractive = Boolean(ctaUrl);

  return createPortal(
    <div className="fdb-backdrop wbm-backdrop cpm-backdrop" role="presentation" onClick={handleClose}>
      <div
        id="custom-promo-modal"
        className="wbm-modal cpm-modal fdb-modal-enter"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cpm-image-wrap">
          <button
            type="button"
            className="fdb-close wbm-close cpm-close"
            onClick={handleClose}
            aria-label="Close"
          />
          {imageInteractive ? (
            <button
              type="button"
              className="cpm-image-btn"
              onClick={handleImageClick}
              aria-label={step?.ctaLabel?.trim() || title}
            >
              <img
                src={src}
                alt={title}
                className="cpm-image"
                draggable={false}
                decoding="async"
              />
            </button>
          ) : (
            <img
              src={src}
              alt={title}
              className="cpm-image"
              draggable={false}
              decoding="async"
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
