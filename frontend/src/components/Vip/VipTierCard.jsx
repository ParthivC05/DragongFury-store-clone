import { motion } from 'framer-motion';
import { SCCoinIcon } from '../../assets/icons';
import { getVipTierStyle, getVipTierImage } from '../../utils/vipTierColors';

const PERK_ICONS = {
  levelUp: '🎁',
  withdrawal: '💵',
  platformWithdrawal: '🪙',
};

function formatXp(n) {
  return (Number(n) || 0).toLocaleString();
}

function VipTierBadge({ tierName }) {
  return (
    <div className="dash-vip-tier-badge-wrap">
      <img
        src={getVipTierImage(tierName)}
        alt=""
        className="dash-vip-tier-badge-img"
        loading="lazy"
        decoding="async"
      />
      <span className="sr-only">{tierName} tier badge</span>
    </div>
  );
}

function VipTierPerkRow({ icon, label, value }) {
  return (
    <li className="dash-vip-tier-perk">
      <span className="dash-vip-tier-perk-icon" aria-hidden>{icon}</span>
      <span className="dash-vip-tier-perk-label">{label}</span>
      <span className="dash-vip-tier-perk-value">
        {value}
        <SCCoinIcon className="dash-vip-tier-perk-sc" aria-hidden />
      </span>
    </li>
  );
}

export function VipTierCard({ level, isCurrent, index }) {
  const tierName = level.name || 'Iron';
  const tierStyle = getVipTierStyle(tierName, level.color);
  const currentXp = Number(level.current_xp) || 0;
  const nextXp = Math.max(0, Number(level.next_level_xp ?? level.xp_to_next_level) || 0);
  const isMaxTier = Boolean(level.is_max_level);
  const lastTierFilled = isMaxTier && nextXp > 0 && currentXp >= nextXp;
  const displayXp = level.is_unlocked === false ? 0 : currentXp;
  const progressPct = lastTierFilled ? 100 : nextXp > 0 ? Math.min(100, (100 * displayXp) / nextXp) : 0;
  const isDone = level.is_unlocked !== false && !isCurrent && progressPct >= 100;

  const perks = [
    { key: 'levelUp', icon: PERK_ICONS.levelUp, label: 'Level Up Reward', value: Number(level.level_up_reward_sc) || 0 },
    { key: 'withdrawal', icon: PERK_ICONS.withdrawal, label: 'Withdrawal Limit', value: formatXp(level.withdrawal_limit) },
    { key: 'platformWithdrawal', icon: PERK_ICONS.platformWithdrawal, label: 'Platform Games Withdrawal Limit', value: formatXp(level.platform_withdrawal_limit) },
  ];

  return (
    <motion.article
      className={`dash-vip-tier-card${isCurrent ? ' dash-vip-tier-card--current' : ''}${isDone ? ' dash-vip-tier-card--done' : ''}`}
      style={{
        '--vip-tier-color': tierStyle.color,
        '--vip-tier-glow': tierStyle.colorLight,
        '--vip-tier-border-glow': tierStyle.glow || tierStyle.colorLight,
      }}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 260 }}
      whileHover={{ y: -4 }}
    >
      {isCurrent && <span className="dash-vip-tier-active-tag">Active</span>}

      <VipTierBadge tierName={tierName} />

      <h3 className="dash-vip-tier-name">{tierName}</h3>

      <div className="dash-vip-tier-progress-wrap">
        <div className="dash-vip-tier-progress" aria-hidden>
          <motion.div
            className="dash-vip-tier-progress-fill"
            style={{ backgroundColor: tierStyle.color }}
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.9, delay: 0.12 + index * 0.05 }}
          />
        </div>
        <div className="dash-vip-tier-progress-meta">
          <span className="dash-vip-tier-progress-current">
            {formatXp(displayXp)}/{formatXp(nextXp)}
          </span>
          {!isMaxTier && nextXp > 0 && (
            <span className="dash-vip-tier-progress-next">
              Next Level: {formatXp(nextXp)}+
            </span>
          )}
          {isMaxTier && (
            <span className="dash-vip-tier-progress-next">Max Tier</span>
          )}
        </div>
      </div>

      <ul className="dash-vip-tier-perks">
        {perks.map((perk) => (
          <VipTierPerkRow key={perk.key} icon={perk.icon} label={perk.label} value={perk.value} />
        ))}
      </ul>
    </motion.article>
  );
}
