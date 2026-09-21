import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as gitslotparkApi from '../../api/gitslotpark';
import * as bonaApi from '../../api/bona';
import * as onegamehubApi from '../../api/onegamehub';
import * as win568Api from '../../api/win568';
import * as scorpioApi from '../../api/scorpio';
import * as gamesApi from '../../api/games';
import { WIN568_GAMES_SLUG, isWin568PlayProvider } from '../../config/win568';
import { SCORPIO_GAMES_SLUG, isScorpioPlayProvider } from '../../config/scorpio';
import { useAuth } from '../../context/AuthContext';
import { AppLoader } from '../../components/AppLoader';
import { HomeIcon, SCCoinIcon } from '../../assets/icons';
import { HeaderCoinToggle } from '../../components/HeaderCoinToggle';
import { site } from '../../config/site';
import { isMessageFromGameFrame, isSlotGameExitMessage } from '../../components/SlotGames/slotGameExitMessages';
import { useSlotGameImmersive } from './useSlotGameImmersive';
import { SlotGameSwipeUpOverlay } from '../../components/SlotGames/SlotGameSwipeUpOverlay';
import { SlotGameFullscreenToggle } from '../../components/SlotGames/SlotGameFullscreenToggle';
import { BonaPortraitRequiredOverlay } from '../../components/SlotGames/BonaPortraitRequiredOverlay';
import { FishingLandscapeRequiredOverlay } from '../../components/SlotGames/FishingLandscapeRequiredOverlay';
import { isOneGameHubFishingPlayGame } from '../../utils/gitslotparkLandingGames';
import {
  applyIOSChromeLandscapeGameScroll,
  applyIOSChromePortraitGameScroll,
  applyIOSPortraitGameScroll,
  detectAnyMobileDevice,
  detectImmersiveGameDevice,
  isPortraitOrientation,
  syncIOSDvhFrame,
} from '../../utils/mobileGameImmersive';
import { usePageContentReady } from '../../context/PageReadyContext';
import { lockPlayPageZoom } from '../../utils/lockPlayPageZoom';
import { DepositRequiredModal } from '../../components/Games/DepositRequiredModal';
import { CoinSelectorModal } from '../../components/Games/CoinSelectorModal';
import { shouldPromptPlayCoin } from '../../config/gcCoins';
import { useCoinType } from '../../context/CoinContext';
import { useDepositRequiredGate } from '../../hooks/useDepositRequiredGate';
import { isDepositRequiredError } from '../../utils/depositRequired';
import '../../components/deposit/SecurePaymentModal.css';
import '../../components/SlotGames/SlotGamePlayPage.css';

function sanitizeWin568PlayUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.hostname.toLowerCase() === 'gp-winfast888.ggppqqgg.com') {
      parsed.hostname = 'gp.winfast888.ggppqqgg.com';
    }
    parsed.protocol = 'https:';
    return parsed.toString();
  } catch {
    return raw.replace(/\/\/gp-winfast888\./gi, '//gp.winfast888.');
  }
}

function getDefaultReturnTo() {
  return '/casino';
}

function resolvePlayProvider(raw) {
  const value = String(raw || 'pragmatic').trim().toLowerCase();
  if (value === 'bona') return 'bona';
  if (value === 'onegamehub' || value === '1gamehub') return 'onegamehub';
  if (value === 'firekirin') return 'firekirin';
  if (isWin568PlayProvider(value)) return 'win568';
  if (isScorpioPlayProvider(value)) return 'scorpio';
  return gitslotparkApi.normalizeGitslotparkProvider(value);
}

