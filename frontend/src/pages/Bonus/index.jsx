import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { usePageContentReady } from '../../context/PageReadyContext';
import { useVipStatus } from '../../context/VipStatusContext';
import { useSpinWheelStatus } from '../../context/SpinWheelStatusContext';
import * as welcomeSignupBonusApi from '../../api/welcomeSignupBonus';
import * as affiliateApi from '../../api/affiliate';
import * as vipApi from '../../api/vip';
import * as promotionsApi from '../../api/promotions';
import { GUEST_LANDING_SPIN_WIN_SC } from '../../components/SpinWheel/guestSpinWheelConfig';
import './Bonus.css';

function formatSc(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function CrownIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <path d="M3 8l4 3 5-7 5 7 4-3-2 11H5L3 8Z" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function IconVip() {
  return (
    <svg className="bonus-lounge-ico" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id="bl-cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF3CC" />
          <stop offset="1" stopColor="#D4A017" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="86" rx="27" ry="5" fill="rgba(0,0,0,.35)" />
      <path d="M14 32l13 10 23-26 23 26 13-10-8 44H22L14 32Z" fill="url(#bl-cg)" stroke="#8A6A1B" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="20" y="72" width="60" height="10" rx="3" fill="#E8B923" stroke="#8A6A1B" strokeWidth="2" />
      <circle cx="50" cy="14" r="5.5" fill="#10B981" />
      <circle cx="14" cy="30" r="4.5" fill="#7CF3E4" />
      <circle cx="86" cy="30" r="4.5" fill="#7CF3E4" />
      <circle cx="50" cy="55" r="7" fill="#8B5CF6" />
      <circle cx="34" cy="60" r="4" fill="#10B981" />
      <circle cx="66" cy="60" r="4" fill="#10B981" />
    </svg>
  );
}

function IconDaily() {
  return (
    <svg className="bonus-lounge-ico" viewBox="0 0 100 100" aria-hidden>
      <ellipse cx="50" cy="88" rx="28" ry="5" fill="rgba(0,0,0,.35)" />
      <rect x="14" y="24" width="72" height="60" rx="8" fill="#F5F0E4" stroke="#8A6A1B" strokeWidth="2.5" />
      <rect x="14" y="24" width="72" height="18" rx="8" fill="#8B5CF6" />
      <rect x="14" y="36" width="72" height="6" fill="#7B4FE0" />
      <rect x="29" y="12" width="8" height="20" rx="4" fill="#C9B8FF" />
      <rect x="63" y="12" width="8" height="20" rx="4" fill="#C9B8FF" />
      <rect x="34" y="58" width="32" height="22" rx="4" fill="#10B981" />
      <rect x="30" y="51" width="40" height="10" rx="3" fill="#7CFFC0" />
      <rect x="46" y="51" width="8" height="29" fill="#E8B923" />
      <path d="M50 51c-5 0-10-2-10-6 0-3 2-5 5-5 5 0 7 6 5 11Z" fill="#E8B923" />
      <path d="M50 51c5 0 10-2 10-6 0-3-2-5-5-5-5 0-7 6-5 11Z" fill="#E8B923" />
    </svg>
  );
}

function IconInvite() {
  return (
    <svg className="bonus-lounge-ico" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <linearGradient id="bl-bl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#A8E6A0" />
          <stop offset="1" stopColor="#4FA84A" />
        </linearGradient>
        <linearGradient id="bl-co" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE9A8" />
          <stop offset="1" stopColor="#E8B923" />
        </linearGradient>
        <linearGradient id="bl-gx" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5FD65A" />
          <stop offset="1" stopColor="#2E9B34" />
        </linearGradient>
      </defs>
      <ellipse cx="50" cy="90" rx="36" ry="6" fill="rgba(0,0,0,.35)" />
      <g transform="rotate(-15 26 56)">
        <rect x="10" y="50" width="26" height="15" rx="2.5" fill="url(#bl-bl)" stroke="#2E6B2C" strokeWidth="1.6" />
        <circle cx="23" cy="57.5" r="3.6" fill="#DFF5DC" />
      </g>
      <g transform="rotate(15 74 56)">
        <rect x="62" y="50" width="26" height="15" rx="2.5" fill="url(#bl-bl)" stroke="#2E6B2C" strokeWidth="1.6" />
        <circle cx="75" cy="57.5" r="3.6" fill="#DFF5DC" />
      </g>
      <circle cx="15" cy="74" r="9" fill="url(#bl-co)" stroke="#8A6A1B" strokeWidth="2" />
      <text x="15" y="78.5" fontSize="11" fontWeight="900" fill="#8A6A1B" textAnchor="middle" fontFamily="Georgia">$</text>
      <circle cx="85" cy="74" r="9" fill="url(#bl-co)" stroke="#8A6A1B" strokeWidth="2" />
      <text x="85" y="78.5" fontSize="11" fontWeight="900" fill="#8A6A1B" textAnchor="middle" fontFamily="Georgia">$</text>
      <circle cx="30" cy="84" r="7" fill="url(#bl-co)" stroke="#8A6A1B" strokeWidth="1.8" />
      <circle cx="70" cy="84" r="7" fill="url(#bl-co)" stroke="#8A6A1B" strokeWidth="1.8" />
      <rect x="33" y="60" width="34" height="27" rx="4" fill="url(#bl-gx)" stroke="#1F6B24" strokeWidth="2" />
      <rect x="29" y="51" width="42" height="12" rx="4" fill="#6FE06A" stroke="#1F6B24" strokeWidth="2" />
      <rect x="46" y="51" width="8" height="36" fill="#E8B923" />
      <path d="M50 51c-6 0-12-2.5-12-7.5 0-3.5 2.5-6 6-6 6 0 8 7 6 13.5Z" fill="#E8B923" stroke="#8A6A1B" strokeWidth="1.5" />
      <path d="M50 51c6 0 12-2.5 12-7.5 0-3.5-2.5-6-6-6-6 0-8 7-6 13.5Z" fill="#E8B923" stroke="#8A6A1B" strokeWidth="1.5" />
      <path d="M20 41 Q38 20 64 24" stroke="#5FD65A" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M58 16l13 8-13 8Z" fill="#5FD65A" />
      <circle cx="23" cy="28" r="6.5" fill="#F0C39A" />
      <path d="M14 44c0-6 4-9.5 9-9.5s9 3.5 9 9.5" fill="#E5661C" />
      <path d="M16 23a7 7 0 0 1 14 0v1.5H16Z" fill="#B23A2E" />
      <circle cx="77" cy="28" r="6.5" fill="#F0C39A" />
      <path d="M68 44c0-6 4-9.5 9-9.5s9 3.5 9 9.5" fill="#8B5CF6" />
      <path d="M70 22c0-4 3-7 7-7s7 3 7 7c0 3-2 4-3 7l-2-6-4 2-3-3-2 5c-2-2-3-3-3-5Z" fill="#5A3A1E" />
      <path d="M50 8l2.4 5 5.6.6-4.2 3.8 1.2 5.6L50 20.2l-5 2.8 1.2-5.6L42 13.6l5.6-.6Z" fill="#FFE9A8" />
    </svg>
  );
}

function IconSpin({ animate }) {
  return (
    <svg className="bonus-lounge-ico" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id="bl-gl" cx="50%" cy="50%">
          <stop offset="55%" stopColor="rgba(255,200,138,0)" />
          <stop offset="100%" stopColor="rgba(255,200,138,.3)" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="52" r="48" fill="url(#bl-gl)" />
      <g className={animate ? 'bonus-lounge-spinning' : undefined}>
        <circle cx="50" cy="52" r="43" fill="#F5893C" stroke="#C15C1B" strokeWidth="2" />
        <path d="M50 52 L50 15 A37 37 0 0 1 76.2 25.8 Z" fill="#F5EFE0" />
        <path d="M50 52 L76.2 25.8 A37 37 0 0 1 87 52 Z" fill="#F5893C" />
        <path d="M50 52 L87 52 A37 37 0 0 1 76.2 78.2 Z" fill="#F5EFE0" />
        <path d="M50 52 L76.2 78.2 A37 37 0 0 1 50 89 Z" fill="#F5893C" />
        <path d="M50 52 L50 89 A37 37 0 0 1 23.8 78.2 Z" fill="#F5EFE0" />
        <path d="M50 52 L23.8 78.2 A37 37 0 0 1 13 52 Z" fill="#F5893C" />
        <path d="M50 52 L13 52 A37 37 0 0 1 23.8 25.8 Z" fill="#F5EFE0" />
        <path d="M50 52 L23.8 25.8 A37 37 0 0 1 50 15 Z" fill="#F5893C" />
        <circle cx="50" cy="52" r="37" fill="none" stroke="#3a2a10" strokeWidth="1" />
        <g fill="#FFF8DC">
          <circle cx="50" cy="11.5" r="3.4" />
          <circle cx="78.6" cy="23.4" r="3.4" />
          <circle cx="90.5" cy="52" r="3.4" />
          <circle cx="78.6" cy="80.6" r="3.4" />
          <circle cx="50" cy="92.5" r="3.4" />
          <circle cx="21.4" cy="80.6" r="3.4" />
          <circle cx="9.5" cy="52" r="3.4" />
          <circle cx="21.4" cy="23.4" r="3.4" />
        </g>
        <circle cx="63" cy="32" r="2.6" fill="#10B981" />
        <circle cx="71" cy="65" r="2.6" fill="#8B5CF6" />
        <circle cx="37" cy="73" r="2.6" fill="#10B981" />
        <circle cx="29" cy="40" r="2.6" fill="#E8B923" />
      </g>
      <circle cx="50" cy="52" r="12" fill="#2E2749" stroke="#161230" strokeWidth="2" />
      <path d="M50 46l2.6 4.6 5.2.7-3.8 3.5 1 5.2-5-2.6-5 2.6 1-5.2-3.8-3.5 5.2-.7Z" fill="#FFE9A8" />
      <path d="M50 5l4.5 12h-9Z" fill="#F5F0E4" stroke="#2E2749" strokeWidth="1.4" />
    </svg>
  );
}

function IconCoinBack() {
  return (
    <svg className="bonus-lounge-ico" viewBox="0 0 100 100" aria-hidden>
      <rect x="20" y="32" width="60" height="50" rx="8" fill="#6B6250" stroke="#3E3828" strokeWidth="2.5" />
      <rect x="34" y="46" width="32" height="28" rx="6" fill="#E8A48C" stroke="#A8654C" strokeWidth="2.5" />
      <path d="M40 46v-8a10 10 0 0 1 20 0v8" fill="none" stroke="#DDD6C8" strokeWidth="5.5" />
      <circle cx="50" cy="59" r="6" fill="#F5D8CC" />
    </svg>
  );
}

function IconPromos() {
  return (
    <svg className="bonus-lounge-ico" viewBox="0 0 100 100" aria-hidden>
      <ellipse cx="50" cy="88" rx="28" ry="5" fill="rgba(0,0,0,.35)" />
      <path d="M20 44 L62 26 v50 Z" fill="#0FBFAE" stroke="#087F73" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="60" y="22" width="17" height="58" rx="5" fill="#7CF3E4" stroke="#087F73" strokeWidth="2.5" />
      <path d="M22 40 h-6a6 6 0 0 0 0 20h6Z" fill="#087F73" />
      <path d="M20 60 l4 22" stroke="#0FBFAE" strokeWidth="5" strokeLinecap="round" />
      <path d="M84 40a13 13 0 0 1 0 22" stroke="#FFE9A8" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path d="M91 33a22 22 0 0 1 0 36" stroke="rgba(255,233,168,.5)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      <circle cx="34" cy="74" r="7" fill="#E8B923" stroke="#8A6A1B" strokeWidth="2" />
    </svg>
  );
}

function IconWelcome() {
  return (
    <svg className="bonus-lounge-ico" viewBox="0 0 100 100" aria-hidden>
      <ellipse cx="50" cy="88" rx="28" ry="5" fill="rgba(0,0,0,.35)" />
      <rect x="28" y="38" width="44" height="42" rx="8" fill="#E8B923" stroke="#8A6A1B" strokeWidth="2.5" />
      <rect x="24" y="30" width="52" height="16" rx="6" fill="#FFE9A8" stroke="#8A6A1B" strokeWidth="2" />
      <rect x="46" y="30" width="8" height="50" fill="#C9A227" />
      <path d="M50 30c-7 0-12-4-12-9 0-4 3-7 7-7 5 0 7 5 5 10Z" fill="#F0E4BC" />
      <path d="M50 30c7 0 12-4 12-9 0-4-3-7-7-7-5 0-7 5-5 10Z" fill="#F0E4BC" />
      <circle cx="50" cy="58" r="8" fill="#10B981" />
      <path d="M50 54v8M46 58h8" stroke="#043820" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

const TILE_ICONS = {
  welcome: IconWelcome,
  vip: IconVip,
  daily: IconDaily,
  refer: IconInvite,
  spin: IconSpin,
  coinback: IconCoinBack,
  promos: IconPromos,
};

function BonusTile({ item, index, spinReady }) {
  const Icon = TILE_ICONS[item.id] || IconVip;
  const live = item.id === 'spin' && spinReady;
  const locked = Boolean(item.locked);

  return (
    <Link
      to={item.to}
      className={[
        'bonus-lounge-tile',
        `bonus-lounge-tile--${item.theme}`,
        live ? 'bonus-lounge-tile--live' : '',
        locked ? 'bonus-lounge-tile--locked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ animationDelay: `${0.28 + index * 0.07}s` }}
      aria-label={`${item.title}. ${item.meta}`}
    >
      <div className="bonus-lounge-tile-art">
        {!locked ? <div className="bonus-lounge-glass" aria-hidden /> : null}
        {item.pip ? (
          <span className={`bonus-lounge-pip bonus-lounge-pip--${item.pipTone || 'g'}`}>{item.pip}</span>
        ) : null}
        <Icon animate={live && !locked} />
      </div>
      <div className="bonus-lounge-tile-foot">
        <b>{item.title}</b>
        <small>{item.meta}</small>
      </div>
    </Link>
  );
}

/**
 * Guest-friendly Bonus Lounge — VIP rail, daily spin feature, and reward tiles.
 * Authenticated users deep-link into the real reward pages.
 */
export function Bonus() {
  const { isAuthenticated } = useAuth();
  const { search } = useLocation();
  const { vipStatus } = useVipStatus();
  const { canSpin } = useSpinWheelStatus();
  const registerPath = `/register${search || ''}`;

  const [ready, setReady] = useState(false);
  const [welcome, setWelcome] = useState(null);
  const [affiliate, setAffiliate] = useState(null);
  const [vipLevels, setVipLevels] = useState([]);
  const [promoCount, setPromoCount] = useState(0);
  const [fillReady, setFillReady] = useState(false);

  usePageContentReady(ready);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      welcomeSignupBonusApi.getWelcomeSignupBonusPublic(),
      affiliateApi.getAffiliateSettings(),
      vipApi.getVipLevels(),
      promotionsApi.getPromotions(),
    ]).then((results) => {
      if (cancelled) return;
      const [welcomeRes, affiliateRes, vipRes, promoRes] = results;
      if (welcomeRes.status === 'fulfilled') setWelcome(welcomeRes.value || null);
      if (affiliateRes.status === 'fulfilled') setAffiliate(affiliateRes.value || null);
      if (vipRes.status === 'fulfilled') {
        const levels = vipRes.value?.levels ?? vipRes.value ?? [];
        setVipLevels(Array.isArray(levels) ? levels : []);
      }
      if (promoRes.status === 'fulfilled') {
        const list = promoRes.value?.promotions ?? promoRes.value ?? [];
        setPromoCount(Array.isArray(list) ? list.length : 0);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const t = window.setTimeout(() => setFillReady(true), 260);
    return () => window.clearTimeout(t);
  }, [ready]);

  const vipRail = useMemo(() => {
    const levels =
      Array.isArray(vipStatus?.levels) && vipStatus.levels.length > 0
        ? vipStatus.levels
        : vipLevels;
    const names = (levels.length > 0 ? levels : [{ name: 'Bronze' }, { name: 'Silver' }, { name: 'Gold' }, { name: 'Platinum' }, { name: 'Elite' }])
      .slice(0, 5)
      .map((l) => String(l.name || '').toUpperCase() || 'TIER');

    const currentLevel =
      vipStatus?.levels?.find((l) => l.is_current) ??
      vipStatus?.levels?.[vipStatus?.level_index ?? 0];
    const tierName = (vipStatus?.level_name || currentLevel?.name || (isAuthenticated ? 'Iron' : 'Guest')).toUpperCase();
    const levelNum = isAuthenticated ? (vipStatus?.level_index ?? 0) + 1 : 0;
    const currentXp = Number(vipStatus?.current_xp) || 0;
    const nextXp = Math.max(0, Number(vipStatus?.next_level_xp) || 0);
    const lastTierFilled =
      Boolean(currentLevel?.is_max_level) && nextXp > 0 && currentXp >= nextXp;
    const progressPct = !isAuthenticated
      ? 12
      : lastTierFilled
        ? 100
        : nextXp > 0
          ? Math.min(100, (100 * currentXp) / nextXp)
          : 0;
    const xpToNext = lastTierFilled ? 0 : Math.max(0, nextXp - currentXp);
    const nextName =
      vipStatus?.levels?.find((l, i) => i === (vipStatus?.level_index ?? 0) + 1)?.name ||
      levels[(vipStatus?.level_index ?? 0) + 1]?.name ||
      'NEXT';

    const currentIndex = Math.min(
      names.length - 1,
      Math.max(0, isAuthenticated ? vipStatus?.level_index ?? 0 : -1)
    );

    return {
      tierName,
      levelNum,
      progressPct,
      xpToNext,
      nextName: String(nextName).toUpperCase(),
      names,
      currentIndex,
      lastTierFilled,
    };
  }, [isAuthenticated, vipLevels, vipStatus]);

  const spinReady = isAuthenticated ? canSpin : true;
  const spinPath = isAuthenticated ? '/spinwheel' : registerPath;
  const welcomeAmount = formatSc(welcome?.amountSc ?? welcome?.amount_sc);
  const welcomeEnabled = welcome?.enabled !== false;
  const tierCount = vipLevels.length > 0 ? vipLevels.length : 7;
  const coinbackTier = vipLevels[Math.min(4, Math.max(0, vipLevels.length - 1))];
  const coinbackLabel = coinbackTier?.name
    ? `UNLOCKS AT ${String(coinbackTier.name).toUpperCase()}`
    : 'UNLOCKS AT TIER V';

  const tiles = useMemo(() => {
    const list = [];

    if (!isAuthenticated) {
      list.push({
        id: 'welcome',
        theme: 'gold',
        pip: welcomeEnabled && welcomeAmount ? `${welcomeAmount} SC` : 'NEW',
        pipTone: 'g',
        title: 'Welcome Bonus',
        meta: 'FREE ON SIGNUP',
        to: registerPath,
      });
    }

    list.push(
      {
        id: 'vip',
        theme: 'gold',
        pip: `${tierCount} TIERS`,
        pipTone: 'g',
        title: 'VIP Rewards',
        meta: isAuthenticated
          ? vipRail.lastTierFilled
            ? 'MAX TIER'
            : `${vipRail.xpToNext.toLocaleString()} XP TO NEXT`
          : 'CLIMB THE RANKS',
        to: isAuthenticated ? '/account/vip' : registerPath,
      },
      {
        id: 'daily',
        theme: 'purple',
        pip: 'DAILY',
        pipTone: 'p',
        title: 'Daily Bonus',
        meta: isAuthenticated ? 'STREAK READY' : 'CLAIM EVERY DAY',
        to: isAuthenticated ? '/daily-bonus' : registerPath,
      },
      {
        id: 'refer',
        theme: 'green',
        pip: 'GIVE·GET',
        pipTone: 'e',
        title: 'Invite Friends',
        meta: affiliate?.reward_description ? 'REFER & EARN' : 'SHARE YOUR LINK',
        to: isAuthenticated ? '/account/affiliate' : registerPath,
      },
      {
        id: 'spin',
        theme: 'orange',
        pip: spinReady ? 'READY' : 'COOLDOWN',
        pipTone: 'o',
        title: 'Spin the Wheel',
        meta: spinReady
          ? isAuthenticated
            ? '1 SPIN LEFT'
            : `WIN ${GUEST_LANDING_SPIN_WIN_SC}+ SC`
          : 'CHECK BACK LATER',
        to: spinPath,
      },
      {
        id: 'coinback',
        theme: 'slate',
        pip: coinbackTier?.name ? String(coinbackTier.name).toUpperCase() : 'TIER V',
        pipTone: 'm',
        title: 'CoinBack',
        meta: coinbackLabel,
        to: isAuthenticated ? '/account/vip' : registerPath,
        locked: true,
      },
      {
        id: 'promos',
        theme: 'teal',
        pip: promoCount > 0 ? `${promoCount} LIVE` : 'OFFERS',
        pipTone: 't',
        title: 'Promotions',
        meta: promoCount > 0 ? "SEE WHAT'S NEW" : 'CHECK BACK SOON',
        to: isAuthenticated ? '/promotions' : registerPath,
      }
    );

    return list;
  }, [
    affiliate,
    coinbackLabel,
    coinbackTier,
    isAuthenticated,
    promoCount,
    registerPath,
    spinPath,
    spinReady,
    tierCount,
    vipRail.lastTierFilled,
    vipRail.xpToNext,
    welcomeAmount,
    welcomeEnabled,
  ]);

  return (
    <div className="dash-page bonus-hub bonus-lounge w-full min-w-0">
      <div className="bonus-lounge-grain" aria-hidden />

      <section className="bonus-lounge-head" aria-label="Bonus Lounge">
        <div className="bonus-lounge-beam" aria-hidden />
        <p className="bonus-lounge-eyebrow">REWARDS</p>
        <h1 className="bonus-lounge-title">
          Bonus <em>Lounge</em>
        </h1>

        <div className="bonus-lounge-rail">
          <div className="bonus-lounge-rail-top">
            <div className="bonus-lounge-rail-now">
              <CrownIcon />
              {isAuthenticated
                ? `${vipRail.tierName}${vipRail.levelNum ? ` · TIER ${roman(vipRail.levelNum)}` : ''}`
                : 'JOIN TO EARN XP'}
            </div>
            <div className="bonus-lounge-rail-next">
              {isAuthenticated ? (
                vipRail.lastTierFilled ? (
                  <b>MAX RANK</b>
                ) : (
                  <>
                    <b>{vipRail.xpToNext.toLocaleString()}</b> XP TO {vipRail.nextName}
                  </>
                )
              ) : (
                <>
                  <b>SIGN UP</b> TO START
                </>
              )}
            </div>
          </div>
          <div className="bonus-lounge-track" aria-hidden>
            <div
              className="bonus-lounge-fill"
              style={{ width: fillReady ? `${vipRail.progressPct}%` : '0%' }}
            />
          </div>
          <div className="bonus-lounge-ticks">
            {vipRail.names.map((name, i) => {
              let cls = 'bonus-lounge-tick';
              if (isAuthenticated) {
                if (i < vipRail.currentIndex) cls += ' bonus-lounge-tick--done';
                else if (i === vipRail.currentIndex) cls += ' bonus-lounge-tick--cur';
              }
              return (
                <div key={`${name}-${i}`} className={cls}>
                  {name}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Link to={spinPath} className="bonus-lounge-feat" aria-label="Open daily spin">
        <div className="bonus-lounge-feat-txt">
          <div className="bonus-lounge-feat-tag">
            <i aria-hidden />
            {spinReady ? 'AVAILABLE NOW' : 'DAILY SPIN'}
          </div>
          <h2>{spinReady ? 'Your daily spin is ready' : 'Daily spin on cooldown'}</h2>
          <p>
            {spinReady
              ? `Up to ${GUEST_LANDING_SPIN_WIN_SC} SC · free once a day`
              : 'Come back when your next free spin unlocks'}
          </p>
        </div>
        <div className="bonus-lounge-feat-go">
          <ChevronIcon />
        </div>
      </Link>

      <section className="bonus-lounge-banner" aria-label="Tournament">
        <img
          src="/tournament.webp"
          alt="Tournament"
          className="bonus-lounge-banner-img"
          loading="lazy"
          decoding="async"
        />
      </section>

      <div className="bonus-lounge-sec">
        <span>ALL REWARDS</span>
        <hr />
      </div>

      <section className="bonus-lounge-grid" aria-label="Bonus offers">
        {tiles.map((item, index) => (
          <BonusTile key={item.id} item={item} index={index} spinReady={spinReady} />
        ))}
      </section>

      {!isAuthenticated && (
        <section className="bonus-lounge-signup" aria-label="Sign up to claim">
          <h2>Ready to claim?</h2>
          <p>Create a free account in seconds — no purchase needed to unlock your welcome bonus.</p>
          <Link to={registerPath} className="bonus-lounge-signup-btn">
            Sign Up Free
          </Link>
        </section>
      )}
    </div>
  );
}

function roman(n) {
  const map = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let num = Math.max(1, Math.min(20, Number(n) || 1));
  let out = '';
  for (const [v, s] of map) {
    while (num >= v) {
      out += s;
      num -= v;
    }
  }
  return out;
}
