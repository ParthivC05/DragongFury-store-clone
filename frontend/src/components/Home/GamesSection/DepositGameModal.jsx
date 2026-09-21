import { useState, useEffect } from 'react';
import * as Dialog from '../../ui/Dialog';
import { formatSc } from '../../../utils/currency';
import { getGameDisplayName } from '../../../utils/gameDisplay';
import { constrainIntegerScInput, GAME_DEPOSIT_AMOUNT_HINT } from '../../../utils/goldenDragon';
import { DepositDiscountBanner, DepositDiscountPreview, hasDepositDiscount } from '../../Games/DepositDiscountOffer';
import { useHideIntercomForGameTransferModal } from '../../intercomApi';

const TOPUP_ONBOARDING_STEPS = new Set([
  'focus_balance_modal',
  'focus_topup_amount',
  'focus_topup_submit',
]);

function shouldBlockOutsideDismissDuringOnboarding() {
  try {
    return (
      localStorage.getItem('onboarding_pending') === 'true' &&
      TOPUP_ONBOARDING_STEPS.has(localStorage.getItem('onboarding_step') || '')
    );
  } catch {
    return false;
  }
}

function isTopupOnboardingSideGuideStep(step) {
  return TOPUP_ONBOARDING_STEPS.has(step);
}

export function DepositGameModal({
  open,
  onOpenChange,
  game,
  balanceSc,
  amount,
  onAmountChange,
  onSubmit,
  submitting,
  errorMessage,
}) {
  useHideIntercomForGameTransferModal(open);
  const [desktopOnboardingSideGuide, setDesktopOnboardingSideGuide] = useState(false);
  const showDiscount = hasDepositDiscount(game);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const sync = () => {
      try {
        setDesktopOnboardingSideGuide(
          mql.matches &&
            localStorage.getItem('onboarding_pending') === 'true' &&
            isTopupOnboardingSideGuideStep(localStorage.getItem('onboarding_step') || '')
        );
      } catch {
        setDesktopOnboardingSideGuide(false);
      }
    };
    sync();
    mql.addEventListener('change', sync);
    window.addEventListener('onboarding:updated', sync);
    window.addEventListener('onboarding:start', sync);
    window.addEventListener('onboarding:ended', sync);
    return () => {
      mql.removeEventListener('change', sync);
      window.removeEventListener('onboarding:updated', sync);
      window.removeEventListener('onboarding:start', sync);
      window.removeEventListener('onboarding:ended', sync);
    };
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="gtm-backdrop fixed inset-0 z-[110]" />
        <div
          className={`fixed inset-0 z-[120] flex items-center justify-center p-4 overflow-y-auto md:overscroll-y-contain ${
            desktopOnboardingSideGuide ? 'md:pr-[min(19.5rem,32vw)]' : ''
          }`}
        >
          <Dialog.Content
            className="gtm-modal gtm-modal--topup gtm-modal-enter relative w-full max-w-md flex-shrink-0 outline-none mx-auto"
            onInteractOutside={(e) => {
              if (shouldBlockOutsideDismissDuringOnboarding()) e.preventDefault();
            }}
            onPointerDownOutside={(e) => {
              if (shouldBlockOutsideDismissDuringOnboarding()) e.preventDefault();
            }}
          >
            <div className="gtm-glow-ring" aria-hidden />
            <div className="gtm-sparkles" aria-hidden>
              <span className="gtm-spark gtm-spark-1">✦</span>
              <span className="gtm-spark gtm-spark-2">★</span>
              <span className="gtm-spark gtm-spark-3">✦</span>
            </div>

            <Dialog.Close className="gtm-close" aria-label="Close">
              ×
            </Dialog.Close>

            <div className="gtm-inner">
              <div className="gtm-header">
                <Dialog.Title className="gtm-title">Recharge {getGameDisplayName(game)}</Dialog.Title>
                <p className="gtm-subtitle">Sweepcoin (SC)</p>
              </div>
              <DepositDiscountBanner game={game} />

              <div className="gtm-balance-card onboarding-balance-section">
                <p className="gtm-balance-label">Your wallet balance</p>
                <p className="gtm-balance-value">
                  {balanceSc != null ? `${formatSc(balanceSc)} SC` : '? SC'}
                </p>
                <p className="gtm-balance-sub">Available to recharge this game.</p>

                {balanceSc === 0 && localStorage.getItem('onboarding_pending') === 'true' && (
                  <div className="gtm-alert gtm-alert--zero mt-3">
                    <p className="m-0 text-sm leading-relaxed">
                      Oops! You don&apos;t have enough balance to recharge this game.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        window.dispatchEvent(new CustomEvent('onboarding:needs-balance'));
                      }}
                      className="gtm-alert-cta onboarding-get-sc-btn"
                    >
                      Get SC
                    </button>
                  </div>
                )}
              </div>

              {errorMessage ? <div className="gtm-alert gtm-alert--warn onboarding-game-transfer-error">{errorMessage}</div> : null}

              <div className="gtm-field-block">
                <label className="gtm-field-label">Amount (SC)</label>
                {(game?.minDepositLimit > 0 || game?.maxDepositLimit > 0) && (
                  <p className="gtm-field-hint">Limit: {game?.minDepositLimit || 0} - {game?.maxDepositLimit || '∞'} SC</p>
                )}
                <p className="gtm-field-hint">{GAME_DEPOSIT_AMOUNT_HINT}</p>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => onAmountChange(constrainIntegerScInput(e.target.value))}
                  className="gtm-input onboarding-topup-amount-input"
                />
                <DepositDiscountPreview game={game} amount={amount} />
              </div>

              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="gtm-submit gtm-submit--topup onboarding-topup-submit-btn"
              >
                <span className="gtm-submit-shine" aria-hidden />
                {submitting ? (
                  <>
                    <span className="gtm-spinner" aria-hidden />
                    Recharging…
                  </>
                ) : (
                  'Recharge'
                )}
              </button>

              <div className="gtm-steps">
                <p className="gtm-steps-title">How it works</p>
                <ol>
                  <li>
                    Enter amount and click <strong>Recharge</strong>.
                  </li>
                  <li>
                    {showDiscount
                      ? 'Your wallet pays the amount you enter. This game credits extra SC from the recharge bonus.'
                      : 'SC is deducted from your wallet and added to this game.'}
                  </li>
                </ol>
              </div>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
