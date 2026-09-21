'use strict';

/**
 * User-facing Refer & Earn copy — Give/Get or commission, from store settings.
 */
function coinLabel(currency) {
  const c = (currency && String(currency).trim()) || 'SC';
  if (c.toUpperCase() === 'SC') return 'Sweepstakes Coins';
  return c;
}

function payoutDelayLabel(payoutDelayHours, payoutDelayMinutes) {
  const minutes =
    payoutDelayMinutes != null && Number.isFinite(Number(payoutDelayMinutes))
      ? Number(payoutDelayMinutes)
      : Math.round((Number(payoutDelayHours) || 0) * 60);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const hours = minutes / 60;
  const whole = Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10;
  return `${whole} hour${whole === 1 ? '' : 's'}`;
}

function isClassicProgram(settings) {
  const mode = String(settings?.programMode || settings?.program_mode || '').toLowerCase();
  return mode === 'classic' || mode === 'commission' || settings?.isClassic === true;
}

function buildGiveGetRewardDescription(settings, currency = 'SC') {
  const label = coinLabel(currency);
  const friend = Number(settings.friendSignupBonusSc) || 0;
  const referrer = Number(settings.referrerRewardSc) || 0;
  const minDeposit = Number(settings.minQualifyingDepositUsd) || 0;
  const weeklyCap = Number(settings.weeklyCapSc) || 0;
  const delay = payoutDelayLabel(settings.payoutDelayHours, settings.payoutDelayMinutes);
  return `Give ${friend}, Get ${referrer} — friends get ${friend} ${label} on signup; you earn ${referrer} ${label} after they deposit $${minDeposit}+ and play once (pays out within ${delay}). Cap ${weeklyCap} ${label}/week.`;
}

function buildGiveGetHowItWorksSteps(settings, currency = 'SC') {
  const label = coinLabel(currency);
  const friend = Number(settings.friendSignupBonusSc) || 0;
  const referrer = Number(settings.referrerRewardSc) || 0;
  const minDeposit = Number(settings.minQualifyingDepositUsd) || 0;
  const weeklyCap = Number(settings.weeklyCapSc) || 0;
  const delay = payoutDelayLabel(settings.payoutDelayHours, settings.payoutDelayMinutes);
  return [
    'Share your unique referral link with friends.',
    `Your friend signs up with your link, gets ${friend} ${label} instantly, then deposits at least $${minDeposit} and plays through it once.`,
    `You earn ${referrer} ${label} after they qualify. Your bonus arrives within ${delay} of their deposit clearing — up to ${weeklyCap} ${label} per week from referrals.`
  ];
}

function buildClassicRewardDescription(settings, currency = 'SC') {
  const label = coinLabel(currency);
  const friend = Number(settings.friendSignupBonusSc) || 0;
  const pct = Number(settings.rewardPercentage) || 0;
  const maxN = Math.round(Number(settings.maxRewardsPerReferral) || 0);
  const friendPart =
    friend > 0 ? `Friends get ${friend} ${label} when they sign up. ` : '';
  return `${friendPart}You earn ${pct}% of each of their first ${maxN} deposit${maxN === 1 ? '' : 's'} — credited to you when they deposit.`;
}

function buildClassicHowItWorksSteps(settings, currency = 'SC') {
  const label = coinLabel(currency);
  const friend = Number(settings.friendSignupBonusSc) || 0;
  const pct = Number(settings.rewardPercentage) || 0;
  const maxN = Math.round(Number(settings.maxRewardsPerReferral) || 0);
  return [
    'Share your unique referral link with friends.',
    friend > 0
      ? `Your friend signs up with your link and gets ${friend} ${label} instantly.`
      : 'Your friend signs up with your link.',
    `You earn ${pct}% ${label} of each of their first ${maxN} deposit${maxN === 1 ? '' : 's'}, credited when the deposit completes. You do not earn on later deposits.`
  ];
}

function buildAffiliateRewardDescription(settings, currency = 'SC') {
  const s = settings || {};
  if (isClassicProgram(s)) return buildClassicRewardDescription(s, currency);
  return buildGiveGetRewardDescription(s, currency);
}

function buildAffiliateHowItWorksSteps(settings, currency = 'SC') {
  const s = settings || {};
  if (isClassicProgram(s)) return buildClassicHowItWorksSteps(s, currency);
  return buildGiveGetHowItWorksSteps(s, currency);
}

module.exports = {
  coinLabel,
  buildAffiliateRewardDescription,
  buildAffiliateHowItWorksSteps,
  buildGiveGetRewardDescription,
  buildGiveGetHowItWorksSteps,
  buildClassicRewardDescription,
  buildClassicHowItWorksSteps
};
