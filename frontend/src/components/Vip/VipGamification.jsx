import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getVipTierStyle } from '../../utils/vipTierColors';

const XP_QUESTS = [
  { id: 'deposit', icon: '💰', label: 'Deposit', desc: '1 XP for every SC you deposit', to: '/deposit' },
  { id: 'refer', icon: '🎯', label: 'Refer Friends', desc: 'Earn XP when referrals deposit', to: '/account/affiliate' },
  { id: 'spin', icon: '🛞', label: 'Spin Wheel', desc: 'Spin for bonus rewards', to: '/spinwheel' },
];

const PARTICLES = [
  { id: 1, e: '✨', t: '10%', l: '6%', d: 0 },
  { id: 2, e: '🪙', t: '18%', r: '8%', d: 0.5 },
  { id: 3, e: '⭐', t: '50%', l: '4%', d: 1 },
  { id: 4, e: '💎', t: '65%', r: '10%', d: 0.3 },
  { id: 5, e: '🔥', t: '30%', r: '20%', d: 1.5 },
];

export function useCountUp(target, duration = 1400) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const end = Math.max(0, Math.floor(target));
    if (end === 0) {
      setValue(0);
      return;
    }
    let frame;
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.floor(eased * end));
      if (t < 1) frame = requestAnimationFrame(step);
      else setValue(end);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

export function VipGfxParticles() {
  return (
    <div className="dash-vip-gfx-particles" aria-hidden>
      {PARTICLES.map((p) => (
        <span key={p.id} className="dash-vip-gfx-particle" style={{ top: p.t, left: p.l, right: p.r, animationDelay: `${p.d}s` }}>
          {p.e}
        </span>
      ))}
      <span className="dash-vip-gfx-orbit dash-vip-gfx-orbit-a" />
      <span className="dash-vip-gfx-orbit dash-vip-gfx-orbit-b" />
    </div>
  );
}

export function VipXpRing({ percent, color, size = 132, children }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, percent));
  const offset = circ - (clamped / 100) * circ;

  return (
    <div className="dash-vip-xp-ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="dash-vip-xp-ring-svg" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={9} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="dash-vip-xp-ring-progress"
        />
      </svg>
      <div className="dash-vip-xp-ring-center">{children}</div>
    </div>
  );
}

export function VipXpBursts({ color }) {
  return (
    <div className="dash-vip-xp-bursts" aria-hidden>
      {[0, 1.2, 2.4].map((d, i) => (
        <span key={i} className="dash-vip-xp-burst" style={{ color, animationDelay: `${d}s` }}>
          +XP
        </span>
      ))}
    </div>
  );
}

export function VipStatsRow({ status, tierStyle }) {
  const currentXp = Number(status?.current_xp) || 0;
  const levelNum = (status?.level_index ?? 0) + 1;
  const total = status?.levels?.length ?? 0;
  const unlocked = status?.levels?.filter((l) => l.is_unlocked !== false).length ?? levelNum;
  const cur = status?.levels?.find((l) => l.is_current);
  const reward = Number(cur?.level_up_reward_sc) || 0;
  const xpVal = useCountUp(currentXp);

  const stats = [
    { icon: '🏆', label: 'VIP Level', value: `${levelNum}/${total}` },
    { icon: '⚡', label: 'Total XP', value: xpVal.toLocaleString() },
    { icon: '🔓', label: 'Unlocked', value: `${unlocked}/${total}` },
    { icon: '🎁', label: 'Tier Reward', value: `${reward} SC`, gold: true },
  ];

  return (
    <div className="dash-vip-stats">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          className="dash-vip-stat"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 * i, type: 'spring', stiffness: 300 }}
          style={s.gold ? { borderColor: 'color-mix(in srgb, var(--dash-gold) 40%, transparent)' } : undefined}
        >
          <span className="dash-vip-stat-icon">{s.icon}</span>
          <span className="dash-vip-stat-label">{s.label}</span>
          <span className="dash-vip-stat-value" style={s.gold ? { color: tierStyle.color } : undefined}>
            {s.value}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

