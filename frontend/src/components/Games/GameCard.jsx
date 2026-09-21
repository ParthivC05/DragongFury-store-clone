import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../context/ToastContext';
import * as gamesApi from '../../api/games';
import { CopyIcon, CheckIcon, EyeIcon, EyeOffIcon, LockIcon, RefreshIcon, PlayIcon, DepositIcon, WithdrawIcon } from '../../assets/icons';
import { formatSc } from '../../utils/currency';
import { getGameDisplayName, isJuwa20Game, isCustomManualGame, isManualModeGame, isCashmachineAgentGame } from '../../utils/gameDisplay';
import { isGoldenDragonGameName, isFirekirinGameName, isMilkywayAgentGameName } from '../../utils/goldenDragon';
import { GameImage } from './GameImage';
import { GameCardDiscountBadge, hasDepositDiscount } from './DepositDiscountOffer';

const MIN_LINK_GAME_USERNAME_LENGTH = 6;

function AccountIdIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M6 8h.01M10 8h8M6 12h.01M10 12h8M6 16h.01M10 16h5" />
    </svg>
  );
}

function isVegasXGameName(gameName) {
  return String(gameName || '').trim().toLowerCase().replace(/[\s_.-]+/g, '') === 'vegasx';
}

function allowsFiveCharLinkUsername(gameName) {
  const key = String(gameName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key.includes('gameroom')) return true;
  if (key.includes('cashmachine') && key.includes('agent')) return true;
  return key === 'cashmachine';
}

function agentPasswordStaleToast(gameName) {
  const name = getGameDisplayName(gameName) || 'game';
  return `Your ${name} password has changed. Please update your password to refresh your balance.`;
}

function showAgentPasswordStaleToast(toast, gameName) {
  toast.error(agentPasswordStaleToast(gameName), 8000);
}

function applyGameBalanceResponse(res, setters) {
  if (gamesApi.isPasswordStaleBalanceResponse(res)) {
    setters.setBalanceUnavailable(true);
    setters.setPasswordStale?.(true);
    return 'password_stale';
  }
  setters.setPasswordStale?.(false);
  if (!res || res.unavailable || (res.balance == null && res.message)) {
    setters.setBalanceUnavailable(true);
    return 'unavailable';
  }
  setters.setBalanceUnavailable(false);
  setters.setBalance(res.balance);
  setters.setEntriesBalance(res.entries != null ? Number(res.entries) : null);
  setters.setWinningsBalance(res.winnings != null ? Number(res.winnings) : null);
  return 'ok';
}

function isOrionStarsGameName(gameName) {
  const key = String(gameName || '').trim().toLowerCase().replace(/[\s_.-]+/g, '');
  return key === 'orionstar' || key === 'orionstars' || key.startsWith('orionstars');
}

function linkUsernameClientValidationError(username, gameName) {
  const t = String(username || '').trim();
  if (!t) return 'Please enter your game username.';
  const isVegasX = isVegasXGameName(gameName);
  if (!isVegasX && !/^[a-zA-Z]/.test(t)) {
    return 'Game username must start with a letter, not a number.';
  }
  if (!isVegasX && allowsFiveCharLinkUsername(gameName) && t.length < 5) {
    return 'Please enter a valid game username with at least 5 characters.';
  }
  if (!isVegasX && !allowsFiveCharLinkUsername(gameName) && t.length < MIN_LINK_GAME_USERNAME_LENGTH) {
    return 'Please enter a valid game username with at least 6 characters.';
  }
  return null;
}

function linkGameRequiresPassword(gameName) {
  return isOrionStarsGameName(gameName)
    || isFirekirinGameName(gameName)
    || isMilkywayAgentGameName(gameName);
}

function linkPasswordHint(gameName) {
  if (isOrionStarsGameName(gameName)) {
    return 'Use the same password you log in with on Orion Stars.';
  }
  if (isFirekirinGameName(gameName)) {
    return 'Use the same password you log in with on Firekirin.';
  }
  if (isMilkywayAgentGameName(gameName)) {
    return 'Use the same password you log in with on Milkyway.';
  }
  return 'Use the same password you log in with on this game.';
}

