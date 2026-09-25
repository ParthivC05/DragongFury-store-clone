import { useEffect, useMemo, useRef, useState } from 'react';
import { getVipTierImage } from '../../utils/vipTierColors';
import './df-vip.css';

function formatXp(n) {
  return (Number(n) || 0).toLocaleString();
}

const EMPTY_LEVELS = [];

/** Player Tiers carousel and criteria, matching the live profile layout. */
export function ProfilePlayerTiers({ levels }) {
  const list = Array.isArray(levels) ? levels : EMPTY_LEVELS;
  const trackRef = useRef(null);
  const currentIdx = useMemo(() => {
    const i = list.findIndex((l) => l.is_current);
    return i >= 0 ? i : 0;
  }, [levels, list]);
  const [selectedIdx, setSelectedIdx] = useState(currentIdx);

  useEffect(() => {
    setSelectedIdx(currentIdx);
  }, [currentIdx]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const btn = track.children[selectedIdx];
    if (btn?.scrollIntoView) {
      btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selectedIdx]);

  const selected = list[selectedIdx] ?? list[0];
  const tierName = selected?.name || 'Iron';
  const currentXp = Number(selected?.current_xp) || 0;
  const nextXp = Math.max(0, Number(selected?.next_level_xp ?? selected?.xp_to_next_level) || 0);
  const isCurrent = Boolean(selected?.is_current);
  const isUnlocked = selected?.is_unlocked !== false;
  const isMax = Boolean(selected?.is_max_level);
  const lastFilled = isMax && nextXp > 0 && currentXp >= nextXp;
  const displayXp = isUnlocked === false ? 0 : currentXp;
  const progressMet = isCurrent || lastFilled || (isUnlocked && nextXp > 0 && displayXp >= nextXp);

  const statusLabel = isCurrent
    ? 'Current'
    : !isUnlocked
      ? 'Locked'
      : lastFilled || progressMet
        ? 'Eligible'
        : 'Unlocked';

  const criteria = [
    {
      label: 'XP Progress',
      value: isMax && lastFilled ? `${formatXp(displayXp)} (Max)` : `${formatXp(displayXp)} / ${formatXp(nextXp)}`,
      met: progressMet || isCurrent,
    },
    {
      label: 'Level Up Reward',
      value: `${formatXp(selected?.level_up_reward_sc)} SC`,
      met: isUnlocked,
    },
    {
      label: 'Withdrawal Limit',
      value: `${formatXp(selected?.withdrawal_limit)} SC`,
      met: isUnlocked,
    },
    {
      label: 'Platform Games Withdrawal',
      value: `${formatXp(selected?.platform_withdrawal_limit)} SC`,
      met: isUnlocked,
    },
  ];

  const go = (dir) => {
    setSelectedIdx((i) => Math.min(list.length - 1, Math.max(0, i + dir)));
  };

  if (!Array.isArray(levels)) return null;

  if (!list.length) {
    return (
      <section className="df-vip-tiers" aria-label="VIP levels">
        <div className="df-vip-tiers-empty">No VIP levels loaded. Please try again later.</div>
      </section>
    );
  }

  return (
    <section className="df-vip-tiers" aria-labelledby="df-vip-tier-title">
      <header>
        <div>
          <p className="df-vip-tiers-kicker">Progress</p>
          <h2 id="df-vip-tier-title" className="df-vip-tiers-title">
            Player Tiers
          </h2>
        </div>
        <div className="df-vip-tier-arrows">
          <button type="button" aria-label="Previous tier" disabled={selectedIdx <= 0} onClick={() => go(-1)}>
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Next tier"
            disabled={selectedIdx >= list.length - 1}
            onClick={() => go(1)}
          >
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="df-vip-tier-track" ref={trackRef}>
        {list.map((level, i) => (
          <button
            key={level.level_index ?? level.name ?? i}
            type="button"
            className={i === selectedIdx ? 'is-selected' : ''}
            aria-pressed={i === selectedIdx}
            onClick={() => setSelectedIdx(i)}
          >
            <img src={getVipTierImage(level.name)} alt="" width={142} height={142} loading="lazy" decoding="async" />
            <span>{level.name}</span>
            {level.is_current ? <small>Current</small> : null}
          </button>
        ))}
      </div>

      {selected && (
        <div className="df-vip-tier-criteria" aria-live="polite">
          <header>
            <h3>{tierName}</h3>
            <span className={`df-vip-tier-status${!isUnlocked || statusLabel === 'Locked' ? ' is-locked' : ''}`}>
              {statusLabel}
            </span>
          </header>
          {criteria.map((row) => (
            <div key={row.label} className="df-vip-tier-criteria-row">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              <i className={`df-vip-tier-dot${row.met ? ' is-met' : ''}`} aria-hidden />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
