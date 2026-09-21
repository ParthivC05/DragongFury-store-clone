import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '../ui/Dialog';
import { useHideIntercomForGameTransferModal } from '../intercomApi';
import { GiftIcon, ReferEarnIcon } from '../../assets/icons';
import * as affiliateApi from '../../api/affiliate';
import { GIT_SLOTPARK_PROVIDERS } from '../../api/gitslotpark';
import { shareOptionsFromAffiliateStats } from '../../utils/socialShare';
import { getAllCachedProviderSlotGames } from '../../utils/dashboardSlotGamesCache';
import {
  prepareDashboardSlotGames,
  resolveLaunchGameId,
} from '../../utils/gitslotparkLandingGames';
import { useEnabledSlotProviders } from '../../hooks/useEnabledSlotProviders';
import { useLaunchDashboardSlotGame } from '../../hooks/useLaunchDashboardSlotGame';
import { DepositRequiredModal } from './DepositRequiredModal';

const TOP_SLOT_COUNT = 3;
const NEUTRAL_REFER_SUBTITLE = 'Invite friends and earn SC';

function formatCelebrateAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n < 0) return null;
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function referEarnSubtitle(affiliateData) {
  if (!affiliateData) return NEUTRAL_REFER_SUBTITLE;

  const opts = shareOptionsFromAffiliateStats(affiliateData);
  if (opts.giveGet) {
    const friend = Number(opts.friendBonus);
    const referrer = Number(opts.referrerBonus);
    if (Number.isFinite(friend) && Number.isFinite(referrer) && friend > 0 && referrer > 0) {
      if (friend === referrer) return `You both get ${friend} SC free`;
      return `Give ${friend}, Get ${referrer} SC`;
    }
    if (Number.isFinite(friend) && friend > 0) return `Friends get ${friend} SC free`;
    return NEUTRAL_REFER_SUBTITLE;
  }

  const friend = Number(opts.friendBonus);
  const pct = Number(opts.rewardPct);
  const friendText = Number.isFinite(friend) && friend > 0 ? `${friend} SC` : 'a signup bonus';
  const pctText = Number.isFinite(pct) && pct > 0 ? `${pct}%` : 'rewards';
  return `Friends get ${friendText} · you earn ${pctText}`;
}

function slotGameImage(game) {
  if (typeof game?.image === 'string' && game.image.trim()) return game.image.trim();
  const icons = Array.isArray(game?.iconUrls) ? game.iconUrls : [];
  const first = icons.find((url) => typeof url === 'string' && url.trim());
  return first ? String(first).trim() : '';
}

function slotGameKey(game) {
  return String(game?.id || `${game?.provider || ''}-${game?.gameid || ''}` || game?.title || '');
}

function isEnabledSlotGame(game, flags) {
  const provider = String(game?.provider || '').trim().toLowerCase();
  if (!provider || !flags) return false;
  if (provider === 'onegamehub' || provider === '1gamehub') return flags.onegamehub === true;
  if (provider === 'bona') return flags.bona === true;
  if (provider === 'gitslotpark' || GIT_SLOTPARK_PROVIDERS.includes(provider)) {
    return flags.gitslotpark === true;
  }
  return false;
}

function pickRandomSlotGames(allGames, flags, count = TOP_SLOT_COUNT) {
  const enabled = prepareDashboardSlotGames(
    (Array.isArray(allGames) ? allGames : []).filter((game) => isEnabledSlotGame(game, flags))
  ).filter((game) => resolveLaunchGameId(game));

  const pool = enabled.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = pool[i];
    pool[i] = pool[j];
    pool[j] = current;
  }
  return pool.slice(0, count);
}

function ChevronRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Shown after an automatic (bot online) game redeem succeeds and SC lands in the
 * wallet. Asks the player to refer friends, play top slots, or go to wallet.
 */