function LinkAccountModal({ gameName, onClose, onLinked }) {
  const { toast } = useToast();
  const [gameUsername, setGameUsername] = useState('');
  const [gamePassword, setGamePassword] = useState('');
  const [showLinkPassword, setShowLinkPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linkError, setLinkError] = useState('');
  const inputRef = useRef(null);
  const requiresPassword = linkGameRequiresPassword(gameName);

  const trimmedUsername = gameUsername.trim();
  const trimmedPassword = gamePassword.trim();
  const canSubmit = Boolean(trimmedUsername) && (!requiresPassword || Boolean(trimmedPassword));

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Small delay to ensure tutorial is ready and modal is fully in DOM Stacking Context
    const timer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('onboarding:link-modal-opened'));
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (gameUsername.trim().length > 0) {
      window.dispatchEvent(new CustomEvent('onboarding:link-username-ready'));
    }
  }, [gameUsername]);

  async function handleSubmit(e) {
    e.preventDefault();
    const username = trimmedUsername;
    const validationError = linkUsernameClientValidationError(username, gameName);
    if (validationError) {
      setLinkError(validationError);
      return;
    }
    if (requiresPassword && !trimmedPassword) {
      setLinkError('Please enter your game password.');
      return;
    }

    setLinkError('');
    setLoading(true);
    try {
      const res = await gamesApi.linkGameAccount(
        gameName,
        username,
        requiresPassword ? trimmedPassword : undefined
      );
      toast.success(res?.message || 'Account connected successfully');
      onLinked?.({
        ...(res?.data || {}),
        account_name: res?.data?.account_name || username,
        password: requiresPassword ? trimmedPassword : null
      });
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to connect account');
    } finally {
      setLoading(false);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 gtm-backdrop" aria-hidden />

      <div
        className="gtm-modal gtm-modal--connect gtm-modal-enter relative z-10 w-full max-w-md flex-shrink-0 outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-account-modal-title"
      >
        <div className="gtm-glow-ring" aria-hidden />
        <div className="gtm-sparkles" aria-hidden>
          <span className="gtm-spark gtm-spark-1">✦</span>
          <span className="gtm-spark gtm-spark-2">★</span>
          <span className="gtm-spark gtm-spark-3">✦</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="gtm-close"
          aria-label="Close"
        >
          ×
        </button>

        <div className="gtm-inner gtm-inner--connect">
          <div className="gtm-header">
            <h2 id="link-account-modal-title" className="gtm-title">
              Connect Your Account
            </h2>
            <p className="gtm-subtitle">
              {requiresPassword ? (
                <>
                  Enter your <span className="gtm-game-highlight">{getGameDisplayName(gameName)}</span> username and password to connect your existing account.
                </>
              ) : (
                <>
                  Enter your <span className="gtm-game-highlight">{getGameDisplayName(gameName)}</span> username to connect your existing account.
                </>
              )}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="gtm-connect-form">
            <div className="gtm-field-block">
              <label htmlFor="link-game-username" className="gtm-field-label">
                Game Username
              </label>
              <p id="link-game-username-hint" className="gtm-field-hint">
                {isVegasXGameName(gameName)
                  ? 'Use the same username you log in with on this game.'
                  : (allowsFiveCharLinkUsername(gameName)
                    ? 'Must start with a letter and be at least 5 characters.'
                    : 'Must start with a letter and be at least 6 characters.')}
              </p>
              <input
                id="link-game-username"
                ref={inputRef}
                type="text"
                value={gameUsername}
                onChange={(e) => {
                  setGameUsername(e.target.value);
                  if (linkError) setLinkError('');
                }}
                placeholder="e.g. your game login name"
                className={`gtm-input gtm-input--connect onboarding-link-username${linkError ? ' gtm-input--error' : ''}`}
                disabled={loading}
                autoComplete="username"
                autoFocus
                aria-invalid={!!linkError}
                aria-describedby={linkError ? 'link-game-username-error' : 'link-game-username-hint'}
              />
            </div>

            {requiresPassword && (
              <div className="gtm-field-block">
                <label htmlFor="link-game-password" className="gtm-field-label">
                  Game Password
                </label>
                <p id="link-game-password-hint" className="gtm-field-hint">
                  {linkPasswordHint(gameName)}
                </p>
                <div className="relative">
                  <input
                    id="link-game-password"
                    type={showLinkPassword ? 'text' : 'password'}
                    value={gamePassword}
                    onChange={(e) => {
                      setGamePassword(e.target.value);
                      if (linkError) setLinkError('');
                    }}
                    placeholder="Your game password"
                    className={`gtm-input gtm-input--connect pr-11${linkError ? ' gtm-input--error' : ''}`}
                    disabled={loading}
                    autoComplete="current-password"
                    aria-invalid={!!linkError}
                    aria-describedby={linkError ? 'link-game-username-error' : 'link-game-password-hint'}
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/60 hover:text-white"
                    onClick={() => setShowLinkPassword((v) => !v)}
                    aria-label={showLinkPassword ? 'Hide password' : 'Show password'}
                    disabled={loading}
                  >
                    {showLinkPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              </div>
            )}

            {linkError && (
              <div id="link-game-username-error" className="gtm-alert gtm-alert--warn" role="alert">
                {linkError}
              </div>
            )}

            <div className="gtm-actions gtm-actions--link">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="gtm-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="gtm-submit gtm-submit--topup onboarding-link-submit"
              >
                <span className="gtm-submit-shine" aria-hidden />
                <span className="gtm-submit-label">
                  {loading ? (
                    <>
                      <span className="gtm-spinner" aria-hidden />
                      Connecting…
                    </>
                  ) : (
                    'Connect Account'
                  )}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modal, document.body);
  }
  return modal;
}

