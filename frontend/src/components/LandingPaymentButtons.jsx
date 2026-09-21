import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useLandingPaymentLinks } from '../hooks/useLandingPaymentLinks';
import { LandingPaymentRedirectModal } from './LandingPaymentRedirectModal';
import '../pages/Landing/landing-payment-bar.css';

function PayDownArrowIcon() {
  return (
    <svg className="lp-pay-down-arrow" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 5v11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <path
        d="M8 13.5L12 17.5L16 13.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getLinkUrls(link) {
  if (Array.isArray(link?.urls)) return link.urls.filter(Boolean);
  if (link?.url) return [link.url];
  return [];
}

function PaymentMenuItem({ link, onNavigate, onOpenWithModal }) {
  const lastIndexRef = useRef(-1);
  const urls = getLinkUrls(link);

  const handleClick = useCallback(
    (e) => {
      e.preventDefault();
      if (urls.length === 0) return;
      let idx = 0;
      if (urls.length > 1) {
        // Pick a random URL each click, never repeating the previous one.
        do {
          idx = Math.floor(Math.random() * urls.length);
        } while (idx === lastIndexRef.current);
      }
      lastIndexRef.current = idx;
      const targetUrl = urls[idx];
      if (typeof onOpenWithModal === 'function' && onOpenWithModal(targetUrl)) {
        onNavigate();
        return;
      }
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      onNavigate();
    },
    [urls, onNavigate, onOpenWithModal],
  );

  return (
    <li role="none">
      <a
        href={urls[0] || '#'}
        className="lp-pay-menu-item"
        role="menuitem"
        target="_blank"
        rel="noopener noreferrer"
        onClick={handleClick}
      >
        {link.label}
      </a>
    </li>
  );
}

function PaymentDropdown({ type, label, links, onOpenWithModal }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const hasLinks = links.length > 0;

  const updateMenuPosition = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setMenuStyle({
      top: `${rect.bottom + 6}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }

    updateMenuPosition();

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (rootRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const btnClass =
    type === 'deposit' ? 'lp-pay-btn lp-pay-btn--deposit' : 'lp-pay-btn lp-pay-btn--withdrawal';

  const menu = open && menuStyle ? (
    <ul
      ref={menuRef}
      className="lp-pay-menu lp-pay-menu--portal"
      style={menuStyle}
      role="menu"
      aria-label={`${label} options`}
    >
      {hasLinks ? (
        links.map((link) => (
          <PaymentMenuItem
            key={link.id}
            link={link}
            onNavigate={() => setOpen(false)}
            onOpenWithModal={onOpenWithModal}
          />
        ))
      ) : (
        <li role="none">
          <span className="lp-pay-menu-empty" role="menuitem">
            No links available
          </span>
        </li>
      )}
    </ul>
  ) : null;

  return (
    <div className={`lp-pay-dropdown${open ? ' lp-pay-dropdown--open' : ''}`} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className={btnClass}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <PayDownArrowIcon />
        <span>{label}</span>
        <svg
          className={`lp-pay-chevron${open ? ' lp-pay-chevron--open' : ''}`}
          viewBox="0 0 20 20"
          aria-hidden
        >
          <path d="M5 7.5L10 12.5L15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

export function LandingPaymentButtons({ inline = false, highlight = false }) {
  const { landingPaymentLinks } = useLandingPaymentLinks();
  const [redirectModal, setRedirectModal] = useState(null);

  const depositLinks = landingPaymentLinks.deposit.filter((l) => l?.label && getLinkUrls(l).length > 0);
  const withdrawalLinks = landingPaymentLinks.withdrawal.filter((l) => l?.label && getLinkUrls(l).length > 0);

  const redirectModals = Array.isArray(landingPaymentLinks.redirectModals)
    ? landingPaymentLinks.redirectModals.filter(
        (modal) =>
          typeof modal?.imageUrl === 'string' &&
          modal.imageUrl.trim() &&
          Number.isFinite(Number(modal.delaySeconds)) &&
          Number(modal.delaySeconds) > 0,
      )
    : [];
  const hasRedirectModal = redirectModals.length > 0;

  const handleOpenWithModal = useCallback(
    (targetUrl) => {
      if (!hasRedirectModal || !targetUrl) return false;
      setRedirectModal({ url: targetUrl });
      return true;
    },
    [hasRedirectModal],
  );

  const closeRedirectModal = useCallback(() => {
    setRedirectModal(null);
  }, []);

  return (
    <>
      <div
        className={`lp-pay-bar${inline ? ' lp-pay-bar--inline' : ''}${highlight ? ' lp-pay-bar--highlight' : ''}`}
        role="navigation"
        aria-label="Deposit, withdraw, and download"
      >
        <div className="lp-pay-bar-inner">
          <PaymentDropdown
            type="deposit"
            label="Deposit"
            links={depositLinks}
            onOpenWithModal={handleOpenWithModal}
          />
          <PaymentDropdown
            type="withdrawal"
            label="Withdraw"
            links={withdrawalLinks}
            onOpenWithModal={handleOpenWithModal}
          />
          <div className="lp-pay-action">
            <Link to="/link2play" className="lp-pay-btn lp-pay-btn--link2play">
              Download
            </Link>
          </div>
        </div>
      </div>
      <LandingPaymentRedirectModal
        open={Boolean(redirectModal?.url)}
        modals={redirectModals}
        redirectUrl={redirectModal?.url || ''}
        onClose={closeRedirectModal}
      />
    </>
  );
}
