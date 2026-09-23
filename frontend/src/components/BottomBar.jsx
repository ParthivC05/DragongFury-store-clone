import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { openSupportWidget } from './intercomApi';

function hudItemClass(base, isActive) {
  return `df-nav-hud__item df-nav-hud__item--${base}${isActive ? ' df-nav-hud__item--active' : ''}`;
}

export function BottomBar() {
  const { isAuthenticated, bscWalletUsable } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const registerPath = `/register${search || ''}`;
  const isOnHome = pathname === '/';
  const bonusHighlighted = pathname === '/bonus' || pathname === '/account/affiliate';
  const bonusCount = Math.max(0, Math.floor(Number(bscWalletUsable) || 0));

  const handleHomeNav = (e) => {
    e.preventDefault();
    if (isOnHome) {
      navigate('/', { replace: true });
    } else {
      navigate('/');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSupport = (e) => {
    e.preventDefault();
    try {
      openSupportWidget();
    } catch (_) {
      navigate('/help');
    }
  };

  const shopTo = isAuthenticated ? '/deposit' : registerPath;
  const redeemTo = isAuthenticated ? '/withdraw' : registerPath;

  return (
    <nav
      className="mobile-lobby-nav df-nav-hud mobile-lobby-nav--lobby onboarding-bottom-bar"
      aria-label="Lobby navigation"
    >
      <img
        className="df-nav-hud__backdrop"
        src="/df-online/nav-backdrop.webp"
        alt=""
        width={1024}
        height={131}
        decoding="async"
        aria-hidden
      />

      <NavLink
        to={shopTo}
        className={({ isActive }) =>
          hudItemClass('shop', isAuthenticated ? pathname === '/deposit' : isActive)
        }
      >
        <span className="df-nav-hud__art" aria-hidden>
          <img src="/df-online/nav-shop.webp" alt="" width={256} height={256} decoding="async" />
        </span>
        <small className="df-nav-hud__label">SHOP</small>
      </NavLink>

      <NavLink
        to={redeemTo}
        className={() => hudItemClass('redeem', pathname === '/withdraw')}
      >
        <span className="df-nav-hud__art" aria-hidden>
          <img src="/df-online/nav-redeem.webp" alt="" width={256} height={256} decoding="async" />
        </span>
        <small className="df-nav-hud__label">REDEEM</small>
      </NavLink>

      <NavLink
        to="/"
        onClick={handleHomeNav}
        className={hudItemClass('home', isOnHome)}
        aria-current={isOnHome ? 'page' : undefined}
      >
        <span className="df-nav-hud__art" aria-hidden>
          <img src="/df-online/nav-home.webp" alt="" width={256} height={256} decoding="async" />
        </span>
        <small className="df-nav-hud__label">HOME</small>
      </NavLink>

      <NavLink
        to="/bonus"
        className={hudItemClass('bonus', bonusHighlighted)}
        aria-current={bonusHighlighted ? 'page' : undefined}
      >
        <span className="df-nav-hud__art" aria-hidden>
          <img
            src="/df-online/nav-bonus.webp"
            alt=""
            width={256}
            height={256}
            decoding="async"
            draggable={false}
          />
        </span>
        <span className="df-nav-hud__counter" aria-label={`Bonus balance ${bonusCount}`}>
          {bonusCount}
        </span>
        <small className="df-nav-hud__label">BONUS</small>
      </NavLink>

      <button
        type="button"
        className={hudItemClass('support', false)}
        aria-label="Open live chat support"
        onClick={handleSupport}
      >
        <span className="df-nav-hud__art" aria-hidden>
          <img src="/df-online/nav-support.webp" alt="" width={256} height={256} decoding="async" />
        </span>
        <small className="df-nav-hud__label">SUPPORT</small>
      </button>
    </nav>
  );
}
