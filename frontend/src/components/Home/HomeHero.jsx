import { Link } from 'react-router-dom';

const SPIN_WHEEL_ICON = '/spinwheel-free-spin.svg';

const HERO_BOXES = [
  { id: 'help', emoji: '⁉️', label: 'Help', to: '/help' },
  { id: 'blog', emoji: '📰', label: 'Blog', to: '/blog' },
  { id: 'promotions', emoji: '🎁', label: 'Promotions', to: '/promotions' },
  { id: 'spinwheel', label: 'Spin Wheel', to: '/spinwheel' },
  { id: 'vip', emoji: '👑', label: 'VIP', to: '/account/vip' },
  { id: 'refer', emoji: '🎯', label: 'Refer & Earn', to: '/account/affiliate' },
];

const HERO_LEFT_INDEXES = HERO_BOXES.filter((_, i) => i % 2 === 0);
const HERO_RIGHT_INDEXES = HERO_BOXES.filter((_, i) => i % 2 === 1);

const HERO_LEFT_BG = [
  'from-[#1e0a2e] to-[#6b21a8]',
  'from-[#312e81] to-[#818cf8]',
  'from-[#4c1d95] to-[#a78bfa]',
  'from-[#500724] to-[#d946ef]',
];
const HERO_RIGHT_BG = [
  'from-[#042f2e] to-[#0d9488]',
  'from-[#14532d] to-[#22c55e]',
  'from-[#422006] to-[#f59e0b]',
  'from-[#451a03] to-[#ea580c]',
];

const HERO_LABEL_MOBILE =
  'dashboard-hero-box-label w-full min-h-[22px] flex items-center justify-center px-0.5 py-1 text-[9px] leading-[1.15] font-bold uppercase tracking-wide text-center whitespace-normal';
const HERO_LABEL_DESKTOP =
  'dashboard-hero-box-label w-full min-h-[26px] flex items-center justify-center px-1 py-1.5 text-[11px] leading-tight font-bold uppercase tracking-wide text-center whitespace-normal';

function HeroSpinWheelIcon({ className = 'w-6 h-6' }) {
  return <img src={SPIN_WHEEL_ICON} alt="" className={`${className} object-contain`} aria-hidden />;
}

function HeroBoxIcon({ box, emojiClassName, iconClassName }) {
  if (box.id === 'spinwheel') {
    return <HeroSpinWheelIcon className={iconClassName} />;
  }
  return (
    <span className={emojiClassName} aria-hidden>
      {box.emoji}
    </span>
  );
}

