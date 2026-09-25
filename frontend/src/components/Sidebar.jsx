import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSpinWheelStatus } from '../context/SpinWheelStatusContext';
import { site } from '../config/site';
import {
  CloseIcon,
  HomeIcon,
  GamesIcon,
  DepositIcon,
  WithdrawIcon,
  PromoIcon,
  SpinIcon,
} from '../assets/icons';

const mainLinks = [
  { to: '/', label: 'Dashboard', Icon: HomeIcon },
  { to: '/', label: 'Games', Icon: GamesIcon },
  { to: '/deposit', label: 'Deposit', Icon: DepositIcon },
  { to: '/redeem', label: 'Redeem', Icon: WithdrawIcon },
  { to: '/promotions', label: 'Promotions', Icon: PromoIcon },
  { to: '/spinwheel', label: 'Spin Wheel', Icon: SpinIcon },
];

const accountLinks = [
  { to: '/settings', label: 'Profile' },
  { to: '/account/transactions', label: 'Transactions' },
  { to: '/account/affiliate', label: 'Refer & Earn' },
];

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 py-3 px-4 text-gray-300 hover:bg-gray-700/50 hover:text-gray-100 no-underline rounded-lg transition-colors ${isActive ? 'bg-primary/20 text-primary' : ''}`;

export function Sidebar({ isOpen, onClose }) {
  const { isAuthenticated, logout } = useAuth();
  const { canSpin } = useSpinWheelStatus();
  const navigate = useNavigate();

  const handleLogout = () => {
    onClose?.();
    logout();
    navigate('/');
  };

  const handleLinkClick = () => {
    onClose?.();
  };

  return (
    <>
      {/* Overlay only on mobile when sidebar open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      {/* Sidebar: drawer on mobile (slide in when isOpen), always visible on desktop */}
      <aside
        className={`fixed left-0 top-0 md:top-14 bottom-0 w-72 max-w-[85vw] md:max-w-none bg-card border-r border-gray-700 z-50 flex flex-col overflow-y-auto scrollbar-app safe-area-pb transform transition-transform duration-200 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        aria-label="Main navigation"
      >
        {/* Logo + close: only on mobile (desktop has logo in top bar only) */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <Link to="/" onClick={handleLinkClick} className="font-bold text-lg text-gray-100 no-underline">
            {site.platformName}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-100 rounded-lg hover:bg-gray-700"
            aria-label="Close menu"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 p-4 pt-4 md:pt-4 space-y-1">
          {mainLinks.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={linkClass} onClick={handleLinkClick}>
              {Icon && <Icon className="w-5 h-5 flex-shrink-0 text-gray-400" />}
              <span className="flex-1">{label}</span>
              {to === '/spinwheel' && isAuthenticated && canSpin && (
                <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Spin ready" />
              )}
            </NavLink>
          ))}

          {isAuthenticated && (
            <>
              <div className="my-4 border-t border-gray-700" />
              <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Account
              </p>
              {accountLinks.map(({ to, label }) => (
                <NavLink key={to} to={to} className={linkClass} onClick={handleLinkClick}>
                  <span>{label}</span>
                </NavLink>
              ))}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 py-3 px-4 text-left text-red-400 hover:bg-gray-700/50 hover:text-red-300 rounded-lg transition-colors"
              >
                <span>Logout</span>
              </button>
            </>
          )}

          {!isAuthenticated && (
            <>
              <div className="my-4 border-t border-gray-700" />
              <Link
                to="/login"
                onClick={handleLinkClick}
                className="flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-red-600 rounded-lg no-underline hover:bg-red-700"
              >
                Login
              </Link>
              <Link
                to="/register"
                onClick={handleLinkClick}
                className="flex items-center justify-center gap-2 py-3 px-4 text-sm font-semibold text-white bg-primary rounded-lg no-underline hover:bg-primary/90"
              >
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
