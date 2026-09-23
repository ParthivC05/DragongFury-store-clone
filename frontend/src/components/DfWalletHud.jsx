import { Link } from 'react-router-dom';
import { warmupDeposit } from '../utils/preloadDeposit';
import { LockIcon } from '../assets/icons';

function formatWalletAmount(n) {
  return Number(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Live DragonFury.online wallet HUD — balance bar + add button.
 * Renders in-header (desktop beside logo; mobile CSS pins it top-left).
 */
export function DfWalletHud({
  amount,
  balanceLoading,
  open,
  onToggle,
  onClose,
  psc,
  bsc,
  rsc,
  lockedSc = 0,
  onUnlockPhone
}) {
  const display = formatWalletAmount(amount);

  return (
    <div className="df-wallet-hud" data-open={open ? 'true' : 'false'}>
      <div className="df-wallet-hud__bar">
        <img
          className="df-wallet-hud__holder"
          src="/df-online/balance-background.webp"
          alt=""
          width={760}
          height={194}
          decoding="async"
          aria-hidden
        />
        <button
          type="button"
          className="df-wallet-hud__amount onboarding-navbar-wallet"
          aria-expanded={open}
          aria-label={`Balance ${display} SC. Show available and redeemable`}
          onClick={onToggle}
          disabled={balanceLoading}
        >
          <small>SC</small>
          <span>{balanceLoading ? '…' : display}</span>
        </button>

        {open ? (
          <div className="df-wallet-hud__sheet" role="dialog" aria-label="Balance details">
            <button
              type="button"
              className="df-wallet-hud__dismiss"
              aria-label="Close"
              onClick={onClose}
            >
              <img src="/df-online/wallet-close.webp" alt="" width={44} height={44} />
            </button>
            <div className="df-wallet-hud__row">
              <span className="df-wallet-hud__row-label">Purchased</span>
              <strong className="df-wallet-hud__row-value">{formatWalletAmount(psc)}</strong>
            </div>
            <div className="df-wallet-hud__row">
              <span className="df-wallet-hud__row-label">Bonus</span>
              <strong className="df-wallet-hud__row-value">{formatWalletAmount(bsc)}</strong>
            </div>
            <div className="df-wallet-hud__row">
              <span className="df-wallet-hud__row-label">Redeemable</span>
              <strong className="df-wallet-hud__row-value">{formatWalletAmount(rsc)}</strong>
            </div>
            {lockedSc > 0 ? (
              <div className="df-wallet-hud__row df-wallet-hud__row--locked">
                <span className="df-wallet-hud__row-label">
                  <LockIcon className="df-wallet-hud__lock" /> Locked
                </span>
                <strong className="df-wallet-hud__row-value">{formatWalletAmount(lockedSc)}</strong>
              </div>
            ) : null}
            {lockedSc > 0 && onUnlockPhone ? (
              <button type="button" className="df-wallet-hud__unlock" onClick={onUnlockPhone}>
                Verify phone to unlock
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Link
        to="/deposit"
        className="df-wallet-hud__add onboarding-deposit-btn"
        aria-label="Add money — go to the store"
        onPointerEnter={() => warmupDeposit()}
      >
        <img src="/df-online/balance-plus.webp" alt="" width={200} height={191} decoding="async" />
      </Link>
    </div>
  );
}