function formatCountdown(secondsLeft) {
  if (secondsLeft <= 0) return '00:00:00';
  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function HomeHero({
  isAuthenticated,
  countdownSeconds,
  spinWheelCanSpin,
  spinWheelSecondsLeft,
  spinWheelCooldownSec = 86400,
}) {
  const showSpinReady = isAuthenticated && spinWheelCanSpin;
  return (
    <section className="dashboard-hero relative overflow-hidden min-h-[340px] md:min-h-[400px] rounded-xl">
      <div className="absolute inset-0 dashboard-hero-bg opacity-90" aria-hidden />
      <div className="relative z-10 flex flex-col min-h-[320px] md:min-h-[400px]">
        <div className="flex items-center justify-center gap-2.5 sm:gap-4 pt-3 sm:pt-5 px-3 sm:px-6">
          {isAuthenticated ? (
            <Link
              to="/spinwheel"
              className="dashboard-spin-pill flex-1 max-w-[280px] relative rounded-full h-10 overflow-hidden flex items-center justify-center gap-2 px-4 no-underline transition"
            >
              <div
                className="dashboard-spin-pill-fill absolute left-0 top-0 bottom-0 rounded-full transition-all duration-1000"
                style={{
                  width: spinWheelCanSpin
                    ? '100%'
                    : `${Math.max(0, 100 - (spinWheelSecondsLeft / spinWheelCooldownSec) * 100)}%`,
                }}
                aria-hidden
              />
              <HeroSpinWheelIcon className="w-5 h-5 z-[1]" />
              <span className="font-bold text-sm text-white tracking-wide z-[1]">
                {spinWheelCanSpin ? (
                  <span className="text-[var(--dash-gold)]">SPIN READY</span>
                ) : spinWheelSecondsLeft != null ? (
                  <>
                    Next: <span className="text-[var(--dash-gold)] tabular-nums">{formatCountdown(spinWheelSecondsLeft)}</span>
                  </>
                ) : (
                  <span className="text-[var(--dash-gold)]">SPIN WHEEL</span>
                )}
              </span>
            </Link>
          ) : (
            <div className="dashboard-spin-pill flex-1 max-w-[280px] relative rounded-full h-10 overflow-hidden flex items-center justify-center gap-2 px-4">
              <div className="dashboard-spin-pill-fill absolute left-0 top-0 bottom-0 w-[20%] rounded-full dashboard-spin-bar-fill" aria-hidden />
              <HeroSpinWheelIcon className="w-5 h-5 z-[1]" />
              <span className="font-bold text-sm text-white tracking-wide z-[1]">
                <span className="text-[var(--dash-gold)]">SPIN WHEEL</span>
              </span>
            </div>
          )}
          <Link
            to="/promotions"
            className="dashboard-gift-btn w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 dashboard-gift-wiggle hover:scale-105 transition"
            title="Promotions"
          >
            🎁
          </Link>
        </div>
        {countdownSeconds != null && (
          <div className="text-center py-1.5 sm:py-3 px-3 font-bold text-sm sm:text-2xl md:text-3xl text-white tracking-[0.08em] sm:tracking-[0.2em] tabular-nums text-shadow-[0_0_20px_rgba(102,111,80,0.6)]">
            {formatCountdown(countdownSeconds)}
          </div>
        )}
        <div className="flex-1 flex flex-row items-end justify-between sm:justify-center gap-0 sm:gap-6 lg:gap-10 pb-0 px-3 sm:px-[10%] sm:pb-6 min-h-[180px] sm:min-h-[240px]">
          <div className="flex sm:hidden flex-col justify-end gap-4">
            {HERO_LEFT_INDEXES.map((box, i) => {
              const leftBg = HERO_LEFT_BG[i % HERO_LEFT_BG.length];
              return (
                <Link
                  key={box.id}
                  to={box.to}
                  className={`dashboard-hero-box w-14 rounded-xl overflow-hidden bg-gradient-to-br ${leftBg} flex flex-col items-center cursor-pointer active:scale-95 transition`}
                >
                  <div className="w-full h-9 flex items-center justify-center">
                    <HeroBoxIcon box={box} emojiClassName="text-lg" iconClassName="w-7 h-7" />
                  </div>
                  <span className={HERO_LABEL_MOBILE}>{box.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="hidden sm:flex flex-col justify-end gap-2 sm:gap-3 sm:mb-6">
            {HERO_LEFT_INDEXES.map((box, i) => {
              const leftBg = HERO_LEFT_BG[i % HERO_LEFT_BG.length];
              return (
                <Link
                  key={box.id}
                  to={box.to}
                  className={`dashboard-hero-box w-[72px] md:w-[86px] rounded-[14px] overflow-hidden bg-gradient-to-br ${leftBg} flex flex-col items-center cursor-pointer active:scale-95 hover:scale-[1.02] transition`}
                >
                  <div className="w-full h-12 md:h-14 flex items-center justify-center">
                    <HeroBoxIcon box={box} emojiClassName="text-xl md:text-2xl" iconClassName="w-9 h-9 md:w-11 md:h-11" />
                  </div>
                  <div className={HERO_LABEL_DESKTOP}>{box.label}</div>
                </Link>
              );
            })}
          </div>
          <div className="flex flex-col items-center flex-shrink-0 mx-4 sm:mx-6 lg:mx-60">
            <div className="text-7xl sm:text-8xl md:text-[7.5rem] leading-none dashboard-mascot-float drop-shadow-lg" style={{ filter: 'drop-shadow(0 0 30px rgba(255,215,0,0.5)) drop-shadow(0 10px 20px rgba(0,0,0,0.8))' }}>
              🍀
            </div>
            <div className="w-28 h-4 rounded-full bg-black/50 -mt-1 dashboard-mascot-shadow" aria-hidden style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.5), transparent 70%)' }} />
          </div>
          <div className="flex sm:hidden flex-col justify-end gap-4">
            {HERO_RIGHT_INDEXES.map((box, i) => {
              const rightBg = HERO_RIGHT_BG[i % HERO_RIGHT_BG.length];
              return (
                <Link
                  key={box.id}
                  to={box.to}
                  className={`dashboard-hero-box w-14 rounded-xl overflow-hidden bg-gradient-to-br ${rightBg} flex flex-col items-center cursor-pointer active:scale-95 transition`}
                >
                  <div className="w-full h-9 flex items-center justify-center">
                    <HeroBoxIcon box={box} emojiClassName="text-lg" iconClassName="w-7 h-7" />
                  </div>
                  <span className={HERO_LABEL_MOBILE}>{box.label}</span>
                  {box.id === 'spinwheel' && showSpinReady && (
                    <div className="w-full bg-black/90 text-[9px] font-bold text-[var(--dash-gold)] text-center py-0.5">READY</div>
                  )}
                </Link>
              );
            })}
          </div>
          <div className="hidden sm:flex flex-col justify-end gap-2 sm:gap-3 sm:mb-6">
            {HERO_RIGHT_INDEXES.map((box, i) => {
              const rightBg = HERO_RIGHT_BG[i % HERO_RIGHT_BG.length];
              return (
                <Link
                  key={box.id}
                  to={box.to}
                  className={`dashboard-hero-box w-[72px] md:w-[86px] rounded-[14px] overflow-hidden bg-gradient-to-br ${rightBg} flex flex-col items-center cursor-pointer active:scale-95 hover:scale-[1.02] transition`}
                >
                  <div className="w-full h-12 md:h-14 flex items-center justify-center">
                    <HeroBoxIcon box={box} emojiClassName="text-xl md:text-2xl" iconClassName="w-9 h-9 md:w-11 md:h-11" />
                  </div>
                  <div className={HERO_LABEL_DESKTOP}>{box.label}</div>
                  {box.id === 'spinwheel' && showSpinReady && (
                    <div className="w-full bg-black/90 text-[10px] font-bold text-[var(--dash-gold)] text-center py-1">READY</div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