function SyncPasswordModal({ gameName, gameUsername, onClose, onSynced }) {
  const { toast } = useToast();
  const [gamePassword, setGamePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const trimmedPassword = gamePassword.trim();
  const canSubmit = Boolean(trimmedPassword);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!trimmedPassword) {
      setError('Please enter your current game password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onSynced(trimmedPassword);
      onClose();
    } catch (err) {
      const msg = typeof err?.message === 'string' ? err.message.trim() : '';
      setError(msg || 'Incorrect game password. Please check and try again.');
      toast.error(msg || 'Incorrect game password. Please check and try again.');
    } finally {
      setLoading(false);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[20000] flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 gtm-backdrop" aria-hidden />
      <div
        className="gtm-modal gtm-modal--connect gtm-modal-enter relative z-10 w-full max-w-md flex-shrink-0 outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-password-modal-title"
      >
        <div className="gtm-glow-ring" aria-hidden />
        <button type="button" onClick={onClose} disabled={loading} className="gtm-close" aria-label="Close">
          ×
        </button>
        <div className="gtm-inner gtm-inner--connect">
          <div className="gtm-header">
            <h2 id="sync-password-modal-title" className="gtm-title">
              Update Game Password
            </h2>
            <p className="gtm-subtitle">
              Enter your current <span className="gtm-game-highlight">{getGameDisplayName(gameName)}</span> password for{' '}
              <span className="gtm-game-highlight">{gameUsername || 'your account'}</span> to refresh your balance.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="gtm-connect-form">
            <div className="gtm-field-block">
              <label htmlFor="sync-game-password" className="gtm-field-label">
                Current Game Password
              </label>
              <p id="sync-game-password-hint" className="gtm-field-hint">
                {linkPasswordHint(gameName)}
              </p>
              <div className="relative">
                <input
                  id="sync-game-password"
                  type={showPassword ? 'text' : 'password'}
                  value={gamePassword}
                  onChange={(e) => {
                    setGamePassword(e.target.value);
                    if (error) setError('');
                  }}
                  placeholder="Your current game password"
                  className={`gtm-input gtm-input--connect pr-11${error ? ' gtm-input--error' : ''}`}
                  disabled={loading}
                  autoComplete="current-password"
                  autoFocus
                  aria-invalid={!!error}
                  aria-describedby={error ? 'sync-game-password-error' : 'sync-game-password-hint'}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/60 hover:text-white"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={loading}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>
            {error && (
              <div id="sync-game-password-error" className="gtm-alert gtm-alert--warn" role="alert">
                {error}
              </div>
            )}
            <div className="gtm-actions gtm-actions--link">
              <button type="button" onClick={onClose} disabled={loading} className="gtm-btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={loading || !canSubmit} className="gtm-submit gtm-submit--topup">
                <span className="gtm-submit-shine" aria-hidden />
                <span className="gtm-submit-label">
                  {loading ? (
                    <>
                      <span className="gtm-spinner" aria-hidden />
                      Updating…
                    </>
                  ) : (
                    'Update Password'
                  )}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modal, document.body);
  }
  return modal;
}

