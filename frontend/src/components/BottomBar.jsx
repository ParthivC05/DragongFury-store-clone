import { useEffect, useState, lazy, Suspense } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { scrollToGamesSection } from '../utils/scrollToGames';
import { SiteLogo } from './SiteLogo';
import { lockBodyScroll } from '../utils/bodyScrollLock';
import { OPEN_MOBILE_MENU_EVENT } from '../utils/navEvents';

const DashboardSidebar = lazy(() =>
  import('./Home/DashboardSidebar').then((m) => ({ default: m.DashboardSidebar }))
);

const BONUS_ICON = '/bonus.webp';

function navItemClass({ isActive, isCenter }) {
  const base = isCenter ? 'dash-nav-item dash-nav-item--home' : 'dash-nav-item';
  return `${base}${isActive ? ' active' : ''}`;
}

export function BottomBar() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { pathname, search, hash } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const registerPath = `/register${search || ''}`;
  const isOnHome = pathname === '/';
  const isOnPlatform = pathname === '/platform';
  // Guests never see Buy SC / Withdraw SC on mobile. Hide while auth is resolving
  // so logged-in users don't get a guest flash, then show once session is known.
  const hideBuyWithdrawRow =
    authLoading ||
    !isAuthenticated ||
    pathname === '/deposit' ||
    pathname === '/withdraw' ||
    pathname.startsWith('/support/tickets');
  const platformHighlighted = isOnPlatform || (isAuthenticated && isOnHome && hash === '#games');
  const homeHighlighted = isOnHome && hash !== '#games' && !isOnPlatform;
  const casinoHighlighted = pathname === '/casino' || pathname.startsWith('/casino/');
  const bonusHighlighted = pathname === '/bonus' || pathname === '/account/affiliate';

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const openFromPage = () => setMenuOpen(true);
    window.addEventListener(OPEN_MOBILE_MENU_EVENT, openFromPage);
    return () => window.removeEventListener(OPEN_MOBILE_MENU_EVENT, openFromPage);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const releaseScrollLock = lockBodyScroll();
    return () => {
      window.removeEventListener('keydown', onKey);
      releaseScrollLock();
    };
  }, [menuOpen]);

  const handlePlatformNav = (e) => {
    e.preventDefault();
    if (!isAuthenticated) {
      if (!isOnPlatform) navigate('/platform');
      return;
    }
    if (isOnHome) {
      scrollToGamesSection();
      navigate({ pathname: '/', hash: '#games' }, { replace: true });
    } else {
      navigate('/#games');
    }
  };

  const handleHomeNav = (e) => {
    e.preventDefault();
    if (isOnHome) {
      navigate('/', { replace: true });
    } else {
      navigate('/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <div className="dash-bottom-wrap md:hidden safe-area-pb onboarding-bottom-bar">
        {!hideBuyWithdrawRow && (
          <div className="dash-buy-row">
            <Link
              to={isAuthenticated ? '/deposit' : registerPath}
              className="dash-btn-buy dash-action-btn dash-action-btn--buy onboarding-buy-sc-btn"
            >
              <span className="dash-action-btn-shine" aria-hidden />
              <span className="dash-action-btn-inner">
                <span className="dash-action-btn-emoji dash-action-btn-emoji--buy" aria-hidden>
                  💰
                </span>
                <span className="dash-action-btn-copy">
                  <span className="dash-action-btn-label">Buy SC</span>
                  <span className="dash-action-btn-sub">Add funds</span>
                </span>
              </span>
            </Link>
            <Link
              to={isAuthenticated ? '/withdraw' : registerPath}
              className="dash-btn-withdraw dash-action-btn dash-action-btn--withdraw"
            >
              <span className="dash-action-btn-shine" aria-hidden />
              <span className="dash-action-btn-inner">
                <span className="dash-action-btn-emoji dash-action-btn-emoji--withdraw" aria-hidden>
                  💸
                </span>
                <span className="dash-action-btn-copy">
                  <span className="dash-action-btn-label">Withdraw SC</span>
                  <span className="dash-action-btn-sub">Cash out SC</span>
                </span>
              </span>
            </Link>
          </div>
        )}

        <nav className="dash-bottom-nav" aria-label="Main navigation">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className={`dash-nav-item${menuOpen ? ' active' : ''}`}
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <span className="dash-nav-emoji" aria-hidden>☰</span>
            <span className="dash-nav-label">Menu</span>
          </button>

          <button
            type="button"
            onClick={handlePlatformNav}
            className={`dash-nav-item${platformHighlighted ? ' active' : ''}`}
            aria-current={platformHighlighted ? 'page' : undefined}
          >
            <span className="dash-nav-emoji" aria-hidden>🎮</span>
            <span className="dash-nav-label">Platform</span>
          </button>

          <NavLink
            to="/"
            onClick={handleHomeNav}
            className={navItemClass({ isActive: homeHighlighted, isCenter: true })}
          >
            <span className="dash-nav-home-btn" aria-hidden>
              <span className="dash-nav-home-emoji">🏠</span>
            </span>
            <span className="dash-nav-label">Home</span>
          </NavLink>

          <NavLink
            to="/bonus"
            className={`dash-nav-item${bonusHighlighted ? ' active' : ''}`}
            aria-current={bonusHighlighted ? 'page' : undefined}
          >
            <span className="dash-nav-emoji dash-nav-emoji--bonus" aria-hidden>
              <img
                src={BONUS_ICON}
                alt=""
                className="dash-nav-bonus-icon"
                width={42}
                height={42}
                draggable={false}
                decoding="async"
                loading="lazy"
              />
            </span>
            <span className="dash-nav-label">Bonus</span>
          </NavLink>

          <NavLink
            to="/casino"
            className={({ isActive }) =>
              navItemClass({
                isActive: casinoHighlighted || isActive,
                isCenter: false,
              })
            }
          >
            <span className="dash-nav-emoji" aria-hidden>🎰</span>
            <span className="dash-nav-label">Casino</span>
          </NavLink>
        </nav>
      </div>

      {menuOpen && (
        <div className="dash-menu-drawer-root md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="dash-menu-drawer-backdrop" aria-label="Close menu" onClick={closeMenu} />
          <div className="dash-menu-drawer">
            <div className="dash-menu-drawer-glow" aria-hidden />
            <div className="dash-menu-drawer-head">
              <div className="dash-menu-drawer-brand">
                <SiteLogo variant="drawer" />
              </div>
              <button type="button" className="dash-menu-drawer-close" aria-label="Close menu" onClick={closeMenu}>
                ✕
              </button>
            </div>
            <div className="dash-menu-drawer-body">
              <Suspense fallback={null}>
                <DashboardSidebar
                  hasSlots
                  onNavigate={closeMenu}
                  isAuthenticated={isAuthenticated}
                />
              </Suspense>
            </div>
            {!isAuthenticated && (
              <div className="dash-menu-drawer-cta">
                <Link to={registerPath} className="dash-menu-drawer-cta-signup" onClick={closeMenu}>
                  <span className="dash-menu-drawer-cta-shine" aria-hidden />
                  Sign Up Free
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
