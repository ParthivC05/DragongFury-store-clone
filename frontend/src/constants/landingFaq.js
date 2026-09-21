/**
 * Shared landing FAQ — kept in sync with visible FAQ UI and FAQPage schema.
 */
import { site } from '../config/site';

export const LANDING_FAQ = [
  {
    q: `Is ${site.platformName} really free to play?`,
    a: `Yes. ${site.platformName} is free to join. No purchase is required to play. Sign up, pick your game, and follow the rules shown in your account for each offer.`,
  },
  {
    q: 'How do I withdraw my winnings?',
    a: 'Approved withdrawals go to the method on file — Cash App, bank transfer, cards, crypto where supported, and more. Timing depends on verification and processor windows.',
  },
  {
    q: 'What games are available?',
    a: 'Fish games, casino games, and sweepstakes-style titles from multiple providers — plus the Instant Casino: 140+ slots, fishing, live tables, crash, keno and more that play right in your browser. New games are added regularly.',
  },
  {
    q: 'How does the daily spin wheel work?',
    a: 'Registered players can use the in-app spin wheel on the schedule shown in your account. Rewards and rules are displayed before you spin.',
  },
  {
    q: 'Is my personal information safe?',
    a: 'We use industry-standard encryption for sensitive data. Review our Privacy Policy for details on how information is handled.',
  },
];

/**
 * Dedicated /faq page — must stay in sync with visible copy (SEO audit FAQPage).
 */
export const SEO_FAQ = [
  {
    q: 'Is Juwa free to play?',
    a: 'Yes, Juwa can be played using free Sweepstakes Coins with no purchase necessary. Additional coin packages are also available.',
  },
  {
    q: "What's the difference between Gold Coins and Sweepstakes Coins?",
    a: 'Gold Coins are for entertainment only and have no redemption value. Sweepstakes Coins may be redeemable for prizes, subject to the Official Rules.',
  },
  {
    q: 'How do I get free Sweepstakes Coins?',
    a: 'New players get a free welcome bundle, with more available through daily rewards, promotions, or the Alternate Method of Entry (AMOE). No purchase is required.',
  },
  {
    q: 'Is Juwa legal to play?',
    a: 'Juwa operates as a sweepstakes-based platform intended to comply with applicable laws in eligible states. Availability varies by location, so players should confirm eligibility before playing.',
  },
  {
    q: 'How does redemption work?',
    a: "Eligible Sweepstakes Coin balances may be submitted for redemption, subject to verification and the platform's Official Rules. Redemption isn't guaranteed.",
  },
  {
    q: 'Is there a minimum age to play?',
    a: 'Yes, players must meet the age requirement in the Terms & Conditions (typically 18+, or 21+ in some states). ID verification may be required before redemption.',
  },
  {
    q: 'Does buying more coins improve my chances?',
    a: "No. Purchases don't affect outcomes. All games use randomized results, and no specific win or payout can be predicted or promised.",
  },
  {
    q: 'How long does redemption take?',
    a: 'Processing times vary based on verification needs and request volume. Players are notified of any required documentation.',
  },
  {
    q: 'Can I play without downloading an app?',
    a: 'Yes, Juwa is accessible through a mobile or desktop browser, subject to device compatibility.',
  },
  {
    q: 'How do I contact support?',
    a: 'Reach the support team via live chat, email, or the in-app help center. Use official channels only, and never share your login details.',
  },
];

/** Platform-page FAQ for AEO (real product claims only; no fabricated ratings). */
export function buildPlatformFaq(gameName) {
  const name = String(gameName || 'this game').trim() || 'this game';
  const brand = site.platformName;
  return [
    {
      q: `How do I play ${name} online at ${brand}?`,
      a: `Sign up, load your account, and launch ${name} directly from the ${brand} platform — no download required.`,
    },
    {
      q: `Is ${name} free to play?`,
      a: `Yes. ${brand} uses the sweepstakes model with free Gold Coin play and optional Sweeps Coin redemption.`,
    },
    {
      q: `Can I play ${name} on mobile?`,
      a: `Yes. ${name} is available on the web and works on modern mobile browsers (iOS and Android).`,
    },
  ];
}
