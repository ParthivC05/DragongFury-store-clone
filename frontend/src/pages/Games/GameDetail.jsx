import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import * as gamesApi from '../../api/games';
import * as transactionsApi from '../../api/transactions';
import { usePageContentReady } from '../../context/PageReadyContext';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import * as Dialog from '../../components/ui/Dialog';
import { CopyIcon, EyeIcon, EyeOffIcon, RefreshIcon, PlayIcon, ChevronLeftIcon } from '../../assets/icons';
import { formatSc } from '../../utils/currency';
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
import { WithdrawPromptModal } from '../../components/Games/WithdrawPromptModal';
import { useDepositRequiredGate } from '../../hooks/useDepositRequiredGate';
import { isDepositRequiredError } from '../../utils/depositRequired';
import { GameImage } from '../../components/Games/GameImage';
import { getGameDisplayName, isJuwa20Game, isCustomManualGame, isManualModeGame, isCashmachineAgentGame } from '../../utils/gameDisplay';
import { applyRouteSchema, clearPageSchema } from '../../utils/schemaOrg';

function formatDateTime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const TX_PAGE_SIZES = [10, 20, 50];
const TX_DEFAULT_LIMIT = 10;
const INSUFFICIENT_BALANCE_PATTERNS = /insufficient|wallet balance|not have.*balance/i;

function txTypeLabel(type) {
  if (type === 'topup') return 'Recharge';
  if (type === 'withdraw' || type === 'redeem') return 'Redeem';
  return type;
}

