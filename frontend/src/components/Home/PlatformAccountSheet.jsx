import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../context/ToastContext';
import * as gamesApi from '../../api/games';
import { GameImage } from '../Games/GameImage';
import { getGameDisplayName } from '../../utils/gameDisplay';
import { formatSc } from '../../utils/currency';
import { constrainIntegerScInput } from '../../utils/goldenDragon';
import { useDepositRequiredGate } from '../../hooks/useDepositRequiredGate';
import { isDepositRequiredError } from '../../utils/depositRequired';
import { DepositRequiredModal } from '../Games/DepositRequiredModal';
import { GameFavoriteButton } from './GameFavoriteButton';
import { platformFavoriteId } from '../../utils/gameFavorites';

const QUICK_AMOUNTS = [10, 25, 50, 100, 250];
const CREATE_STEPS = [
  'Initializing Game Account',
  'Connecting to Game Server',
  'Creating Player Profile',
  'Setting Up Game Balance',
  'Finalizing Account',
];

const RETURN_RULES =
  'Platform returns follow the load tiers: 10–14.99 SC needs 50 SC; 15–39.99 SC uses stepped minimums; 40–49.99 SC needs 3×; 50+ SC needs 4×. The return cap is 10× the load. Platform redeems use 5 SC steps, such as 50, 55 or 60 SC. Any remainder below 5 SC stays in the game.';

