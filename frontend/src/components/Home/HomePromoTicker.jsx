const DEFAULT_TICKER_ITEMS = [
  { id: 'welcome', title: 'Welcome', desc: 'Play games and win big!' },
  { id: 'spinwheel', title: 'Spin the Wheel', desc: 'Unlock surprises, free credits & rewards' },
  { id: 'invite', title: 'Invite & Earn', desc: 'Refer friends and earn more' },
];

function sanitizeTickerDesc(text) {
  return text.replace(/\d+%\s*extra/gi, 'bonus').trim() || text;
}

/** Trim to maxLen without cutting a word in half. */
function truncateAtWord(text, maxLen) {
  const value = String(text || '').trim();
  if (value.length <= maxLen) return value;
  const cut = value.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s,.;:!-]+$/, '')}…`;
}

function isInviteEarnPromo(p) {
  const slug = String(p?.slug || '').toLowerCase();
  const title = String(p?.title || '').toLowerCase();
  return slug.includes('invite') || title.includes('invite') || title.includes('refer');
}

/** Short ticker line from store Refer & Earn Give/Get SC settings (or promo description). */
function buildInviteEarnTickerDesc(source) {
  if (source && typeof source === 'object') {
    const friend = Number(source.friendSignupBonusSc ?? source.friend_signup_bonus_sc);
    const referrer = Number(source.referrerRewardSc ?? source.referrer_reward_sc);
    if (Number.isFinite(friend) && Number.isFinite(referrer) && (friend > 0 || referrer > 0)) {
      return `Give ${friend} SC, Get ${referrer} SC`;
    }
  }
  const text = typeof source === 'string' ? source : source?.description || '';
  const match = String(text).match(/give\s+(\d+(?:\.\d+)?)\s*,\s*get\s+(\d+(?:\.\d+)?)/i);
  if (match) return `Give ${match[1]} SC, Get ${match[2]} SC`;
  return null;
}

export function HomePromoTicker({ promotions = [], affiliateSettings = null }) {
  const inviteFromSettings = buildInviteEarnTickerDesc(affiliateSettings);

  const tickerItems =
    promotions.length > 0
      ? promotions.map((p) => {
          const invite = isInviteEarnPromo(p);
          const desc = invite
            ? inviteFromSettings ||
              buildInviteEarnTickerDesc(p.description) ||
              sanitizeTickerDesc(p.description || '')
            : sanitizeTickerDesc(p.description || '');
          return { id: p.id, title: p.title, desc, maxLen: invite ? 56 : 35 };
        })
      : DEFAULT_TICKER_ITEMS.map((item) =>
          item.id === 'invite'
            ? {
                ...item,
                desc: inviteFromSettings || item.desc,
                maxLen: 56,
              }
            : { ...item, maxLen: 35 }
        );

  const tickerBlock = tickerItems.length >= 3 ? tickerItems : [...tickerItems, ...tickerItems, ...tickerItems];
  const tickerContent = [...tickerBlock, ...tickerBlock];

  return (
    <div className="dashboard-ticker py-1.5 overflow-hidden w-full">
      <div
        className="flex gap-9 whitespace-nowrap w-max"
        style={{ animation: 'dashboard-tick 25s linear infinite', willChange: 'transform' }}
      >
        {tickerContent.map((item, i) => (
          <div
            key={`ticker-${i}-${item.id}`}
            className="flex items-center gap-1.5 text-[0.68rem] text-[var(--dash-muted)] flex-shrink-0 px-1"
          >
            <span className="text-[var(--dash-gold)] font-extrabold">{item.title}</span>
            {item.desc && (
              <span className="text-[var(--dash-neon)] font-bold">
                · {truncateAtWord(item.desc, item.maxLen ?? 35)}
              </span>
            )}
            <span className="text-[var(--dash-muted)]"> · </span>
          </div>
        ))}
      </div>
    </div>
  );
}