function GameDetailInner() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const {
    requireDeposit,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    openDepositRequiredModal,
    activationBonusType,
  } = useDepositRequiredGate();
  const { refreshBalance: refreshScWallet, balanceSc } = useAuth();
  const [game, setGame] = useState(null);
  const [balance, setBalance] = useState(null);
  const [entriesBalance, setEntriesBalance] = useState(null);
  const [winningsBalance, setWinningsBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [txData, setTxData] = useState({ transactions: [], total: 0, page: 1, limit: TX_DEFAULT_LIMIT, total_pages: 0 });
  const [txPage, setTxPage] = useState(1);
  const [txLimit, setTxLimit] = useState(TX_DEFAULT_LIMIT);
  const [txLoading, setTxLoading] = useState(false);
  const [depositModalOpen, setDepositModalOpen] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [redeemError, setRedeemError] = useState(null);
  const [withdrawPromptOpen, setWithdrawPromptOpen] = useState(false);
  const [redeemedAmount, setRedeemedAmount] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);

  usePageContentReady(!loading);

  // Open deposit or withdraw modal when navigating from game card with ?modal=deposit or ?modal=withdraw
  useEffect(() => {
    const modal = searchParams.get('modal');
    if (modal === 'deposit' || modal === 'withdraw') {
      requireDeposit(() => {
        if (modal === 'deposit') setDepositModalOpen(true);
        if (modal === 'withdraw') setWithdrawModalOpen(true);
      });
    }
  }, [searchParams, requireDeposit]);

  function clearModalParam() {
    if (searchParams.has('modal')) {
      const next = new URLSearchParams(searchParams);
      next.delete('modal');
      setSearchParams(next, { replace: true });
    }
  }

  const loadGame = useCallback(async (silent = false) => {
    if (!gameId) return;
    if (!silent) setLoading(true);
    try {
      const data = await gamesApi.getGame(gameId);
      setGame(data);
    } catch (e) {
      if (!silent) toast.error(e.message || 'Failed to load game');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [gameId, toast]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!gameId) return;
      setLoading(true);
      try {
        const data = await gamesApi.getGame(gameId);
        if (!cancelled) setGame(data);
      } catch (e) {
        if (!cancelled) toast.error(e.message || 'Failed to load game');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [gameId, toast]);

  useEffect(() => {
    if (!game?.name || !gameId) return undefined;
    const displayName = getGameDisplayName(game);
    applyRouteSchema(`/games/${gameId}`, {
      gameName: displayName,
      gameId,
      gameImage: game.image_url || game.imageUrl,
    });
    return () => {
      clearPageSchema();
    };
  }, [game, gameId]);

  // When this game is pending approval, poll so page updates when admin approves (no refresh needed)
  const isGamePending = game?.has_account && game?.account_status === 'pending';
  const isCustomManual = isCustomManualGame(game);
  const isManualFlow = isManualModeGame(game);
  const isGoldenDragonForRedeem = isGoldenDragonGameName(game);
  const redeemDisplayBalance = isGoldenDragonForRedeem ? winningsBalance : balance;
  const balanceZero = !isManualFlow && redeemDisplayBalance !== null && redeemDisplayBalance === 0;
  useEffect(() => {
    if (!isGamePending) return;
    const interval = setInterval(() => loadGame(true), 30000);
    return () => clearInterval(interval);
  }, [isGamePending, loadGame]);

  const loadGameTransactions = useCallback(async (page, limit) => {
    if (!game) return;
    setTxLoading(true);
    try {
      const res = await transactionsApi.getGameTransactions({ gameName: game.name, page, limit });
      setTxData({
        transactions: res.transactions || [],
        total: res.total ?? 0,
        page: res.page ?? page,
        limit: res.limit ?? limit,
        total_pages: res.total_pages ?? 0
      });
    } catch (_) {}
    finally {
      setTxLoading(false);
    }
  }, [game]);

  useEffect(() => {
    if (game) loadGameTransactions(txPage, txLimit);
  }, [game, txPage, txLimit]);

  // Refresh game balance when Withdraw modal opens so it shows current balance
  useEffect(() => {
    if (withdrawModalOpen && gameId) {
      refreshBalance();
    }
  }, [withdrawModalOpen]);

  useEffect(() => {
    if (withdrawModalOpen) setRedeemError(null);
  }, [withdrawModalOpen]);

  async function refreshBalance() {
    if (!gameId) return;
    if (isManualModeGame(game)) {
      setBalance(null);
      setEntriesBalance(null);
      setWinningsBalance(null);
      return;
    }
    setBalanceLoading(true);
    try {
      const res = await gamesApi.getGameBalance(gameId);
      setBalance(res.balance);
      setEntriesBalance(res.entries != null ? Number(res.entries) : null);
      setWinningsBalance(res.winnings != null ? Number(res.winnings) : null);
    } catch {
      // No red toast for game balance API (automation/manual mode handled on our side)
    } finally {
      setBalanceLoading(false);
    }
  }

  async function handleTopup() {
    const n = parseInt(String(topupAmount).trim(), 10);
    if (!isIntegerScAmount(n)) {
      toast.error(GAME_DEPOSIT_AMOUNT_ERROR);
      return;
    }
    const amount = n;
    if (game?.minDepositLimit > 0 && amount < game.minDepositLimit) {
      toast.error(`The minimum deposit amount for this game is ${game.minDepositLimit} SC.`);
      return;
    }
    if (game?.maxDepositLimit > 0 && amount > game.maxDepositLimit) {
      toast.error(`The maximum deposit amount for this game is ${game.maxDepositLimit} SC.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await gamesApi.gameTopup(gameId, amount);
      toast.success(res?.message_extra || res?.message || 'Recharge successful');
      setTopupAmount('');
      setDepositModalOpen(false);
      refreshBalance();
      await refreshScWallet?.();
      loadGameTransactions(1, txLimit);
      setTxPage(1);
    } catch (e) {
      const msg = e.message || '';
      if (isDepositRequiredError(e)) {
        setDepositModalOpen(false);
        openDepositRequiredModal();
      } else if (INSUFFICIENT_BALANCE_PATTERNS.test(msg)) {
        setDepositModalOpen(false);
        toast.error('You don\'t have enough balance in your wallet to complete this recharge.');
        navigate('/deposit');
      } else if (shouldToastGameWalletTransferMessage(e)) {
        toast.error(msg);
      }
      // No red toast for other topup errors (game/bot APIs; automation handled on our side)
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw() {
    const gd = isGoldenDragonGameName(game);
    const n = parseInt(String(withdrawAmount).trim(), 10);
    if (!isIntegerScAmount(n)) {
      toast.error(GAME_WITHDRAW_AMOUNT_ERROR);
      return;
    }
    const amount = n;
    const redeemableBalance = gd ? winningsBalance : balance;
    // Validate amount does not exceed game balance (before calling API)
    if (!isManualModeGame(game) && redeemableBalance != null && amount > redeemableBalance) {
      setRedeemError(`Your game balance is insufficient. Please enter an amount up to ${formatSc(redeemableBalance)} SC.`);
      return;
    }
    setRedeemError(null);
    setSubmitting(true);
    try {
      const res = await gamesApi.gameWithdraw(gameId, amount);
      toast.success(res?.message_extra || res?.message || 'Redeem successful');
      setWithdrawAmount('');
      setWithdrawModalOpen(false);
      refreshBalance();
      await refreshScWallet?.();
      loadGameTransactions(1, txLimit);
      setTxPage(1);
      // Auto (bot online) redeem credits the wallet immediately — offer next steps.
      if (!res?.pending) {
        setRedeemedAmount(amount);
        setWithdrawPromptOpen(true);
      }
    } catch (e) {
      if (isDepositRequiredError(e)) {
        setWithdrawModalOpen(false);
        openDepositRequiredModal();
      } else if (shouldToastGameWalletTransferMessage(e)) {
        const alertMessage =
          formatRedeemMinimumBalanceAlertMessage(e.message) || 'Request could not be completed.';
        toast.error(alertMessage);
      }
      // No red toast for other redeem errors (manual mode queued on our side)
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    if (!game?.name) return;
    setResettingPassword(true);
    try {
      const res = await gamesApi.gameForgotPassword(game.name, game.bot_username || '');
      // Reflect the newly generated password without a manual refresh.
      const newPassword = res?.data?.new_password;
      if (newPassword) {
        setGame((prev) => (prev ? { ...prev, bot_password: newPassword } : prev));
        setShowPassword(true);
      } else {
        // Manual mode / no password returned — reload to stay in sync.
        loadGame(true);
      }
      toast.success(res?.message || 'Password reset successfully.');
    } catch (e) {
      toast.error(gamesApi.getGamePasswordResetErrorMessage(e));
    } finally {
      setResettingPassword(false);
    }
  }

  if (!loading && !game) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 py-2 pr-3 pl-2 -ml-2 rounded-lg text-gray-300 hover:text-primary hover:bg-gray-800/60 transition-colors text-sm font-medium"
        >
          <ChevronLeftIcon className="w-5 h-5 flex-shrink-0" aria-hidden />
          Back to Games
        </Link>
        <div className="rounded-xl bg-card border border-gray-700 p-6 text-center text-muted">
          Game not found.
          <Link to="/" className="block mt-4 text-primary hover:underline">Go to Games</Link>
        </div>
      </div>
    );
  }

  if (loading || !game) {
    return null;
  }

  const isGoldenDragonGame = isGoldenDragonGameName(game);

  if (!game.has_account || game.account_status !== 'approved') {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 py-2 pr-3 pl-2 -ml-2 rounded-lg text-gray-300 hover:text-primary hover:bg-gray-800/60 transition-colors text-sm font-medium"
        >
          <ChevronLeftIcon className="w-5 h-5 flex-shrink-0" aria-hidden />
          Back to Games
        </Link>
        <div className="rounded-xl bg-card border border-gray-700 p-6 text-center text-muted">
          You need to register for this game first.
          <Link to="/" className="block mt-4 text-primary hover:underline">Go to Games</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-2 py-2 pr-3 pl-2 -ml-2 rounded-lg text-gray-300 hover:text-primary hover:bg-gray-800/60 transition-colors text-sm font-medium"
      >
        <ChevronLeftIcon className="w-5 h-5 flex-shrink-0" aria-hidden />
        Back to Games
      </Link>

      <div className="rounded-xl bg-card border border-gray-700/60 overflow-hidden">
        <div className="p-6 border-b border-gray-700/60 flex items-center gap-4">
          <GameImage game={game} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-100">{getGameDisplayName(game)}</h1>
            <p className="text-sm text-green-500 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Online
            </p>
          </div>
          {(game.platform_game_url || game.platformGameUrl) && (
            <button
              type="button"
              onClick={() =>
                requireDeposit(() => {
                  const url = String(game.platform_game_url || game.platformGameUrl || '').trim();
                  if (url) window.open(url, '_blank', 'noopener,noreferrer');
                })
              }
              className="flex-shrink-0 inline-flex items-center gap-2 py-2 px-4 rounded-lg bg-primary text-white font-medium hover:bg-orange-600 transition"
              title="Play game (opens in new tab)"
            >
              <PlayIcon />
              <span>Play game</span>
            </button>
          )}
        </div>

        <div className="p-6 space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">Login credentials</h2>
            <p className="text-xs text-muted mb-2">Use these to log into the game platform. Keep them secure.</p>
            <div className="rounded-lg bg-gray-800/80 p-4 space-y-3">
              <div>
                <label className="text-xs text-muted block mb-1">Game ID / Username</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={game.bot_username || ''}
                    className="flex-1 bg-input border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(game.bot_username || '')}
                    className="p-2 rounded text-primary hover:bg-primary/10 transition"
                    title="Copy username"
                  >
                    <CopyIcon />
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted block mb-1">Password</label>
                <div className="flex items-center gap-2">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    readOnly
                    value={game.bot_password || ''}
                    className="flex-1 bg-input border border-gray-600 rounded px-3 py-2 text-sm text-gray-100 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="p-2 rounded text-primary hover:bg-primary/10 transition"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(game.bot_password || '')}
                    className="p-2 rounded text-primary hover:bg-primary/10 transition"
                    title="Copy password"
                  >
                    <CopyIcon />
                  </button>
                </div>
                {!isJuwa20Game(game.name) && !isGoldenDragonGame && !isCustomManual && !isCashmachineAgentGame(game) && (
                  <div className="mt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resettingPassword}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline disabled:opacity-60 disabled:cursor-not-allowed disabled:no-underline"
                    >
                      {resettingPassword && (
                        <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" aria-hidden />
                      )}
                      {resettingPassword ? 'Resetting…' : 'Reset password?'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {!isManualFlow && (
          <section>
            <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-2">Balance</h2>
            <p className="text-muted text-xs mb-2">Your balance in this game. Click refresh to load.</p>
            <div className="flex items-center gap-3">
              <span className="text-xl font-semibold text-gray-100 tabular-nums">
                {balance != null ? `${formatSc(balance)} SC` : '? SC'}
              </span>
              <button
                type="button"
                onClick={refreshBalance}
                disabled={balanceLoading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition disabled:opacity-50 text-sm font-medium"
                title="Refresh balance"
              >
                <RefreshIcon className={balanceLoading ? 'animate-spin w-4 h-4' : 'w-4 h-4'} />
                {balanceLoading ? 'Loading…' : 'Refresh balance'}
              </button>
            </div>
            {isGoldenDragonGame && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-800/60 border border-gray-700/60 px-3 py-2">
                  <p className="text-xs text-muted uppercase tracking-wide">Entries (SC)</p>
                  <p className="text-base font-semibold text-gray-100 tabular-nums">
                    {entriesBalance != null ? `${formatSc(entriesBalance)} SC` : '? SC'}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-800/60 border border-gray-700/60 px-3 py-2">
                  <p className="text-xs text-muted uppercase tracking-wide">Winnings (SC)</p>
                  <p className="text-base font-semibold text-gray-100 tabular-nums">
                    {winningsBalance != null ? `${formatSc(winningsBalance)} SC` : '? SC'}
                  </p>
                </div>
              </div>
            )}
          </section>
          )}

          <section className="sm:block">
            <h2 className="text-sm font-semibold text-primary uppercase tracking-wide mb-3">Recharge & Redeem</h2>
            <p className="text-muted text-xs mb-4">Move SC between your wallet and this game.</p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => requireDeposit(() => setDepositModalOpen(true))}
                className="inline-flex items-center gap-2 py-3 px-5 rounded-xl bg-green-600/90 text-white font-semibold hover:bg-green-500 transition"
              >
                Recharge
              </button>
              <button
                type="button"
                onClick={() => requireDeposit(() => setWithdrawModalOpen(true))}
                className="inline-flex items-center gap-2 py-3 px-5 rounded-xl bg-red-600/90 text-white font-semibold hover:bg-red-500 transition"
              >
                Redeem
              </button>
            </div>
          </section>

          {/* Deposit modal */}
          <Dialog.Root
            open={depositModalOpen}
            onOpenChange={(open) => {
              if (!open) {
                setDepositModalOpen(false);
                clearModalParam();
              }
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px]" />
              <div className="fixed inset-0 z-[60] md:left-72 min-h-[100dvh] overflow-y-auto flex items-center justify-center p-4">
                <Dialog.Content
                  className="relative w-full max-w-md my-auto p-6 bg-card border border-gray-600 rounded-xl shadow-2xl outline-none"
                  onEscapeKeyDown={() => { setDepositModalOpen(false); clearModalParam(); }}
                  onPointerDownOutside={() => { setDepositModalOpen(false); clearModalParam(); }}
                >
                  <Dialog.Close
                    className="absolute right-3 top-3 w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-700 outline-none text-xl"
                    aria-label="Close"
                  >
                    &#215;
                  </Dialog.Close>
                  <Dialog.Title className="text-xl font-bold text-gray-100 mb-0.5">Recharge</Dialog.Title>
                  <p className="text-muted text-sm mb-3">Sweepcoin (SC)</p>
                  {hasDepositDiscount(game) ? (
                    <div className="mb-4">
                      <DepositDiscountBanner game={game} />
                    </div>
                  ) : null}
                  <div className="rounded-lg border border-primary/40 bg-gray-800/60 px-4 py-3 mb-4">
                    <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Your wallet balance</p>
                    <p className="text-2xl font-semibold text-gray-100 tabular-nums">
                      {balanceSc != null ? `${formatSc(balanceSc)} SC` : '? SC'}
                    </p>
                    <p className="text-xs text-muted mt-1">Available to recharge this game.</p>
                  </div>
                  <label className="block text-sm text-gray-300 mb-1">Amount (SC)</label>
                  {(game?.minDepositLimit > 0 || game?.maxDepositLimit > 0) && (
                    <p className="text-xs text-muted mb-1">
                      Limit: {game?.minDepositLimit || 0} - {game?.maxDepositLimit || '∞'} SC
                    </p>
                  )}
                  <p className="text-xs text-muted mb-2">{GAME_DEPOSIT_AMOUNT_HINT}</p>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Enter amount"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(constrainIntegerScInput(e.target.value))}
                    className="w-full bg-input border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder:text-muted mb-2"
                  />
                  {hasDepositDiscount(game) ? (
                    <div className="mb-4">
                      <DepositDiscountPreview game={game} amount={topupAmount} />
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
                      <li>Click Refresh balance above to see your updated game balance.</li>
                    </ol>
                  </div>
                </Dialog.Content>
              </div>
            </Dialog.Portal>
          </Dialog.Root>

          {/* Withdraw modal */}
          <Dialog.Root
            open={withdrawModalOpen}
            onOpenChange={(open) => {
              if (!open) {
                setWithdrawModalOpen(false);
                clearModalParam();
              }
            }}
          >
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px]" />
              <div className="fixed inset-0 z-[60] md:left-72 min-h-[100dvh] overflow-y-auto flex items-center justify-center p-4">
                <Dialog.Content
                  className="relative w-full max-w-md my-auto p-6 bg-card border border-gray-600 rounded-xl shadow-2xl outline-none"
                  onEscapeKeyDown={() => { setWithdrawModalOpen(false); clearModalParam(); }}
                  onPointerDownOutside={() => { setWithdrawModalOpen(false); clearModalParam(); }}
                >
                  <Dialog.Close
                    className="absolute right-3 top-3 w-9 h-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-700 outline-none text-xl"
                    aria-label="Close"
                  >
                    &#215;
                  </Dialog.Close>
                  <Dialog.Title className="text-xl font-bold text-gray-100 mb-0.5">Redeem</Dialog.Title>
                  <p className="text-muted text-sm mb-4">Sweepcoin (SC)</p>
                  {!isManualFlow && (
                  <div className="rounded-lg border border-red-500/40 bg-gray-800/60 px-4 py-3 mb-4">
                    <p className="text-xs text-muted uppercase tracking-wide mb-0.5">Your game balance</p>
                    <p className="text-2xl font-semibold text-gray-100 tabular-nums">
                      {balance != null ? `${formatSc(balance)} SC` : '? SC'}
                    </p>
                    <p className="text-xs text-muted mt-1">
                      {redeemDisplayBalance == null
                        ? 'Click Refresh balance above to load.'
                        : balanceZero
                          ? isGoldenDragonForRedeem
                            ? 'No winnings available to redeem yet.'
                            : 'Recharge this game to redeem later.'
                          : isGoldenDragonForRedeem
                            ? 'Winnings available to redeem to your wallet.'
                            : 'Available to redeem to your wallet.'}
                    </p>
                  </div>
                  )}
                  {balanceZero ? (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 mb-4 text-amber-200 text-sm">
                      You don&apos;t have enough balance to redeem. Your game balance is{' '}
                      {formatSc(redeemDisplayBalance)} SC.
                    </div>
                  ) : null}
                  {redeemError ? (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 mb-4 text-amber-200 text-sm">
                      {redeemError}
                    </div>
                  ) : null}
                  <label className="block text-sm text-gray-300 mb-1">Amount (SC)</label>
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
                    disabled={balanceZero}
                    className="w-full bg-input border border-gray-600 rounded-lg px-4 py-3 text-gray-100 placeholder:text-muted mb-4 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={handleWithdraw}
                    disabled={submitting || balanceZero}
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
                </Dialog.Content>
              </div>
            </Dialog.Portal>
          </Dialog.Root>

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-primary uppercase tracking-wide">Transactions</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Show</span>
                <select
                  value={txLimit}
                  onChange={(e) => { setTxLimit(Number(e.target.value)); setTxPage(1); }}
                  className="py-1 px-2 text-xs text-gray-100 bg-input border border-gray-600 rounded focus:outline-none focus:border-primary"
                >
                  {TX_PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span className="text-xs text-muted">per page</span>
              </div>
            </div>

            {txLoading ? (
              <div className="py-8 flex justify-center text-sm text-muted">Loading transactions…</div>
            ) : txData.transactions.length === 0 ? (
              <p className="py-8 text-gray-500 text-center text-sm">No transactions yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-700">
                        <th className="py-2 pr-4 font-medium text-gray-400 whitespace-nowrap">Date</th>
                        <th className="py-2 pr-4 font-medium text-gray-400">Type</th>
                        <th className="py-2 font-medium text-gray-400 text-right whitespace-nowrap">Coins (SC)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txData.transactions.map((tx) => (
                        <tr key={tx.id} className="border-b border-gray-700/50">
                          <td className="py-3 pr-4 text-gray-400 whitespace-nowrap text-xs">{formatDateTime(tx.created_at)}</td>
                          <td className="py-3 pr-4">
                            <span className={tx.type === 'topup' ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                              {txTypeLabel(tx.type)}
                            </span>
                          </td>
                          <td className={`py-3 text-right font-semibold tabular-nums ${tx.type === 'topup' ? 'text-green-400' : 'text-red-400'}`}>
                            {tx.type === 'topup' ? '+' : '\u2212'}{formatSc(tx.coins)} SC
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {txData.total > txLimit && (
                  <div className="mt-4 pt-4 border-t border-gray-700 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-gray-400">
                      Showing {(txData.page - 1) * txData.limit + 1}–{Math.min(txData.page * txData.limit, txData.total)} of {txData.total}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                        disabled={txData.page <= 1}
                        className="px-3 py-1.5 text-xs rounded border border-gray-600 text-gray-300 hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>
                      <span className="text-xs text-gray-400 px-2">
                        {txData.page} / {txData.total_pages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTxPage((p) => Math.min(txData.total_pages, p + 1))}
                        disabled={txData.page >= txData.total_pages}
                        className="px-3 py-1.5 text-xs rounded border border-gray-600 text-gray-300 hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
      <DepositRequiredModal
        open={depositRequiredModalOpen}
        onClose={closeDepositRequiredModal}
        activationBonusType={activationBonusType}
      />
      <WithdrawPromptModal
        open={withdrawPromptOpen}
        onOpenChange={setWithdrawPromptOpen}
        amount={redeemedAmount}
        onConfirm={() => {
          setWithdrawPromptOpen(false);
          navigate('/redeem');
        }}
      />
    </div>
  );
}

export function GameDetail() {
  return (
    <ProtectedRoute>
      <GameDetailInner />
    </ProtectedRoute>
  );
}
