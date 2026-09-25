import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePageContentReady } from '../../context/PageReadyContext';
import { useVipStatus } from '../../context/VipStatusContext';
import { ReferralShareModal } from '../../components/ReferralShareModal';
import * as affiliateApi from '../../api/affiliate';
import * as vipApi from '../../api/vip';
import { formatSc } from '../../utils/currency';
import { buildReferralLink } from '../../utils/referralLink';
import { shareOptionsFromAffiliateStats } from '../../utils/socialShare';
import './Bonus.css';

function formatXp(n) {
  return (Number(n) || 0).toLocaleString();
}

function rewardTitle(entry) {
  const type = String(entry?.entry_type || '');
  if (type === 'level_up_reward') return 'Level up reward';
  if (type === 'xp_grant') return 'XP earned';
  return type.replace(/_/g, ' ') || 'Reward';
}

function rewardAmount(entry) {
  const amount = Number(entry?.amount) || 0;
  if (entry?.entry_type === 'xp_grant') return `+${formatXp(amount)} XP`;
  const code = entry?.currency_code || 'SC';
  return `+${formatSc(amount)} ${code}`;
}

/**
 * Bonus page matching the live rewards layout.
 * The live Dragon Levels carousel is intentionally omitted.
 */
export function Bonus() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { vipStatus } = useVipStatus();
  const [ready, setReady] = useState(false);
  const [affiliate, setAffiliate] = useState(null);
  const [history, setHistory] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);

  usePageContentReady(ready);

  useEffect(() => {
    let cancelled = false;
    const jobs = [affiliateApi.getAffiliateSettings()];
    if (isAuthenticated) {
      jobs.push(affiliateApi.getAffiliateStats(), vipApi.getVipHistory({ limit: 8 }));
    }
    Promise.allSettled(jobs).then((results) => {
      if (cancelled) return;
      const settings = results[0]?.status === 'fulfilled' ? results[0].value : null;
      const stats = results[1]?.status === 'fulfilled' ? results[1].value : null;
      const ledger = results[2]?.status === 'fulfilled' ? results[2].value : null;
      setAffiliate(stats ? { ...settings, ...stats } : settings);
      const entries = ledger?.entries ?? ledger?.history ?? [];
      setHistory(Array.isArray(entries) ? entries : []);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const levels = Array.isArray(vipStatus?.levels) ? vipStatus.levels : [];
  const currentIndex = Math.max(0, Number(vipStatus?.level_index) || 0);
  const current = levels[currentIndex] || null;
  const next = levels[currentIndex + 1] || null;
  const currentXp = Math.max(0, Number(vipStatus?.current_xp) || 0);
  const nextXp = Math.max(0, Number(vipStatus?.next_level_xp ?? current?.next_level_xp) || 0);
  const xpLeft = next ? Math.max(0, nextXp - currentXp) : 0;
  const rewardSc = Number(current?.level_up_reward_sc ?? next?.level_up_reward_sc) || 0;
  const tierName = vipStatus?.level_name || current?.name || 'Iron';

  const isGiveGet = affiliate?.program_mode !== 'classic';
  const friendBonus = Number(affiliate?.friend_signup_bonus_sc ?? affiliate?.friendSignupBonusSc) || 0;
  const referrerBonus = Number(affiliate?.referrer_reward_sc ?? affiliate?.referrerRewardSc) || 0;
  const rewardBadge = isGiveGet ? referrerBonus || friendBonus : friendBonus;
  const referralCode = affiliate?.referral_code || '';
  const referralLink = buildReferralLink(referralCode);
  const weeklyCap = affiliate?.weekly_cap_sc ?? null;
  const weeklyEarned = affiliate?.weekly_earned_sc ?? 0;
  const weeklyPct = weeklyCap > 0 ? Math.min(100, Math.round((weeklyEarned / weeklyCap) * 100)) : 0;
  const shareOptions = shareOptionsFromAffiliateStats(affiliate);

  const recent = useMemo(() => history.slice(0, 6), [history]);

  function copy(value, success) {
    if (!value) {
      toast.error('Referral details are not ready yet.');
      return;
    }
    navigator.clipboard.writeText(value).then(
      () => toast.success(success),
      () => toast.error('Could not copy.')
    );
  }

  return (
    <div className="df-bonus-page">
      <section className="df-bonus-panel" aria-label="Your bonus">
        <p className="df-bonus-label">Your bonus</p>
        <p className="df-bonus-value">
          {isAuthenticated ? formatSc(rewardSc) : '—'} <small>SC</small>
        </p>
        <p className="df-bonus-hint">Level-up reward at {tierName}.</p>
        <Link className="df-bonus-cta" to={isAuthenticated ? '/store' : '/register'}>
          Earn bonus
        </Link>
      </section>

      <section className="df-bonus-panel" aria-label="Next evolution">
        <p className="df-bonus-label">Next evolution</p>
        <p className="df-bonus-next-name">{next?.name || (vipStatus?.is_max_level ? 'Max tier' : '—')}</p>
        <p className="df-bonus-next-gap">
          {next ? `${formatXp(xpLeft)} XP to go` : vipStatus?.is_max_level ? 'Top tier reached' : 'Sign in to track progress'}
        </p>
        <p className="df-bonus-hint">
          {next
            ? `Unlocks a ${formatSc(next.level_up_reward_sc || 0)} SC level-up reward.`
            : 'Keep earning XP to move up a tier.'}
        </p>
      </section>

      <section className="df-bonus-panel" aria-label="Recent rewards">
        <p className="df-bonus-label">Recent rewards</p>
        {recent.length === 0 ? (
          <p className="df-bonus-hint">{isAuthenticated ? 'No rewards yet.' : 'Sign in to see your rewards.'}</p>
        ) : (
          <ul className="df-bonus-log">
            {recent.map((entry) => (
              <li key={entry.id || `${entry.entry_type}-${entry.created_at}`}>
                <strong>{rewardAmount(entry)}</strong>
                <span>{rewardTitle(entry)}</span>
                <time dateTime={entry.created_at || undefined}>
                  {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="df-bonus-invite" aria-label="Referral control panel">
        <p className="df-bonus-invite-kicker">Referral control panel</p>
        <div className="df-bonus-invite-hero">
          <img src="/df-online/referral-invite.webp" alt="" width={240} height={210} decoding="async" />
          <div>
            <small>REFER &amp; EARN</small>
            <h2>Invite Friends</h2>
            <p>Share your link or code.</p>
          </div>
          <span className="df-bonus-invite-reward">
            <img src="/df-online/sc-coin.webp" alt="" width={68} height={68} decoding="async" />
            <strong>{rewardBadge > 0 ? formatSc(rewardBadge).replace(/\.00$/, '') : '—'}</strong>
          </span>
        </div>

        {isAuthenticated ? (
          <div className="df-bonus-invite-actions">
            <button type="button" onClick={() => copy(referralCode, 'Referral code copied.')}>
              <small>YOUR CODE</small>
              <strong>{referralCode || '—'}</strong>
            </button>
            <button type="button" onClick={() => copy(referralLink, 'Link copied.')} disabled={!referralLink}>
              COPY LINK
            </button>
            <button type="button" onClick={() => setShareOpen(true)} disabled={!referralLink}>
              SHARE
            </button>
          </div>
        ) : (
          <div className="df-bonus-invite-actions">
            <Link className="df-bonus-cta" to="/register">Sign up to invite</Link>
          </div>
        )}

        <div className="df-bonus-invite-stats" aria-label="Referral totals">
          <span>
            <strong>
              {weeklyCap != null ? `${formatSc(weeklyEarned)} / ${formatSc(weeklyCap)} SC` : '—'}
            </strong>
            <small>Weekly cap</small>
          </span>
          <span>
            <strong>{affiliate?.total_referrals ?? 0}</strong>
            <small>Total referrals</small>
          </span>
          <span>
            <strong>{formatSc(affiliate?.total_earned_sc ?? 0)} SC</strong>
            <small>Total earned</small>
          </span>
          <span>
            <strong>{friendBonus > 0 ? `${formatSc(friendBonus)} SC` : '—'}</strong>
            <small>Friend bonus</small>
          </span>
        </div>
        {weeklyCap != null ? (
          <div className="df-bonus-invite-cap" aria-label={`${formatSc(weeklyEarned)} of ${formatSc(weeklyCap)} weekly referral SC used`}>
            <span style={{ width: `${weeklyPct}%` }} />
          </div>
        ) : null}
      </section>

      <ReferralShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        referralLink={referralLink}
        shareOptions={shareOptions}
      />
    </div>
  );
}
