import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Wheel } from 'spin-wheel';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useSpinWheelStatus } from '../../context/SpinWheelStatusContext';
import * as spinwheelApi from '../../api/spinwheel';
import { AppLoader } from '../../components/AppLoader';
import { usePageContentReady } from '../../context/PageReadyContext';
import {
  SpinWheelParticles,
  spinFadeUp,
} from '../../components/SpinWheel/SpinWheelGamification';
import { SpinWheelResultModal } from '../../components/SpinWheel/SpinWheelResultModal';
import {
  unlockSpinWheelSound,
  playSpinTick,
  playSpinResult,
  startSpinLoop,
  stopSpinSounds,
} from '../../components/SpinWheel/spinWheelSound';
import '../../components/SpinWheel/df-spinwheel.css';

function formatCountdown(ms) {
  if (ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${String(m).padStart(2, '0')}m`);
  parts.push(`${String(s).padStart(2, '0')}s`);
  return parts.join(' ');
}

function segmentShortLabel(seg) {
  const custom = typeof seg?.label === 'string' ? seg.label.trim() : '';
  if (custom) return custom;
  const type = seg?.type;
  const value = seg?.value != null ? Number(seg.value) : 0;
  if (type === 'sc_coins') return value ? `${value} SC` : 'SC';
  if (type === 'free_spin') return value > 1 ? `${value} Spins` : '1 Spin';
  if (type === 'coupon') {
    if (Number.isFinite(value) && value > 0) {
      const pretty = Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
      return `${pretty}% Off`;
    }
    return 'Coupon';
  }
  if (type === 'no_win') return 'No Luck';
  return '';
}

function loadSegmentIcons() {
  const load = (src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  return Promise.all([
    load('/spinwheel-sc-coin.svg'),
    load('/spinwheel-free-spin.svg'),
    load('/spinwheel-no-win.svg'),
    load('/spinwheel-coupon.svg'),
  ]).then(([coin, freeSpin, noWin, coupon]) => ({ coin, freeSpin, noWin, coupon }));
}

function segmentIcon(type, icons) {
  if (type === 'sc_coins') return icons.coin;
  if (type === 'free_spin') return icons.freeSpin;
  if (type === 'coupon') return icons.coupon;
  return icons.noWin;
}

function getContrastLabelColor(hex) {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return '#ffffff';
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

function loadImage(path) {
  return new Promise((resolve) => {
    if (!path) return resolve(null);
    const img = new Image();
    const url = path.startsWith('http') || path.startsWith('data:') ? path : `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

const SPIN_DURATION_MS = 4000;
const WHEEL_SIZE_DESKTOP = 400;
const WHEEL_SIZE_MOBILE = 280;
const MOBILE_BREAKPOINT = 640;

function getWheelSize() {
  if (typeof window === 'undefined') return WHEEL_SIZE_DESKTOP;
  const vw = window.innerWidth;
  if (vw > MOBILE_BREAKPOINT) return WHEEL_SIZE_DESKTOP;
  const horizontalInset = 88;
  const maxWheel = vw - horizontalInset - 20;
  return Math.min(WHEEL_SIZE_MOBILE, Math.max(220, maxWheel));
}

const RAYS_GRADIENT = `conic-gradient(from 0deg at 50% 50%,
  transparent 0deg 15deg, rgba(255,215,0,0.16) 15deg 30deg, transparent 30deg 45deg,
  rgba(155,89,255,0.14) 45deg 60deg, transparent 60deg 75deg, rgba(0,255,224,0.12) 75deg 90deg,
  transparent 90deg 105deg, rgba(255,215,0,0.15) 105deg 120deg, transparent 120deg 135deg,
  rgba(155,89,255,0.13) 135deg 150deg, transparent 150deg 165deg, rgba(0,255,224,0.11) 165deg 180deg,
  transparent 180deg 195deg, rgba(255,215,0,0.16) 195deg 210deg, transparent 210deg 225deg,
  rgba(155,89,255,0.14) 225deg 240deg, transparent 240deg 255deg, rgba(0,255,224,0.12) 255deg 270deg,
  transparent 270deg 285deg, rgba(255,215,0,0.15) 285deg 300deg, transparent 300deg 315deg,
  rgba(155,89,255,0.13) 315deg 330deg, transparent 330deg 345deg, rgba(0,255,224,0.11) 345deg 360deg)`;

export function SpinWheel() {
  const { refreshBalance, isAuthenticated } = useAuth();
  const { refreshSpinStatus } = useSpinWheelStatus();
  const { toast } = useToast();
  const reduceMotion = useReducedMotion();
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [nextSpinIn, setNextSpinIn] = useState(null);
  const [wheelSize, setWheelSize] = useState(getWheelSize);
  const wheelContainerRef = useRef(null);
  const wheelRef = useRef(null);
  const spinResultRef = useRef(null);
  const keepSpinIntervalRef = useRef(null);
  const spinInProgressRef = useRef(false);

  usePageContentReady(!loading);

  useEffect(() => {
    const onResize = () => setWheelSize(getWheelSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const load = useCallback(async () => {
    try {
      const configPromise = isAuthenticated
        ? spinwheelApi.getSpinWheelConfigMe()
        : spinwheelApi.getSpinWheelConfig();
      const statusPromise = isAuthenticated ? spinwheelApi.getSpinWheelStatus() : Promise.resolve(null);
      const [configRes, statusRes] = await Promise.all([configPromise, statusPromise]);
      setConfig(configRes);
      setStatus(statusRes);
    } catch (err) {
      toast.error(err.message || 'Failed to load spin wheel.');
    } finally {
      setLoading(false);
    }
  }, [toast, isAuthenticated]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const nextAt = status?.next_spin_at;
    const canSpinNow = status?.can_spin === true;
    if (canSpinNow || !nextAt) {
      setNextSpinIn(null);
      return;
    }
    const update = () => {
      const ms = new Date(nextAt) - new Date();
      if (ms <= 0) {
        setNextSpinIn(null);
        load();
        refreshSpinStatus();
        return;
      }
      setNextSpinIn(ms);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [status?.next_spin_at, status?.can_spin, refreshSpinStatus, load]);

  const segments = config?.segments ?? [];
  const clubSliceColors = ['#3b0764', '#6d28d9', '#1e1033', '#7e22ce', '#312e81', '#9333ea', '#4c1d95', '#581c87'];
  const segmentColors = segments.map((_, index) => clubSliceColors[index % clubSliceColors.length]);
  const segmentLabelColors = segmentColors.map(getContrastLabelColor);
  const n = segments.length;
  const spinLocked = status?.spin_locked === true;
  const spinLockedMessage =
    'Your free 3-day spin access has ended. Make a deposit to unlock daily spins again.';
  const canSpin = status?.can_spin === true && !isSpinning && n > 0;
  const pendingFreeSpins = Math.max(0, Number(status?.pending_free_spins) || 0);
  const usableCoupons = Array.isArray(status?.usable_coupons) ? status.usable_coupons : [];
  const dailyLimitReached = status?.daily_limit_reached === true;
  const maxSpinsPerDay =
    status?.max_spins_per_day != null && Number(status.max_spins_per_day) > 0
      ? Number(status.max_spins_per_day)
      : null;
  const spinsUsedToday =
    status?.spins_used_today != null && Number.isFinite(Number(status.spins_used_today))
      ? Number(status.spins_used_today)
      : null;

  const countdownText = nextSpinIn != null && nextSpinIn > 0 ? formatCountdown(nextSpinIn) : null;

  const explainWhyCannotSpin = useCallback(() => {
    if (spinLocked) {
      toast.error('Make a deposit to unlock daily spins.');
      return;
    }
    if (dailyLimitReached) {
      toast.error(
        pendingFreeSpins > 0
          ? countdownText
            ? `Daily spin limit reached. Your ${pendingFreeSpins} bonus spin${pendingFreeSpins !== 1 ? 's' : ''} unlock in ${countdownText}.`
            : `Daily spin limit reached. Your ${pendingFreeSpins} bonus spin${pendingFreeSpins !== 1 ? 's' : ''} unlock after the 24-hour limit resets.`
          : countdownText
            ? `Daily spin limit reached. Next spin in ${countdownText}.`
            : 'Daily spin limit reached. Come back after 24 hours.'
      );
      return;
    }
    if (!status?.can_spin) {
      toast.error(
        countdownText
          ? `No spin available yet. Next spin in ${countdownText}.`
          : 'No spin available. Come back tomorrow or use a free spin.'
      );
    }
  }, [spinLocked, dailyLimitReached, pendingFreeSpins, countdownText, status?.can_spin, toast]);

  const wheelCallbacksRef = useRef({ load, refreshBalance, refreshSpinStatus });
  wheelCallbacksRef.current = { load, refreshBalance, refreshSpinStatus };

  const segmentSignature = segments
    .map((s) => `${s?.type}|${s?.value}|${s?.color}|${s?.label}`)
    .join('~');

  useEffect(() => {
    const el = wheelContainerRef.current;
    if (!el || n === 0) return;

    let mounted = true;

    const handleRest = () => {
      setIsSpinning(false);
      spinInProgressRef.current = false;
      const ref = spinResultRef.current;
      spinResultRef.current = null;
      const payload = ref?.payload;
      if (!payload?.outcome) return;
      const outcome = payload.outcome;
      const rawWin =
        outcome.value ??
        outcome.amount ??
        outcome.sc_amount ??
        outcome.win_amount;
      const parsedWin = rawWin != null ? Number(rawWin) : NaN;
      const winValue = Number.isFinite(parsedWin)
        ? parsedWin
        : outcome.type === 'sc_coins'
          ? 0
          : outcome.type === 'free_spin'
            ? 1
            : 0;
      const couponCode = outcome.coupon_code || outcome.couponCode || '';
      setResult({
        outcome: {
          segmentIndex: outcome.segmentIndex,
          type: outcome.type,
          value: winValue,
          label: outcome.label ?? (outcome.type === 'sc_coins' ? `${winValue} SC` : outcome.type === 'free_spin' ? `${winValue} Free Spin` : outcome.type === 'coupon' ? `${winValue}% Off` : 'No Win'),
          coupon_code: couponCode,
          coupon_percent: outcome.coupon_percent ?? outcome.couponPercent ?? (outcome.type === 'coupon' ? winValue : undefined)
        },
        balance_sc: payload.balance_sc != null ? Number(payload.balance_sc) : null,
        pending_free_spins: payload.pending_free_spins != null ? Number(payload.pending_free_spins) : null,
        can_spin: payload.can_spin === true,
        daily_limit_reached: payload.daily_limit_reached === true,
        next_spin_at: payload.next_spin_at || null,
        max_spins_per_day:
          payload.max_spins_per_day != null ? Number(payload.max_spins_per_day) : null,
      });
      if (payload.pending_free_spins != null || payload.can_spin != null) {
        setStatus((prev) => ({
          ...(prev || {}),
          can_spin: payload.can_spin === true,
          pending_free_spins:
            payload.pending_free_spins != null
              ? Number(payload.pending_free_spins)
              : prev?.pending_free_spins,
          daily_limit_reached: payload.daily_limit_reached === true,
          next_spin_at: payload.next_spin_at || prev?.next_spin_at || null,
          max_spins_per_day:
            payload.max_spins_per_day != null
              ? Number(payload.max_spins_per_day)
              : prev?.max_spins_per_day,
          spins_used_today:
            payload.spins_used_today != null
              ? Number(payload.spins_used_today)
              : prev?.spins_used_today,
          usable_coupons: Array.isArray(payload.usable_coupons)
            ? payload.usable_coupons
            : prev?.usable_coupons,
        }));
      }
      wheelCallbacksRef.current.refreshBalance?.();
      wheelCallbacksRef.current.refreshSpinStatus?.();
      wheelCallbacksRef.current.load?.();
    };

    const buildItems = (icons) => {
      const { coin, freeSpin, noWin, coupon } = icons || {};
      return segments.map((seg) => {
        const image = icons ? segmentIcon(seg?.type, { coin, freeSpin, noWin, coupon }) : undefined;
        return {
          label: segmentShortLabel(seg),
          image: image || undefined,
          imageOpacity: 1,
          imageRadius: 0.85,
          imageScale: 0.24,
          imageRotation: 0,
          weight: 1,
        };
      });
      const wheelProps = {
        radius: 0.88,
        itemLabelRadius: 0.65,
        itemLabelRadiusMax: 0.18,
        itemLabelRotation: 90,
        itemLabelAlign: 'center',
        itemLabelFontSizeMax: Math.round(18 * (wheelSize / WHEEL_SIZE_DESKTOP)),
        itemBackgroundColors: segmentColors,
        itemLabelColors: segmentLabelColors,
        itemLabelStrokeWidth: 0.2,
        itemLabelStrokeColor: 'black',
        rotationSpeedMax: 700,
        rotationResistance: -70,
        lineWidth: 0,
        overlayImage: overlayImage || undefined,
        items,
      };

      if (mounted && wheelContainerRef.current) {
        wheelRef.current = new Wheel(wheelContainerRef.current, wheelProps);
        wheelRef.current.onCurrentIndexChange = () => {
          if (!spinInProgressRef.current) return;
          playSpinTick(wheelRef.current?.rotationSpeed);
        };
        wheelRef.current.onRest = () => {
          stopSpinSounds();
          setIsSpinning(false);
          spinInProgressRef.current = false;
          const ref = spinResultRef.current;
          spinResultRef.current = null;
          const payload = ref?.payload;
          if (payload?.outcome) {
            playSpinResult(payload.outcome.type !== 'no_win');
            const outcome = payload.outcome;
            const rawWin =
              outcome.value ??
              outcome.amount ??
              outcome.sc_amount ??
              outcome.win_amount;
            const parsedWin = rawWin != null ? Number(rawWin) : NaN;
            const winValue = Number.isFinite(parsedWin)
              ? parsedWin
              : outcome.type === 'sc_coins'
                ? 0
                : outcome.type === 'free_spin'
                  ? 1
                  : 0;
            setResult({
              outcome: {
                segmentIndex: outcome.segmentIndex,
                type: outcome.type,
                value: winValue,
                label: outcome.label ?? (outcome.type === 'sc_coins' ? `${winValue} SC` : outcome.type === 'free_spin' ? `${winValue} Free Spin` : 'No Win'),
              },
              balance_sc: payload.balance_sc != null ? Number(payload.balance_sc) : null,
              pending_free_spins: payload.pending_free_spins != null ? Number(payload.pending_free_spins) : null,
              can_spin: payload.can_spin === true,
              daily_limit_reached: payload.daily_limit_reached === true,
              next_spin_at: payload.next_spin_at || null,
              max_spins_per_day:
                payload.max_spins_per_day != null ? Number(payload.max_spins_per_day) : null,
            });
            if (payload.pending_free_spins != null || payload.can_spin != null) {
              setStatus((prev) => ({
                ...(prev || {}),
                can_spin: payload.can_spin === true,
                pending_free_spins:
                  payload.pending_free_spins != null
                    ? Number(payload.pending_free_spins)
                    : prev?.pending_free_spins,
                daily_limit_reached: payload.daily_limit_reached === true,
                next_spin_at: payload.next_spin_at || prev?.next_spin_at || null,
                max_spins_per_day:
                  payload.max_spins_per_day != null
                    ? Number(payload.max_spins_per_day)
                    : prev?.max_spins_per_day,
                spins_used_today:
                  payload.spins_used_today != null
                    ? Number(payload.spins_used_today)
                    : prev?.spins_used_today,
              }));
            }
            refreshBalance?.();
            refreshSpinStatus?.();
            load();
          }
        };
      }
    };

    const buildProps = (overlayImage, icons) => ({
      radius: 0.88,
      itemLabelRadius: 0.65,
      itemLabelRadiusMax: 0.18,
      itemLabelRotation: 90,
      itemLabelAlign: 'center',
      itemLabelFontSizeMax: Math.round(18 * (wheelSize / WHEEL_SIZE_DESKTOP)),
      itemBackgroundColors: segmentColors,
      itemLabelColors: segmentLabelColors,
      itemLabelStrokeWidth: 0.2,
      itemLabelStrokeColor: 'black',
      rotationSpeedMax: 700,
      rotationResistance: -70,
      lineWidth: 0,
      overlayImage: overlayImage || undefined,
      onRest: handleRest,
      items: buildItems(icons),
    });

    wheelRef.current = new Wheel(el, buildProps(null, null));

    Promise.all([loadImage('/df-wheel-overlay.svg?v=2'), loadSegmentIcons()]).then(([overlayImage, icons]) => {
      if (!mounted || !wheelRef.current) return;
      wheelRef.current.init(buildProps(overlayImage, icons));
    });

    return () => {
      mounted = false;
      stopSpinSounds();
      if (wheelRef.current) {
        wheelRef.current.remove();
        wheelRef.current = null;
      }
    };
  }, [n, segmentSignature, wheelSize]);

  async function handleSpin() {
    if (!canSpin) {
      explainWhyCannotSpin();
      return;
    }
    if (!wheelRef.current) return;
    if (isSpinning) return;
    if (spinInProgressRef.current) return;

    setResult(null);
    spinResultRef.current = null;
    setIsSpinning(true);
    spinInProgressRef.current = true;
    unlockSpinWheelSound();
    startSpinLoop();

    let freshStatus;
    try {
      freshStatus = await spinwheelApi.getSpinWheelStatus();
    } catch (err) {
      stopSpinSounds();
      toast.error(err?.message || 'Could not check spin availability.');
      setIsSpinning(false);
      spinInProgressRef.current = false;
      return;
    }
    if (!freshStatus?.can_spin) {
      stopSpinSounds();
      setStatus(freshStatus);
      const pending = Math.max(0, Number(freshStatus?.pending_free_spins) || 0);
      const nextMs =
        freshStatus?.next_spin_at != null
          ? new Date(freshStatus.next_spin_at) - new Date()
          : 0;
      const nextLabel = nextMs > 0 ? formatCountdown(nextMs) : null;
      toast.error(
        freshStatus?.spin_locked
          ? 'Make a deposit to unlock daily spins.'
          : freshStatus?.daily_limit_reached
            ? pending > 0
              ? nextLabel
                ? `Daily spin limit reached. Your ${pending} bonus spin${pending !== 1 ? 's' : ''} unlock in ${nextLabel}.`
                : `Daily spin limit reached. Your ${pending} bonus spin${pending !== 1 ? 's' : ''} unlock after the 24-hour limit resets.`
              : nextLabel
                ? `Daily spin limit reached. Next spin in ${nextLabel}.`
                : 'Daily spin limit reached. Come back after 24 hours.'
            : nextLabel
              ? `No spin available yet. Next spin in ${nextLabel}.`
              : 'No spin available. Come back tomorrow or use a free spin.'
      );
      setIsSpinning(false);
      spinInProgressRef.current = false;
      return;
    }

    if (keepSpinIntervalRef.current) {
      clearInterval(keepSpinIntervalRef.current);
      keepSpinIntervalRef.current = null;
    }

    const KEEP_SPIN_SPEED = 420;
    const KEEP_SPIN_INTERVAL_MS = 120;
    wheelRef.current.spin(KEEP_SPIN_SPEED);
    keepSpinIntervalRef.current = setInterval(() => {
      if (wheelRef.current) wheelRef.current.spin(KEEP_SPIN_SPEED);
    }, KEEP_SPIN_INTERVAL_MS);

    spinwheelApi
      .spinWheelSpin()
      .then((data) => {
        if (keepSpinIntervalRef.current) {
          clearInterval(keepSpinIntervalRef.current);
          keepSpinIntervalRef.current = null;
        }
        let payload = null;
        if (typeof data.payload === 'string') {
          try {
            payload = JSON.parse(atob(data.payload));
          } catch (_) {
            payload = null;
          }
        }
        if (!payload?.outcome) {
          stopSpinSounds();
          toast.error('Invalid spin result. Please try again.');
          setIsSpinning(false);
          spinInProgressRef.current = false;
          return;
        }
        const outcome = payload.outcome;
        const winnerIndex = outcome.segmentIndex != null ? Number(outcome.segmentIndex) : segments.findIndex((s) => s?.type === outcome?.type && s?.value === outcome?.value);
        const targetIndex = winnerIndex >= 0 ? winnerIndex : 0;
        spinResultRef.current = { payload };
        wheelRef.current.spinToItem(targetIndex, SPIN_DURATION_MS, true, 3, 1, null);
      })
      .catch((err) => {
        if (keepSpinIntervalRef.current) {
          clearInterval(keepSpinIntervalRef.current);
          keepSpinIntervalRef.current = null;
        }
        stopSpinSounds();
        toast.error(err?.message || 'Spin failed.');
        setIsSpinning(false);
        spinInProgressRef.current = false;
      });
  }

  if (loading) {
    return <AppLoader fillPage message="Loading spin wheel" />;
  }

  if (n === 0) {
    return (
      <div className="w-full flex items-center justify-center min-h-[50vh]">
        <p className="text-[var(--dash-muted)]">Spin wheel is not configured yet.</p>
      </div>
    );
  }

  const btnSize = Math.round(88 * (wheelSize / WHEEL_SIZE_DESKTOP));

  return (
    <div className="spinwheel-page df-spin-page w-full min-h-full">
      <div className="spinwheel-page-stack flex flex-col">
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="spinwheel-page-hero relative overflow-hidden rounded-2xl border-2 border-[var(--dash-border-strong)]"
      >
        <div className="absolute inset-0 spinwheel-hero-glow" aria-hidden />
        <SpinWheelParticles />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--dash-deep)] via-transparent to-transparent" aria-hidden />

        <div className="relative z-10 px-4 sm:px-6 pt-5 sm:pt-6 pb-4 text-center">
          <motion.div
            className="flex flex-wrap items-center justify-center gap-2 mb-3"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <span className="spinwheel-badge spinwheel-badge--daily">
              🛞 Daily Reward
            </span>
            {canSpin && (
              <motion.span
                className="spinwheel-badge spinwheel-badge--ready"
                animate={reduceMotion ? {} : { scale: [1, 1.06, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              >
                Spin Ready
              </motion.span>
            )}
          </motion.div>

          <motion.h1
            variants={spinFadeUp}
            initial="hidden"
            animate="visible"
            className="text-2xl sm:text-3xl font-black text-[var(--dash-text)] flex items-center justify-center gap-2"
          >
            <span className="spinwheel-crown-float text-2xl" aria-hidden>🛞</span>
            Daily Spin Wheel
            <span className="spinwheel-crown-float text-2xl" aria-hidden>✨</span>
          </motion.h1>
          <motion.p variants={spinFadeUp} custom={1} initial="hidden" animate="visible" className="text-[var(--dash-muted)] text-sm mt-1 max-w-md mx-auto">
            Spin for free SC coins, bonus spins, and surprise rewards.
            {maxSpinsPerDay != null
              ? ` Up to ${maxSpinsPerDay} spins every 24 hours.`
              : ' Daily spins reset every 24 hours.'}
          </motion.p>

          {spinLocked && (
            <motion.div
              variants={spinFadeUp}
              custom={2}
              initial="hidden"
              animate="visible"
              className="spinwheel-lock-card mt-4 mx-auto max-w-md"
            >
              <div className="spinwheel-lock-card__shine" aria-hidden />
              <div className="spinwheel-lock-card__badge">Unlock daily rewards</div>
              <p className="spinwheel-lock-card__title">Daily Spins Locked</p>
              <p className="spinwheel-lock-card__copy">{spinLockedMessage}</p>
              <Link
                to="/deposit"
                className="spinwheel-lock-cta no-underline"
              >
                <span className="spinwheel-lock-cta__icon" aria-hidden>$</span>
                <span>
                  <span className="spinwheel-lock-cta__label">Make a Deposit</span>
                  <span className="spinwheel-lock-cta__sub">Reactivate your daily spin wheel</span>
                </span>
              </Link>
              <p className="spinwheel-lock-card__fine">Deposit once to keep daily spins active.</p>
            </motion.div>
          )}

          {!spinLocked && !canSpin && dailyLimitReached && (
            <motion.div
              variants={spinFadeUp}
              custom={2}
              initial="hidden"
              animate="visible"
              className="spinwheel-limit-banner mt-4 mx-auto max-w-md"
              role="status"
            >
              <p className="spinwheel-limit-banner__title">Daily spin limit reached</p>
              <p className="spinwheel-limit-banner__copy">
                {pendingFreeSpins > 0
                  ? `You have ${pendingFreeSpins} bonus spin${pendingFreeSpins !== 1 ? 's' : ''} saved. ${
                      countdownText
                        ? `You can use them in ${countdownText}.`
                        : 'You can use them after the 24-hour limit resets.'
                    }`
                  : countdownText
                    ? `Come back in ${countdownText} for your next spin.`
                    : 'Come back after 24 hours for your next spin.'}
              </p>
              {maxSpinsPerDay != null && spinsUsedToday != null && (
                <p className="spinwheel-limit-banner__meta">
                  Used {spinsUsedToday} of {maxSpinsPerDay} spins in the last 24 hours
                </p>
              )}
            </motion.div>
          )}

          {!spinLocked && !canSpin && !dailyLimitReached && countdownText && (
            <motion.p variants={spinFadeUp} custom={2} initial="hidden" animate="visible" className="text-sm font-bold text-[var(--dash-muted)] mt-3">
              Next spin in{' '}
              <span className="text-[var(--dash-gold)] tabular-nums font-black spinwheel-text-pulse">{countdownText}</span>
            </motion.p>
          )}
        </div>
      </motion.section>

      <motion.div
        variants={spinFadeUp}
        custom={2}
        initial="hidden"
        animate="visible"
        className="spinwheel-wheel-section relative flex flex-col items-center justify-center w-full"
      >
        {[
          { left: '12%', top: '18%', delay: 'spinwheel-sparkle-delay-1' },
          { left: '88%', top: '22%', delay: 'spinwheel-sparkle-delay-2' },
          { left: '78%', top: '55%', delay: 'spinwheel-sparkle-delay-3' },
          { left: '15%', top: '70%', delay: 'spinwheel-sparkle-delay-4' },
          { left: '50%', top: '12%', delay: 'spinwheel-sparkle-delay-5' },
          { left: '92%', top: '68%', delay: 'spinwheel-sparkle-delay-6' },
        ].map((pos, i) => (
          <div
            key={i}
            className={`absolute w-2 h-2 rounded-full pointer-events-none spinwheel-sparkle ${pos.delay}`}
            style={{ left: pos.left, top: pos.top }}
          />
        ))}

        <div
          className={`spinwheel-wheel-frame relative flex items-center justify-center spinwheel-float ${isSpinning ? 'spinwheel-wheel-stage-spinning' : 'spinwheel-wheel-stage'}`}
        >
          <div className="spinwheel-wheel-core flex items-center justify-center" style={{ width: wheelSize, height: wheelSize }}>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none spinwheel-rays-wrap" aria-hidden>
              <div
                className="spinwheel-rays absolute"
                style={{
                  width: '150%',
                  height: '150%',
                  left: '-25%',
                  top: '-25%',
                  background: RAYS_GRADIENT,
                  maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, black 18%, transparent 52%)',
                  WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, black 18%, transparent 52%)',
                  maskRepeat: 'no-repeat',
                  maskPosition: 'center',
                  maskSize: '100% 100%',
                }}
              />
            </div>

            <div
              ref={wheelContainerRef}
              className="absolute inset-0 rounded-full overflow-hidden ring-2 ring-[rgba(255,215,0,0.25)]"
              style={{ width: '100%', height: '100%', margin: 0 }}
            />

            <div
              className="absolute z-20 pointer-events-none"
              style={{
                width: btnSize,
                height: btnSize,
                left: `calc(50% - ${btnSize / 2}px)`,
                top: `calc(50% - ${btnSize / 2}px)`,
              }}
            >
              <button
                type="button"
                onClick={handleSpin}
                disabled={isSpinning}
                aria-disabled={!canSpin || isSpinning}
                aria-busy={isSpinning}
                className={`spinwheel-spin-btn w-full h-full rounded-full flex items-center justify-center disabled:cursor-not-allowed pointer-events-auto focus:outline-none focus:ring-2 focus:ring-[var(--dash-gold)] focus:ring-offset-2 focus:ring-offset-[var(--dash-deep)] ${canSpin ? 'spinwheel-button-ready' : 'cursor-pointer'} ${isSpinning ? 'spinwheel-spin-btn--spinning' : ''}`}
                style={{
                  background: canSpin
                    ? 'linear-gradient(145deg, var(--dash-gold) 0%, var(--dash-gold2) 55%, #c07a00 100%)'
                    : 'linear-gradient(145deg, #3a3a52 0%, #252538 100%)',
                  border: canSpin ? '2px solid rgba(255,255,255,0.35)' : '2px solid rgba(255,255,255,0.1)',
                  color: canSpin ? 'var(--dash-bg)' : 'var(--dash-muted)',
                  boxShadow: canSpin
                    ? 'inset 0 2px 12px rgba(255,255,255,0.35), 0 4px 24px rgba(255,215,0,0.35)'
                    : 'inset 0 1px 4px rgba(0,0,0,0.3)',
                }}
                aria-label={
                  spinLocked
                    ? 'Spin wheel locked until deposit'
                    : dailyLimitReached
                      ? 'Daily spin limit reached'
                      : canSpin
                        ? 'Spin the wheel'
                        : 'Spin unavailable'
                }
              >
                <span className="spinwheel-spin-btn-label">
                  {spinLocked ? 'LOCKED' : dailyLimitReached ? 'WAIT' : 'SPIN'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {pendingFreeSpins > 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`text-xs font-bold mt-2 ${
              canSpin ? 'text-[var(--dash-neon2)] spinwheel-text-pulse' : 'text-[var(--dash-gold)]'
            }`}
          >
            {canSpin
              ? `+ ${pendingFreeSpins} bonus spin${pendingFreeSpins !== 1 ? 's' : ''} in your queue — tap SPIN to use one`
              : countdownText
                ? `${pendingFreeSpins} bonus spin${pendingFreeSpins !== 1 ? 's' : ''} saved · unlocks in ${countdownText}`
                : `${pendingFreeSpins} bonus spin${pendingFreeSpins !== 1 ? 's' : ''} saved · unlocks after the 24-hour limit resets`}
          </motion.p>
        )}
        {usableCoupons.length > 0 && (
          <div className="spinwheel-coupons-banner" role="status">
            <p className="spinwheel-coupons-banner__title">Deposit coupons</p>
            <p className="spinwheel-coupons-banner__copy">
              One-time codes for your next deposit. Apply them on the Deposit page.
            </p>
            <ul className="spinwheel-coupons-banner__list">
              {usableCoupons.map((c) => (
                <li key={c.code || c.id} className="spinwheel-coupons-banner__item">
                  <code>{c.code}</code>
                  <span>{c.label || `${c.discount_percent}% off`}</span>
                </li>
              ))}
            </ul>
            <Link to="/deposit" className="spinwheel-coupons-banner__cta">
              Go to Deposit
            </Link>
          </div>
        )}
      </motion.div>
      </div>

      {result?.outcome && (
        <SpinWheelResultModal
          outcome={result.outcome}
          balanceSc={result.balance_sc}
          pendingFreeSpins={result.pending_free_spins}
          canSpinNow={result.can_spin === true}
          dailyLimitReached={result.daily_limit_reached === true}
          nextSpinLabel={
            result.next_spin_at
              ? formatCountdown(Math.max(0, new Date(result.next_spin_at) - new Date()))
              : countdownText
          }
          maxSpinsPerDay={result.max_spins_per_day ?? maxSpinsPerDay}
          onClose={() => setResult(null)}
        />
      )}
    </div>
  );
}
