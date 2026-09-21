import { useEffect, useState } from 'react';
import { HelpTabPage } from '../HelpTabPage';
import * as affiliateApi from '../../../api/affiliate';

function buildClassicSteps(stats) {
  const friend = stats?.friend_signup_bonus_sc ?? 5;
  const pct = stats?.reward_percentage ?? 10;
  const maxN = stats?.max_rewarded_purchases ?? 3;
  return [
    'Invite your friends using your unique referral link.',
    `Your friend signs up with your link and gets ${friend} Sweepstakes Coins instantly.`,
    `You earn ${pct}% of each of their first ${maxN} deposits, credited when they deposit. You do not earn on later deposits.`
  ];
}

function resolveMinDeposit(stats) {
  const direct = Number(stats?.min_qualifying_deposit_usd ?? stats?.minQualifyingDepositUsd);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const blob = [
    ...(Array.isArray(stats?.how_it_works_steps) ? stats.how_it_works_steps : []),
    stats?.reward_description || ''
  ].join(' ');
  const m =
    blob.match(/at least \$(\d+(?:\.\d+)?)/i) || blob.match(/deposit \$(\d+(?:\.\d+)?)\+/i);
  if (m) return Number(m[1]);
  return 20;
}

function buildGiveGetSteps(stats) {
  const friend = stats?.friend_signup_bonus_sc ?? 15;
  const referrer = stats?.referrer_reward_sc ?? 15;
  const minDeposit = resolveMinDeposit(stats);
  const delayHours = stats?.payout_delay_hours ?? 24;
  const weeklyCap = stats?.weekly_cap_sc ?? 100;
  return [
    'Share your unique referral link with friends.',
    `Your friend signs up with your link, gets ${friend} Sweepstakes Coins instantly, then deposits at least $${minDeposit} and plays through it once.`,
    `You earn ${referrer} Sweepstakes Coins after they qualify. Your bonus arrives within ${delayHours} hours of their deposit clearing — up to ${weeklyCap} SC per week from referrals.`
  ];
}

export function ReferEarnHelp({ title }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let cancelled = false;
    affiliateApi
      .getAffiliateStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isGiveGet = stats?.program_mode === 'give_get';
  const steps =
    (Array.isArray(stats?.how_it_works_steps) && stats.how_it_works_steps.length > 0
      ? stats.how_it_works_steps
      : null) || (isGiveGet || stats == null ? buildGiveGetSteps(stats) : buildClassicSteps(stats));

  const friend = stats?.friend_signup_bonus_sc ?? 15;
  const referrer = stats?.referrer_reward_sc ?? 15;
  const delayHours = stats?.payout_delay_hours ?? 24;
  const intro =
    isGiveGet || stats == null
      ? `Refer & Earn lets you invite friends with Give ${friend}, Get ${referrer} — you both earn Sweepstakes Coins when they join and play.`
      : stats?.reward_description ||
        'Refer & Earn lets you invite friends and earn Sweepstakes Coins when they join and deposit.';

  return (
    <HelpTabPage
      title={title}
      note={
        isGiveGet || stats == null
          ? `Referral rewards are credited only when referral terms and qualification rules are met (deposit, play-through, and ${delayHours}-hour delay).`
          : 'Referral rewards are credited only when referral terms and qualification rules are met.'
      }
    >
      <p className="m-0 mb-3">{intro}</p>
      <ol className="list-decimal pl-5 m-0 space-y-2 text-sm text-gray-200">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className="mt-4 m-0 text-sm text-gray-200">
        Open <strong>Account &gt; Refer & Earn</strong> to copy your link, see referrals, pending rewards, and weekly cap progress.
        Rewards also appear under <strong>Transactions</strong> (filter: Refer & Earn).
      </p>
    </HelpTabPage>
  );
}

const CLASSIC_STEPS = buildClassicSteps();

export { CLASSIC_STEPS, buildClassicSteps };
