import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useToast } from '../../context/ToastContext';
import * as vipApi from '../../api/vip';
import { usePageContentReady } from '../../context/PageReadyContext';
import { getVipTierStyle } from '../../utils/vipTierColors';
import {
  useCountUp,
  VipGfxParticles,
  VipXpRing,
  VipXpBursts,
  VipStatsRow,
  VipQuestGrid,
  VipConfetti,
} from '../../components/Vip/VipGamification';
import { VipTierCard } from '../../components/Vip/VipTierCard';

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
                  background: `linear-gradient(90deg, ${tierStyle.color}, var(--dash-gold), var(--dash-teal))`,
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

/** Promo: mobile = crown on top, then title & CTA */
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
    <div className="dash-page dash-vip-page w-full min-w-0">
      <VipConfetti show={confetti} />

      <header className="dash-deposit-header dash-animate-in">
        <motion.p
          className="dash-vip-page-tag"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          🎮 Gamified VIP
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

      <section className="dash-animate-in dash-delay-4">
        <div className="dash-section-head">
          <h2 className="dash-section-title">VIP Levels</h2>
          <p className="dash-section-sub">Compare tiers and unlock higher limits, rewards, and bonuses as you rank up.</p>
        </div>
        <div className="dash-vip-tiers-track">
          {levels.map((level, i) => (
            <VipTierCard key={level.level_index} level={level} isCurrent={level.is_current} index={i} />
          ))}
        </div>
        {levels.length === 0 && (
          <div className="dash-panel dash-vip-empty">
            <p className="dash-panel-desc m-0">No VIP levels loaded. Please try again later.</p>
          </div>
        )}
      </section>

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