export function VipTierPath({ levels, currentIndex }) {
  if (!levels?.length) return null;

  return (
    <section className="dash-vip-path dash-animate-in dash-delay-2">
      <div className="dash-section-head">
        <h2 className="dash-section-title">Tier Journey</h2>
        <p className="dash-section-sub dash-vip-path-hint">Swipe to see your rank path →</p>
      </div>
      <div className="dash-vip-path-scroll">
        <div className="dash-vip-path-track">
          {levels.map((level, i) => {
            const style = getVipTierStyle(level.name, level.color);
            const isCurrent = level.is_current;
            const locked = level.is_unlocked === false;
            const done = !isCurrent && i < currentIndex;

            return (
              <div key={level.level_index ?? i} className="dash-vip-path-node-wrap">
                {i > 0 && (
                  <span
                    className={`dash-vip-path-line${i <= currentIndex ? ' dash-vip-path-line--on' : ''}`}
                    style={i <= currentIndex ? { background: `linear-gradient(90deg, ${style.color}, var(--dash-gold))` } : undefined}
                  />
                )}
                <motion.div
                  className={`dash-vip-path-node${isCurrent ? ' dash-vip-path-node--current' : ''}${locked ? ' dash-vip-path-node--locked' : ''}`}
                  style={{ '--node-color': style.color }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.05 * i, type: 'spring', stiffness: 400 }}
                >
                  {isCurrent && <span className="dash-vip-path-pulse" />}
                  <span className="dash-vip-path-node-inner">{locked ? '🔒' : done ? '✓' : level.name?.slice(0, 1)}</span>
                  <span className="dash-vip-path-name">{level.name}</span>
                  {isCurrent && <span className="dash-vip-path-you">YOU</span>}
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function VipQuestGrid() {
  return (
    <section className="dash-vip-quests dash-animate-in dash-delay-3" aria-label="Earn XP">
      <div className="dash-section-head">
        <h2 className="dash-section-title">Earn XP</h2>
        <p className="dash-section-sub">Complete quests to rank up faster</p>
      </div>
      <div className="dash-panel dash-vip-quest-panel">
        <div className="dash-vip-quest-grid">
          {XP_QUESTS.map((q, i) => (
            <motion.div
              key={q.id}
              className="dash-vip-quest-item"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.06 }}
            >
              <Link to={q.to} className="dash-vip-quest-link">
                <span className="dash-vip-quest-icon-wrap" aria-hidden>
                  <span className="dash-vip-quest-icon">{q.icon}</span>
                </span>
                <span className="dash-vip-quest-body">
                  <span className="dash-vip-quest-label">{q.label}</span>
                  <span className="dash-vip-quest-desc">{q.desc}</span>
                </span>
                <span className="dash-vip-quest-go" aria-hidden>→</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function VipNextReward({ status, tierStyle }) {
  const idx = status?.level_index ?? 0;
  const next = status?.levels?.[idx + 1];
  if (!next || status?.is_max_level) return null;
  const ns = getVipTierStyle(next.name, next.color);
  const xpLeft = Math.max(0, (Number(status?.next_level_xp) || 0) - (Number(status?.current_xp) || 0));
  const reward = Number(next.level_up_reward_sc) || 0;

  return (
    <motion.section
      className="dash-vip-next dash-animate-in dash-delay-2"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <motion.span className="dash-vip-next-chest" animate={{ rotate: [-6, 6, -6], scale: [1, 1.08, 1] }} transition={{ duration: 2.2, repeat: Infinity }}>
        🎁
      </motion.span>
      <div className="dash-vip-next-body">
        <p className="dash-vip-next-kicker">Next level up</p>
        <p className="dash-vip-next-title">
          Unlock <strong style={{ color: ns.color }}>{next.name}</strong>
        </p>
        <p className="dash-vip-next-meta">
          <span className="dash-vip-next-reward">{reward.toLocaleString()} SC</span> · {xpLeft.toLocaleString()} XP left
        </p>
      </div>
      <span className="dash-vip-next-badge" style={{ background: `linear-gradient(145deg, ${tierStyle.color}, var(--dash-gold))` }}>
        {next.name?.slice(0, 1)}
      </span>
    </motion.section>
  );
}

export function VipConfetti({ show }) {
  const pieces = useMemo(() => Array.from({ length: 28 }, (_, i) => ({ id: i, left: `${(i * 13) % 98}%`, d: (i % 7) * 0.1, r: (i * 40) % 360 })), []);
  if (!show) return null;
  return (
    <div className="dash-vip-confetti" aria-hidden>
      {pieces.map((p) => (
        <span key={p.id} className="dash-vip-confetti-piece" style={{ left: p.left, animationDelay: `${p.d}s`, transform: `rotate(${p.r}deg)` }} />
      ))}
    </div>
  );
}
