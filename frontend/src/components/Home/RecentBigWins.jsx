import { useEffect, useMemo, useRef, useState } from 'react';
import { scheduleAfterLoad } from '../../utils/scheduleAfterLoad';
import { STORE_CODE } from '../../config/site';
import { createPrefixDeck } from '../../utils/storeWinnerNames';

/* ── Static win data using real game images from /public/games/ ──────────────
   Each entry maps to an actual .webp file already in the project.
   Win amounts are realistic-looking values seeded per game.
────────────────────────────────────────────────────────────────────────────── */
const BIG_WIN_ENTRIES = [
  { id: 'mw1',  name: 'Milky Way',     image: '/optimized/games/milkyway.webp',      amount: '243' },
  { id: 'os1',  name: 'Orion Stars',   image: '/optimized/games/orionstars.webp',    amount: '472' },
  { id: 'pm1',  name: 'Panda Master',  image: '/optimized/games/pandamaster.webp',   amount: '136' },
  { id: 'vx1',  name: 'Vegas X',       image: '/optimized/games/vegasx.webp',        amount: '668' },
  { id: 'cm1',  name: 'Cash Machine',  image: '/optimized/games/cashmachine777.webp',amount: '561' },
  { id: 'gd1',  name: 'Golden Dragon', image: '/optimized/games/goldendragon.webp',  amount: '493' },
  { id: 'fk1',  name: 'Fire Kirin',    image: '/optimized/games/firekirin.webp',     amount: '709' },
  { id: 'gr1',  name: 'Gameroom',      image: '/optimized/games/gameroom.webp',      amount: '857' },
  { id: 'gv1',  name: 'Game Vault',    image: '/optimized/games/gamevault.webp',     amount: '458' },
  { id: 'jw1',  name: 'Juwa',          image: '/optimized/games/juwa.webp',          amount: '289' },
  { id: 'j2',   name: 'Juwa 2.0',      image: '/optimized/games/juwa2.0.webp',       amount: '296' },
  { id: 'up1',  name: 'Ultra Panda',   image: '/optimized/games/ultrapanda.webp',    amount: '374' },
  { id: 'rs1',  name: 'River Sweeps',  image: '/optimized/games/riversweeps.webp',   amount: '513' },
  { id: 'vb1',  name: 'VBlink',        image: '/optimized/games/vblink.webp',        amount: '184' },
  { id: 'eg1',  name: 'Egame 99',      image: '/optimized/games/egame99.webp',       amount: '625' },
  { id: 'mw2',  name: 'Milky Way',     image: '/optimized/games/milkyway.webp',      amount: '931' },
  { id: 'os2',  name: 'Orion Stars',   image: '/optimized/games/orionstars.webp',    amount: '339' },
  { id: 'fk2',  name: 'Fire Kirin',    image: '/optimized/games/firekirin.webp',     amount: '448' },
  { id: 'jw2',  name: 'Juwa',          image: '/optimized/games/juwa.webp',          amount: '763' },
  { id: 'gv2',  name: 'Game Vault',    image: '/optimized/games/gamevault.webp',     amount: '220' },
];

const TICKER_SPEED = 0.55; // px per animation frame

function withStorePlayerNames(entries) {
  const deck = createPrefixDeck(STORE_CODE);
  return entries.map((entry) => ({
    ...entry,
    username: `${deck.nextUniqueInBatch()}****`,
  }));
}

