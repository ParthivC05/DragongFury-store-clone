import {
  computeGameDepositCredit,
  formatDepositDiscountPercentLabel,
  getDepositDiscountPercent,
} from '../../utils/goldenDragon';

export function hasDepositDiscount(game) {
  return getDepositDiscountPercent(game) > 0;
}

export function GameCardDiscountBadge({ game }) {
  const pct = formatDepositDiscountPercentLabel(game);
  if (!pct) return null;
  return (
    <span className="dash-gc-ribbon" aria-label={`${pct} percent extra SC on recharge`}>
      <span className="dash-gc-ribbon-band">
        <span className="dash-gc-ribbon-shine" aria-hidden />
        <span className="dash-gc-ribbon-pct">{pct}%</span>
        <span className="dash-gc-ribbon-word">EXTRA</span>
      </span>
    </span>
  );
}

export function DepositDiscountBanner({ game }) {
  const pct = formatDepositDiscountPercentLabel(game);
  if (!pct) return null;
  return (
    <div className="gtm-bonus-banner" role="status">
      <div className="gtm-bonus-banner-chip">
        <span className="gtm-bonus-banner-pct">+{pct}%</span>
        <span className="gtm-bonus-banner-chip-txt">EXTRA</span>
      </div>
      <div className="gtm-bonus-banner-copy">
        <p className="gtm-bonus-banner-title">Bonus SC on recharge</p>
        <p className="gtm-bonus-banner-sub">Pay from your wallet — this game credits extra.</p>
      </div>
    </div>
  );
}

export function DepositDiscountPreview({ game, amount }) {
  if (!hasDepositDiscount(game)) return null;
  const walletAmount = Number(amount);
  const ready = Number.isFinite(walletAmount) && walletAmount >= 1;
  const gameCredit = ready ? computeGameDepositCredit(walletAmount, game) : null;
  const showSplit = ready && gameCredit != null && gameCredit > walletAmount;

  if (!showSplit) {
    return (
      <div className="gtm-bonus-preview gtm-bonus-preview--idle">
        Enter an amount to see your extra SC.
      </div>
    );
  }

  return (
    <div className="gtm-bonus-preview" role="status">
      <div className="gtm-bonus-preview-col">
        <span className="gtm-bonus-preview-label">You pay</span>
        <strong>{walletAmount} SC</strong>
      </div>
      <span className="gtm-bonus-preview-arrow" aria-hidden>
        →
      </span>
      <div className="gtm-bonus-preview-col gtm-bonus-preview-col--get">
        <span className="gtm-bonus-preview-label">You get in game</span>
        <strong>{gameCredit} SC</strong>
      </div>
    </div>
  );
}
