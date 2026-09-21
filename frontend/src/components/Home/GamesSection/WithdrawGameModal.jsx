import { useEffect, useState } from 'react';
import * as Dialog from '../../ui/Dialog';
import { formatSc } from '../../../utils/currency';
import { getGameDisplayName, isManualModeGame } from '../../../utils/gameDisplay';
import { isGoldenDragonGameName, constrainIntegerScInput, GAME_WITHDRAW_AMOUNT_HINT } from '../../../utils/goldenDragon';
import { useHideIntercomForGameTransferModal } from '../../intercomApi';

const WITHDRAW_ONBOARDING_STEPS = new Set([
  'focus_withdraw_amount',
  'focus_withdraw_submit',
]);

function shouldBlockOutsideDismissDuringOnboarding() {
  try {
    return (
      localStorage.getItem('onboarding_pending') === 'true' &&
      WITHDRAW_ONBOARDING_STEPS.has(localStorage.getItem('onboarding_step') || '')
    );
  } catch {
    return false;
  }
}

export function WithdrawGameModal({
  open,
  onOpenChange,
  game,
  gameBalance,
  winnings,
  redeemableBalance,
  amount,
  onAmountChange,
  onSubmit,
  submitting,
  errorMessage,
}) {
  useHideIntercomForGameTransferModal(open);
  const isManualFlow = isManualModeGame(game);
  const isGoldenDragon = !isManualFlow && isGoldenDragonGameName(game);
  const winningsNum = winnings != null ? Number(winnings) : null;
  const gameBalanceNum = gameBalance != null ? Number(gameBalance) : null;
  // Golden Dragon: only winnings are redeemable — always show/use those as the redeem balance.
  const displayBalanceNum = isGoldenDragon
    ? winningsNum
    : (redeemableBalance != null ? Number(redeemableBalance) : gameBalanceNum);
  const balanceZero = !isManualFlow && displayBalanceNum !== null && displayBalanceNum === 0;
  const disabled = submitting || balanceZero;
  const [desktopOnboardingSideGuide, setDesktopOnboardingSideGuide] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const sync = () => {
      try {
        setDesktopOnboardingSideGuide(
          mql.matches &&
            localStorage.getItem('onboarding_pending') === 'true' &&
            WITHDRAW_ONBOARDING_STEPS.has(localStorage.getItem('onboarding_step') || '')
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
          className={`fixed inset-0 z-[120] flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh] ${
            desktopOnboardingSideGuide ? 'md:pr-[min(19.5rem,32vw)]' : ''
          }`}
        >
          <Dialog.Content
            className="gtm-modal gtm-modal--redeem gtm-modal-enter relative w-full max-w-md flex-shrink-0 outline-none mx-auto"
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
                <Dialog.Title className="gtm-title">Redeem from {getGameDisplayName(game)}</Dialog.Title>
                <p className="gtm-subtitle">Sweepcoin (SC)</p>
              </div>

              {!isManualFlow && (
                <div className="gtm-balance-card gtm-balance-card--redeem">
                  <p className="gtm-balance-label">Your game balance</p>
                  <p className="gtm-balance-value">
                    {displayBalanceNum != null ? `${formatSc(displayBalanceNum)} SC` : 'Loading...'}
                  </p>
                  <p className="gtm-balance-sub">
                    {displayBalanceNum == null
                      ? 'Fetching balance from game provider...'
                      : balanceZero
                        ? isGoldenDragon
                          ? 'No winnings available to redeem yet.'
                          : 'Recharge this game to redeem later.'
                        : isGoldenDragon
                          ? 'Winnings available to redeem to your wallet.'
                          : 'Available to redeem to your wallet.'}
                  </p>
                </div>
              )}

              {balanceZero && (
                <div className="gtm-alert gtm-alert--warn">
                  You don&apos;t have enough balance to redeem. Your game balance is{' '}
                  {formatSc(displayBalanceNum)} SC.
                </div>
              )}
              {errorMessage && <div className="gtm-alert gtm-alert--warn onboarding-game-transfer-error">{errorMessage}</div>}

              <div className="gtm-field-block">
                <div className="gtm-field-row">
                  <label className="gtm-field-label m-0">Amount (SC)</label>
                  {(game?.minWithdrawalLimit > 0 || game?.maxWithdrawalLimit > 0) && (
                    <span className="gtm-limit">
                      Limit: {game?.minWithdrawalLimit || 0} - {game?.maxWithdrawalLimit || '∞'} SC
                    </span>
                  )}
                </div>
                <p className="gtm-field-hint">{GAME_WITHDRAW_AMOUNT_HINT}</p>
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => onAmountChange(constrainIntegerScInput(e.target.value))}
                  disabled={balanceZero}
                  className="gtm-input onboarding-withdraw-amount-input"
                />
              </div>

              <button
                type="button"
                onClick={onSubmit}
                disabled={disabled}
                className="gtm-submit gtm-submit--redeem onboarding-withdraw-submit-btn"
              >
                <span className="gtm-submit-shine" aria-hidden />
                {submitting ? (
                  <>
                    <span className="gtm-spinner" aria-hidden />
                    Redeeming…
                  </>
                ) : (
                  'Redeem'
                )}
              </button>

              <div className="gtm-steps">
                <p className="gtm-steps-title">How it works</p>
                <ol>
                  <li>
                    Enter amount and click <strong>Redeem</strong>.
                  </li>
                  <li>
                    {isManualFlow
                      ? 'Your redeem request is submitted for processing.'
                      : 'SC is sent from this game to your wallet.'}
                  </li>
                  <li>
                    {isManualFlow
                      ? 'Once approved, SC is added to your wallet.'
                      : 'Your wallet balance (navbar) updates; you can use the SC elsewhere.'}
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
