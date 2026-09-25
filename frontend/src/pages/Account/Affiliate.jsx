import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import * as affiliateApi from '../../api/affiliate';
import { usePageContentReady } from '../../context/PageReadyContext';
import { ShareIcon } from '../../assets/icons';
import { ReferralShareModal } from '../../components/ReferralShareModal';
import { formatSc } from '../../utils/currency';
import { buildReferralLink } from '../../utils/referralLink';
import { site } from '../../config/site';
import {
  REFERRAL_PAGE_SOCIAL_PLATFORMS,
  buildReferralSharePayload,
  getReferralShareTarget,
  openShareUrl,
  shareOptionsFromAffiliateStats,
} from '../../utils/socialShare';
import './AffiliateReferPage.css';
import './df-refer.css';

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  return (
    date.toLocaleDateString(undefined, { dateStyle: 'short' }) +
    ' ' +
    date.toLocaleTimeString(undefined, { timeStyle: 'short' })
  );
}

function statusLabel(status) {
  switch (status) {
    case 'awaiting_playthrough':
      return 'Awaiting play';
    case 'scheduled':
      return 'Scheduled';
    case 'paid':
      return 'Paid';
    case 'capped':
      return 'Weekly cap';
    case 'signed_up':
      return 'Signed up';
    case 'earning':
      return 'Earning';
    case 'complete':
      return 'Complete';
    default:
      return status || '—';
  }
}

function ShareOutlineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function GamepadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 12h4M8 10v4M15 13h.01M18 11h.01M6.5 6h11A3.5 3.5 0 0 1 21 9.5v5a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 3 14.5v-5A3.5 3.5 0 0 1 6.5 6z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CoinsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="12" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14.5 7.2a6 6 0 1 1 0 9.6" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 19c.8-3 3-4.8 5.5-4.8S13.7 16 14.5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 14.5c2 .3 3.6 1.6 4.3 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function MessengerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17V22l3.45-1.89c.99.27 2.04.42 3.41.42 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm1.01 12.95l-2.54-2.7-4.96 2.7 5.46-5.79 2.6 2.7 4.9-2.7-5.46 5.79z" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

function SmsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h2v2H7V9zm4 0h2v2h-2V9zm4 0h2v2h-2V9z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

const SOCIAL_ICONS = {
  whatsapp: WhatsAppIcon,
  messenger: MessengerIcon,
  telegram: TelegramIcon,
  sms: SmsIcon,
  facebook: FacebookIcon,
  instagram: InstagramIcon,
};

