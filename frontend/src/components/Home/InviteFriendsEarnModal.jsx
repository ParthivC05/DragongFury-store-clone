import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CopyIcon, ShareIcon } from '../../assets/icons';
import { ReferralShareModal } from '../ReferralShareModal';
import { shareOptionsFromAffiliateStats } from '../../utils/socialShare';
import { useToast } from '../../context/ToastContext';
import { formatSc } from '../../utils/currency';
import { buildReferralLink } from '../../utils/referralLink';
import { lockBodyScroll } from '../../utils/bodyScrollLock';

const HOW_IT_WORKS_STEPS = [
  { icon: '🔗', title: 'Share link' },
  { icon: '🎮', title: 'Friend plays' },
  { icon: '💰', title: 'You earn SC' },
];

const spring = { type: 'spring', stiffness: 340, damping: 28 };

const backdropMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.3, ease: 'easeOut' },
};

const modalMotion = {
  initial: { opacity: 0, scale: 0.86, y: 32 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.92, y: 16 },
  transition: spring,
};

const bodyStagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};

const revealItem = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: spring },
};

const instant = { duration: 0 };

/** Clipboard fallback for browsers/contexts without navigator.clipboard. */
function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function InviteFriendsEarnModal({ open, onClose, affiliateData }) {
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const [copiedBurst, setCopiedBurst] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const referralLink = buildReferralLink(affiliateData?.referral_code);

  useEffect(() => {
    if (!open && !shareModalOpen) return undefined;
    const releaseScrollLock = lockBodyScroll();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (shareModalOpen) setShareModalOpen(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      releaseScrollLock();
      window.removeEventListener('keydown', onKey);
    };
  }, [open, shareModalOpen, onClose]);

  useEffect(() => {
    if (!open) setShareModalOpen(false);
  }, [open]);

  if (!open && !shareModalOpen) return null;

  const rewardDescription = affiliateData?.reward_description?.trim() || '';
  const isGiveGet = affiliateData?.program_mode === 'give_get';
  const friendBonus = affiliateData?.friend_signup_bonus_sc ?? 15;
  const referrerBonus = affiliateData?.referrer_reward_sc ?? 15;
  // The affiliate summary API exposes only a free-text description, so derive the
  // headline numbers from it when present and fall back to the platform defaults.
  const pctMatch = rewardDescription.match(/(\d{1,3})\s*%/);
  const purchasesMatch = rewardDescription.match(/(\d{1,2})\s*(?:purchase|deposit|order)/i);
  const rewardPct = affiliateData?.reward_percentage ?? (pctMatch ? Number(pctMatch[1]) : 10);
  const maxPurchases =
    affiliateData?.max_rewarded_purchases ?? (purchasesMatch ? Number(purchasesMatch[1]) : 3);

  const markCopied = () => {
    toast.success('Link copied!');
    setCopiedBurst(true);
    setTimeout(() => setCopiedBurst(false), 900);
  };

  const handleCopy = () => {
    if (!referralLink) {
      toast.error('Referral link is not ready yet.');
      return;
    }
    // Prefer the async Clipboard API, but fall back to execCommand for older
    // browsers / non-secure (http) contexts where navigator.clipboard is absent.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(referralLink).then(markCopied, () => {
        if (!legacyCopy(referralLink)) toast.error('Could not copy.');
      });
      return;
    }
    if (legacyCopy(referralLink)) markCopied();
    else toast.error('Could not copy.');
  };

  const handleShare = () => {
    if (!referralLink) {
      toast.error('Referral link is not ready yet.');
      return;
    }
    setShareModalOpen(true);
  };

  const totalReferrals = affiliateData?.total_referrals ?? 0;
  const totalEarned = affiliateData?.total_earned_sc ?? 0;
  const currency = affiliateData?.currency || 'SC';
  const shareOpts = shareOptionsFromAffiliateStats(affiliateData);

  return createPortal(
    <>
      <AnimatePresence mode="wait">
        {open && (
          <motion.div
            key="invite-friends-earn-modal"
            className="fdb-backdrop rfx-backdrop"
            role="presentation"
            onClick={onClose}
            initial={reduceMotion ? false : backdropMotion.initial}
            animate={reduceMotion ? { opacity: 1 } : backdropMotion.animate}
            exit={reduceMotion ? undefined : backdropMotion.exit}
            transition={reduceMotion ? instant : backdropMotion.transition}
          >
            <motion.div
              className="rfx-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="rfx-modal-title"
              onClick={(e) => e.stopPropagation()}
              initial={reduceMotion ? false : modalMotion.initial}
              animate={reduceMotion ? { opacity: 1, scale: 1, y: 0 } : modalMotion.animate}
              exit={reduceMotion ? undefined : modalMotion.exit}
              transition={reduceMotion ? instant : modalMotion.transition}
            >
              <button type="button" className="fdb-close" onClick={onClose} aria-label="Close" />

              <div className="rfx-aura" aria-hidden />
              <div className="rfx-confetti" aria-hidden>
                <span className="rfx-confetti-piece rfx-cp-1" />
                <span className="rfx-confetti-piece rfx-cp-2" />
                <span className="rfx-confetti-piece rfx-cp-3" />
                <span className="rfx-confetti-piece rfx-cp-4" />
                <span className="rfx-confetti-piece rfx-cp-5" />
                <span className="rfx-confetti-piece rfx-cp-6" />
              </div>

              <motion.div
                className="rfx-inner"
                variants={reduceMotion ? undefined : bodyStagger}
                initial={reduceMotion ? false : 'initial'}
                animate="animate"
              >
                <motion.div className="rfx-badge" variants={reduceMotion ? undefined : revealItem}>
                  <span className="rfx-badge-dot" aria-hidden />
                  Refer &amp; Earn
                </motion.div>

                {/* ── Hero reward ─────────────────────────── */}
                <motion.div className="rfx-hero" variants={reduceMotion ? undefined : revealItem}>
                  <div className="rfx-hero-coin" aria-hidden>
                    <span className="rfx-hero-coin-face">SC</span>
                  </div>
                  <div className="rfx-hero-reward">
                    {isGiveGet ? (
                      <>
                        <span className="rfx-hero-pct">
                          {friendBonus}/{referrerBonus}
                        </span>
                        <span className="rfx-hero-cap">
                          Give &amp; Get {currency}
                          <br /> when friends play
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="rfx-hero-pct">{rewardPct}%</span>
                        <span className="rfx-hero-cap">
                          back in {currency} <br /> on every friend
                        </span>
                      </>
                    )}
                  </div>
                </motion.div>

                <motion.h2
                  id="rfx-modal-title"
                  className="rfx-title"
                  variants={reduceMotion ? undefined : revealItem}
                >
                  {isGiveGet
                    ? `Give ${friendBonus}, Get ${referrerBonus}`
                    : 'Invite Friends & Earn'}
                </motion.h2>

                <motion.p className="rfx-sub" variants={reduceMotion ? undefined : revealItem}>
                  {rewardDescription ||
                    (isGiveGet ? (
                      <>
                        Friends get <b>{friendBonus} SC</b> on signup. You get <b>{referrerBonus} SC</b>{' '}
                        after they deposit ${affiliateData?.min_qualifying_deposit_usd ?? 20}+ and play once
                        (within {affiliateData?.payout_delay_hours ?? 24} hours).
                      </>
                    ) : (
                      <>
                        Earn up to <b>{rewardPct}% Sweepstakes Coins</b> every time a friend buys a
                        coin package — rewarded on their first <b>{maxPurchases} purchases</b>.
                      </>
                    ))}
                </motion.p>

                {/* ── Live stats ──────────────────────────── */}
                <motion.div
                  className="rfx-stats"
                  variants={reduceMotion ? undefined : revealItem}
                  role="list"
                  aria-label="Your referral stats"
                >
                  <div className="rfx-stat" role="listitem">
                    <span className="rfx-stat-val tabular-nums">{totalReferrals}</span>
                    <span className="rfx-stat-label">Friends</span>
                  </div>
                  <div className="rfx-stat rfx-stat--hero" role="listitem">
                    <span className="rfx-stat-val tabular-nums">
                      {formatSc(totalEarned)}
                      <span className="rfx-stat-unit"> {currency}</span>
                    </span>
                    <span className="rfx-stat-label">Earned</span>
                  </div>
                  <div className="rfx-stat" role="listitem">
                    <span className="rfx-stat-val">×{maxPurchases}</span>
                    <span className="rfx-stat-label">Per friend</span>
                  </div>
                </motion.div>

                {/* ── How it works (compact horizontal flow) ── */}
                <motion.div className="rfx-steps" variants={reduceMotion ? undefined : revealItem}>
                  <div className="rfx-steps-head">How it works</div>
                  <ol className="rfx-steps-list">
                    {HOW_IT_WORKS_STEPS.map((step, i) => (
                      <li className="rfx-step" key={step.title}>
                        <span className="rfx-step-icon" aria-hidden>
                          <span className="rfx-step-num">{i + 1}</span>
                          {step.icon}
                        </span>
                        <span className="rfx-step-title">{step.title}</span>
                      </li>
                    ))}
                  </ol>
                </motion.div>

                {/* ── Referral link ───────────────────────── */}
                <motion.div className="rfx-link" variants={reduceMotion ? undefined : revealItem}>
                  <div className="rfx-link-label">Your invite link</div>
                  <div className="rfx-link-row">
                    <input
                      type="text"
                      readOnly
                      value={referralLink}
                      className="rfx-link-input"
                      aria-label="Your referral link"
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      className={`rfx-copy${copiedBurst ? ' rfx-copy--done' : ''}`}
                      onClick={handleCopy}
                      title="Copy link"
                      aria-label="Copy referral link"
                    >
                      {copiedBurst ? (
                        <span className="rfx-copy-check" aria-hidden>
                          ✓
                        </span>
                      ) : (
                        <CopyIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </motion.div>

                {/* ── Actions ─────────────────────────────── */}
                <motion.div className="rfx-actions" variants={reduceMotion ? undefined : revealItem}>
                  <button type="button" className="rfx-cta" onClick={handleShare}>
                    <span className="rfx-cta-shine" aria-hidden />
                    <ShareIcon className="w-5 h-5" />
                    Share My Link
                  </button>
                  <Link
                    to="/account/affiliate"
                    className="rfx-secondary no-underline"
                    onClick={onClose}
                  >
                    View my referral dashboard
                  </Link>
                  <button type="button" className="rfx-dismiss" onClick={onClose}>
                    Maybe later
                  </button>
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReferralShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        referralLink={referralLink}
        shareOptions={shareOpts}
      />
    </>,
    document.body
  );
}
