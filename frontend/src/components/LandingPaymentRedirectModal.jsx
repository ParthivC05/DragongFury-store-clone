import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { lockBodyScroll } from '../utils/bodyScrollLock';
import './LandingPaymentRedirectModal.css';

function normalizeModalSteps(modals, imageSrc, delaySeconds) {
  if (Array.isArray(modals) && modals.length > 0) {
    return modals
      .map((modal) => {
        const imageUrl = typeof modal?.imageUrl === 'string' ? modal.imageUrl.trim() : '';
        const delay = Number(modal?.delaySeconds);
        if (!imageUrl || !Number.isFinite(delay) || delay <= 0) return null;
        return { imageUrl, delaySeconds: delay };
      })
      .filter(Boolean);
  }
  const src = typeof imageSrc === 'string' ? imageSrc.trim() : '';
  const delay = Number(delaySeconds);
  if (src && Number.isFinite(delay) && delay > 0) {
    return [{ imageUrl: src, delaySeconds: delay }];
  }
  return [];
}

function navigateOpenedWindow(win, url) {
  if (win && !win.closed) {
    try {
      win.opener = null;
      win.location.replace(url);
      return true;
    } catch {
      // Fall through to a fresh tab if the placeholder window cannot be updated.
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
  return false;
}

/**
 * Shows admin-configured images one at a time. Closing a modal starts that modal's
 * delay; then the next modal appears, or the payment URL opens after the last delay.
 */
export function LandingPaymentRedirectModal({
  open,
  modals,
  imageSrc,
  redirectUrl,
  delaySeconds,
  onClose,
}) {
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState('showing');
  const [revealed, setRevealed] = useState(false);
  const pendingWindowRef = useRef(null);

  const steps = useMemo(
    () => normalizeModalSteps(modals, imageSrc, delaySeconds),
    [modals, imageSrc, delaySeconds],
  );
  const current = steps[step] || null;
  const src = current?.imageUrl || '';
  const url = typeof redirectUrl === 'string' ? redirectUrl.trim() : '';
  const delayMs = Math.max(0, Number(current?.delaySeconds) || 0) * 1000;
  const showing = open && phase === 'showing' && Boolean(src);

  const finishSequence = useCallback(() => {
    const win = pendingWindowRef.current;
    pendingWindowRef.current = null;
    if (url) navigateOpenedWindow(win, url);
    onClose();
  }, [url, onClose]);

  const dismissCurrent = useCallback(() => {
    if (!open || phase !== 'showing' || !current) return;
    const isLast = step >= steps.length - 1;
    if (isLast && url && !pendingWindowRef.current) {
      pendingWindowRef.current = window.open('about:blank', '_blank');
    }
    setRevealed(false);
    setPhase('waiting');
  }, [open, phase, current, step, steps.length, url]);

  useEffect(() => {
    if (!open) {
      setStep(0);
      setPhase('showing');
      setRevealed(false);
      if (pendingWindowRef.current && !pendingWindowRef.current.closed) {
        try {
          pendingWindowRef.current.close();
        } catch {
          // Ignore if the browser blocks closing the placeholder tab.
        }
      }
      pendingWindowRef.current = null;
      return undefined;
    }
    setStep(0);
    setPhase('showing');
    const releaseScrollLock = lockBodyScroll();
    document.body.classList.add('lprm-open');
    return () => {
      releaseScrollLock();
      document.body.classList.remove('lprm-open');
    };
  }, [open]);

  useEffect(() => {
    if (!showing) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') dismissCurrent();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showing, dismissCurrent]);

  useEffect(() => {
    if (!showing || !src) {
      setRevealed(false);
      return undefined;
    }
    setRevealed(false);
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, [showing, src, step]);

  useEffect(() => {
    if (!open || phase !== 'waiting' || !current || delayMs <= 0) return undefined;
    const timer = window.setTimeout(() => {
      if (step < steps.length - 1) {
        setStep((prev) => prev + 1);
        setPhase('showing');
        return;
      }
      finishSequence();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [open, phase, current, delayMs, step, steps.length, finishSequence]);

  if (!open || steps.length === 0) return null;

  return createPortal(
    <div
      className="lprm-backdrop"
      role="presentation"
      onClick={showing ? dismissCurrent : undefined}
    >
      {showing ? (
        <div
          className="lprm-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Opening payment link"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="lprm-close" onClick={dismissCurrent} aria-label="Close" />
          <div className="lprm-image-wrap">
            {!revealed ? <span className="lprm-image-placeholder" aria-hidden /> : null}
            <img
              key={`${step}-${src}`}
              src={src}
              alt=""
              className={`lprm-image${revealed ? ' lprm-image--ready' : ''}`}
              draggable={false}
              decoding="async"
              fetchPriority="high"
              onLoad={() => setRevealed(true)}
            />
          </div>
        </div>
      ) : (
        <span className="lprm-wait" role="status" aria-live="polite">
          Please wait
        </span>
      )}
    </div>,
    document.body,
  );
}