export function RecentBigWins({ variant = 'cards' }) {
  const namedEntries = useMemo(() => withStorePlayerNames(BIG_WIN_ENTRIES), []);
  const trackRef  = useRef(null);
  const offsetRef = useRef(0);
  const rafRef    = useRef(null);
  const pausedRef = useRef(false);

  /* Infinite auto-scroll — cache half-width to avoid forced reflow every frame */
  useEffect(() => {
    if (variant === 'lobby') return undefined;
    const track = trackRef.current;
    if (!track) return undefined;

    let half = 0;
    const measure = () => {
      half = track.scrollWidth / 2;
    };
    measure();

    let loopOn = false;
    let allowMotion = false;
    function tick() {
      if (!loopOn) {
        rafRef.current = 0;
        return;
      }
      if (!pausedRef.current && half > 0) {
        offsetRef.current += TICKER_SPEED;
        if (offsetRef.current >= half) offsetRef.current = 0;
        track.style.transform = `translateX(-${offsetRef.current}px)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    const startLoop = () => {
      if (!allowMotion || loopOn) return;
      loopOn = true;
      rafRef.current = requestAnimationFrame(tick);
    };

    const stopLoop = () => {
      loopOn = false;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    const onResize = () => {
      measure();
      if (half > 0 && offsetRef.current >= half) offsetRef.current = 0;
    };
    window.addEventListener('resize', onResize);

    const syncLoop = (active) => {
      if (active && document.visibilityState === 'visible') startLoop();
      else stopLoop();
    };

    const onVisibility = () => {
      syncLoop(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', onVisibility);

    const section = track.closest('.rbw-section');
    const io =
      typeof IntersectionObserver !== 'undefined' && section
        ? new IntersectionObserver(
            (entries) => {
              const visible = entries.some((entry) => entry.isIntersecting);
              syncLoop(visible);
            },
            { threshold: 0.01 }
          )
        : null;
    if (section) io?.observe(section);

    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(track);

    const cancelSchedule = scheduleAfterLoad(() => {
      allowMotion = true;
      syncLoop(document.visibilityState === 'visible');
    });

    return () => {
      cancelSchedule();
      stopLoop();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      io?.disconnect();
      ro?.disconnect();
    };
  }, [variant]);

  /* Duplicate list for seamless looping */
  const doubled = [...namedEntries, ...namedEntries];

  if (variant === 'lobby') {
    return (
      <div className="lobby-win-ticker" aria-label="Winning now">
        <div className="lobby-win-ticker-live">
          <span className="lobby-win-ticker-pulse" aria-hidden />
          Winning now
        </div>
        <div className="lobby-win-ticker-marquee">
          <div className="lobby-win-ticker-track">
            {doubled.map((entry, index) => {
              const username = entry.username || `${entry.name.replace(/\s+/g, '').slice(0, 4)}****`;
              return (
                <span key={`${entry.id}-${index}`}>
                  {username} won <b>{entry.amount} SC</b>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="rbw-section" aria-label="Recent Big Wins">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="rbw-head">
        {/* Pulsing red live-dot */}
        <span style={{ position: 'relative', width: '10px', height: '10px', flexShrink: 0, display: 'inline-flex' }}>
          <span style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            background: '#ff2244', animation: 'rbwPing 1.4s ease-out infinite',
          }} />
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#ff2244' }} />
        </span>
        <h2 className="rbw-title">
          Recent Big Wins
        </h2>
      </div>

      {/* ── Scrolling ticker track ───────────────────────────── */}
      <div
        className="rbw-viewport"
        onMouseEnter={() => { pausedRef.current = true; }}
        onMouseLeave={() => { pausedRef.current = false; }}
        onTouchStart={() => { pausedRef.current = true; }}
        onTouchEnd={() => { pausedRef.current = false; }}
      >
        <div ref={trackRef} className="rbw-track">
          {doubled.map((entry, idx) => (
            <WinCard key={`${entry.id}-${idx}`} entry={entry} />
          ))}
        </div>
      </div>

      {/* Scoped keyframe animations */}
      <style>{`
        @keyframes rbwPing {
          0%   { transform: scale(1);   opacity: 1; }
          70%  { transform: scale(2.4); opacity: 0; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes rbwShine {
          0%   { left: -80%; }
          55%  { left: 130%; }
          100% { left: 130%; }
        }
      `}</style>
    </section>
  );
}

/* ── Win Card sub-component ─────────────────────────────────────────────── */
function WinCard({ entry }) {
  const [hovered, setHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  /* Masked username: first 4 chars of name + **** */
  const username = entry.username || `${entry.name.replace(/\s+/g, '').slice(0, 4)}****`;

  return (
    <div
      className={`rbw-card${hovered ? ' rbw-card--hovered' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Game thumbnail */}
      <div className="rbw-card-thumb">
        {!imgError ? (
          <img
            src={entry.image}
            alt={entry.name}
            width={58}
            height={52}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              transition: 'transform 0.3s ease',
              transform: hovered ? 'scale(1.08)' : 'scale(1)',
            }}
          />
        ) : (
          /* Fallback if image fails to load */
          <div style={{
            width: '100%', height: '100%',
            background: 'linear-gradient(135deg, #1a1f3a, #0d1020)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '24px',
          }}>
            🎰
          </div>
        )}

        {/* Shine sweep on hover */}
        {hovered && (
          <div style={{
            position: 'absolute', top: 0, width: '40%', height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)',
            animation: 'rbwShine 0.55s ease forwards',
            pointerEvents: 'none',
          }} />
        )}

        {/* Bottom gradient for text legibility */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%',
          background: 'linear-gradient(transparent, rgba(4,6,14,0.88))',
          pointerEvents: 'none',
        }} />

        {/* Top gold accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
          background: 'linear-gradient(90deg, transparent, rgba(245,196,81,0.7), transparent)',
          opacity: hovered ? 1 : 0.5,
          transition: 'opacity 0.2s',
        }} />
      </div>

      {/* Username + win amount */}
      <div className="rbw-card-meta">
        <div className="rbw-card-user">{username}</div>
        <div className="rbw-card-amount">
          {entry.amount}
          <span className="rbw-card-amount-unit">{'\u00a0'}SC</span>
        </div>
      </div>
    </div>
  );
}
