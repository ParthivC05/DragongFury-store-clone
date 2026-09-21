import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Wheel } from 'spin-wheel';
import { motion, useReducedMotion } from 'framer-motion';
import * as spinwheelApi from '../../api/spinwheel';
import { useGuestLandingSpinCooldown } from '../../hooks/useGuestLandingSpinCooldown';
import { spinFadeUp } from './SpinWheelGamification';
import { getSegmentWheelColors } from './spinWheelAppearance';
import {
  GUEST_SPIN_WHEEL_SEGMENTS,
  GUEST_LANDING_SPIN_WIN_SC,
  findScSegmentIndex,
} from './guestSpinWheelConfig';
import { saveGuestPendingSpinWin } from './guestLandingSpinPendingWin';
import {
  unlockSpinWheelSound,
  playSpinTick,
  playSpinResult,
  startSpinLoop,
  stopSpinSounds,
} from './spinWheelSound';

const SPIN_DURATION_MS = 4000;
const WHEEL_SIZE_DESKTOP = 400;
const WHEEL_SIZE_MOBILE = 280;
const MOBILE_BREAKPOINT = 640;
const KEEP_SPIN_SPEED = 420;
const KEEP_SPIN_INTERVAL_MS = 120;
const FAKE_SPIN_DELAY_MS = 700;
/** Gentle always-on rotation when the guest wheel is idle. */
const IDLE_SPIN_SPEED = 38;
const IDLE_SPIN_RESTART_MS = 1800;

const RAYS_GRADIENT = `conic-gradient(from 0deg at 50% 50%,
  transparent 0deg 15deg, rgba(182,255,42,0.22) 15deg 30deg, transparent 30deg 45deg,
  rgba(143,227,26,0.16) 45deg 60deg, transparent 60deg 75deg, rgba(212,255,106,0.14) 75deg 90deg,
  transparent 90deg 105deg, rgba(182,255,42,0.2) 105deg 120deg, transparent 120deg 135deg,
  rgba(111,191,0,0.16) 135deg 150deg, transparent 150deg 165deg, rgba(182,255,42,0.12) 165deg 180deg,
  transparent 180deg 195deg, rgba(182,255,42,0.22) 195deg 210deg, transparent 210deg 225deg,
  rgba(143,227,26,0.16) 225deg 240deg, transparent 240deg 255deg, rgba(212,255,106,0.14) 255deg 270deg,
  transparent 270deg 285deg, rgba(182,255,42,0.2) 285deg 300deg, transparent 300deg 315deg,
  rgba(111,191,0,0.16) 315deg 330deg, transparent 330deg 345deg, rgba(182,255,42,0.12) 345deg 360deg)`;

const SPARKLE_POSITIONS = [
  { left: '12%', top: '18%', delay: 'spinwheel-sparkle-delay-1' },
  { left: '88%', top: '22%', delay: 'spinwheel-sparkle-delay-2' },
  { left: '78%', top: '55%', delay: 'spinwheel-sparkle-delay-3' },
  { left: '15%', top: '70%', delay: 'spinwheel-sparkle-delay-4' },
  { left: '50%', top: '12%', delay: 'spinwheel-sparkle-delay-5' },
  { left: '92%', top: '68%', delay: 'spinwheel-sparkle-delay-6' },
];

function segmentShortLabel(seg) {
  const type = seg?.type;
  const value = seg?.value != null ? Number(seg.value) : 0;
  if (type === 'sc_coins') return value ? `${value} SC` : 'SC';
  if (type === 'free_spin') return value > 1 ? `${value} Spins` : '1 Spin';
  if (type === 'coupon') return value ? `${value}% Off` : 'Coupon';
  if (type === 'no_win') return 'No Luck';
  return seg?.label ?? '';
}