export function AccountAffiliate() {
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState('');

  usePageContentReady(!(loading && !data));

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await affiliateApi.getAffiliateStats();
      setData(res);
    } catch (err) {
      toast.error(err.message || 'Failed to load referral data.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const referralLink = buildReferralLink(data?.referral_code);
  const siteName = site?.platformName || 'Dragon Fury';
  const isGiveGet = data?.program_mode !== 'classic';
  const shareOpts = shareOptionsFromAffiliateStats(data);
  const friendBonus = data?.friend_signup_bonus_sc ?? data?.friendSignupBonusSc ?? (isGiveGet ? 15 : 5);
  const referrerBonus = data?.referrer_reward_sc ?? data?.referrerRewardSc ?? 15;
  const rewardPct = Number(data?.reward_percentage ?? data?.rewardPercentage);
  const commissionPct = Number.isFinite(rewardPct) && rewardPct > 0 ? rewardPct : 10;
  const maxDepositsRaw = Number(data?.max_rewarded_purchases ?? data?.maxRewardedPurchases);
  const maxDeposits = Number.isFinite(maxDepositsRaw) && maxDepositsRaw > 0 ? maxDepositsRaw : 3;
  const minDeposit = (() => {
    const direct = Number(data?.min_qualifying_deposit_usd ?? data?.minQualifyingDepositUsd);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const blob = [
      ...(Array.isArray(data?.how_it_works_steps) ? data.how_it_works_steps : []),
      data?.reward_description || ''
    ].join(' ');
    const m =
      blob.match(/at least \$(\d+(?:\.\d+)?)/i) || blob.match(/deposit \$(\d+(?:\.\d+)?)\+/i);
    if (m) return Number(m[1]);
    return 20;
  })();
  const payoutMinutes = data?.payout_delay_minutes ?? (data?.payout_delay_hours != null ? data.payout_delay_hours * 60 : 24 * 60);
  const payoutDelayLabel =
    payoutMinutes < 60
      ? `${payoutMinutes} minute${payoutMinutes === 1 ? '' : 's'}`
      : `${Math.round((payoutMinutes / 60) * 10) / 10} hour${payoutMinutes === 60 ? '' : 's'}`;
  const weeklyCap = data?.weekly_cap_sc ?? 100;
  const weeklyEarned = data?.weekly_earned_sc ?? 0;
  const weeklyPct = weeklyCap > 0 ? Math.min(100, Math.round((weeklyEarned / weeklyCap) * 100)) : 0;
  const totalReferrals = data?.total_referrals ?? 0;
  const totalEarnedSc = data?.total_earned_sc ?? 0;
  const currency = data?.currency || 'SC';
  const referredUsers = data?.referred_users || [];
  const earnings = data?.earnings || [];
  const pendingRewards = data?.pending_rewards || [];

  function showCopied(msg) {
    setCopiedToast(msg);
    window.setTimeout(() => setCopiedToast(''), 2500);
  }

  function copyCode() {
    const code = data?.referral_code;
    if (!code) {
      toast.error('Referral code is not ready yet.');
      return;
    }
    navigator.clipboard.writeText(code).then(
      () => {
        showCopied('Code copied!');
        toast.success('Referral code copied.');
      },
      () => toast.error('Could not copy.')
    );
  }

  function copyLink() {
    if (!referralLink) {
      toast.error('Referral link is not ready yet.');
      return;
    }
    navigator.clipboard.writeText(referralLink).then(
      () => {
        showCopied('Link copied!');
        toast.success('Referral link copied.');
      },
      () => toast.error('Could not copy.')
    );
  }

  async function handleSocialShare(platformId) {
    if (!referralLink) {
      toast.error('Referral link is not ready yet.');
      return;
    }

    const target = getReferralShareTarget(platformId, referralLink, siteName, shareOpts);
    if (!target.ok) {
      toast.error('Referral link is not ready yet.');
      return;
    }

    const label = REFERRAL_PAGE_SOCIAL_PLATFORMS.find((p) => p.id === platformId)?.label || 'app';

    if (target.action === 'copy' || target.action === 'copy_and_open') {
      const { text } = buildReferralSharePayload(referralLink, siteName, shareOpts);
      // Open first (user gesture) — Facebook cannot prefill text, so we copy for paste.
      if (platformId === 'facebook' && target.shareUrl) {
        openShareUrl(target.shareUrl);
      }
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        toast.error('Could not copy.');
        return;
      }
      if (platformId === 'messenger') {
        showCopied('Message copied — opening Messenger…');
        if (target.deepLink) window.location.href = target.deepLink;
        else toast.success('Message copied — paste in Messenger.');
        return;
      }
      if (platformId === 'instagram') {
        showCopied('Message copied — paste in Instagram DM or Story!');
        window.open('https://www.instagram.com/direct/inbox/', '_blank', 'noopener,noreferrer');
        return;
      }
      if (platformId === 'facebook') {
        showCopied('Message copied — paste it on Facebook!');
        return;
      }
      toast.success(`Message copied for ${label}.`);
      return;
    }

    if (platformId === 'sms') {
      window.location.href = target.shareUrl;
      return;
    }

    openShareUrl(target.shareUrl);
    toast.success(`Opening ${label}…`);
  }

  function handleMoreShare() {
    if (!referralLink) {
      toast.error('Referral link is not ready yet.');
      return;
    }
    setShareModalOpen(true);
  }

  if (loading && !data) {
    return (
      <div className="dash-page w-full min-w-0">
        <div className="rae-page">
          <div className="rae-loading">Loading referral rewards…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-page w-full min-w-0">
      <div className="rae-page df-refer-page">
        <p className="df-refer-kicker">Referral Control Panel</p>

        <section className="df-refer-hero" aria-labelledby="df-refer-title">
          <img src="/df-online/referral-invite.webp" alt="" width={240} height={210} decoding="async" />
          <div>
            <small>Refer &amp; Earn</small>
            <h1 id="df-refer-title">Invite Friends</h1>
            <p>
              {isGiveGet
                ? 'Share your link or code.'
                : `Your friend gets ${friendBonus} SC on signup. You earn ${commissionPct}% of their first ${maxDeposits} deposits.`}
            </p>
          </div>
          <span className="df-refer-reward">
            <img src="/df-online/sc-coin.webp" alt="" width={68} height={68} decoding="async" />
            <strong>{isGiveGet ? referrerBonus : `${commissionPct}%`}</strong>
          </span>
        </section>

        <div className="df-refer-invite">
          <button type="button" onClick={copyCode}>
            <small>Your code</small>
            <strong>{data?.referral_code || '—'}</strong>
          </button>
          <button type="button" onClick={copyLink}>Copy link</button>
          <button type="button" onClick={handleMoreShare}>Share</button>
        </div>
        <div className="df-refer-copied" aria-live="polite">{copiedToast}</div>

        <div className="df-refer-stats" aria-label="Referral totals">
          <span>
            <strong>{formatSc(weeklyEarned)} / {formatSc(weeklyCap)} {currency}</strong>
            <small>Weekly cap</small>
          </span>
          <span>
            <strong>{totalReferrals}</strong>
            <small>Total referrals</small>
          </span>
          <span>
            <strong>{pendingRewards.length}</strong>
            <small>Pending rewards</small>
          </span>
          <span>
            <strong>{formatSc(totalEarnedSc)} {currency}</strong>
            <small>Total earned</small>
          </span>
        </div>
        <div className="df-refer-cap" aria-label={`${formatSc(weeklyEarned)} of ${formatSc(weeklyCap)} weekly referral ${currency} used`}>
          <span style={{ width: `${weeklyPct}%` }} />
        </div>

        <div className="rae-section">
          <h2>Share With Friends</h2>
          <p className="rae-sub">Tap where you want to send it</p>
          <div className="rae-social-grid" role="group" aria-label="Share referral link">
            {REFERRAL_PAGE_SOCIAL_PLATFORMS.map((platform) => {
              const Icon = SOCIAL_ICONS[platform.id];
              return (
                <button
                  key={platform.id}
                  type="button"
                  className={`rae-social-btn rae-s-${platform.id}`}
                  onClick={() => handleSocialShare(platform.id)}
                  aria-label={`Share on ${platform.label}`}
                >
                  <span className="rae-s-icon">{Icon ? <Icon /> : null}</span>
                  <span className="rae-s-name">{platform.label}</span>
                </button>
              );
            })}
          </div>
          <button type="button" className="rae-more-share-btn" onClick={handleMoreShare}>
            <ShareIcon />
            More Sharing Options
          </button>
        </div>

        <div className="rae-section">
          <h2 className="rae-how-title">How it works</h2>
          <p className="rae-sub">Three easy steps</p>
          <div className="rae-flow">
            <div className="rae-step">
              <div className="rae-step-icon">
                <ShareOutlineIcon />
              </div>
              <div className="rae-step-txt">
                <b>1. Share your link</b>
                <span>Pick an app above and send it to a friend.</span>
              </div>
            </div>
            <div className="rae-step">
              <div className="rae-step-icon">
                <GamepadIcon />
              </div>
              <div className="rae-step-txt">
                <b>{isGiveGet ? '2. Friend joins & plays' : '2. Friend signs up'}</b>
                <span>
                  {isGiveGet
                    ? `They sign up with your link, deposit at least $${minDeposit}, and play through it once.`
                    : `They sign up with your link and get ${friendBonus} SC instantly. You earn nothing until they deposit.`}
                </span>
              </div>
            </div>
            <div className="rae-step">
              <div className="rae-step-icon">
                <CoinsIcon />
              </div>
              <div className="rae-step-txt">
                <b>
                  {isGiveGet
                    ? `3. You both get ${friendBonus} SC!`
                    : `3. You earn ${commissionPct}% when they deposit`}
                </b>
                <span>
                  {isGiveGet
                    ? `Friend gets ${friendBonus} SC instantly; yours arrives within ${payoutDelayLabel}.`
                    : `You get ${commissionPct}% of each of their first ${maxDeposits} deposits, credited when the deposit completes.`}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="rae-note">
          <div className="rae-note-ic">
            <ClockIcon />
          </div>
          <p>
            {isGiveGet ? (
              <>
                <b>Bonus arrives within {payoutDelayLabel}</b> of your friend&apos;s qualifying
                deposit, so every reward is safe and real. Earn up to <b>{weeklyCap} SC per week</b>{' '}
                from referrals — refer as many friends as you like.
              </>
            ) : (
              <>
                <b>You only earn when your friend deposits.</b> Friend gets {friendBonus} SC on
                signup. You get {commissionPct}% of each of their first {maxDeposits} deposits —
                credited as soon as the deposit completes.
              </>
            )}
          </p>
        </div>

        <div className="rae-stat-row" aria-label="Referral statistics">
          <div className="rae-stat">
            <div className="rae-stat-num">{totalReferrals}</div>
            <div className="rae-stat-lbl">Friends Referred</div>
          </div>
          <div className="rae-stat">
            <div className="rae-stat-num">
              {formatSc(totalEarnedSc)} {currency}
            </div>
            <div className="rae-stat-lbl">Total Earned</div>
          </div>
        </div>

        {totalReferrals === 0 ? (
          <div className="rae-empty-card">
            <div className="rae-empty-ic">
              <UsersIcon />
            </div>
            <b>Your first referral is one tap away!</b>
            <span>
              {isGiveGet
                ? `Send your link now — you’ll both see ${friendBonus} SC within ${payoutDelayLabel} after they qualify.`
                : `Send your link now — your friend gets ${friendBonus} SC on signup, and you earn ${commissionPct}% of their first ${maxDeposits} deposits.`}
            </span>
          </div>
        ) : (
          <div className="rae-panel">
            <h3>My Referrals</h3>
            <div className="rae-table-wrap">
              <table className="rae-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Joined</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {referredUsers.map((u) => (
                    <tr key={u.user_id}>
                      <td>{u.username || '—'}</td>
                      <td className="rae-td-muted">{formatDate(u.joined_at)}</td>
                      <td className="rae-td-muted">{statusLabel(u.qualification_status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isGiveGet && (
        <div className="rae-ladder" aria-label="Weekly referral cap">
          <div className="rae-ladder-top">
            <b>Weekly referral cap</b>
            <span>
              {formatSc(weeklyEarned)} / {formatSc(weeklyCap)} {currency}
            </span>
          </div>
          <div className="rae-bar">
            <div className="rae-bar-fill" style={{ width: `${weeklyPct}%` }} />
          </div>
          <div className="rae-ladder-labels">
            <span>0</span>
            <span>Up to {weeklyCap} SC / week</span>
          </div>
        </div>
        )}

        {pendingRewards.length > 0 && (
          <div className="rae-panel">
            <h3>Pending rewards</h3>
            <div className="rae-table-wrap">
              <table className="rae-table">
                <thead>
                  <tr>
                    <th>Friend</th>
                    <th>Status</th>
                    <th className="text-right">{currency}</th>
                    <th>Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRewards.map((e, i) => (
                    <tr key={`pending-${i}`}>
                      <td>{e.username || '—'}</td>
                      <td className="rae-td-muted">{statusLabel(e.status)}</td>
                      <td className="rae-td-amount">+{formatSc(e.amount)}</td>
                      <td className="rae-td-muted">{formatDate(e.payout_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="rae-panel">
          <h3>Referral earnings</h3>
          <p className="rae-panel-desc">
            Credited after friends qualify. For play only — withdraw winnings from play. Also in{' '}
            <Link to="/account/transactions">Transactions</Link> (Refer &amp; Earn).
          </p>
          {earnings.length === 0 ? (
            <p className="rae-panel-desc" style={{ marginBottom: 0 }}>
              No referral earnings yet.
            </p>
          ) : (
            <div className="rae-table-wrap">
              <table className="rae-table">
                <thead>
                  <tr>
                    <th>Friend</th>
                    <th className="text-right">{currency}</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {earnings.map((e, i) => (
                    <tr key={`earn-${i}`}>
                      <td>{e.username || '—'}</td>
                      <td className="rae-td-amount">+{formatSc(e.amount)}</td>
                      <td className="rae-td-muted">{formatDate(e.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ReferralShareModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          referralLink={referralLink}
          shareOptions={shareOpts}
        />
      </div>
    </div>
  );
}
