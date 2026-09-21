import { GCCoinIcon, SCCoinIcon } from '../assets/icons';
import { useAuth } from '../context/AuthContext';
import { useCoinType } from '../context/CoinContext';
import './HeaderCoinToggle.css';

function formatSc(value) {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatGc(value) {
  return Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 0,
  });
}

export function HeaderCoinToggle({
  variant = 'header',
  disabled = false,
  onChange,
  onSelectedClick,
}) {
  const { coinType, setCoinType } = useCoinType();
  const { balanceSc, balanceGc } = useAuth();
  const isGc = coinType === 'GC';

  const select = (next) => {
    if (disabled) return;
    if ((next === 'GC') === isGc) {
      onSelectedClick?.(next);
      return;
    }
    setCoinType(next);
    onChange?.(next);
  };

  return (
    <div
      className={`pj-coin-toggle pj-coin-toggle--${variant}${isGc ? ' pj-coin-toggle--gc' : ' pj-coin-toggle--sc'}${disabled ? ' pj-coin-toggle--disabled' : ''}`}
      role="group"
      aria-label="Switch coin type"
    >
      <div className="pj-coin-toggle__track">
        <span className="pj-coin-toggle__slider" aria-hidden />
        <button
          type="button"
          className={`pj-coin-toggle__seg pj-coin-toggle__seg--sc${!isGc ? ' is-active' : ''}`}
          onClick={() => select('SC')}
          disabled={disabled}
          aria-pressed={!isGc}
          aria-label={`Sweep Coins ${formatSc(balanceSc)}${!isGc ? ', selected' : ''}`}
        >
          <span className="pj-coin-toggle__icon" aria-hidden>
            <SCCoinIcon />
          </span>
          <span className="pj-coin-toggle__amt">
            {formatSc(balanceSc)}
            <span className="pj-coin-toggle__unit"> SC</span>
          </span>
        </button>
        <button
          type="button"
          className={`pj-coin-toggle__seg pj-coin-toggle__seg--gc${isGc ? ' is-active' : ''}`}
          onClick={() => select('GC')}
          disabled={disabled}
          aria-pressed={isGc}
          aria-label={`Gold Coins ${formatGc(balanceGc)}${isGc ? ', selected' : ''}`}
        >
          <span className="pj-coin-toggle__icon" aria-hidden>
            <GCCoinIcon />
          </span>
          <span className="pj-coin-toggle__amt">
            {formatGc(balanceGc)}
            <span className="pj-coin-toggle__unit"> GC</span>
          </span>
        </button>
      </div>
    </div>
  );
}