export function WithdrawPromptModal({
  open,
  onOpenChange,
  onConfirm,
  amount,
}) {
  const navigate = useNavigate();
  useHideIntercomForGameTransferModal(open);
  const { providers: providerFlags, loaded: providersLoaded } = useEnabledSlotProviders();
  const {
    handlePlayGame,
    launchingGameId,
    depositRequiredModalOpen,
    closeDepositRequiredModal,
    activationBonusType,
  } = useLaunchDashboardSlotGame();

  const [affiliateData, setAffiliateData] = useState(null);
  const [slotGames, setSlotGames] = useState(() => getAllCachedProviderSlotGames());
  const [slotsFetched, setSlotsFetched] = useState(() => getAllCachedProviderSlotGames().length > 0);
  const [similarGames, setSimilarGames] = useState([]);
  const pickedThisOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    affiliateApi
      .getAffiliateStats()
      .then((res) => {
        if (!cancelled) setAffiliateData(res);
      })
      .catch(() => {
        if (!cancelled) setAffiliateData(null);
      });

    const cached = getAllCachedProviderSlotGames();
    if (cached.length) {
      setSlotGames(cached);
      setSlotsFetched(true);
    }

    import('../Home/DashboardSlotGamesSection')
      .then((mod) => mod.prefetchLobbySlotGames())
      .then(() => {
        if (cancelled) return;
        const next = getAllCachedProviderSlotGames();
        if (next.length) setSlotGames(next);
        setSlotsFetched(true);
      })
      .catch(() => {
        if (!cancelled) setSlotsFetched(true);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      pickedThisOpenRef.current = false;
      setSimilarGames([]);
      return;
    }
    if (!providersLoaded || pickedThisOpenRef.current) return;

    const next = pickRandomSlotGames(slotGames, providerFlags, TOP_SLOT_COUNT);
    if (next.length) {
      pickedThisOpenRef.current = true;
      setSimilarGames(next);
      return;
    }
    if (slotsFetched) setSimilarGames([]);
  }, [open, providersLoaded, slotsFetched, slotGames, providerFlags]);

  const amountLabel = formatCelebrateAmount(amount);
  const referSub = referEarnSubtitle(affiliateData);
  const similarCount = similarGames.length;
  const catalogReady = providersLoaded && slotsFetched;

  function closeModal() {
    onOpenChange?.(false);
  }

  function handleRefer() {
    closeModal();
    navigate('/account/affiliate');
  }

  function handleBrowseSlots() {
    closeModal();
    navigate('/casino');
  }

  function handlePickGame(game) {
    if (!resolveLaunchGameId(game)) {
      closeModal();
      navigate('/casino');
      return;
    }
    closeModal();
    handlePlayGame(game);
  }

  function handleWallet() {
    if (onConfirm) {
      onConfirm();
      return;
    }
    closeModal();
    navigate('/withdraw');
  }

  function handleSlotImageError(event) {
    event.currentTarget.removeAttribute('src');
    event.currentTarget.style.visibility = 'hidden';
  }

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="gtm-backdrop fixed inset-0 z-[110]" />
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh]">
            <Dialog.Content className="gtm-modal gtm-modal--celebrate gtm-modal-enter relative w-full max-w-md flex-shrink-0 outline-none mx-auto">
              <div className="gtm-glow-ring" aria-hidden />

              <Dialog.Close className="gtm-close" aria-label="Close">
                ×
              </Dialog.Close>

              <div className="gtm-inner gtm-prompt">
                <div className="gtm-prompt-hero" aria-hidden>
                  <GiftIcon className="gtm-prompt-hero-icon" />
                </div>

                <div className="gtm-header gtm-prompt-header">
                  <Dialog.Title className="gtm-title">Congratulations!</Dialog.Title>
                  {amountLabel ? (
                    <p className="gtm-prompt-amount">
                      You won {amountLabel} <span>SC</span>
                    </p>
                  ) : null}
                  <Dialog.Description className="gtm-subtitle">
                    Just landed in your wallet.
                  </Dialog.Description>
                </div>

                <div className="gtm-prompt-actions">
                  <button type="button" onClick={handleRefer} className="gtm-prompt-row gtm-prompt-row--primary">
                    <span className="gtm-prompt-row-icon" aria-hidden>
                      <ReferEarnIcon />
                    </span>
                    <span className="gtm-prompt-row-copy">
                      <span className="gtm-prompt-row-title">Refer and earn more</span>
                      <span className="gtm-prompt-row-sub">{referSub}</span>
                    </span>
                    <span className="gtm-prompt-row-chevron" aria-hidden>
                      <ChevronRightIcon />
                    </span>
                  </button>

                  <div className="gtm-prompt-slots">
                    <div className="gtm-prompt-slots-head">
                      <p className="gtm-prompt-slots-title">Play these hot slots</p>
                      <p className="gtm-prompt-slots-sub">
                        {!catalogReady || similarCount === TOP_SLOT_COUNT
                          ? 'New picks for you'
                          : 'Picked for you'}
                      </p>
                    </div>

                    {!catalogReady ? (
                      <div className="gtm-prompt-picks" aria-hidden />
                    ) : similarCount > 0 ? (
                      <div className="gtm-prompt-picks" role="list">
                        {similarGames.map((game) => {
                          const title = game.title || 'Slot game';
                          const src = slotGameImage(game);
                          const gameId = resolveLaunchGameId(game);
                          const launching = Boolean(gameId && launchingGameId === gameId);
                          return (
                            <button
                              key={slotGameKey(game)}
                              type="button"
                              className="gtm-prompt-pick"
                              onClick={() => handlePickGame(game)}
                              disabled={launching}
                              role="listitem"
                              aria-label={`Play ${title}`}
                            >
                              {src ? (
                                <img
                                  src={src}
                                  alt=""
                                  className="gtm-prompt-pick-img"
                                  width={56}
                                  height={56}
                                  onError={handleSlotImageError}
                                />
                              ) : (
                                <span className="gtm-prompt-pick-img" aria-hidden />
                              )}
                              <span className="gtm-prompt-pick-name">{title}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <button type="button" onClick={handleBrowseSlots} className="gtm-prompt-row gtm-prompt-row--ghost">
                        <span className="gtm-prompt-row-copy">
                          <span className="gtm-prompt-row-title">Browse slot games</span>
                          <span className="gtm-prompt-row-sub">See what's hot in casino</span>
                        </span>
                        <span className="gtm-prompt-row-chevron" aria-hidden>
                          <ChevronRightIcon />
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                <button type="button" onClick={handleWallet} className="gtm-prompt-no">
                  Go to wallet
                </button>
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
    </>
  );
}
