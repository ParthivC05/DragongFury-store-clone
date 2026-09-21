import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { site } from '../../config/site';
import { ApplePayIcon, CashAppIcon, CryptoPayIcon, GooglePayIcon } from '../../assets/icons';
import { ChimeLogoMarkLight } from '../../components/payment/ChimeLogo';
import { SiteLogo } from '../../components/SiteLogo';
import { JOIN_REASONS } from '../../constants/landingJoinReasons';
import { lockBodyScroll } from '../../utils/bodyScrollLock';
import './landing-dragonfury.css';

const FEATURED_GAMES = [
  { title: 'CashMachine777', image: '/optimized/games/cashmachine777.webp' },
  { title: 'Egame99', image: '/optimized/games/egame99.webp' },
  { title: 'Firekirin', image: '/optimized/games/firekirin.webp' },
  { title: 'Gameroom', image: '/optimized/games/gameroom.webp' },
  { title: 'Gamevault', image: '/optimized/games/gamevault.webp' },
  { title: 'Golden Dragon', image: '/optimized/games/goldendragon.webp' },
  { title: 'Juwa', image: '/optimized/games/juwa.webp' },
  { title: 'Juwa 2.0', image: '/optimized/games/juwa2.0.webp' },
  { title: 'Mafia', image: '/games/mafia.webp' },
  { title: 'Milkyway', image: '/optimized/games/milkyway.webp' },
  { title: 'Orionstars', image: '/optimized/games/orionstars.webp' },
  { title: 'Pandamasters', image: '/optimized/games/pandamaster.webp' },
  { title: 'Riversweeps', image: '/optimized/games/riversweeps.webp' },
  { title: 'Ultra Panda', image: '/optimized/games/ultrapanda.webp' },
  { title: 'Vblink', image: '/optimized/games/vblink.webp' },
  { title: 'Vegasx', image: '/optimized/games/vegasx.webp' },
];

const SLOT_SYMS = ['🃏', '🎰', '💎', '🌟', '🔥', '7️⃣', '🎲', '👑', '💰', '⭐'];

const TICKER_WINS = [
  { user: 'Alex M.', amt: '$247', game: 'Juwa' },
  { user: 'Priya K.', amt: '$88', game: 'Gamevault' },
  { user: 'Carlos R.', amt: '$512', game: 'Firekirin' },
  { user: 'Dana L.', amt: '$34', game: 'Milkyway' },
  { user: 'Sam T.', amt: '$175', game: 'Vegasx' },
  { user: 'Mia F.', amt: '$320', game: 'Orionstars' },
  { user: 'Raj S.', amt: '$60', game: 'Juwa' },
  { user: 'Omar K.', amt: '$430', game: 'Golden Dragon' },
];

const WHEEL_PRIZES = [
  { label: '$5', color: '#E65100' },
  { label: '$3', color: '#00838F' },
  { label: '$1', color: '#546E7A' },
  { label: 'Free Spin', color: '#1565C0' },
  { label: '$10', color: '#2E7D32' },
];

/** Index of slice that always wins (pointer lands here on every spin). */
const WHEEL_FIXED_WIN_INDEX = WHEEL_PRIZES.findIndex((p) => p.label === '$10');

const FAQ = [
  {
    q: `Is ${site.platformName} really free to play?`,
    a: `Yes. ${site.platformName} is free to join. No purchase is required to play. Sign up, pick your game, and follow the rules shown in your account for each offer.`,
  },
  {
    q: 'How do I withdraw my winnings?',
    a: 'Approved withdrawals go to the method on file — Cash App, bank transfer, cards, crypto where supported, and more. Timing depends on verification and processor windows.',
  },
  {
    q: 'What games are available?',
    a: 'Fish games, casino games, and sweepstakes-style titles from multiple providers — see the lineup below. New games are added regularly.',
  },
  {
    q: 'How does the daily spin wheel work?',
    a: 'Registered players can use the in-app spin wheel on the schedule shown in your account. Rewards and rules are displayed before you spin.',
  },
  {
    q: 'Is my personal information safe?',
    a: 'We use industry-standard encryption for sensitive data. Review our Privacy Policy for details on how information is handled.',
  },
];