export function GameCard({
  game,
  onRegistered,
  onOpenDeposit,
  onOpenWithdraw,
  onOpenPlay,
  balanceRefreshTrigger = 0,
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(null);
  const [entriesBalance, setEntriesBalance] = useState(null);
  const [winningsBalance, setWinningsBalance] = useState(null);
  const [balanceUnavailable, setBalanceUnavailable] = useState(false);
  const [passwordStale, setPasswordStale] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [localCredentials, setLocalCredentials] = useState(null);
  const [registerRequestPending, setRegisterRequestPending] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showSyncPasswordModal, setShowSyncPasswordModal] = useState(false);
  const [onboardingRegisterDisabled, setOnboardingRegisterDisabled] = useState(false);
  const copyTimeoutRef = useRef(null);

  useEffect(() => () => { if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current); }, []);

  useEffect(() => {
    if (!game.bot_password) return;
    setLocalCredentials((prev) => {
      if (!prev) return prev;
      if (prev.password === game.bot_password) return prev;
      return { ...prev, password: game.bot_password };
    });
  }, [game.bot_password]);

  // During onboarding "existing user" game step, only login is highlighted — block Register on all cards.
  useEffect(() => {
    const syncOnboardingRegisterLock = () => {
      try {
        const pending = localStorage.getItem('onboarding_pending') === 'true';
        const step = localStorage.getItem('onboarding_step');
        const userType = localStorage.getItem('onboarding_user_type');
        setOnboardingRegisterDisabled(pending && step === 'focus_game' && userType === 'existing');
      } catch {
        setOnboardingRegisterDisabled(false);
      }
    };
    syncOnboardingRegisterLock();
    window.addEventListener('onboarding:start', syncOnboardingRegisterLock);
    window.addEventListener('onboarding:ended', syncOnboardingRegisterLock);
    window.addEventListener('onboarding:updated', syncOnboardingRegisterLock);
    return () => {
      window.removeEventListener('onboarding:start', syncOnboardingRegisterLock);
      window.removeEventListener('onboarding:ended', syncOnboardingRegisterLock);
      window.removeEventListener('onboarding:updated', syncOnboardingRegisterLock);
    };
  }, []);

  function handleCopy(field, text) {
    navigator.clipboard.writeText(text || '');
    setCopiedField(field);
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopiedField(null), 2000);
  }

  const gameUsername = localCredentials ? localCredentials.account_name : game.bot_username;
  const gamePassword = localCredentials ? localCredentials.password : game.bot_password;
  // Use local credentials if we just registered, otherwise fallback to game prop
  const hasAccount = (!!localCredentials || (game.has_account && game.account_status === 'approved')) && !!(gameUsername || gamePassword);
  const isPending = !!registerRequestPending || (!localCredentials && (game.has_account && game.account_status === 'pending'));
  const isRiversweeps = game.name?.toLowerCase() === 'riversweeps';
  const isGoldenDragon = isGoldenDragonGameName(game);
  const isFirekirin = isFirekirinGameName(game.name) || isFirekirinGameName(game.gameKey);
  const isMilkywayAgent = isMilkywayAgentGameName(game);
  const usesAgentPasswordSync = isFirekirin || isMilkywayAgent;
  const isCustomManual = isCustomManualGame(game);
  const isManualFlow = isManualModeGame(game);
  const hidePasswordReset = isRiversweeps || isJuwa20Game(game.name) || isGoldenDragon || isCustomManual || isCashmachineAgentGame(game);

  function handleBalanceResult(res) {
    const status = applyGameBalanceResponse(res, {
      setBalance,
      setEntriesBalance,
      setWinningsBalance,
      setBalanceUnavailable,
      setPasswordStale,
    });
    if (status === 'password_stale' && usesAgentPasswordSync) {
      showAgentPasswordStaleToast(toast, game.name);
    }
    return status;
  }

  // Load balance when the user has a game account (on mount / tab switch) and when parent
  // signals a refresh (e.g. after top-up or redeem). No red toast for game/bot APIs.
  useEffect(() => {
    if (isManualFlow || !hasAccount) {
      setBalance(null);
      setEntriesBalance(null);
      setWinningsBalance(null);
      setBalanceUnavailable(false);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setBalanceLoading(true);
      try {
        const res = await gamesApi.getGameBalance(game.id);
        if (cancelled) return;
        handleBalanceResult(res);
      } catch {
        if (!cancelled) setBalanceUnavailable(true);
      } finally {
        if (!cancelled) setBalanceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [balanceRefreshTrigger, hasAccount, game.id, isManualFlow]);

  useEffect(() => {
    if (isManualFlow || !hasAccount || !isFirekirin) return undefined;

    const onFirekirinBalanceRefresh = (event) => {
      const eventGameId = event?.detail?.gameId;
      if (eventGameId && Number(eventGameId) !== Number(game.id)) return;
      (async () => {
        setBalanceLoading(true);
        try {
          const res = await gamesApi.getGameBalance(game.id);
          handleBalanceResult(res);
        } catch {
          setBalanceUnavailable(true);
        } finally {
          setBalanceLoading(false);
        }
      })();
    };

    window.addEventListener('games:firekirin-balance-refresh', onFirekirinBalanceRefresh);
    return () => window.removeEventListener('games:firekirin-balance-refresh', onFirekirinBalanceRefresh);
  }, [hasAccount, game.id, isManualFlow, isFirekirin]);

  async function handleRegister() {
    if (loading || registerRequestPending) return;
    setLoading(true);
    try {
      const resp = await gamesApi.registerGameAccount(game.id);
      if (resp && resp.pending) {
        setRegisterRequestPending(true);
        toast.success(resp.message || "We're on it. You'll see your game login here once it's ready.");
      } else if (resp && resp.data) {
        setLocalCredentials(resp.data);
        toast.success(resp.message || 'Account created successfully');
      } else {
        toast.success(resp?.message || 'Account created successfully');
      }
      window.dispatchEvent(new CustomEvent('onboarding:game-registered'));
      onRegistered?.();
    } catch (err) {
      if (gamesApi.isGameUsernameAlreadyTakenError(err)) {
        const msg = typeof err?.message === 'string' ? err.message.trim() : '';
        if (msg) toast.error(msg);
      } else {
        const msg = typeof err?.message === 'string' ? err.message.trim() : '';
        toast.error(msg || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRefreshBalance() {
    if (isManualFlow || balanceLoading || !hasAccount) return;
    setBalanceLoading(true);
    try {
      const res = await gamesApi.getGameBalance(game.id);
      handleBalanceResult(res);
    } catch {
      setBalanceUnavailable(true);
    } finally {
      setBalanceLoading(false);
    }
  }

  function handleLinked(data) {
    if (data) {
      setLocalCredentials({
        account_name: data.account_name,
        password: data.password != null ? data.password : null
      });
    }
    window.dispatchEvent(new CustomEvent('onboarding:game-registered'));
    onRegistered?.();
  }

  async function handleSyncAgentPassword(plainPassword) {
    const syncFn = isMilkywayAgent
      ? gamesApi.syncMilkywayGamePassword
      : gamesApi.syncFirekirinGamePassword;
    const res = await syncFn(game.id, plainPassword);
    setLocalCredentials((prev) => ({
      account_name: prev?.account_name || gameUsername || game.bot_username,
      password: plainPassword,
    }));
    setPasswordStale(false);
    setBalanceUnavailable(false);
    setBalance(res?.balance ?? null);
    toast.success(res?.message || 'Password updated successfully.');
  }

  function handlePasswordAction() {
    if (usesAgentPasswordSync) {
      setShowSyncPasswordModal(true);
      return;
    }
    handleForgotPassword();
  }

  async function handleForgotPassword() {
    if (resettingPassword || !game.name) return;
    setResettingPassword(true);
    try {
      const res = await gamesApi.gameForgotPassword(game.name, gameUsername || '');
      const newPassword = res?.data?.new_password;
      if (newPassword) {
        setLocalCredentials((prev) => ({
          account_name: prev?.account_name || gameUsername || game.bot_username,
          password: newPassword,
        }));
        setShowPassword(true);
      }
      toast.success(res?.message || 'Password reset successfully.');
    } catch (err) {
      toast.error(gamesApi.getGamePasswordResetErrorMessage(err));
    } finally {
      setResettingPassword(false);
    }
  }

  return (
    <>
    {showLinkModal && (
      <LinkAccountModal
        gameName={game.name}
        onClose={() => setShowLinkModal(false)}
        onLinked={handleLinked}
      />
    )}
    {showSyncPasswordModal && (
      <SyncPasswordModal
        gameName={game.name}
        gameUsername={gameUsername}
        onClose={() => setShowSyncPasswordModal(false)}
        onSynced={handleSyncAgentPassword}
      />
    )}
    <article className={`dash-game-card onboarding-game-card${hasDepositDiscount(game) ? ' dash-game-card--discount' : ''}`}>
      <GameCardDiscountBadge game={game} />
      <div className="dash-gc-inner">
        <header className="dash-gc-header">
          <GameImage game={game} className="dash-gc-thumb" />
          <div className="dash-gc-header-body">
            {(hasAccount || isPending) && (
              <div className={`dash-gc-status${isPending ? ' dash-gc-status-pending' : ''}`}>
                <CheckIcon className="w-4 h-4 flex-shrink-0" aria-hidden />
                <span>{isPending ? 'Pending' : 'Active'}</span>
              </div>
            )}
            <h3 className="dash-gc-title">{getGameDisplayName(game)}</h3>
            {hasAccount && !isManualFlow && (
              <div className="dash-gc-balance-row">
                <p
                  className="dash-gc-balance"
                  title={
                    passwordStale
                      ? `Your ${getGameDisplayName(game) || 'game'} password has changed — update it to refresh balance`
                      : balanceUnavailable
                        ? 'Balance temporarily unavailable — try refresh'
                        : undefined
                  }
                >
                  {balance != null
                    ? formatSc(balance)
                    : balanceLoading || balanceUnavailable
                      ? '—'
                      : '$0'}
                </p>
                <button
                  type="button"
                  onClick={handleRefreshBalance}
                  disabled={balanceLoading}
                  className="dash-gc-refresh-btn"
                  title="Refresh balance"
                  aria-label="Refresh balance"
                >
                  <RefreshIcon className={`w-4 h-4 flex-shrink-0${balanceLoading ? ' animate-spin' : ''}`} />
                  <span>Refresh Balance</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {!hasAccount && !isPending && (
          <div className="dash-gc-guest-actions">
            <button
              type="button"
              onClick={handleRegister}
              disabled={loading || onboardingRegisterDisabled}
              className="dash-gc-btn dash-gc-btn-add w-full onboarding-register-btn"
            >
              {loading ? 'Registering…' : 'Register'}
            </button>
            <button
              type="button"
              onClick={() => setShowLinkModal(true)}
              disabled={loading}
              className="dash-btn-outline w-full py-3 onboarding-login-btn"
            >
              Connect Your Account
            </button>
          </div>
        )}

        {isPending && (
          <div className="dash-gc-guest-actions">
            <p className="dash-gc-pending-msg">
              Your request has been submitted. We&apos;re working on it — credentials will appear here when ready.
            </p>
            <button type="button" disabled className="dash-gc-btn dash-gc-btn-play-disabled w-full">
              Request submitted
            </button>
          </div>
        )}

        {hasAccount && !isPending && (
          <>
            <div className="dash-gc-details">
              <div className="dash-gc-detail-row">
                <span className="dash-gc-detail-label">
                  <AccountIdIcon className="dash-gc-detail-label-icon" />
                  Game ID:
                </span>
                <span className="dash-gc-detail-value">{gameUsername || '—'}</span>
                <button
                  type="button"
                  onClick={() => handleCopy('username', gameUsername || '')}
                  className="dash-gc-icon-btn"
                  style={{ width: 30, height: 30 }}
                  title={copiedField === 'username' ? 'Copied' : 'Copy Game ID'}
                  aria-label="Copy Game ID"
                >
                  {copiedField === 'username' ? (
                    <CheckIcon className="w-4 h-4 text-[var(--dash-green)]" />
                  ) : (
                    <CopyIcon className="w-4 h-4" />
                  )}
                </button>
              </div>

              {isGoldenDragon && (
                <div className="dash-gc-detail-row">
                  <span className="dash-gc-detail-label">Entries:</span>
                  <span className="dash-gc-detail-value">
                    {entriesBalance != null ? `${formatSc(entriesBalance)} SC` : '—'}
                  </span>
                </div>
              )}

              {isGoldenDragon && winningsBalance != null && (
                <div className="dash-gc-detail-row">
                  <span className="dash-gc-detail-label">Winnings:</span>
                  <span className="dash-gc-detail-value">{formatSc(winningsBalance)} SC</span>
                </div>
              )}

              <div className="dash-gc-detail-row">
                <span className="dash-gc-detail-label">
                  <LockIcon className="dash-gc-detail-label-icon" />
                  {isRiversweeps ? 'PIN:' : 'Password:'}
                </span>
                <span className="dash-gc-detail-value">
                  {showPassword ? (gamePassword || '—') : '••••••••'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="dash-gc-icon-btn"
                  style={{ width: 30, height: 30 }}
                  title={showPassword ? `Hide ${isRiversweeps ? 'PIN' : 'password'}` : `Show ${isRiversweeps ? 'PIN' : 'password'}`}
                  aria-label={showPassword ? `Hide ${isRiversweeps ? 'PIN' : 'password'}` : `Show ${isRiversweeps ? 'PIN' : 'password'}`}
                >
                  {showPassword ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy('password', gamePassword || '')}
                  className="dash-gc-icon-btn"
                  style={{ width: 30, height: 30 }}
                  title={copiedField === 'password' ? 'Copied' : `Copy ${isRiversweeps ? 'PIN' : 'password'}`}
                  aria-label={`Copy ${isRiversweeps ? 'PIN' : 'password'}`}
                >
                  {copiedField === 'password' ? (
                    <CheckIcon className="w-4 h-4 text-[var(--dash-green)]" />
                  ) : (
                    <CopyIcon className="w-4 h-4" />
                  )}
                </button>
              </div>

              {!hidePasswordReset && (
                <div className="dash-gc-forgot-row">
                  <button
                    type="button"
                    onClick={handlePasswordAction}
                    disabled={resettingPassword}
                    className="dash-payment-forgot-link"
                  >
                    {resettingPassword
                      ? 'Updating…'
                      : usesAgentPasswordSync
                        ? 'Update password?'
                        : 'Reset password?'}
                  </button>
                </div>
              )}
            </div>

            <footer className="dash-gc-actions">
              <div className="dash-gc-actions-row">
                <button
                  type="button"
                  onClick={() => onOpenDeposit?.(game)}
                  className="dash-gc-btn dash-gc-btn-add onboarding-topup-btn"
                >
                  <DepositIcon className="w-4 h-4 flex-shrink-0" />
                  Recharge
                </button>
                {game.platformGameUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenPlay) {
                        onOpenPlay(game);
                        return;
                      }
                      window.open(game.platformGameUrl, '_blank', 'noopener,noreferrer');
                    }}
                    className="dash-gc-btn dash-gc-btn-play"
                    title="Play game (opens in new tab)"
                  >
                    <PlayIcon className="w-5 h-5 flex-shrink-0" />
                    <span className="dash-gc-btn-play-label">Play Now</span>
                  </button>
                ) : (
                  <span className="dash-gc-btn dash-gc-btn-play dash-gc-btn-play-disabled" title="Game URL not configured">
                    <PlayIcon className="w-5 h-5 flex-shrink-0" />
                    <span className="dash-gc-btn-play-label">Play Now</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onOpenWithdraw?.(game)}
                  className="dash-gc-btn dash-gc-btn-withdraw onboarding-withdraw-btn"
                >
                  <WithdrawIcon className="w-4 h-4 flex-shrink-0" />
                  Redeem
                </button>
              </div>
            </footer>
          </>
        )}
      </div>
    </article>
    </>
  );
}