function standardLoadQuote(amount) {
  const load = Number(amount);
  if (!Number.isFinite(load) || load < 10) return null;
  let reach = null;
  if (load < 15) reach = 50;
  else if (load >= 50) reach = load * 4;
  else if (load >= 40) reach = load * 3;
  return { load, reach, cap: load * 10 };
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

function RefreshIcon({ spinning }) {
  return (
    <svg className={spinning ? 'is-spinning' : undefined} viewBox="0 0 24 24" aria-hidden>
      <path d="M20 6v5h-5" />
      <path d="M19 11a7.5 7.5 0 1 0 .2 3" />
    </svg>
  );
}

function StepProgress({ activeIndex }) {
  const shown = Math.min(CREATE_STEPS.length, Math.max(1, activeIndex + 1));
  return (
    <div className="df-game-steps" role="status" aria-live="polite" aria-label="Account creation progress">
      <div className="df-game-steps__counter">Step {shown} of {CREATE_STEPS.length}</div>
      <ol className="df-game-steps__list">
        {CREATE_STEPS.map((label, index) => {
          const state = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'pending';
          const status = state === 'done' ? 'Completed' : state === 'active' ? 'In Progress…' : 'Pending';
          return (
            <li key={label} className={`df-game-steps__item df-game-steps__item--${state}`}>
              <span className="df-game-steps__marker" aria-hidden>
                {state === 'done' ? (
                  <svg viewBox="0 0 20 20" className="df-game-steps__check">
                    <path d="M4 10.5l3.5 3.5L16 5.5" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : state === 'active' ? (
                  <span className="df-game-steps__pulse" />
                ) : (
                  <span className="df-game-steps__dot" />
                )}
              </span>
              <span className="df-game-steps__text">
                <span className="df-game-steps__label">{label}</span>
                <span className="df-game-steps__status">{status}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function PlatformAccountSheet({
  game,
  balanceSc,
  paidSc,
  onClose,
  onRegistered,
  onWalletRefresh,
}) {
  const { toast } = useToast();
  const { requireDeposit, depositRequiredModalOpen, openDepositRequiredModal, closeDepositRequiredModal, activationBonusType } =
    useDepositRequiredGate();
  const name = getGameDisplayName(game);
  const hasAccount = Boolean(game?.has_account && game?.account_status === 'approved');
  const isPending =
    Boolean(game?.has_account && game?.account_status === 'pending') || Boolean(game?.register_pending);
  const username = game?.bot_username || '';
  const password = game?.bot_password || '';
  const paid = paidSc != null && Number.isFinite(Number(paidSc)) ? Number(paidSc) : Number(balanceSc);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [mode, setMode] = useState('transfer');
  const [amountMode, setAmountMode] = useState('quick');
  const [amount, setAmount] = useState('10');
  const [busy, setBusy] = useState(false);
  const [createStep, setCreateStep] = useState(0);
  const [error, setError] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [gameBalance, setGameBalance] = useState(null);
  const [balanceChecked, setBalanceChecked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [balanceNote, setBalanceNote] = useState('Check required to transfer back');

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  useEffect(() => {
    if (!busy || hasAccount) return undefined;
    setCreateStep(0);
    const timer = window.setInterval(() => {
      setCreateStep((step) => Math.min(step + 1, CREATE_STEPS.length - 1));
    }, 700);
    return () => window.clearInterval(timer);
  }, [busy, hasAccount]);

  async function copyText(value, label) {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  }

  async function activate() {
    setBusy(true);
    setError('');
    try {
      const resp = await gamesApi.registerGameAccount(game.id);
      toast.success(resp?.pending ? resp.message || 'Request submitted.' : resp?.message || 'Account created');
      window.dispatchEvent(new CustomEvent('onboarding:game-registered'));
      onRegistered?.();
    } catch (err) {
      if (isDepositRequiredError(err)) {
        openDepositRequiredModal();
        return;
      }
      const msg = typeof err?.message === 'string' ? err.message.trim() : '';
      setError(msg || 'Registration failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshBalance() {
    setChecking(true);
    setBalanceNote('Checking live balance...');
    try {
      const res = await gamesApi.getGameBalance(game.id);
      const value = res?.balance != null ? Number(res.balance) : null;
      if (!Number.isFinite(value)) {
        setBalanceChecked(false);
        setGameBalance(null);
        setBalanceNote(res?.message || 'Check required to transfer back');
        return;
      }
      setGameBalance(value);
      setBalanceChecked(true);
      setBalanceNote('Live game balance');
    } catch (err) {
      setBalanceChecked(false);
      const msg = typeof err?.message === 'string' ? err.message.trim() : '';
      setBalanceNote(msg || 'Check required to transfer back');
    } finally {
      setChecking(false);
    }
  }

  async function confirm() {
    const n = parseInt(String(amount).trim(), 10);
    if (!Number.isInteger(n) || n <= 0) {
      setError('Enter a whole-number amount.');
      return;
    }
    if (mode === 'transfer' && Number.isFinite(paid) && n > paid + 0.01) {
      setError('This amount exceeds your paid SC. Choose a smaller amount or add paid SC.');
      return;
    }
    if (mode === 'withdraw') {
      if (!balanceChecked || gameBalance == null) return;
      if (n > gameBalance) {
        setError(`Your game balance is ${formatSc(gameBalance)} SC.`);
        return;
      }
      if (n % 5 !== 0) {
        setError('Platform redeems use 5 SC steps, such as 50, 55 or 60 SC.');
        return;
      }
    }
    setError('');
    const run = async () => {
      setBusy(true);
      try {
        const res =
          mode === 'transfer'
            ? await gamesApi.gameTopup(game.id, n)
            : await gamesApi.gameRedeem(game.id, n);
        toast.success(res?.message_extra || res?.message || (mode === 'transfer' ? 'Transfer complete' : 'Redeem complete'));
        await onWalletRefresh?.();
        onRegistered?.();
        if (mode === 'transfer') setBalanceChecked(false);
      } catch (err) {
        if (isDepositRequiredError(err)) {
          openDepositRequiredModal();
          return;
        }
        const msg = typeof err?.message === 'string' ? err.message.trim() : '';
        setError(msg || 'Request could not be completed.');
      } finally {
        setBusy(false);
      }
    };
    requireDeposit(run);
  }

  const amountN = parseInt(String(amount).trim(), 10);
  const quote = mode === 'transfer' ? standardLoadQuote(amountN) : null;
  const overPaid = mode === 'transfer' && Number.isFinite(paid) && Number.isInteger(amountN) && amountN > paid + 0.01;
  const minTransfer = Math.max(10, Number(game?.minDepositLimit) || 0);
  const maxTransfer = Number(game?.maxDepositLimit) > 0 ? Number(game.maxDepositLimit) : null;
  const minWithdraw = Math.max(0, Number(game?.minWithdrawalLimit) || 0);
  const maxWithdraw = balanceChecked && gameBalance != null ? gameBalance : (Number(game?.maxWithdrawalLimit) > 0 ? Number(game.maxWithdrawalLimit) : null);
  const transferBlocked =
    !Number.isInteger(amountN) ||
    amountN < minTransfer ||
    overPaid ||
    (maxTransfer != null && amountN > maxTransfer);
  const withdrawBlocked =
    !balanceChecked ||
    gameBalance == null ||
    !Number.isInteger(amountN) ||
    amountN <= 0 ||
    amountN % 5 !== 0 ||
    (minWithdraw > 0 && amountN < minWithdraw) ||
    amountN > gameBalance;
  const confirmDisabled = busy || (mode === 'transfer' ? transferBlocked : withdrawBlocked);
  const confirmLabel =
    mode === 'withdraw'
      ? balanceChecked
        ? 'Confirm Transfer Back'
        : 'Check Balance to Transfer Back'
      : 'Confirm Transfer';

  const launch = !hasAccount;

  const sheet = (
    <div className="df-game-sheet" role="dialog" aria-modal="true" aria-label={`${name} account`}>
      <button type="button" className="df-game-sheet__backdrop" aria-label={`Close ${name} account`} onClick={onClose} />
      <section className={`df-game-sheet__panel${launch ? ' df-game-sheet__panel--launch' : ''}`}>
        <button
          type="button"
          className="df-game-sheet__close dragonfury-close-button"
          onClick={onClose}
          aria-label={`Close ${name} account`}
        />

        {launch ? (
          <div className={`df-game-launch${busy ? ' is-creating' : ''}`}>
            <div className="df-game-launch__logo">
              <GameImage game={game} width={160} height={216} />
            </div>
            <h2>{name}</h2>
            {isPending && !busy ? (
              <p className="df-game-sheet__pending">Your request is still pending. Login details will show here when the account is ready.</p>
            ) : busy ? (
              <div className="df-game-creation" aria-busy="true">
                <p className="df-game-creation__title" role="status">Creating your {name} account...</p>
                <p className="df-game-creation__hint">Please keep this window open.</p>
                <StepProgress activeIndex={createStep} />
              </div>
            ) : (
              <>
                <h3>Ready to play?</h3>
                <p>Create your game account to continue.</p>
                {error ? <div className="df-game-sheet__error" role="alert">{error}</div> : null}
                <button type="button" className="df-game-sheet__create" onClick={activate}>
                  Create Account
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <span className="df-game-sheet__handle" aria-hidden />
            <header className="df-game-sheet__head">
              <GameImage game={game} className="df-game-sheet__art" width={72} height={96} />
              <div className="df-game-sheet__titles">
                <small>DragonFury</small>
                <h2>{name}</h2>
                <span>Web</span>
              </div>
              <GameFavoriteButton id={platformFavoriteId(game)} name={name} className="df-game-sheet__fav" />
            </header>

            <button
              type="button"
              className="df-game-sheet__toggle"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((open) => !open)}
            >
              <span>{detailsOpen ? 'Hide account details' : 'Show account details'}</span>
              <b aria-hidden>{detailsOpen ? '−' : '+'}</b>
            </button>

            {detailsOpen ? (
              <div className="df-game-sheet__body">
                <div className="df-game-sheet__balance">
                  <div className="df-game-sheet__balance-head">
                    <span>Balance</span>
                    <button type="button" aria-expanded={rulesOpen} aria-haspopup="dialog" onClick={() => setRulesOpen(true)}>
                      Rules
                    </button>
                  </div>
                  <div className="df-game-sheet__balance-row">
                    <strong>{gameBalance != null ? `${formatSc(gameBalance)} SC` : '0.00 SC'}</strong>
                    <button type="button" className="df-game-sheet__refresh" aria-label="Check live game balance" aria-busy={checking} disabled={checking} onClick={refreshBalance}>
                      <RefreshIcon spinning={checking} />
                    </button>
                  </div>
                  <small>{balanceNote}</small>
                </div>

                <div className="df-game-sheet__creds">
                  <label>
                    <span>Username</span>
                    <strong>{username || '—'}</strong>
                    <button type="button" aria-label="Copy game username" onClick={() => copyText(username, 'Username')}>
                      <CopyIcon />
                    </button>
                  </label>
                  <label>
                    <span>Password</span>
                    <strong>{password || '—'}</strong>
                    <button type="button" aria-label="Copy game password" onClick={() => copyText(password, 'Password')}>
                      <CopyIcon />
                    </button>
                  </label>
                </div>

                <button
                  type="button"
                  className="df-game-sheet__play"
                  onClick={() => {
                    copyText(`${username}\n${password}`, 'Login');
                    const url = game?.platformGameUrl ? String(game.platformGameUrl).trim() : '';
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Copy Login &amp; Play
                </button>

                {quote ? (
                  <div className="df-game-quote">
                    <div className="df-game-quote__head">
                      <strong>Verified load quote</strong>
                      <small>{Number.isFinite(paid) ? `${formatSc(paid)} paid SC available` : 'Paid SC unavailable'}</small>
                    </div>
                    <dl>
                      <div>
                        <dt>Load SC</dt>
                        <dd>{formatSc(quote.load)}</dd>
                      </div>
                      <div>
                        <dt>Reach in game</dt>
                        <dd>{quote.reach == null ? 'Stepped' : formatSc(quote.reach)}</dd>
                      </div>
                      <div>
                        <dt>Wallet cap</dt>
                        <dd>{formatSc(quote.cap)}</dd>
                      </div>
                    </dl>
                    <div className="df-game-quote__badges">
                      <span>Full game return</span>
                      <span>Excess over cap removed</span>
                    </div>
                    {overPaid ? (
                      <p className="df-game-sheet__alert" role="alert">
                        This amount exceeds your paid SC. Choose a smaller amount or add paid SC.
                      </p>
                    ) : null}
                    <details>
                      <summary>Load &amp; return details</summary>
                      <p>
                        {quote.reach == null
                          ? `Load ${formatSc(quote.load)} SC. 15–39.99 SC uses stepped minimums. Up to ${formatSc(quote.cap)} SC can reach your wallet.`
                          : `Load ${formatSc(quote.load)} SC under normal rules. Reach ${formatSc(quote.reach)} SC in this game before returning the eligible balance in 5 SC steps. Any remainder below 5 SC stays in the game. Up to ${formatSc(quote.cap)} SC can reach your wallet; excess credits are removed.`}
                      </p>
                    </details>
                  </div>
                ) : null}

                <div className="df-game-sheet__wallet">
                  <strong>Game wallet</strong>
                  <span>Withdraw → wallet</span>
                </div>

                <div className="df-game-sheet__switch" role="group" aria-label="Transfer mode">
                  <button type="button" aria-pressed={mode === 'transfer'} onClick={() => { setMode('transfer'); setError(''); }}>
                    Transfer
                  </button>
                  <button type="button" aria-pressed={mode === 'withdraw'} aria-label="Withdraw from game to wallet" onClick={() => { setMode('withdraw'); setError(''); }}>
                    Withdraw
                  </button>
                </div>
                <div className="df-game-sheet__switch df-game-sheet__switch--sub" role="group" aria-label="Amount entry mode">
                  <button type="button" aria-pressed={amountMode === 'quick'} onClick={() => setAmountMode('quick')}>
                    Quick Load
                  </button>
                  <button type="button" aria-pressed={amountMode === 'custom'} onClick={() => setAmountMode('custom')}>
                    Customizable
                  </button>
                </div>
                {amountMode === 'quick' ? (
                  <div className="df-game-sheet__quick" aria-label="Quick transfer amounts">
                    {QUICK_AMOUNTS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={String(value) === String(amount)}
                        onClick={() => { setAmount(String(value)); setError(''); }}
                      >
                        {value} SC
                      </button>
                    ))}
                  </div>
                ) : (
                  <label className="df-game-sheet__custom">
                    <input
                      inputMode="numeric"
                      value={amount}
                      onChange={(event) => { setAmount(constrainIntegerScInput(event.target.value)); setError(''); }}
                      aria-label="Custom amount in SC"
                    />
                    <span>SC</span>
                  </label>
                )}
                {mode === 'withdraw' ? (
                  <small className="df-game-sheet__limits">5 SC steps · 50, 55, 60 SC · Any remainder below 5 SC stays in the game.</small>
                ) : null}
                <small className="df-game-sheet__limits">
                  Min {mode === 'transfer' ? minTransfer : (minWithdraw || 10)} SC
                  {(mode === 'transfer' ? maxTransfer : maxWithdraw) != null
                    ? ` · Max ${formatSc(mode === 'transfer' ? maxTransfer : maxWithdraw)} SC`
                    : ''}
                  {mode === 'withdraw'
                    ? ' · Limits come from your latest live balance check'
                    : ' · Review the accepted load-tier limits before confirming'}
                </small>
                {error ? <p className="df-game-sheet__alert" role="alert">{error}</p> : null}
                <button
                  type="button"
                  className="df-game-sheet__confirm"
                  disabled={confirmDisabled && !(mode === 'withdraw' && !balanceChecked)}
                  onClick={() => {
                    if (mode === 'withdraw' && !balanceChecked) {
                      refreshBalance();
                      return;
                    }
                    confirm();
                  }}
                >
                  {busy ? 'Working…' : confirmLabel}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {rulesOpen ? (
        <div className="df-game-rules" role="presentation">
          <button type="button" className="df-game-rules__backdrop" aria-label="Close rules" onClick={() => setRulesOpen(false)} />
          <section className="df-game-rules__panel" role="dialog" aria-modal="true" aria-labelledby="df-game-rules-title">
            <button type="button" className="dragonfury-close-button df-game-rules__close" aria-label="Close rules" onClick={() => setRulesOpen(false)} />
            <p>Game Account</p>
            <h2 id="df-game-rules-title">Redeem rules</h2>
            <p>{RETURN_RULES}</p>
          </section>
        </div>
      ) : null}

      <DepositRequiredModal
        open={depositRequiredModalOpen}
        onClose={closeDepositRequiredModal}
        activationBonusType={activationBonusType}
      />
    </div>
  );

  return createPortal(sheet, document.body);
}