const GRADIENT_CLASS = ['gc-1', 'gc-2', 'gc-3', 'gc-4', 'gc-5', 'gc-6'];
const BADGE_CYCLE = [
  ['b-hot', '🔥 Hot'],
  ['b-top', '⭐ Top'],
  ['b-new', '✦ New'],
];

const ROW_GRADIENTS = ['sg-1', 'sg-2', 'sg-3', 'sg-4', 'sg-5', 'sg-6', 'sg-7', 'sg-8'];

const GAME_PROVIDERS = [
  { name: 'BGaming', logo: '/partners/bgaming.webp' },
  { name: 'PlaySoon', logo: '/partners/playsoon.webp' },
  { name: 'EGT Digital', logo: '/partners/egt_digital.webp' },
  { name: 'Ruby Play', logo: '/partners/rubyplay.webp' },
  { name: 'SPRIBE', logo: '/partners/spribe.webp' },
  { name: 'CQ9 Gaming', logo: '/partners/cq9_gaming.webp' },
];

const PAYOUT_CARDS = [
  { name: 'Credit / Debit', type: 'Visa · Mastercard', mark: '💳', cls: 'p-card' },
  { name: 'Bank Transfer', type: 'ACH · Wire', mark: '🏦', cls: 'p-bank' },
  { name: 'Cash App', type: 'Instant', mark: null, Icon: CashAppIcon, cls: 'p-cash' },
  { name: 'Chime', type: 'Instant transfer', mark: null, Icon: ChimeLogoMarkLight, cls: 'p-chime' },
  { name: 'Google Pay', type: 'Tap to pay', mark: null, Icon: GooglePayIcon, cls: 'p-gpay' },
  { name: 'Apple Pay', type: 'Touch ID', mark: null, Icon: ApplePayIcon, cls: 'p-apay' },
  { name: 'Bitcoin', type: 'Crypto', mark: null, Icon: CryptoPayIcon, cls: 'p-btc' },
  { name: 'USDT', type: 'Tether', mark: '💠', cls: 'p-usdt' },
];

function randomSymbols() {
  return Array.from({ length: 9 }, () => SLOT_SYMS[Math.floor(Math.random() * SLOT_SYMS.length)]);
}

