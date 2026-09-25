import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useToast } from '../../context/ToastContext';
import * as vipApi from '../../api/vip';
import { usePageContentReady } from '../../context/PageReadyContext';
import { getVipTierStyle, getVipTierImage } from '../../utils/vipTierColors';
import {
  useCountUp,
  VipGfxParticles,
  VipXpRing,
  VipXpBursts,
  VipStatsRow,
  VipQuestGrid,
  VipConfetti,
} from '../../components/Vip/VipGamification';
import '../../components/Vip/df-vip.css';

function formatXp(n) {
  return (Number(n) || 0).toLocaleString();
}

function VipHero({ status, lastTierFilled }) {
  const currentLevel = status?.levels?.find((l) => l.is_current) ?? status?.levels?.[status?.level_index ?? 0];
  const tierName = status?.level_name || currentLevel?.name || 'Iron';
  const tierStyle = getVipTierStyle(tierName, currentLevel?.color);
  const currentXp = Number(status?.current_xp) || 0;
  const nextXp = Math.max(0, Number(status?.next_level_xp) || 0);
  const progressPct = lastTierFilled ? 100 : nextXp > 0 ? Math.min(100, (100 * currentXp) / nextXp) : 0;
  const xpToNext = lastTierFilled ? 0 : Math.max(0, nextXp - currentXp);
  const levelNum = (status?.level_index ?? 0) + 1;
  const xpDisplay = useCountUp(currentXp);
  const pctDisplay = useCountUp(Math.round(progressPct), 1000);

  return (
    <section className="dash-vip-hero dash-animate-in">
      <div className="dash-vip-hero-bg" aria-hidden />
      <VipGfxParticles />
      <VipXpBursts color={tierStyle.color} />

      <div className="dash-vip-hero-inner">
        <div className="dash-vip-hero-badges">
          <span className="dash-vip-live-badge">⚡ Live XP</span>
          <motion.span
            className="dash-vip-level-pill"
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          >
            Level {levelNum}
          </motion.span>
        </div>

        <div className="dash-vip-hero-main">
          <div className="dash-vip-hero-ring-col">
            <VipXpRing percent={progressPct} color={tierStyle.color}>
              <motion.span
                className="dash-vip-hero-crown"
                animate={{ y: [0, -10, 0], rotate: [-5, 5, -5] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                👑
              </motion.span>
            </VipXpRing>
            <motion.span
              className="dash-vip-hero-pct"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.6, type: 'spring' }}
            >
              {pctDisplay}%
            </motion.span>
          </div>

          <div className="dash-vip-hero-copy">
            <p className="dash-vip-hero-kicker">Your VIP Rank</p>
            <h2 className="dash-vip-hero-title" style={{ color: tierStyle.color }}>
              {tierName} <span className="dash-vip-hero-vip">VIP</span>
            </h2>
            <p className="dash-vip-hero-sub">
              {lastTierFilled
                ? '🏆 Max tier — legendary member!'
                : (
                  <>
                    <strong className="dash-vip-hero-xp-left">{xpToNext.toLocaleString()} XP</strong> to next rank
                  </>
                )}
            </p>
            <div className="dash-vip-hero-xp-box">
              <span className="dash-vip-hero-xp-label">XP</span>
              <motion.span key={xpDisplay} className="dash-vip-hero-xp-num" initial={{ scale: 1.2 }} animate={{ scale: 1 }}>
                {xpDisplay.toLocaleString()}
              </motion.span>
              {!lastTierFilled && nextXp > 0 && (
                <span className="dash-vip-hero-xp-max">/ {nextXp.toLocaleString()}</span>
              )}
            </div>
            <div className="dash-vip-progress dash-vip-progress--hero">
              <motion.div
                className="dash-vip-progress-fill dash-vip-progress-fill--animated"
                style={{
                  width: `${progressPct}%`,
                  background: `linear-gradient(90deg, ${tierStyle.color}, var(--vip-gold, #ffc94f), var(--vip-emerald, #35ef9a))`,
                }}
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqItem({ item, isOpen, onToggle }) {
  return (
    <div className={`dash-vip-faq-item${isOpen ? ' dash-vip-faq-item--open' : ''}`}>
      <button type="button" onClick={() => onToggle(item.id)} className="dash-vip-faq-trigger" aria-expanded={isOpen}>
        <span className="dash-vip-faq-question">{item.question}</span>
        <svg className="dash-vip-faq-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && <div className="dash-vip-faq-answer">{item.answer}</div>}
    </div>
  );
}

function VipPromoSection() {
  return (
    <section className="dash-vip-promo dash-animate-in dash-delay-2">
      <div className="dash-vip-promo-glow" aria-hidden />
      <div className="dash-vip-promo-icon" aria-hidden>
        <motion.span
          animate={{ y: [0, -12, 0], rotate: [-8, 8, -8], scale: [1, 1.1, 1] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          👑
        </motion.span>
      </div>
      <div className="dash-vip-promo-body">
        <h2 className="dash-vip-promo-title">Earn Extra Rewards!</h2>
        <p className="dash-vip-promo-desc">
          Invite friends and level up for higher withdrawal limits and weekly Coins Back.
        </p>
        <Link to="/account/affiliate" className="dash-btn-cta dash-vip-promo-cta dash-vip-promo-cta--pulse">
          Invite Friends Now
        </Link>
      </div>
    </section>
  );
}

/** Live Profile–style Player Tiers carousel + criteria panel */
function VipTiersSection({ levels }) {
  const trackRef = useRef(null);
  const currentIdx = useMemo(() => {
    const i = levels.findIndex((l) => l.is_current);
    return i >= 0 ? i : 0;
  }, [levels]);
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

  const selected = levels[selectedIdx] ?? levels[0];
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
    setSelectedIdx((i) => Math.min(levels.length - 1, Math.max(0, i + dir)));
  };

  if (!levels.length) {
    return (
      <section className="df-vip-tiers dash-animate-in dash-delay-4" aria-label="VIP levels">
        <div className="df-vip-tiers-empty">No VIP levels loaded. Please try again later.</div>
      </section>
    );
  }

  return (
    <section className="df-vip-tiers dash-animate-in dash-delay-4" aria-labelledby="df-vip-tier-title">
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
            disabled={selectedIdx >= levels.length - 1}
            onClick={() => go(1)}
          >
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>
      </header>

      <div className="df-vip-tier-track" ref={trackRef}>
        {levels.map((level, i) => (
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

export function AccountVip() {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [faq, setFaq] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openFaqId, setOpenFaqId] = useState(null);
  const [confetti, setConfetti] = useState(false);

  usePageContentReady(!loading);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, faqRes] = await Promise.all([vipApi.getVipStatus(), vipApi.getVipFaq()]);
      setStatus(statusRes);
      setFaq(faqRes.faq || []);
      setOpenFaqId((prev) => (prev != null ? prev : faqRes.faq?.[0]?.id ?? null));
    } catch (e) {
      toast.error(e.message || 'Unable to load VIP. Please try again.');
      setStatus(null);
      setFaq([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener('vip:refresh', onRefresh);
    return () => window.removeEventListener('vip:refresh', onRefresh);
  }, [load]);

  const levels = status?.levels ?? [];
  const lastTierFilled = Boolean(
    status?.is_max_level && status?.next_level_xp != null && (Number(status?.current_xp) || 0) >= Number(status.next_level_xp)
  );
  const topTierName = status?.level_name || 'Diamond';
  const topLevel = levels.length > 0 ? levels[levels.length - 1] : null;
  const topTierStyle = getVipTierStyle(topTierName, topLevel?.color);
  const currentLevel = levels.find((l) => l.is_current);
  const tierStyle = getVipTierStyle(status?.level_name, currentLevel?.color);

  useEffect(() => {
    if (!loading) {
      setConfetti(true);
      const t = setTimeout(() => setConfetti(false), 2800);
      return () => clearTimeout(t);
    }
  }, [loading]);

  useEffect(() => {
    if (!loading && lastTierFilled) {
      setConfetti(true);
      const t = setTimeout(() => setConfetti(false), 3200);
      return () => clearTimeout(t);
    }
  }, [loading, lastTierFilled]);

  return (
    <div className="dash-page dash-vip-page df-vip-page w-full min-w-0">
      <VipConfetti show={confetti} />

      <header className="dash-deposit-header dash-animate-in">
        <motion.p
          className="dash-vip-page-tag"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          Progress
        </motion.p>
        <h1 className="dash-deposit-title dash-vip-page-title">VIP Club</h1>
        <p className="dash-deposit-sub">
          Rank up, unlock tiers, and claim bigger rewards. Earn XP from deposits, gameplay, and referrals.
        </p>
      </header>

      {status && <VipHero status={status} lastTierFilled={lastTierFilled} />}

      <VipStatsRow status={status} tierStyle={tierStyle} />

      <VipQuestGrid />

      {lastTierFilled && (
        <section
          className="dash-vip-complete dash-animate-in dash-delay-1"
          style={{ '--vip-tier-color': topTierStyle.color, '--vip-tier-glow': topTierStyle.colorLight }}
        >
          <motion.div
            className="dash-vip-complete-badge"
            style={{ backgroundColor: topTierStyle.color }}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            🏆
          </motion.div>
          <div className="dash-vip-complete-body">
            <h2 className="dash-vip-complete-title" style={{ color: topTierStyle.color }}>
              {topTierName} VIP — Max Tier!
            </h2>
            <p className="dash-vip-complete-text">You conquered every VIP rank. Legendary status unlocked!</p>
          </div>
        </section>
      )}

      <VipPromoSection />

      <VipTiersSection levels={levels} />

      {faq.length > 0 && (
        <section className="dash-animate-in dash-delay-5">
          <div className="dash-section-head">
            <h2 className="dash-section-title">FAQ</h2>
            <p className="dash-section-sub">Common questions about VIP tiers and rewards.</p>
          </div>
          <div className="dash-panel dash-vip-faq">
            {faq.map((item) => (
              <FaqItem key={item.id} item={item} isOpen={openFaqId === item.id} onToggle={(id) => setOpenFaqId((p) => (p === id ? null : id))} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
