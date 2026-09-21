import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import * as gamesApi from '../../api/games';
import { GameCard } from '../../components/Games/GameCard';
import { usePageContentReady } from '../../context/PageReadyContext';
import * as Dialog from '../../components/ui/Dialog';
import { formatSc } from '../../utils/currency';
import { getGameDisplayName, isManualModeGame } from '../../utils/gameDisplay';
import {
  isGoldenDragonGameName,
  isIntegerScAmount,
  constrainIntegerScInput,
  GAME_DEPOSIT_AMOUNT_HINT,
  GAME_DEPOSIT_AMOUNT_ERROR,
  GAME_WITHDRAW_AMOUNT_HINT,
  GAME_WITHDRAW_AMOUNT_ERROR,
} from '../../utils/goldenDragon';
import {
  formatRedeemMinimumBalanceAlertMessage,
  shouldToastGameWalletTransferMessage,
} from '../../utils/gameWalletTransferErrors';
import { DepositRequiredModal } from '../../components/Games/DepositRequiredModal';
import { DepositDiscountBanner, DepositDiscountPreview, hasDepositDiscount } from '../../components/Games/DepositDiscountOffer';
import { useDepositRequiredGate } from '../../hooks/useDepositRequiredGate';
import { isDepositRequiredError } from '../../utils/depositRequired';

export { GameDetail } from './GameDetail';
export { GamesListing } from './GamesListing';
export { SeoGameCategory } from './SeoGameCategory';

const INSUFFICIENT_BALANCE_PATTERNS = /insufficient|wallet balance|not have.*balance/i;