function SlotReel({ delayIndex }) {
  const [syms, setSyms] = useState(randomSymbols);
  const [offset, setOffset] = useState(0);

  const spin = useCallback(() => {
    setSyms(randomSymbols());
    setOffset(0);
    const tgt = -(3 + Math.floor(Math.random() * 5)) * 58;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setOffset(tgt);
      });
    });
  }, []);

  useEffect(() => {
    spin();
    const t = setInterval(spin, 2200 + delayIndex * 380);
    return () => clearInterval(t);
  }, [spin, delayIndex]);

  return (
    <div className="lp-slot-reel">
      <div
        className="lp-slot-strip"
        style={{
          transform: `translateY(${offset}px)`,
          transition: offset === 0 ? 'none' : `transform ${0.55 + delayIndex * 0.1}s cubic-bezier(0.25, 0.46, 0.45, 0.94)`,
        }}
      >
        {syms.map((s, i) => (
          <div key={`${s}-${i}`} className="lp-slot-sym">
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

function useStarfield(canvasRef) {
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    const ctx = c.getContext('2d');
    let W;
    let H;
    const stars = [];
    function resize() {
      W = c.width = window.innerWidth;
      H = c.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < 100; i += 1) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.4 + 0.2,
        speed: Math.random() * 0.25 + 0.08,
        op: Math.random() * 0.6 + 0.1,
        ts: Math.random() * 0.018 + 0.004,
        td: Math.random() > 0.5 ? 1 : -1,
      });
    }
    let raf;
    function draw() {
      ctx.clearRect(0, 0, W, H);
      stars.forEach((s) => {
        s.op += s.ts * s.td;
        if (s.op > 1 || s.op < 0.05) s.td *= -1;
        s.y -= s.speed;
        if (s.y < 0) {
          s.y = H;
          s.x = Math.random() * W;
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,${Math.random() > 0.7 ? 215 : 255},${Math.random() > 0.7 ? 0 : 255},${s.op})`;
        ctx.fill();
      });
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, [canvasRef]);
}

const WHEEL_SLICE_COUNT = WHEEL_PRIZES.length;

/** Smooth spin curve: slow start, fast middle, gentle stop */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Final wheel angle (radians) so slice `prizeIndex` center sits under pointer at top (-π/2).
 * Pointer fixed at 12 o'clock; wheel rotates CCW in canvas arc space.
 */
function computeSpinTargetAngle(startAngle, prizeIndex) {
  const twoPi = Math.PI * 2;
  const d = twoPi / WHEEL_SLICE_COUNT;
  const align = -Math.PI / 2 - (prizeIndex + 0.5) * d;
  const minTurns = 5.75;
  const minEnd = startAngle + minTurns * twoPi;
  let m = Math.ceil((minEnd - align) / twoPi);
  let target = align + m * twoPi;
  while (target < minEnd) {
    m += 1;
    target = align + m * twoPi;
  }
  return target;
}

/** Draw wheel; only resizes backing store when DPR/size changes (avoids jitter). */
function drawWheelCanvas(canvas, angle) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = 212;
  const w = Math.round(size * dpr);
  const h = Math.round(size * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, size, size);

  const cx = 106;
  const cy = 106;
  const r = 103;
  const slices = WHEEL_SLICE_COUNT;
  const sliceAngle = (Math.PI * 2) / slices;

  WHEEL_PRIZES.forEach((p, i) => {
    const start = angle + i * sliceAngle;
    const end = start + sliceAngle;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + sliceAngle / 2);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px "Russo One", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = p.label.split('\n');
    lines.forEach((ln, li) => {
      ctx.fillText(ln, r * 0.62, (li - (lines.length - 1) / 2) * 13);
    });
    ctx.restore();
  });
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,215,0,.5)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

export function Landing() {
  const { isAuthenticated } = useAuth();
  const reg = isAuthenticated ? '/' : '/register';
  const spinDest = isAuthenticated ? '/spinwheel' : '/register';

  const canvasRef = useRef(null);
  const wheelRef = useRef(null);
  const wheelAngleRef = useRef(0);
  /** @type {React.MutableRefObject<{ t0: number; duration: number; startAngle: number; targetAngle: number; prize: (typeof WHEEL_PRIZES)[number] } | null>} */
  const spinStateRef = useRef(null);
  const wheelLastTsRef = useRef(0);
  const [prizeDisplay, setPrizeDisplay] = useState(0);
  const [faqOpen, setFaqOpen] = useState(-1);
  const [winOverlay, setWinOverlay] = useState(false);
  const [winLabel, setWinLabel] = useState('');
  const [statPlayersK, setStatPlayersK] = useState(0);
  const [statPaidM, setStatPaidM] = useState(0);
  const statsStarted = useRef(false);

  const miniGames = useMemo(() => FEATURED_GAMES.slice(0, 6), []);
  const tickerItems = useMemo(() => [...TICKER_WINS, ...TICKER_WINS], []);

  useStarfield(canvasRef);

  /* Mobile Safari collapses the address bar only when the document scrolls, not .lp-scroll */
  useLayoutEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const root = document.documentElement;
    const sync = () => {
      if (mq.matches) {
        root.classList.add('lp-landing-scroll');
        /* Keep hero below fixed nav on load (Galaxy S8+, iPhone, etc.) */
        window.scrollTo(0, 0);
      } else {
        root.classList.remove('lp-landing-scroll');
      }
    };
    sync();
    mq.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      root.classList.remove('lp-landing-scroll');
    };
  }, []);

  useEffect(() => {
    let raf;
    const target = 1000;
    let c = 0;
    function tick() {
      c = Math.min(c + 18, target);
      setPrizeDisplay(Math.floor(c));
      if (c < target) raf = requestAnimationFrame(tick);
    }
    const t = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, 200);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, []);

  useLayoutEffect(() => {
    const c = wheelRef.current;
    if (c) drawWheelCanvas(c, wheelAngleRef.current);
  }, []);

  useEffect(() => {
    if (!winOverlay) return undefined;
    const releaseScrollLock = lockBodyScroll();
    document.body.classList.add('guest-spin-modal-open');
    return () => {
      releaseScrollLock();
      document.body.classList.remove('guest-spin-modal-open');
    };
  }, [winOverlay]);

  useEffect(() => {
    let raf = 0;
    wheelLastTsRef.current = performance.now();

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const canvas = wheelRef.current;
      if (!canvas) return;

      const spin = spinStateRef.current;
      if (spin) {
        const t = Math.min(1, (now - spin.t0) / spin.duration);
        const eased = easeInOutCubic(t);
        wheelAngleRef.current = spin.startAngle + (spin.targetAngle - spin.startAngle) * eased;
        drawWheelCanvas(canvas, wheelAngleRef.current);
        if (t >= 1) {
          const { prize } = spin;
          wheelAngleRef.current = spin.targetAngle;
          spinStateRef.current = null;
          drawWheelCanvas(canvas, wheelAngleRef.current);
          setWinLabel(`${prize.label.replace('\n', ' ')} bonus`);
          setTimeout(() => setWinOverlay(true), 400);
        }
        wheelLastTsRef.current = now;
        return;
      }

      if (!document.hidden) {
        const last = wheelLastTsRef.current;
        const dt = Math.min(0.05, (now - last) / 1000);
        wheelLastTsRef.current = now;
        wheelAngleRef.current += ((Math.PI * 2) / 22) * dt;
        drawWheelCanvas(canvas, wheelAngleRef.current);
      } else {
        wheelLastTsRef.current = now;
      }
    };

    const onResize = () => {
      const c = wheelRef.current;
      if (c) drawWheelCanvas(c, wheelAngleRef.current);
    };

    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const startStats = useCallback(() => {
    if (statsStarted.current) return;
    statsStarted.current = true;
    const dur = 1400;
    const steps = 56;
    let step = 0;
    const iv = setInterval(() => {
      step += 1;
      const t = Math.min(step / steps, 1);
      setStatPlayersK(Math.min(Math.ceil(50 * t), 50));
      setStatPaidM(Math.min(Math.ceil(2 * t), 2));
      if (step >= steps) clearInterval(iv);
    }, dur / steps);
  }, []);

  useEffect(() => {
    const el = document.getElementById('lp-sec-2');
    if (!el) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) startStats();
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [startStats]);

  const spinWheel = useCallback(() => {
    if (spinStateRef.current) return;
    const prizeIndex = WHEEL_FIXED_WIN_INDEX >= 0 ? WHEEL_FIXED_WIN_INDEX : WHEEL_PRIZES.length - 1;
    const prize = WHEEL_PRIZES[prizeIndex];
    const startAngle = wheelAngleRef.current;
    const targetAngle = computeSpinTargetAngle(startAngle, prizeIndex);
    spinStateRef.current = {
      t0: performance.now(),
      duration: 4600,
      startAngle,
      targetAngle,
      prize,
    };
  }, []);

  const rowGames = (slice) =>
    [...slice, ...slice].map((g, idx) => (
      <Link key={`${g.title}-${idx}`} to={reg} className={`lp-ag-card ${ROW_GRADIENTS[idx % ROW_GRADIENTS.length]}`}>
        <div className="lp-ag-art">
          <img src={g.image} alt="" />
        </div>
        <div className="lp-ag-name">{g.title}</div>
      </Link>
    ));

  const rowProviders = (slice) =>
    [...slice, ...slice].map((p, idx) => (
      <div key={`${p.name}-${idx}`} className="lp-gp-item" aria-hidden={idx >= slice.length}>
        <img
          src={p.logo}
          alt={idx < slice.length ? p.name : ''}
          width={147}
          height={50}
          loading="lazy"
          decoding="async"
        />
      </div>
    ));

  return (
    <div className={`lp-root${isAuthenticated ? '' : ' lp-root--guest'}`}>
      <canvas ref={canvasRef} className="lp-bg-canvas" aria-hidden />
      <div className="lp-lightning" aria-hidden />

      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link to="/" className="lp-logo" aria-label={site.platformName}>
            <SiteLogo variant="nav" />
          </Link>
          <div className="lp-nav-btns">
            {isAuthenticated ? (
              <Link to="/" className="lp-btn-signup-nav">
                Play now
              </Link>
            ) : (
              <>
                <Link to="/login" className="lp-btn-login">
                  Login
                </Link>
                <Link to="/register" className="lp-btn-signup-nav">
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="lp-scroll">
        <section id="lp-sec-0" className="lp-sec lp-sec-hero">
          <div className="lp-hero-grid">
            <div className="lp-hero-col-left">
              <div className="lp-neon-box">
                <div className="lp-prize-eyebrow">🔥 Win Up To</div>
                <div className="lp-prize-amount">${prizeDisplay.toLocaleString()}</div>
                <div className="lp-prize-tagline">
                  Play Now · <em>Win Everyday</em>
                </div>
              </div>

              <div className="lp-mascot-strip">
                <div className="lp-mascot-coin">🪙</div>
                <div className="lp-mascot-main">🎰</div>
                <div className="lp-mascot-coin r">💰</div>
              </div>

              <div className="lp-slot-wrap">
                <div className="lp-slot-lbl">🎰 Live Winners</div>
                <div className="lp-win-line" />
                <div className="lp-slot-machine">
                  <SlotReel delayIndex={0} />
                  <span className="lp-slot-sep">·</span>
                  <SlotReel delayIndex={1} />
                  <span className="lp-slot-sep">·</span>
                  <SlotReel delayIndex={2} />
                </div>
                <div className="lp-win-line" />
              </div>
            </div>

            <div className="lp-hero-col-right">
              <div className="lp-hero-platforms">
                <div className="lp-mini-label">
                  <div className="lp-mline" />
                  <span>
                    <span className="lp-live-dot" />
                    Live Platforms
                  </span>
                  <div className="lp-mline r" />
                </div>
                <div className="lp-mini-grid">
                  {miniGames.map((game, index) => {
                    const [badgeCls, badgeText] = BADGE_CYCLE[index % BADGE_CYCLE.length];
                    return (
                      <Link
                        key={game.title}
                        to={reg}
                        title={game.title}
                        className={`lp-mg-card ${GRADIENT_CLASS[index % GRADIENT_CLASS.length]}`}
                      >
                        <div className="lp-mg-art">
                          <img src={game.image} alt="" />
                        </div>
                        <div className="lp-mg-footer">
                          <div className="lp-mg-name" title={game.title}>
                            {game.title}
                          </div>
                          <span className={`lp-mg-badge ${badgeCls}`}>{badgeText}</span>
                        </div>
                        <div className="lp-mg-play" aria-hidden>
                          <div className="lp-play-ring">
                            <div className="lp-play-ring-in">
                              <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                                <path d="M1 1L11 7L1 13V1Z" fill="#FFD700" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="lp-ticker-wrap">
            <div className="lp-ticker-track">
              {tickerItems.map((w, i) => (
                <span key={`${w.user}-${i}`} className="lp-tick">
                  <span className="lp-tick-live">LIVE</span>
                  <span>{w.user}</span>
                  <span style={{ color: 'var(--lp-text)' }}> won </span>
                  <span className="lp-tick-amt">{w.amt}</span>
                  <span className="lp-tick-game">
                    {' '}
                    on {w.game} 🎉
                  </span>
                </span>
              ))}
            </div>
          </div>

          <div className="lp-scroll-hint">
            <span>Scroll</span>
            <div className="lp-scroll-arrow" />
          </div>
        </section>

        <section id="lp-sec-1" className="lp-sec lp-s2">
          <div className="lp-s2-inner">
            <div className="lp-s2-copy">
              <div className="lp-s2-head">
                <div className="lp-s2-title">
                  SPIN &amp; <span>WIN</span>
                </div>
                <div className="lp-s2-sub">
                  Spin the wheel on your schedule · win <em>real prizes</em> per account rules
                </div>
              </div>
              <Link to={spinDest} className="lp-btn-cta" style={{ textDecoration: 'none' }}>
                <span aria-hidden>🏆</span>
                {isAuthenticated ? 'OPEN SPIN WHEEL' : 'REGISTER & WIN'}
                <span aria-hidden>🎰</span>
              </Link>
              <div className="lp-no-purchase">
                <div className="lp-np-item">
                  <span className="lp-np-check">✓</span>No Purchase Needed
                </div>
                <div className="lp-np-item">
                  <span className="lp-np-check">✓</span>Free to Join
                </div>
                <div className="lp-np-item">
                  <span className="lp-np-check">✓</span>Instant Access
                </div>
              </div>
            </div>

            <div className="lp-s2-wheel-col">
              <div className="lp-wheel-stage">
                <div className="lp-wheel-pointer">▼</div>
                <div className="lp-wheel-outer">
                  <div className="lp-wheel-mid" aria-hidden>
                    <div className="lp-wheel-static-layers">
                      <div className="lp-wheel-ring" />
                    </div>
                    <div className="lp-wheel-spin-surface">
                      <div className="lp-wheel-canvas-wrap">
                        <canvas ref={wheelRef} width={212} height={212} />
                      </div>
                    </div>
                  </div>
                  <button type="button" className="lp-wheel-center" onClick={spinWheel} aria-label="Spin wheel">
                    🎰
                  </button>
                </div>
                <button type="button" className="lp-spin-btn-outer" onClick={spinWheel}>
                  🎡 SPIN NOW — FREE
                </button>
              </div>
            </div>
          </div>

          <div className="lp-scroll-hint">
            <span>Scroll</span>
            <div className="lp-scroll-arrow" />
          </div>
        </section>

        <section id="lp-sec-2" className="lp-sec lp-s3">
          <div className="lp-s3-inner">
            <div className="lp-s3-title">
              ALL <span>GAMES</span>
            </div>
            <div className="lp-s3-sub">{FEATURED_GAMES.length}+ platforms · new games added regularly</div>
          </div>

          <div className="lp-auto-row-wrap">
            <div className="lp-auto-row fwd">{rowGames(FEATURED_GAMES.slice(0, 8))}</div>
          </div>
          <div className="lp-auto-row-wrap">
            <div className="lp-auto-row rev">{rowGames(FEATURED_GAMES.slice(4, 12))}</div>
          </div>
          <div className="lp-auto-row-wrap">
            <div className="lp-auto-row fwd" style={{ animationDuration: '26s' }}>
              {rowGames([...FEATURED_GAMES.slice(2, 8), ...FEATURED_GAMES.slice(0, 4)])}
            </div>
          </div>

          <div className="lp-stats-row">
            <div className="lp-stat-card">
              <div className="lp-stat-icon" aria-hidden>
                🏅
              </div>
              <div className="lp-stat-val">
                {statPlayersK}
                K+
              </div>
              <div className="lp-stat-lbl">Players</div>
            </div>
            <div className="lp-stat-card">
              <div className="lp-stat-icon" aria-hidden>
                💸
              </div>
              <div className="lp-stat-val">
                ${statPaidM}M+
              </div>
              <div className="lp-stat-lbl">Paid Out</div>
            </div>
            <div className="lp-stat-card">
              <div className="lp-stat-icon" aria-hidden>
                🎮
              </div>
              <div className="lp-stat-val">{FEATURED_GAMES.length}+</div>
              <div className="lp-stat-lbl">Games</div>
            </div>
          </div>

          <div className="lp-scroll-hint">
            <span>Scroll</span>
            <div className="lp-scroll-arrow" />
          </div>
        </section>

        <section id="lp-sec-3" className="lp-sec lp-s4">
          <div className="lp-s4-head">
            <div className="lp-s4-title">
              PAYMENT <span>METHODS</span>
            </div>
            <div className="lp-s4-sub">Fast · secure · multiple options for withdrawals</div>
          </div>

          <div className="lp-pay-grid">
            {PAYOUT_CARDS.map((p) => (
              <Link key={p.name} to={reg} className={`lp-pay-card ${p.cls}`}>
                <span className="lp-pay-icon">{p.Icon ? <p.Icon /> : p.mark}</span>
                <div className="lp-pay-name">{p.name}</div>
                <div className="lp-pay-type">{p.type}</div>
              </Link>
            ))}
          </div>

          <div className="lp-pay-secure">
            <div style={{ fontSize: 28, flexShrink: 0 }} aria-hidden>
              🔒
            </div>
            <div className="lp-pay-secure-text">
              <h3>256-bit SSL Encrypted</h3>
              <p>Transactions use industry-standard encryption. Complete any verification steps shown in your account.</p>
            </div>
          </div>

          <div className="lp-scroll-hint">
            <span>Scroll</span>
            <div className="lp-scroll-arrow" />
          </div>
        </section>

        <section id="lp-sec-4" className="lp-sec lp-s-join-reasons">
          <div className="lp-join-reasons" id="lp-join-reasons" aria-labelledby="lp-join-reasons-title">
            <h2 id="lp-join-reasons-title" className="lp-join-reasons-title">
              More reasons to join <span>{site.platformName}</span>
            </h2>
            <div className="lp-join-reasons-grid">
              {JOIN_REASONS.map((reason) => (
                <article
                  key={reason.id}
                  className={`lp-join-reason-card lp-join-reason-card--${reason.id}`}
                >
                  <div className="lp-join-reason-card-glow" aria-hidden />
                  <div className="lp-join-reason-icon-wrap">
                    <img
                      className="lp-join-reason-icon"
                      src={reason.icon}
                      alt=""
                      width={64}
                      height={64}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <h3>{reason.title}</h3>
                  <p>{reason.text}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="lp-scroll-hint">
            <span>Scroll</span>
            <div className="lp-scroll-arrow" />
          </div>
        </section>

        <section id="lp-sec-5" className="lp-sec lp-s5 lp-sec-combined">
          <div className="lp-sec-combined-inner">
            <div id="lp-providers" className="lp-s-providers-block" aria-labelledby="lp-providers-title">
              <div className="lp-s-providers-head">
                <h2 id="lp-providers-title" className="lp-s-providers-title">
                  Game Providers
                </h2>
              </div>

              <div className="lp-gp-row-wrap">
                <div className="lp-gp-row fwd">{rowProviders(GAME_PROVIDERS)}</div>
              </div>
              <div className="lp-gp-row-wrap lp-gp-row-wrap--stagger">
                <div className="lp-gp-row rev" style={{ animationDuration: '24s' }}>
                  {rowProviders([...GAME_PROVIDERS].reverse())}
                </div>
              </div>
            </div>

            <div className="lp-s5-head" id="lp-faq">
              <div className="lp-s5-title">
                GOT <span>QUESTIONS?</span>
              </div>
              <div className="lp-s5-sub">Everything you need to know about {site.platformName}</div>
            </div>

            <div className="lp-faq-list">
            {FAQ.map((item, i) => (
              <div key={item.q} className={`lp-faq-item${faqOpen === i ? ' open' : ''}`}>
                <button type="button" className="lp-faq-q" onClick={() => setFaqOpen((v) => (v === i ? -1 : i))}>
                  <span className="lp-faq-q-text">{item.q}</span>
                  <span className="lp-faq-arrow">▼</span>
                </button>
                <div className="lp-faq-a">{item.a}</div>
              </div>
            ))}
            </div>
          </div>

          <div className="lp-scroll-hint">
            <span>Scroll</span>
            <div className="lp-scroll-arrow" />
          </div>
        </section>

        <section id="lp-sec-6" className="lp-sec lp-s6">
          <div className="lp-s6-inner lp-footer-root">
            <div className="lp-footer-brandmark">
              <SiteLogo variant="footer" />
            </div>

            <div className="lp-footer-cols">
              <div className="lp-footer-col">
                <div className="lp-footer-col-head">Platforms</div>
                <Link to="/" className="lp-footer-col-link">
                  All Platforms
                </Link>
                <a href="#lp-providers" className="lp-footer-col-link">
                  Game Providers
                </a>
              </div>
              <div className="lp-footer-col">
                <div className="lp-footer-col-head">Support</div>
                <Link to="/privacy" className="lp-footer-col-link">
                  Privacy Policy
                </Link>
                <Link to="/terms" className="lp-footer-col-link">
                  Terms &amp; Conditions
                </Link>
                <a href="#lp-faq" className="lp-footer-col-link">
                  FAQ
                </a>
              </div>
            </div>

            <div className="lp-footer-rule" aria-hidden />

            <div className="lp-footer-trust">
              <span className="lp-footer-trust-badge lp-footer-trust-badge--text" title="18+ only">
                18+
              </span>
              <span className="lp-footer-trust-badge" aria-hidden>
                🛡️
              </span>
              <span className="lp-footer-trust-badge" aria-hidden>
                ✅
              </span>
              <span className="lp-footer-trust-badge" aria-hidden>
                💯
              </span>
              <span className="lp-footer-trust-badge" aria-hidden>
                ☑️
              </span>
              <span className="lp-footer-trust-badge" aria-hidden>
                🔒
              </span>
              <span className="lp-footer-trust-badge" aria-hidden>
                🎯
              </span>
            </div>

            <p className="lp-footer-disclaimer">
              {site.platformName} is a free sweepstakes platform. No purchase necessary. Void where prohibited. Must be 18+ to
              participate. Not available in all states. Sweeps Coins have no cash value until redeemed. T&amp;Cs apply. Please play
              responsibly.
            </p>
            <div className="lp-footer-copyline">
              © {site.year} {site.platformName} · All Rights Reserved
            </div>
          </div>
        </section>
      </div>

      {!isAuthenticated && (
        <div className="lp-sticky-cta-wrap safe-area-pb" role="region" aria-label="Create account">
          <Link to="/register" className="lp-sticky-cta">
            <span className="lp-sticky-cta-shine" aria-hidden />
            Create Account
          </Link>
        </div>
      )}

      <div
        className={`lp-win-overlay${winOverlay ? ' show' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lp-win-title"
        onClick={(e) => {
          if (e.target === e.currentTarget) setWinOverlay(false);
        }}
      >
        <div className="lp-win-box">
          <div style={{ fontSize: 60 }} aria-hidden>
            🎉
          </div>
          <div id="lp-win-title" className="lp-win-title">
            YOU WON!
          </div>
          <div className="lp-win-prize">{winLabel}</div>
          <div className="lp-win-sub">{isAuthenticated ? 'Nice spin — check your rewards in the app.' : 'Create a free account to keep playing and claim offers.'}</div>
          <Link to={reg} className="lp-win-cta" onClick={() => setWinOverlay(false)}>
            🏆 {isAuthenticated ? 'Back to lobby' : 'Claim — Register free'}
          </Link>
        </div>
      </div>
    </div>
  );
}
