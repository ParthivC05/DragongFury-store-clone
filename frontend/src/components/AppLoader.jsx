import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { site } from '../config/site';
import './AppLoader.css';

const LOADER_LOGO = site.loaderLogoUrl;
const FALLBACK_LOGO = site.logoUrl;

function sameAsset(currentSrc, candidate) {
  if (!currentSrc || !candidate) return false;
  try {
    const left = new URL(currentSrc, window.location.origin).pathname;
    const right = new URL(candidate, window.location.origin).pathname;
    return left === right;
  } catch {
    return currentSrc === candidate;
  }
}

function preloadOne(src) {
  if (typeof document === 'undefined' || !src) return;
  if (document.querySelector(`link[rel="preload"][href="${src}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = src;
  link.fetchPriority = 'high';
  document.head.appendChild(link);
  const img = new Image();
  img.decoding = 'async';
  if ('fetchPriority' in img) img.fetchPriority = 'high';
  img.src = src;
}

function preloadLoaderLogo() {
  preloadOne(LOADER_LOGO);
  if (FALLBACK_LOGO && FALLBACK_LOGO !== LOADER_LOGO) preloadOne(FALLBACK_LOGO);
}

preloadLoaderLogo();

function markReadyIfDecoded(img, onReady) {
  if (!img) return;
  if (img.complete && img.naturalWidth > 0) {
    onReady();
  }
}

/**
 * Branded loading screen — logo on a dark backdrop with a soft highlight pulse.
 * @param {boolean} fullScreen - Fixed overlay; portaled to body
 * @param {boolean} fillPage - Fill main content area so footer stays at bottom
 */
export function AppLoader({ fullScreen = false, fillPage = true, message = 'Loading' }) {
  const [logoSrc, setLogoSrc] = useState(LOADER_LOGO || FALLBACK_LOGO);
  const [logoReady, setLogoReady] = useState(false);

  const handleReady = useCallback(() => {
    setLogoReady(true);
  }, []);

  const imgRef = useCallback((node) => {
    markReadyIfDecoded(node, handleReady);
  }, [handleReady]);

  const handleError = useCallback((e) => {
    if (FALLBACK_LOGO && !sameAsset(e.currentTarget.src, FALLBACK_LOGO)) {
      setLogoReady(false);
      setLogoSrc(FALLBACK_LOGO);
    }
  }, []);

  const content = (
    <div
      className={`dash-loader${fillPage && !fullScreen ? ' dash-loader--fill-page' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={message}
    >
      <div className={`dash-loader-logo-wrap${logoReady ? ' is-ready' : ''}`} aria-hidden>
        <span className="dash-loader-logo-glow" />
        {logoSrc ? (
          <img
            key={logoSrc}
            ref={imgRef}
            src={logoSrc}
            alt=""
            className={`dash-loader-logo${logoReady ? ' is-ready' : ''}`}
            width={340}
            height={132}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onLoad={handleReady}
            onError={handleError}
          />
        ) : null}
      </div>
      <span className="sr-only">{message}</span>
    </div>
  );

  if (fullScreen) {
    return createPortal(
      <div className="dash-loader-screen">
        {content}
      </div>,
      document.body
    );
  }

  return <div className={`dash-loader-wrap${fillPage ? ' dash-loader-wrap--fill' : ''}`}>{content}</div>;
}

export { preloadLoaderLogo };