export function SlotGamePlayPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { gameId } = useParams();
  const [searchParams] = useSearchParams();
  const { balanceSc } = useAuth();
  const { setCoinType } = useCoinType();
  const {
    hasDeposit,
    loading: depositGateLoading,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    openDepositRequiredModal,
    activationBonusType,
    refresh,
  } = useDepositRequiredGate();
  const iframeRef = useRef(null);
  const returnToRef = useRef('/casino');
  const launchedSessionRef = useRef({ gameId: null, provider: null, gpid: null, portfolio: null, coinType: null });
  const settlingRef = useRef(false);
  const firekirinBalanceRefreshRef = useRef(false);

  const provider = resolvePlayProvider(
    location.state?.provider || searchParams.get('provider') || 'pragmatic'
  );
  const needsCoinSelect = shouldPromptPlayCoin(provider);
  const [playCoinType, setPlayCoinType] = useState(null);
  const win568Gpid = location.state?.gpid ?? searchParams.get('g') ?? searchParams.get('gpid');
  const win568Portfolio =
    location.state?.portfolio
    ?? searchParams.get('p')
    ?? searchParams.get('tp')
    ?? searchParams.get('portfolio');
  const win568Gameid =
    location.state?.gameid
    ?? searchParams.get('gid')
    ?? searchParams.get('gameid')
    ?? gameId;
  const scorpioProviderId =
    location.state?.providerId
    ?? location.state?.gpid
    ?? searchParams.get('g')
    ?? searchParams.get('providerId');
  const scorpioGameCode =
    location.state?.gameCode
    ?? searchParams.get('gid')
    ?? searchParams.get('gameCode')
    ?? gameId;
  const stateName = location.state?.name;
  const stateReturnTo = location.state?.returnTo;
  const returnTo = stateReturnTo
    || (provider === 'win568'
      ? `/${WIN568_GAMES_SLUG}`
      : provider === 'scorpio'
        ? `/${SCORPIO_GAMES_SLUG}`
        : provider === 'firekirin'
          ? '/'
          : getDefaultReturnTo());

  const [gameUrl, setGameUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const gameName = stateName || 'Casino game';
  const isBonaPlay = provider === 'bona';
  const isFirekirinPlay = provider === 'firekirin';
  const isOghFishingPlay =
    provider === 'onegamehub' &&
    isOneGameHubFishingPlayGame({
      provider,
      gameid: gameId,
      gameId,
      id: gameId,
      name: stateName,
      title: stateName,
      categories: location.state?.categories,
      lobbyCategoryId: location.state?.lobbyCategoryId || searchParams.get('cat'),
      isFishing: location.state?.isFishing || searchParams.get('fishing'),
    });
  const [isPortraitView, setIsPortraitView] = useState(() =>
    typeof window !== 'undefined' ? isPortraitOrientation() : true
  );
  const [isMobilePlayDevice, setIsMobilePlayDevice] = useState(() =>
    typeof window !== 'undefined' ? detectImmersiveGameDevice() : false
  );
  const [isFishingMobileDevice, setIsFishingMobileDevice] = useState(() =>
    typeof window !== 'undefined' ? detectAnyMobileDevice() : false
  );

  usePageContentReady(!loading, { immediate: true });

  useEffect(() => lockPlayPageZoom(), []);

  // Mobile: collapse the browser address bar + fill the visible viewport (iOS & Android).
  const {
    immersiveDevice,
    immersiveReady,
    isIOS,
    isIOSChrome,
    isStandalone,
    isPortrait,
    iosSwipeGateComplete,
    showIosSwipeUpOverlay,
    dismissIosSwipeOverlay,
  } = useSlotGameImmersive({
    enabled: !!gameUrl,
    gameKey: gameUrl,
  });

  // Track orientation for Bona / fishing even before the game URL loads.
  useEffect(() => {
    if (!isBonaPlay && !isOghFishingPlay) {
      setIsPortraitView(true);
      return undefined;
    }

    const sync = () => {
      setIsPortraitView(isPortraitOrientation());
      setIsMobilePlayDevice(detectImmersiveGameDevice());
      setIsFishingMobileDevice(detectAnyMobileDevice());
    };
    sync();

    const mq = window.matchMedia('(orientation: portrait)');
    mq.addEventListener('change', sync);
    window.addEventListener('orientationchange', sync);
    window.addEventListener('resize', sync);

    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('orientationchange', sync);
      window.removeEventListener('resize', sync);
    };
  }, [isBonaPlay, isOghFishingPlay]);

  const showBonaPortraitGate = isBonaPlay && isMobilePlayDevice && !isPortraitView;
  const showFishingLandscapeGate =
    isOghFishingPlay && isFishingMobileDevice && isPortraitView;
  const showOrientationGate = showBonaPortraitGate || showFishingLandscapeGate;

  const iosPortraitGated =
    !isOghFishingPlay &&
    immersiveDevice &&
    isIOS &&
    isPortrait &&
    !isStandalone &&
    !iosSwipeGateComplete;
  // Keep the game mounted under orientation gates so rotating back
  // does not remount the iframe / lose the session.
  const canShowGame = !iosPortraitGated;

  returnToRef.current = returnTo;

  const settleBonaIfNeeded = useCallback(async () => {
    if (provider !== 'bona' || settlingRef.current) return;
    settlingRef.current = true;
    try {
      await bonaApi.settleBonaSession({ gameId: Number(gameId) || undefined });
      window.dispatchEvent(new Event('wallet:refresh'));
    } catch (_) {
      // best-effort
    } finally {
      settlingRef.current = false;
    }
  }, [provider, gameId]);

  const refreshFirekirinBalanceIfNeeded = useCallback(async () => {
    if (provider !== 'firekirin' || firekirinBalanceRefreshRef.current) return null;
    firekirinBalanceRefreshRef.current = true;
    try {
      let platformGameId = location.state?.firekirinGameId;
      if (!platformGameId) {
        const exclusive = await gamesApi.getFirekirinExclusiveGames();
        platformGameId = exclusive?.firekirinGameId;
      }
      if (!platformGameId) return null;
      await gamesApi.getGameBalance(platformGameId);
      return platformGameId;
    } catch (_) {
      return location.state?.firekirinGameId || null;
    }
  }, [provider, location.state?.firekirinGameId]);

  useEffect(() => {
    if (!gameId) {
      navigate(returnTo, { replace: true });
    }
  }, [gameId, returnTo, navigate]);

  useEffect(() => {
    if (!gameId) return undefined;
    if (depositGateLoading) return undefined;
    if (!hasDeposit) {
      let cancelled = false;
      (async () => {
        // Force re-check: Chime/package credits can land without unlocking a stale gate.
        const deposited = await refresh({ force: true });
        if (cancelled) return;
        if (deposited) return;
        if (
          gameUrl &&
          launchedSessionRef.current.gameId === gameId &&
          launchedSessionRef.current.provider === provider &&
          String(launchedSessionRef.current.gpid || '') === String(
            provider === 'scorpio' ? scorpioProviderId : win568Gpid || ''
          ) &&
          String(launchedSessionRef.current.portfolio || '') === String(win568Portfolio || '')
        ) {
          return;
        }
        launchedSessionRef.current = { gameId: null, provider: null, gpid: null, portfolio: null };
        setGameUrl('');
        setLoading(false);
        setError('');
        openDepositRequiredModal();
      })();
      return () => {
        cancelled = true;
      };
    }

    if (
      launchedSessionRef.current.gameId === gameId &&
      launchedSessionRef.current.provider === provider &&
      launchedSessionRef.current.coinType === (playCoinType || 'SC') &&
      String(launchedSessionRef.current.gpid || '') === String(
        provider === 'scorpio' ? scorpioProviderId : win568Gpid || ''
      ) &&
      String(launchedSessionRef.current.portfolio || '') === String(win568Portfolio || '')
    ) {
      return undefined;
    }

    if (needsCoinSelect && !playCoinType) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    setGameUrl('');
    setLoading(true);
    setError('');

    (async () => {
      try {
        const coinType = playCoinType || 'SC';
        const res =
          provider === 'win568'
            ? await win568Api.launchWin568Game({
                gameid: win568Gameid,
                gpid: win568Gpid,
                portfolio: win568Portfolio,
                coinType
              })
            : provider === 'scorpio'
            ? await scorpioApi.launchScorpioGame({
                gameCode: scorpioGameCode,
                providerId: scorpioProviderId,
                coinType
              })
            : provider === 'bona'
            ? await bonaApi.launchBonaGame(gameId, coinType)
            : provider === 'onegamehub'
              ? await onegamehubApi.launchOneGameHubGame(gameId, coinType)
              : provider === 'firekirin'
                ? await gamesApi.enterFirekirinExclusiveGame(gameId)
                : await gitslotparkApi.launchSlotGame(gameId, provider, coinType);
        const url = res?.url ? sanitizeWin568PlayUrl(String(res.url).trim()) : '';
        if (!url) {
          throw new Error('Game launch URL not returned');
        }
        if (!cancelled) {
          launchedSessionRef.current = {
            gameId,
            provider,
            gpid: provider === 'scorpio' ? scorpioProviderId : win568Gpid,
            portfolio: win568Portfolio,
            coinType: playCoinType || 'SC'
          };
          setGameUrl(url);
        }
      } catch (e) {
        if (!cancelled) {
          launchedSessionRef.current = { gameId: null, provider: null, gpid: null, portfolio: null };
          if (isDepositRequiredError(e)) {
            openDepositRequiredModal();
            setError('');
          } else {
            setError(e.message || 'Unable to launch this game. Please try again.');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gameId, provider, gameUrl, hasDeposit, depositGateLoading, openDepositRequiredModal, refresh, win568Gpid, win568Portfolio, win568Gameid, scorpioProviderId, scorpioGameCode, needsCoinSelect, playCoinType]);

  useEffect(() => {
    if (!gameUrl) return undefined;

    // Always hide the surrounding chrome (nav/footer/chat) while playing.
    document.body.classList.add('payment-iframe-active', 'slot-game-play-active');

    // On mobile the immersive hook manages body scroll (a scrollable document is
    // required for the browser to collapse its address bar), so only hard-lock
    // the body on non-immersive (desktop) devices.
    const lockBody = !immersiveDevice;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevWidth = document.body.style.width;
    const scrollY = window.scrollY;

    if (lockBody) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
    }

    return () => {
      document.body.classList.remove('payment-iframe-active', 'slot-game-play-active');
      if (lockBody) {
        document.body.style.overflow = prevOverflow;
        document.body.style.position = prevPosition;
        document.body.style.width = prevWidth;
        document.body.style.top = '';
        window.scrollTo(0, scrollY);
      }
      window.dispatchEvent(new Event('wallet:refresh'));
      if (provider === 'bona') {
        settleBonaIfNeeded();
      }
      if (provider === 'firekirin') {
        refreshFirekirinBalanceIfNeeded();
      }
    };
  }, [gameUrl, immersiveDevice, provider, settleBonaIfNeeded, refreshFirekirinBalanceIfNeeded]);

  // One refresh when the game opens; live SC updates come from Socket.IO (wallet:balance).
  useEffect(() => {
    if (!gameUrl) return undefined;
    window.dispatchEvent(new Event('wallet:refresh'));
    return undefined;
  }, [gameUrl]);

  const leavePlay = useCallback(
    (to) => {
      if (provider === 'bona') {
        settleBonaIfNeeded().finally(() => {
          navigate(to, { replace: true });
        });
        return;
      }
      if (provider === 'firekirin') {
        const pendingRefresh = refreshFirekirinBalanceIfNeeded();
        navigate(to, { replace: true });
        pendingRefresh
          .catch(() => null)
          .then((platformGameId) => {
            window.dispatchEvent(
              new CustomEvent('games:firekirin-balance-refresh', {
                detail: { gameId: platformGameId || location.state?.firekirinGameId },
              })
            );
          });
        return;
      }
      navigate(to, { replace: true });
    },
    [navigate, provider, settleBonaIfNeeded, refreshFirekirinBalanceIfNeeded, location.state?.firekirinGameId]
  );

  const handleClose = useCallback(() => {
    leavePlay(returnToRef.current);
  }, [leavePlay]);

  const handleGoHome = useCallback(() => {
    leavePlay('/');
  }, [leavePlay]);

  const handleSwipeOverlayExit = () => {
    dismissIosSwipeOverlay();
    handleClose();
  };

  const handleIframeLoad = useCallback(() => {
    // Provider quit often navigates the iframe to lobbyUrl (store origin) instead of
    // postMessage. Detect that and leave the play shell so we don't stack two headers.
    try {
      const win = iframeRef.current?.contentWindow;
      if (win && win.location.origin === window.location.origin) {
        handleClose();
        return;
      }
    } catch {
      // Still on the cross-origin game frame — expected while playing.
    }

    if (!isIOS || !immersiveDevice) return;
    const wrapper = document.getElementById('slot-game-fullscreen-wrapper');
    if (isPortrait) {
      if (isIOSChrome) applyIOSChromePortraitGameScroll(wrapper);
      else applyIOSPortraitGameScroll(wrapper);
    } else if (isIOSChrome) {
      applyIOSChromeLandscapeGameScroll(wrapper);
    } else {
      syncIOSDvhFrame(wrapper);
    }
  }, [isIOS, isIOSChrome, isPortrait, immersiveDevice, handleClose]);

  useEffect(() => {
    if (!gameUrl) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gameUrl, handleClose]);

  useEffect(() => {
    if (!gameUrl) return undefined;

    const onGameMessage = (event) => {
      const iframeEl = iframeRef.current;
      if (!iframeEl || !isMessageFromGameFrame(event, iframeEl)) return;
      if (!isSlotGameExitMessage(event.data)) return;
      handleClose();
    };

    window.addEventListener('message', onGameMessage);
    return () => window.removeEventListener('message', onGameMessage);
  }, [gameUrl, handleClose]);

  if (!gameId) return null;

  const title = gameName ? `Playing ${gameName}` : 'Casino game';

  return (
    <div
      id="slot-game-fullscreen-wrapper"
      className={
        'secure-payment-modal secure-payment-modal--iframe-only flex flex-col' +
        (immersiveDevice
          ? ' slot-game-immersive-root'
          : ' fixed inset-0 z-[10080] overflow-hidden') +
        (isBonaPlay ? ' slot-game-play--bona' : '')
      }
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="spm-iframe-header spm-iframe-header--play">
        <div className="spm-play-logo" aria-label={site.platformName}>
          <span className="spm-play-logo-ring" aria-hidden>
            <span className="spm-play-logo-inner">🎰</span>
          </span>
          <span className="spm-play-logo-text">{site.platformName}</span>
        </div>

        {needsCoinSelect ? (
          <div className="spm-play-wallet spm-play-wallet--toggle">
            <HeaderCoinToggle
              variant="gameplay"
              onChange={(next) => {
                if (playCoinType && playCoinType !== next) setPlayCoinType(next);
              }}
            />
          </div>
        ) : (
          <div className="spm-play-wallet" aria-live="polite" title="Your Sweepstakes Coins balance">
            <span className="spm-play-wallet-coin" aria-hidden>
              <SCCoinIcon className="w-full h-full" />
            </span>
            <span className="spm-play-wallet-amount">
              {Number(balanceSc || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="spm-play-wallet-label">SC</span>
          </div>
        )}

        <div className="spm-iframe-header-actions">
          <SlotGameFullscreenToggle immersiveLocked={immersiveReady} />
          <button
            type="button"
            onClick={handleGoHome}
            className="spm-iframe-header-home"
            aria-label="Home"
          >
            <HomeIcon className="spm-iframe-header-home-icon" />
            <span>Home</span>
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="spm-iframe-header-close"
          >
            Close
          </button>
        </div>
      </header>

      {showBonaPortraitGate ? <BonaPortraitRequiredOverlay /> : null}
      {showFishingLandscapeGate ? <FishingLandscapeRequiredOverlay /> : null}

      {showIosSwipeUpOverlay && !showOrientationGate ? (
        <>
          <div className="slot-game-ios-scroll-rail sg-swipe-overlay-scroll-rail" aria-hidden />
          <SlotGameSwipeUpOverlay onExit={handleSwipeOverlayExit} />
        </>
      ) : null}

      {immersiveReady && isIOS && !isPortrait && (
        <div className="slot-game-ios-scroll-edge" aria-hidden />
      )}

      <div className="relative flex-1 min-h-0 w-full flex flex-col overflow-hidden">
        {loading && canShowGame && !showIosSwipeUpOverlay ? (
          <div className="flex flex-1 items-center justify-center min-h-[240px]">
            <AppLoader message="Loading game" fillPage={false} />
          </div>
        ) : error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
            <p className="text-gray-200">{error}</p>
            <button
              type="button"
              onClick={handleClose}
              className="py-2.5 px-5 rounded-xl font-medium text-gray-200 bg-white/10 hover:bg-white/15 transition"
            >
              Back to games
            </button>
          </div>
        ) : canShowGame && gameUrl && !error ? (
          <div
            className={
              'spm-iframe-shell flex-1 min-h-0 flex flex-col' +
              (isBonaPlay ? ' spm-iframe-shell--bona' : '')
            }
          >
            <iframe
              ref={iframeRef}
              title={title}
              src={gameUrl}
              className={
                'spm-iframe flex-1 w-full min-h-0 border-0 bg-black' +
                (isBonaPlay ? ' spm-iframe--bona' : '')
              }
              allow="fullscreen; autoplay; clipboard-write; gamepad"
              referrerPolicy="origin"
              sandbox={
                isFirekirinPlay
                  ? 'allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-orientation-lock allow-modals allow-downloads allow-presentation'
                  : undefined
              }
              onLoad={handleIframeLoad}
            />
          </div>
        ) : !showIosSwipeUpOverlay && !loading ? (
          <div className="flex flex-1 items-center justify-center min-h-[240px]" aria-hidden />
        ) : null}

        {canShowGame && immersiveReady && gameUrl && !error && !showIosSwipeUpOverlay && !showOrientationGate && (
          <div className="slot-game-swipe-hint" aria-hidden>
            <span className="slot-game-swipe-hint-arrow">⌃</span>
            <span>{isIOS ? 'Swipe up for fullscreen' : 'Swipe up to hide bar'}</span>
          </div>
        )}
      </div>

      {canShowGame && immersiveReady && isIOS && isPortrait && !showFishingLandscapeGate && (
        <div className="slot-game-ios-scroll-rail" aria-hidden />
      )}
      <DepositRequiredModal
        open={depositRequiredModalOpen}
        onClose={() => {
          closeDepositRequiredModal();
          if (!hasDeposit) navigate(returnTo, { replace: true });
        }}
        activationBonusType={activationBonusType}
      />
      {needsCoinSelect && !playCoinType && hasDeposit && !depositGateLoading && !depositRequiredModalOpen ? (
        <CoinSelectorModal
          game={{
            title: gameName,
            name: gameName,
            image: location.state?.image,
            iconUrls: location.state?.iconUrls,
          }}
          onClose={() => navigate(returnTo, { replace: true })}
          onLaunch={(mode) => {
            const coin = mode === 'gc' ? 'GC' : 'SC';
            setCoinType(coin);
            setPlayCoinType(coin);
          }}
        />
      ) : null}
    </div>
  );
}