function loadImage(path) {
  return new Promise((resolve) => {
    if (!path) return resolve(null);
    const img = new Image();
    const url =
      path.startsWith('http') || path.startsWith('data:')
        ? path
        : `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function loadSegmentIcons() {
  const load = (src) =>
    new Promise((resolve) => {
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

function getWheelSize(compact) {
  if (typeof window === 'undefined') return compact ? 300 : WHEEL_SIZE_DESKTOP;
  const vw = window.innerWidth;
  let size;
  if (vw > MOBILE_BREAKPOINT) {
    size = compact ? 300 : WHEEL_SIZE_DESKTOP;
  } else {
    const horizontalInset = compact ? 32 : 88;
    const maxWheel = vw - horizontalInset;
    size = Math.min(compact ? 280 : WHEEL_SIZE_MOBILE, Math.max(200, maxWheel));
  }
  return size;
}

/**
 * Same visual spin wheel as `/spinwheel` — loads public segment colors from API
 * (appearance only); guest spin outcome is rigged to the configured SC amount.
 */
export function GuestSpinWheelWidget({ onWin, compact = true, className = '', winScAmount = GUEST_LANDING_SPIN_WIN_SC }) {
  const reduceMotion = useReducedMotion();
  const { canSpin, cooldownLabel, markSpinUsed } = useGuestLandingSpinCooldown();
  const [isSpinning, setIsSpinning] = useState(false);
  const [wheelSize, setWheelSize] = useState(() => getWheelSize(compact));
  const [segments, setSegments] = useState(GUEST_SPIN_WHEEL_SEGMENTS);
  const wheelContainerRef = useRef(null);
  const wheelRef = useRef(null);
  const spinResultRef = useRef(null);
  const keepSpinIntervalRef = useRef(null);
  const idleSpinIntervalRef = useRef(null);
  const spinInProgressRef = useRef(false);
  const onWinRef = useRef(onWin);
  const markSpinUsedRef = useRef(markSpinUsed);
  const segmentsRef = useRef(segments);

  const { backgrounds: segmentColors, labels: segmentLabelColors } = useMemo(
    () => getSegmentWheelColors(segments),
    [segments]
  );
  const n = segments.length;
  const winIndex = findScSegmentIndex(segments, winScAmount);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    onWinRef.current = onWin;
  }, [onWin]);

  useEffect(() => {
    markSpinUsedRef.current = markSpinUsed;
  }, [markSpinUsed]);

  useEffect(() => {
    let cancelled = false;
    spinwheelApi
      .getSpinWheelConfig()
      .then((config) => {
        if (cancelled) return;
        const apiSegments = Array.isArray(config?.segments) ? config.segments : [];
        if (apiSegments.length === 0) return;
        // Landing wheel uses Dragon Fury lime/ink wedges — keep API types/values/labels only.
        const palette = GUEST_SPIN_WHEEL_SEGMENTS.map((s) => s.color);
        setSegments(
          apiSegments.map((seg, i) => ({
            ...seg,
            color: palette[i % palette.length],
          }))
        );
      })
      .catch(() => {
        /* keep cream/orange fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onResize = () => setWheelSize(getWheelSize(compact));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [compact]);

  const stopIdleSpin = useCallback(() => {
    if (idleSpinIntervalRef.current) {
      clearInterval(idleSpinIntervalRef.current);
      idleSpinIntervalRef.current = null;
    }
  }, []);

  const startIdleSpin = useCallback(() => {
    if (spinInProgressRef.current || !wheelRef.current) return;
    wheelRef.current.spin(IDLE_SPIN_SPEED);
    if (idleSpinIntervalRef.current) return;
    idleSpinIntervalRef.current = window.setInterval(() => {
      if (!spinInProgressRef.current && wheelRef.current) {
        wheelRef.current.spin(IDLE_SPIN_SPEED);
      }
    }, IDLE_SPIN_RESTART_MS);
  }, []);

  useEffect(() => {
    if (!wheelContainerRef.current || n === 0) return undefined;

    let mounted = true;

    const setupWheel = async () => {
      const [overlayImage, icons] = await Promise.all([loadImage('/overlay.svg'), loadSegmentIcons()]);
      const { coin, freeSpin, noWin, coupon } = icons || {};
      const items = segments.map((seg) => {
        const type = seg?.type;
        const image =
          type === 'sc_coins' ? coin : type === 'free_spin' ? freeSpin : type === 'coupon' ? coupon : noWin;
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
        if (wheelRef.current) {
          wheelRef.current.remove();
          wheelRef.current = null;
        }
        wheelRef.current = new Wheel(wheelContainerRef.current, wheelProps);
        wheelRef.current.onCurrentIndexChange = () => {
          if (!spinInProgressRef.current) return;
          playSpinTick(wheelRef.current?.rotationSpeed);
        };
        wheelRef.current.onRest = () => {
          const ref = spinResultRef.current;
          if (ref?.outcome) {
            stopSpinSounds();
            playSpinResult(ref.outcome.type !== 'no_win');
            setIsSpinning(false);
            spinInProgressRef.current = false;
            spinResultRef.current = null;
            stopIdleSpin();
            markSpinUsedRef.current();
            const winAmount = ref.outcome?.value != null ? Number(ref.outcome.value) : winScAmount;
            saveGuestPendingSpinWin(winAmount);
            onWinRef.current?.(ref.outcome);
            return;
          }
          if (!spinInProgressRef.current) {
            setIsSpinning(false);
            startIdleSpin();
          }
        };
        startIdleSpin();
      }
    };

    setupWheel();

    return () => {
      mounted = false;
      stopIdleSpin();
      stopSpinSounds();
      if (keepSpinIntervalRef.current) {
        clearInterval(keepSpinIntervalRef.current);
        keepSpinIntervalRef.current = null;
      }
      if (wheelRef.current) {
        wheelRef.current.remove();
        wheelRef.current = null;
      }
    };
  }, [n, segmentColors.join(','), segmentLabelColors.join(','), wheelSize, segments, startIdleSpin, stopIdleSpin]);

  const handleSpin = useCallback(() => {
    if (!canSpin || !wheelRef.current || isSpinning || spinInProgressRef.current) return;

    const currentSegments = segmentsRef.current;
    const targetIndex = findScSegmentIndex(currentSegments, winScAmount);
    const winSeg = currentSegments[targetIndex] ?? GUEST_SPIN_WHEEL_SEGMENTS[targetIndex];

    spinResultRef.current = null;
    setIsSpinning(true);
    spinInProgressRef.current = true;
    stopIdleSpin();

    if (keepSpinIntervalRef.current) {
      clearInterval(keepSpinIntervalRef.current);
      keepSpinIntervalRef.current = null;
    }

    unlockSpinWheelSound();
    startSpinLoop();

    wheelRef.current.spin(KEEP_SPIN_SPEED);
    keepSpinIntervalRef.current = setInterval(() => {
      if (wheelRef.current) wheelRef.current.spin(KEEP_SPIN_SPEED);
    }, KEEP_SPIN_INTERVAL_MS);

    window.setTimeout(() => {
      if (keepSpinIntervalRef.current) {
        clearInterval(keepSpinIntervalRef.current);
        keepSpinIntervalRef.current = null;
      }
      if (!wheelRef.current) {
        stopSpinSounds();
        setIsSpinning(false);
        spinInProgressRef.current = false;
        return;
      }

      spinResultRef.current = {
        outcome: {
          segmentIndex: targetIndex,
          type: winSeg?.type ?? 'sc_coins',
          value: winScAmount,
          label: `${winScAmount} SC`,
        },
      };
      wheelRef.current.spinToItem(targetIndex, SPIN_DURATION_MS, true, 3, 1, null);
    }, FAKE_SPIN_DELAY_MS);
  }, [canSpin, isSpinning, stopIdleSpin, winScAmount]);

  const spinDisabled = isSpinning || !canSpin;

  const btnSize = Math.round(88 * (wheelSize / WHEEL_SIZE_DESKTOP));

  return (
    <motion.div
      variants={spinFadeUp}
      custom={2}
      initial="hidden"
      animate="visible"
      className={`spinwheel-wheel-section lp-guest-spin-wheel relative flex flex-col items-center justify-center w-full max-w-full overflow-hidden${className ? ` ${className}` : ''}`}
    >
      {SPARKLE_POSITIONS.map((pos, i) => (
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
                maskImage:
                  'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, black 18%, transparent 52%)',
                WebkitMaskImage:
                  'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, black 18%, transparent 52%)',
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
                maskSize: '100% 100%',
              }}
            />
          </div>

          <div
            ref={wheelContainerRef}
            className="absolute inset-0 rounded-full overflow-hidden ring-2 ring-[rgba(182,255,42,0.35)]"
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
              disabled={spinDisabled}
              aria-busy={isSpinning}
              aria-disabled={spinDisabled}
              className={`spinwheel-spin-btn w-full h-full rounded-full flex items-center justify-center disabled:cursor-not-allowed pointer-events-auto focus:outline-none focus:ring-2 focus:ring-[var(--dash-gold)] focus:ring-offset-2 focus:ring-offset-[var(--dash-deep)] ${canSpin && !isSpinning ? 'spinwheel-button-ready' : ''} ${isSpinning ? 'spinwheel-spin-btn--spinning' : ''}`}
              style={{
                background: 'linear-gradient(145deg, var(--dash-gold) 0%, var(--dash-gold2) 55%, #c07a00 100%)',
                border: '2px solid rgba(255,255,255,0.35)',
                color: 'var(--dash-bg)',
                boxShadow:
                  'inset 0 2px 12px rgba(255,255,255,0.35), 0 4px 24px rgba(255,215,0,0.35)',
              }}
              aria-label="Spin the wheel"
            >
              <span className="spinwheel-spin-btn-label">SPIN</span>
            </button>
          </div>
        </div>
      </div>

      {!isSpinning && canSpin ? (
        <motion.button
          type="button"
          onClick={handleSpin}
          className="lp-spin-btn-outer lp-spin-btn-outer--guest mt-3"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          🎡 SPIN NOW — FREE
        </motion.button>
      ) : null}

      {!isSpinning && !canSpin ? (
        <p className="lp-guest-spin-cooldown mt-3" role="status">
          Next free spin in <strong>{cooldownLabel}</strong>
        </p>
      ) : null}
    </motion.div>
  );
}
