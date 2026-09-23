import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { lockBodyScroll } from '../../utils/bodyScrollLock';
import { beginAnimatedClose } from '../../utils/dfCloseAnimation';

export function CustomPromoModal({ open, onClose, step }) {
  const navigate = useNavigate();
  const src = typeof step?.imageUrl === 'string' ? step.imageUrl.trim() : '';
  const title = step?.title || 'Promotional offer';
  const ctaUrl = step?.ctaUrl ? String(step.ctaUrl).trim() : '';
  const [exiting, setExiting] = useState(false);

  const requestClose = useCallback(() => {
    beginAnimatedClose(exiting, setExiting, onClose);
  }, [exiting, onClose]);

  const handleImageClick = useCallback(() => {
    if (!ctaUrl) return;
    beginAnimatedClose(exiting, setExiting, () => {
      onClose();
      if (ctaUrl.startsWith('/')) {
        navigate(ctaUrl);
      } else {
        window.open(ctaUrl, '_blank', 'noopener,noreferrer');
      }
    });
  }, [ctaUrl, exiting, navigate, onClose]);

  useEffect(() => {
    if (!open) {
      setExiting(false);
      return undefined;
    }
    const releaseScrollLock = lockBodyScroll({
      lockHtml: true,
      reserveScrollPosition: true,
    });
    document.body.classList.add('df-promo-open');
    const onKey = (e) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      document.body.classList.remove('df-promo-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [open, requestClose]);

  if (!open || !src) return null;

  const imageInteractive = Boolean(ctaUrl);
  const ctaLabel = step?.ctaLabel?.trim() || (imageInteractive ? 'CLAIM NOW' : '');

  return createPortal(
    <div
      className={`df-promo-backdrop${exiting ? ' is-exiting' : ''}`}
      role="presentation"
      onClick={requestClose}
    >
      <div
        id="custom-promo-modal"
        className="df-promo-modal df-promo-modal--custom"
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
        {imageInteractive ? (
          <button
            type="button"
            className="df-promo-art"
            onClick={handleImageClick}
            aria-label={ctaLabel || title}
          >
            <img src={src} alt={title} className="df-promo-image is-ready" draggable={false} decoding="async" />
          </button>
        ) : (
          <div className="df-promo-art">
            <img src={src} alt={title} className="df-promo-image is-ready" draggable={false} decoding="async" />
          </div>
        )}
        {ctaLabel ? (
          <button type="button" className="df-promo-cta" onClick={handleImageClick}>
            {ctaLabel}
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
