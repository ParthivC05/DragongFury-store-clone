import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { CopyIcon, ShareIcon } from '../../assets/icons';
import { ReferralShareModal } from '../ReferralShareModal';
import { useToast } from '../../context/ToastContext';
import { formatSc } from '../../utils/currency';
import { buildReferralLink } from '../../utils/referralLink';
import { shareOptionsFromAffiliateStats } from '../../utils/socialShare';

export function InviteFriendsSection({ affiliateData, onCopyLink, onShare }) {
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const [copiedBurst, setCopiedBurst] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const totalReferrals = affiliateData?.total_referrals ?? 0;
  const totalEarned = affiliateData?.total_earned_sc ?? 0;
  const currency = affiliateData?.currency || 'SC';
  const shareOpts = shareOptionsFromAffiliateStats(affiliateData);

  const referralLink = buildReferralLink(affiliateData?.referral_code);

  const handleCopy = () => {
    if (!referralLink) return;
    navigator.clipboard.writeText(referralLink).then(
      () => {
        toast.success('Link copied!');
        setCopiedBurst(true);
        setTimeout(() => setCopiedBurst(false), 900);
      },
      () => toast.error('Could not copy.')
    );
    onCopyLink?.();
  };

  const handleShare = () => {
    if (!referralLink) {
      toast.error('Referral link is not ready yet.');
      return;
    }
    setShareModalOpen(true);
    onShare?.();
  };

  return (
    <section className="dash-invite-card dash-invite-card--gamified" aria-label="Invite friends and earn">
      <div className="dash-invite-glow" aria-hidden />

      <div className="dash-invite-head">
        <motion.span
          className="dash-invite-icon dash-invite-icon--pulse relative"
          aria-hidden
          animate={reduceMotion ? undefined : { y: [0, -4, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          🎁
        </motion.span>
        <div className="dash-invite-head-copy">
          <h2>Invite Friends &amp; Earn</h2>
          <p>
            {affiliateData?.reward_description ||
              (affiliateData?.program_mode === 'classic'
                ? `Your friend gets ${affiliateData?.friend_signup_bonus_sc ?? 5} SC on signup. You earn ${affiliateData?.reward_percentage ?? 10}% of their first ${affiliateData?.max_rewarded_purchases ?? 3} deposits.`
                : affiliateData?.program_mode === 'give_get'
                ? `Give ${affiliateData?.friend_signup_bonus_sc ?? 15}, Get ${affiliateData?.referrer_reward_sc ?? 15} — friends get ${affiliateData?.friend_signup_bonus_sc ?? 15} SC on signup; you earn ${affiliateData?.referrer_reward_sc ?? 15} SC after they deposit $${affiliateData?.min_qualifying_deposit_usd ?? 20}+ and play once.`
                : 'Earn Sweepstakes Coins when friends purchase coin packages.')}
          </p>
        </div>
      </div>

      <div className="dash-invite-stats" role="list" aria-label="Referral statistics">
        <div className="dash-invite-stat" role="listitem">
          <span className="dash-invite-stat-val tabular-nums">{totalReferrals}</span>
          <span className="dash-invite-stat-label">Friends</span>
        </div>
        <div className="dash-invite-stat dash-invite-stat--mid" role="listitem">
          <span className="dash-invite-stat-val tabular-nums">
            {formatSc(totalEarned)} <span className="dash-invite-stat-unit">{currency}</span>
          </span>
          <span className="dash-invite-stat-label">Earned</span>
        </div>
      </div>

      <div className="dash-invite-fields">
        <label className="dash-invite-field-label" htmlFor="dash-invite-link">
          Your referral link
        </label>
        <div className="dash-invite-link-row">
          <input
            id="dash-invite-link"
            type="text"
            readOnly
            value={referralLink}
            className="dash-input dash-invite-link-input"
            aria-label="Your referral link"
          />
          <div className="dash-invite-actions">
            <button
              type="button"
              onClick={handleCopy}
              className={`dash-invite-action-btn${copiedBurst ? ' dash-invite-copy-btn--burst' : ''}`}
              title="Copy link"
              aria-label="Copy link"
            >
              <CopyIcon className="w-4 h-4" />
              {copiedBurst && <span className="dash-invite-copy-burst" aria-hidden>✓</span>}
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="dash-invite-action-btn"
              title="Share"
              aria-label="Share link"
            >
              <ShareIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="dash-invite-footer">
        <Link to="/account/affiliate" className="dash-invite-page-link no-underline">
          Full Refer &amp; Earn page →
        </Link>
      </div>

      <ReferralShareModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        referralLink={referralLink}
        shareOptions={shareOpts}
      />
    </section>
  );
}
