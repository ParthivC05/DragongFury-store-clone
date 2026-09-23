import { useEffect, useState, lazy, Suspense } from 'react';
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SiteLogo } from './SiteLogo';
import { lockBodyScroll } from '../utils/bodyScrollLock';
import { OPEN_MOBILE_MENU_EVENT } from '../utils/navEvents';

const DashboardSidebar = lazy(() =>
  import('./Home/DashboardSidebar').then((m) => ({ default: m.DashboardSidebar }))
);

function navItemClass({ isActive, isCenter }) {
  const base = isCenter ? 'dash-nav-item dash-nav-item--home' : 'dash-nav-item';
  return `${base}${isActive ? ' active' : ''}`;
}

export function BottomBar() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const registerPath = `/register${search || ''}`;
  const isOnHome = pathname === '/';
  const hideBuyWithdrawRow =
    authLoading ||
    !isAuthenticated ||
    pathname === '/deposit' ||
    pathname === '/withdraw' ||
    pathname.startsWith('/support/tickets');
  const homeHighlighted = isOnHome;
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

        <nav className="dash-bottom-nav" aria-label="Lobby navigation">
          <NavLink
            to={isAuthenticated ? '/deposit' : registerPath}
            className={({ isActive }) =>
              `dash-nav-item${isAuthenticated && pathname === '/deposit' ? ' active' : isActive && pathname === '/deposit' ? ' active' : ''}`
            }
          >
            <span className="dash-nav-emoji" aria-hidden>
              <img src="/df-online/nav-shop.webp" alt="" className="dash-nav-hud-art" width={42} height={42} />
            </span>
            <span className="dash-nav-label">Shop</span>
          </NavLink>

          <NavLink
            to={isAuthenticated ? '/withdraw' : registerPath}
            className={() =>
              `dash-nav-item${pathname === '/withdraw' ? ' active' : ''}`
            }
          >
            <span className="dash-nav-emoji" aria-hidden>
              <img src="/df-online/nav-redeem.webp" alt="" className="dash-nav-hud-art" width={42} height={42} />
            </span>
            <span className="dash-nav-label">Redeem</span>
          </NavLink>

          <NavLink
            to="/"
            onClick={handleHomeNav}
            className={navItemClass({ isActive: homeHighlighted, isCenter: true })}
          >
            <span className="dash-nav-home-btn" aria-hidden>
              <img src="/df-online/nav-home.webp" alt="" className="dash-nav-hud-art" width={52} height={52} />
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
                src="/df-online/nav-bonus.webp"
                alt=""
                className="dash-nav-hud-art"
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
            to="/help"
            className={({ isActive }) => `dash-nav-item${isActive || pathname.startsWith('/support') ? ' active' : ''}`}
          >
            <span className="dash-nav-emoji" aria-hidden>
              <img src="/df-online/nav-support.webp" alt="" className="dash-nav-hud-art" width={42} height={42} />
            </span>
            <span className="dash-nav-label">Support</span>
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
