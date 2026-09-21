/** Build referral share message from live affiliate program settings when provided. */
export function buildReferralShareMessage(siteName = 'Casino Slots', options = {}) {
  const programMode = options.programMode ?? (options.giveGet === false ? 'classic' : null);
  const isGiveGet =
    programMode === 'give_get' ||
    (programMode == null && options.giveGet !== false && (options.friendBonus != null || options.referrerBonus != null || options.giveGet === true));

  if (isGiveGet || options.giveGet === true) {
    const friend = Number(options.friendBonus ?? options.friendSignupBonusSc);
    const referrer = Number(options.referrerBonus ?? options.referrerRewardSc);
    const amount =
      Number.isFinite(friend) && friend > 0
        ? friend
        : Number.isFinite(referrer) && referrer > 0
          ? referrer
          : null;
    if (amount != null) {
      return `Hey! Join me on ${siteName} — we both get ${amount} SC free when you sign up and play. Here's my link:`;
    }
    return `Hey! Join me on ${siteName} — we both get free SC when you sign up and play. Here's my link:`;
  }

  const friendAmt = Number(options.friendBonus ?? options.friendSignupBonusSc);
  const pct = Number(options.rewardPct ?? options.rewardPercentage);
  const maxN = Number(options.maxPurchases ?? options.maxRewardedPurchases);
  const friendText = Number.isFinite(friendAmt) && friendAmt > 0 ? `${friendAmt} SC` : 'a signup bonus';
  const pctText = Number.isFinite(pct) && pct > 0 ? `${pct}%` : 'a percent';
  const nText = Number.isFinite(maxN) && maxN > 0 ? maxN : 'few';
  return `Join me on ${siteName}! Sign up with my link — you’ll get ${friendText}, and I earn ${pctText} of your first ${nText} deposits:`;
}

export function buildReferralSharePayload(referralLink, siteName, options = {}) {
  const message = buildReferralShareMessage(siteName, options);
  const text = `${message} ${referralLink}`;
  return { message, text, url: referralLink };
}

/** Primary share grid on the Refer & Earn page (matches design mock). */
export const REFERRAL_PAGE_SOCIAL_PLATFORMS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'sms', label: 'Text / SMS' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'instagram', label: 'Instagram' },
];

/** Compact list used on the home invite modal. */
export const REFERRAL_SOCIAL_PLATFORMS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'snapchat', label: 'Snapchat' },
  { id: 'facebook', label: 'Facebook' },
];

/** Full list for the affiliate share modal. */
export const REFERRAL_SHARE_PLATFORMS = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'twitter', label: 'Twitter' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'vkontakte', label: 'VKontakte' },
  { id: 'odnoklassniki', label: 'Odnoklassniki' },
  { id: 'reddit', label: 'Reddit' },
  { id: 'gmail', label: 'Gmail' },
  { id: 'pinterest', label: 'Pinterest' },
  { id: 'linkedin', label: 'LinkedIn' },
];

/** Opens a share URL in a new tab; falls back to same-tab navigation if popups are blocked. */
export function openShareUrl(url) {
  if (!url) return false;

  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.assign(url);
  }
  return true;
}

/**
 * Builds the platform-specific share URL, or null when the platform needs copy-first flow.
 */
export function getReferralShareTarget(platformId, referralLink, siteName = 'Casino Slots', options = {}) {
  if (!referralLink?.trim()) {
    return { ok: false, reason: 'no_link' };
  }

  const { message, text, url } = buildReferralSharePayload(referralLink.trim(), siteName, options);
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  const encodedMessage = encodeURIComponent(message);
  const subject = encodeURIComponent(`Join ${siteName}`);

  switch (platformId) {
    case 'whatsapp':
      return { ok: true, shareUrl: `https://api.whatsapp.com/send?text=${encodedText}` };
    case 'facebook':
      // Facebook no longer prefills post text (quote param deprecated). Copy the
      // full message + referral link, then open the share dialog with the URL.
      return {
        ok: true,
        action: 'copy_and_open',
        platformId: 'facebook',
        url,
        text,
        message,
        shareUrl: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      };
    case 'twitter':
      return { ok: true, shareUrl: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedMessage}` };
    case 'telegram':
      return { ok: true, shareUrl: `https://t.me/share/url?url=${encodedUrl}&text=${encodedMessage}` };
    case 'vkontakte':
      return { ok: true, shareUrl: `https://vk.com/share.php?url=${encodedUrl}&title=${encodedMessage}&comment=${encodedMessage}` };
    case 'odnoklassniki':
      return { ok: true, shareUrl: `https://connect.ok.ru/offer?url=${encodedUrl}&title=${encodedMessage}&description=${encodedMessage}` };
    case 'reddit':
      return { ok: true, shareUrl: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedMessage}` };
    case 'gmail':
      return {
        ok: true,
        shareUrl: `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${encodedText}`,
        mailtoUrl: `mailto:?subject=${subject}&body=${encodedText}`,
      };
    case 'pinterest':
      return { ok: true, shareUrl: `https://www.pinterest.com/pin/create/link/?url=${encodedUrl}&description=${encodedMessage}` };
    case 'linkedin':
      return { ok: true, shareUrl: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` };
    case 'snapchat':
      return { ok: true, shareUrl: `https://www.snapchat.com/share?link=${encodedUrl}` };
    case 'sms':
      return { ok: true, shareUrl: `sms:?body=${encodedText}` };
    case 'messenger':
      return { ok: true, action: 'copy', platformId, url, text, deepLink: `fb-messenger://share?link=${encodedUrl}` };
    case 'instagram':
    case 'tiktok':
      return { ok: true, action: 'copy', platformId, url, text };
    default:
      return { ok: false, reason: 'unknown_platform' };
  }
}

/**
 * Opens the platform share flow in a new tab/window (or app via universal link).
 */
export function openReferralSocialShare(platformId, referralLink, siteName = 'Casino Slots', options = {}) {
  const target = getReferralShareTarget(platformId, referralLink, siteName, options);
  if (!target.ok) return target;

  if (target.action === 'copy' || target.action === 'copy_and_open') {
    return target;
  }

  const opened = openShareUrl(target.shareUrl);
  if (!opened && target.mailtoUrl) {
    openShareUrl(target.mailtoUrl);
  }

  return { ok: true, action: 'open', platformId };
}

/**
 * Opens a platform share URL, then copies the full referral message (with link).
 * Used when the platform (e.g. Facebook) cannot prefill post text.
 * Opens first so the popup stays tied to the user click.
 */
export async function openReferralShareThenCopy(target) {
  if (!target?.text) return { ok: false, reason: 'no_text' };
  if (target.shareUrl) openShareUrl(target.shareUrl);
  try {
    await navigator.clipboard.writeText(target.text);
  } catch {
    return { ok: false, reason: 'copy_failed', opened: Boolean(target.shareUrl) };
  }
  return { ok: true, action: 'copy_and_open', platformId: target.platformId };
}

/** Options helper from affiliate stats payload. */
export function shareOptionsFromAffiliateStats(data) {
  const programMode = data?.program_mode === 'classic' ? 'classic' : 'give_get';
  return {
    programMode,
    giveGet: programMode === 'give_get',
    friendBonus: data?.friend_signup_bonus_sc ?? (programMode === 'classic' ? 5 : 15),
    referrerBonus: data?.referrer_reward_sc ?? 15,
    rewardPct: data?.reward_percentage ?? 10,
    maxPurchases: data?.max_rewarded_purchases ?? 3
  };
}