export function Games() {
  const navigate = useNavigate();
  const { isAuthenticated, refreshBalance: refreshScWallet, balanceSc } = useAuth();
  const { toast } = useToast();
  const {
    requireDeposit,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    openDepositRequiredModal,
    activationBonusType,
  } = useDepositRequiredGate({ enabled: isAuthenticated });
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [activeGame, setActiveGame] = useState(null);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeGameBalance, setActiveGameBalance] = useState(null);
  const [activeGameWinnings, setActiveGameWinnings] = useState(null);
  const [balanceRefreshTrigger, setBalanceRefreshTrigger] = useState({ gameId: null, key: 0 });
  const [redeemError, setRedeemError] = useState(null);
  const [topupError, setTopupError] = useState(null);

  usePageContentReady(!loading);

  async function load() {
    setLoading(true);
    try {
      const res = await gamesApi.listGames();
      const list = res.games || [];
      // Registered games (user has an account) at top, then others
      const sorted = [...list].sort((a, b) => {
        const aReg = a.has_account ? 1 : 0;
        const bReg = b.has_account ? 1 : 0;
        if (bReg !== aReg) return bReg - aReg; // registered first
        return (a.id || 0) - (b.id || 0);
      });
      setGames(sorted);
    } catch (e) {
      toast.error(e.message || 'Unable to load games. Please try again later.');
      setGames([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [isAuthenticated]);

  // When any game has pending approval, poll so list updates when admin approves (no refresh needed)
  const hasPendingGame = games.some((g) => g.has_account && g.account_status === 'pending');
  useEffect(() => {
    if (!hasPendingGame) return;
    const interval = setInterval(() => load(), 30000);
    return () => clearInterval(interval);
  }, [hasPendingGame]);

  // Handle balance fetching when withdraw modal opens
  useEffect(() => {
    if (withdrawModalOpen && activeGame) {
      refreshActiveGameBalance();
    }
  }, [withdrawModalOpen, activeGame]);

  async function refreshActiveGameBalance() {
    if (!activeGame) return;
    if (isManualModeGame(activeGame)) {
      setActiveGameBalance(null);
      setActiveGameWinnings(null);
      return;
    }
    try {
      const res = await gamesApi.getGameBalance(activeGame.id);
      setActiveGameBalance(res.balance);
      setActiveGameWinnings(res?.winnings != null ? Number(res.winnings) : null);
    } catch {
      // No red toast for game balance API (automation/manual mode handled on our side)
    }
  }

  function handleOpenDeposit(game) {
    requireDeposit(() => {
      setActiveGame(game);
      setTopupAmount('');
      setTopupError(null);
      setDepositModalOpen(true);
    });
  }

  function handleOpenWithdraw(game) {
    requireDeposit(() => {
      setActiveGame(game);
      setWithdrawAmount('');
      setRedeemError(null);
      setActiveGameBalance(null); // Reset until it fetches
      setActiveGameWinnings(null);
      setWithdrawModalOpen(true);
    });
  }

  function handleOpenPlay(game) {
    requireDeposit(() => {
      const url = game?.platformGameUrl ? String(game.platformGameUrl).trim() : '';
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  async function handleTopup() {
    if (!activeGame) return;
    const n = parseInt(String(topupAmount).trim(), 10);
    if (!isIntegerScAmount(n)) {
      setTopupError(GAME_DEPOSIT_AMOUNT_ERROR);
      return;
    }
    const amount = n;
    if (balanceSc != null && amount > balanceSc) {
      setTopupError(`Your wallet balance is insufficient. Please enter an amount up to ${balanceSc.toFixed(2)} SC.`);
      return;
    }
    if (activeGame.minDepositLimit > 0 && amount < activeGame.minDepositLimit) {
      setTopupError(`The minimum deposit amount for this game is ${activeGame.minDepositLimit} SC.`);
      return;
    }
    if (activeGame.maxDepositLimit > 0 && amount > activeGame.maxDepositLimit) {
      setTopupError(`The maximum deposit amount for this game is ${activeGame.maxDepositLimit} SC.`);
      return;
    }
    setTopupError(null);
    setSubmitting(true);
    try {
      const res = await gamesApi.gameTopup(activeGame.id, amount);
      toast.success(res?.message_extra || res?.message || 'Recharge successful');
      setTopupAmount('');
      setDepositModalOpen(false);
      await refreshScWallet?.();
      setBalanceRefreshTrigger((prev) => ({ gameId: activeGame.id, key: prev.key + 1 }));
      load();
    } catch (e) {
      const msg = e.message || '';
      if (isDepositRequiredError(e)) {
        setDepositModalOpen(false);
        openDepositRequiredModal();
      } else if (INSUFFICIENT_BALANCE_PATTERNS.test(msg)) {
        setTopupError('You don\'t have enough balance in your wallet to complete this recharge.');
      } else if (shouldToastGameWalletTransferMessage(e)) {
        toast.error(msg);
      }
      // No red toast for other topup errors (game/bot APIs; automation handled on our side)
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw() {
    if (!activeGame) return;

    const gd = isGoldenDragonGameName(activeGame);
    const n = parseInt(String(withdrawAmount).trim(), 10);
    if (!isIntegerScAmount(n)) {
      setRedeemError(GAME_WITHDRAW_AMOUNT_ERROR);
      return;
    }
    const amount = n;

    const redeemableCap = gd ? activeGameWinnings : activeGameBalance;
    if (!isManualModeGame(activeGame) && redeemableCap != null && amount > redeemableCap) {
      setRedeemError(`Your game balance is insufficient. Please enter an amount up to ${formatSc(redeemableCap)} SC.`);
      return;
    }
    setRedeemError(null);

    setSubmitting(true);
    try {
      const res = await gamesApi.gameRedeem(activeGame.id, amount);
      toast.success(res?.message_extra || res?.message || 'Redeem successful! SC added to your wallet.');
      setWithdrawAmount('');
      setWithdrawModalOpen(false);
      await refreshScWallet?.();
      setBalanceRefreshTrigger((prev) => ({ gameId: activeGame.id, key: prev.key + 1 }));
      load();
    } catch (e) {
      if (isDepositRequiredError(e)) {
        setWithdrawModalOpen(false);
        openDepositRequiredModal();
      } else if (shouldToastGameWalletTransferMessage(e)) {
        const alertMessage =
          formatRedeemMinimumBalanceAlertMessage(e.message) || 'Request could not be completed.';
        toast.error(alertMessage);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const activeGameIsGoldenDragon = isGoldenDragonGameName(activeGame);

  const isActiveGameManualFlow = isManualModeGame(activeGame);
  const activeGameRedeemable = activeGameIsGoldenDragon ? activeGameWinnings : activeGameBalance;
  const activeGameBalanceZero =
    !isActiveGameManualFlow && activeGameRedeemable !== null && activeGameRedeemable === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100">Games</h1>
        <p className="text-muted mt-1">Choose a game and register or play. Only active BOT games are shown.</p>
      </div>

      {games.length === 0 ? (
        <div className="rounded-xl bg-card border border-gray-700/60 p-8 text-center">
          <p className="text-gray-300">No games are available at the moment.</p>
          <p className="text-muted mt-2 text-sm">Please check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              onRegistered={load}
              onOpenDeposit={handleOpenDeposit}
              onOpenWithdraw={handleOpenWithdraw}
              onOpenPlay={handleOpenPlay}
              balanceRefreshTrigger={balanceRefreshTrigger.gameId === game.id ? balanceRefreshTrigger.key : 0}
            />
          ))}
        </div>
      )}

      {/* Deposit modal */}
      <Dialog.Root open={depositModalOpen} onOpenChange={setDepositModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px]" />
          <div className="fixed inset-0 z-[60] md:left-72 min-h-[100dvh] overflow-y-auto flex items-center justify-center p-4">
            <Dialog.Content className="relative w-full max-w-md my-auto p-6 bg-card border border-gray-600 rounded-xl shadow-2xl outline-none">
              <Dialog.Close
                className="absolute right-3 top-3 w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-700 outline-none text-xl"
                aria-label="Close"
              >
                &#215;
              </Dialog.Close>
              <Dialog.Title className="text-xl font-bold text-gray-100 mb-0.5">Recharge {getGameDisplayName(activeGame)}</Dialog.Title>
              <p className="text-muted text-sm mb-3">Sweepcoin (SC)</p>
              {hasDepositDiscount(activeGame) ? (
                <div className="mb-4">
                  <DepositDiscountBanner game={activeGame} />
                </div>
              ) : null}
              <div className="rounded-lg border border-primary/40 bg-gray-800/60 px-4 py-3 mb-4">
                <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Your wallet balance</p>
                <p className="text-2xl font-semibold text-gray-100 tabular-nums">
                  {balanceSc != null ? `${formatSc(balanceSc)} SC` : '? SC'}
                </p>
                <p className="text-xs text-muted mt-1">Available to recharge this game.</p>
              </div>
              {topupError ? (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 mb-4 text-amber-200 text-sm">
                  {topupError}
                </div>
              ) : null}
              <label className="block text-sm text-gray-300 mb-1">Amount (SC)</label>
              {(activeGame?.minDepositLimit > 0 || activeGame?.maxDepositLimit > 0) && (
                <p className="text-xs text-muted mb-1">
                  Limit: {activeGame?.minDepositLimit || 0} - {activeGame?.maxDepositLimit || '∞'} SC
                </p>
              )}
              <p className="text-xs text-muted mb-2">{GAME_DEPOSIT_AMOUNT_HINT}</p>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="Enter amount"
                value={topupAmount}
                onChange={(e) => {
                  setTopupAmount(constrainIntegerScInput(e.target.value));
                  setTopupError(null);
                }}
                className="w-full bg-input border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder:text-muted mb-2"
              />
              {hasDepositDiscount(activeGame) ? (
                <div className="mb-4">
                  <DepositDiscountPreview game={activeGame} amount={topupAmount} />
                </div>
              ) : (
                <div className="mb-2" />
              )}
              <button
                type="button"
                onClick={handleTopup}
                disabled={submitting}
                className="w-full py-3 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-500 disabled:opacity-70 transition mb-4 inline-flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
                    Recharging…
                  </>
                ) : (
                  'Recharge'
                )}
              </button>
              <div className="rounded-lg bg-gray-800/80 px-3 py-2.5 text-sm">
                <p className="font-medium text-gray-200 mb-1.5">Steps</p>
                <ol className="list-decimal list-inside space-y-1 text-muted text-xs">
                  <li>Enter amount and click <strong className="text-gray-300">Recharge</strong>.</li>
                  <li>SC is deducted from your wallet and added to this game.</li>
                </ol>
              </div>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Withdraw modal */}
      <Dialog.Root open={withdrawModalOpen} onOpenChange={setWithdrawModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px]" />
          <div className="fixed inset-0 z-[60] md:left-72 min-h-[100dvh] overflow-y-auto flex items-center justify-center p-4">
            <Dialog.Content className="relative w-full max-w-md my-auto p-6 bg-card border border-gray-600 rounded-xl shadow-2xl outline-none">
              <Dialog.Close
                className="absolute right-3 top-3 w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-700 outline-none text-xl"
                aria-label="Close"
              >
                &#215;
              </Dialog.Close>
              <Dialog.Title className="text-xl font-bold text-gray-100 mb-0.5">Redeem from {getGameDisplayName(activeGame)}</Dialog.Title>
              <p className="text-muted text-sm mb-4">Sweepcoin (SC)</p>
              {!isActiveGameManualFlow && (
              <div className="rounded-lg border border-red-500/40 bg-gray-800/60 px-4 py-3 mb-4">
                <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Your game balance</p>
                <p className="text-2xl font-semibold text-gray-100 tabular-nums">
                  {activeGameRedeemable != null ? `${formatSc(activeGameRedeemable)} SC` : 'Loading...'}
                </p>
                <p className="text-xs text-muted mt-1">
                  {activeGameRedeemable == null
                    ? 'Fetching balance from game provider...'
                    : activeGameBalanceZero
                      ? activeGameIsGoldenDragon
                        ? 'No winnings available to redeem yet.'
                        : 'Recharge this game to redeem later.'
                      : activeGameIsGoldenDragon
                        ? 'Winnings available to redeem to your wallet.'
                        : 'Available to redeem to your wallet.'}
                </p>
              </div>
              )}
              {activeGameBalanceZero ? (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 mb-4 text-amber-200 text-sm">
                  You don&apos;t have enough balance to redeem. Your game balance is{' '}
                  {formatSc(activeGameRedeemable)} SC.
                </div>
              ) : null}
              {redeemError ? (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 mb-4 text-amber-200 text-sm">
                  {redeemError}
                </div>
              ) : null}
              <div className="flex items-end justify-between mb-1">
                <label className="block text-sm text-gray-300">Amount (SC)</label>
                {(activeGame?.minWithdrawalLimit > 0 || activeGame?.maxWithdrawalLimit > 0) && (
                  <span className="text-xs text-muted">
                    Limit: {activeGame?.minWithdrawalLimit || 0} - {activeGame?.maxWithdrawalLimit || '∞'} SC
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mb-2">{GAME_WITHDRAW_AMOUNT_HINT}</p>
              <input
                type="number"
                min="1"
                step="1"
                placeholder="Enter amount"
                value={withdrawAmount}
                onChange={(e) => {
                  setWithdrawAmount(constrainIntegerScInput(e.target.value));
                  setRedeemError(null);
                }}
                disabled={activeGameBalanceZero}
                className="w-full bg-input border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder:text-muted mb-4 disabled:opacity-60 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={submitting || activeGameBalanceZero}
                className="w-full py-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-500 disabled:opacity-70 disabled:cursor-not-allowed transition mb-4 inline-flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden />
                    Redeeming…
                  </>
                ) : (
                  'Redeem'
                )}
              </button>
              <div className="rounded-lg bg-gray-800/80 px-3 py-2.5 text-sm">
                <p className="font-medium text-gray-200 mb-1.5">Steps</p>
                <ol className="list-decimal list-inside space-y-1 text-muted text-xs">
                  <li>Enter amount and click <strong className="text-gray-300">Redeem</strong>.</li>
                  <li>
                    {isActiveGameManualFlow
                      ? 'Your redeem request is submitted for processing.'
                      : 'SC is sent from this game to your wallet.'}
                  </li>
                  <li>
                    {isActiveGameManualFlow
                      ? 'Once approved, SC is added to your wallet.'
                      : 'Your wallet balance (navbar) updates; you can use the SC elsewhere.'}
                  </li>
                </ol>
              </div>
            </Dialog.Content>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
      <DepositRequiredModal
        open={depositRequiredModalOpen}
        onClose={closeDepositRequiredModal}
        activationBonusType={activationBonusType}
      />
    </div>
  );
}
