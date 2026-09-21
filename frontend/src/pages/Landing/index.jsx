import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { site } from '../../config/site';
import './landing-fury-lobby.css';

const PLATFORMS = [
  { title: 'CashMachine777', image: '/optimized/games/cashmachine777.webp', tag: 'hot' },
  { title: 'Egame99', image: '/optimized/games/egame99.webp', tag: 'new' },
  { title: 'Firekirin', image: '/optimized/games/firekirin.webp', tag: 'hot' },
  { title: 'Gameroom', image: '/optimized/games/gameroom.webp', tag: 'slots' },
  { title: 'Gamevault', image: '/optimized/games/gamevault.webp', tag: 'hot' },
  { title: 'Golden Dragon', image: '/optimized/games/goldendragon.webp', tag: 'fish' },
  { title: 'Juwa', image: '/optimized/games/juwa.webp', tag: 'hot' },
  { title: 'Juwa 2.0', image: '/optimized/games/juwa2.0.webp', tag: 'new' },
  { title: 'Mafia', image: '/games/mafia.webp', tag: 'slots' },
  { title: 'Milkyway', image: '/optimized/games/milkyway.webp', tag: 'slots' },
  { title: 'Orionstars', image: '/optimized/games/orionstars.webp', tag: 'hot' },
  { title: 'Pandamasters', image: '/optimized/games/pandamaster.webp', tag: 'fish' },
  { title: 'Riversweeps', image: '/optimized/games/riversweeps.webp', tag: 'slots' },
  { title: 'Ultra Panda', image: '/optimized/games/ultrapanda.webp', tag: 'fish' },
  { title: 'Vblink', image: '/optimized/games/vblink.webp', tag: 'new' },
  { title: 'Vegasx', image: '/optimized/games/vegasx.webp', tag: 'slots' },
];

const CATEGORIES = [
  { id: 'hot', label: 'Fury Picks', icon: 'flame' },
  { id: 'slots', label: 'Slots', icon: 'slots' },
  { id: 'fish', label: 'Fish', icon: 'fish' },
  { id: 'platforms', label: 'Platforms', icon: 'grid' },
  { id: 'spin', label: 'Daily Spin', icon: 'spin' },
  { id: 'rewards', label: 'Rewards', icon: 'gift' },
];

const LIVE_DROPS = [
  { user: 'Kai R.', amt: '$420', game: 'Firekirin' },
  { user: 'Nora P.', amt: '$188', game: 'Golden Dragon' },
  { user: 'Dex T.', amt: '$75', game: 'Juwa 2.0' },
  { user: 'Mia L.', amt: '$310', game: 'Orionstars' },
];

function DragonMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <path
        d="M32 4c8 10 20 14 26 28-6 4-12 6-18 6 4 8 4 16 0 22-8-6-14-8-16-8s-8 2-16 8c-4-6-4-14 0-22-6 0-12-2-18-6C12 18 24 14 32 4Z"
        fill="#B6FF2A"
      />
      <path d="M24 30h6l2 8-5 3-3-11Z" fill="#0A0C0A" />
      <path d="M40 30h-6l-2 8 5 3 3-11Z" fill="#0A0C0A" />
      <circle cx="26.5" cy="28" r="2.2" fill="#0A0C0A" />
      <circle cx="37.5" cy="28" r="2.2" fill="#0A0C0A" />
    </svg>
  );
}

function Icon({ name }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (name === 'flame') {
    return (
      <svg {...common}>
        <path d="M12 3c2 4-1 5 1 9 3-2 6-1 6 4a7 7 0 1 1-14 0c0-5 4-7 7-13Z" />
      </svg>
    );
  }
  if (name === 'slots') {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M8 5v14M16 5v14M4 10h16" />
      </svg>
    );
  }
  if (name === 'fish') {
    return (
      <svg {...common}>
        <path d="M3 12s5-7 12-7c4 0 6 3 6 7s-2 7-6 7c-7 0-12-7-12-7Z" />
        <circle cx="16" cy="12" r="1.2" fill="currentColor" />
        <path d="M3 12l4-3v6L3 12Z" />
      </svg>
    );
  }
  if (name === 'grid') {
    return (
      <svg {...common}>
        <rect x="4" y="4" width="6" height="6" rx="1" />
        <rect x="14" y="4" width="6" height="6" rx="1" />
        <rect x="4" y="14" width="6" height="6" rx="1" />
        <rect x="14" y="14" width="6" height="6" rx="1" />
      </svg>
    );
  }
  if (name === 'spin') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 4a8 8 0 0 1 8 8" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    );
  }
  if (name === 'gift') {
    return (
      <svg {...common}>
        <rect x="4" y="11" width="16" height="9" rx="1" />
        <path d="M12 7v13M4 11h16" />
        <path d="M12 11c-3-5-7-5-7-2s3 3 7 2Z" />
        <path d="M12 11c3-5 7-5 7-2s-3 3-7 2Z" />
      </svg>
    );
  }
  if (name === 'search') {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16.5 16.5 21 21" />
      </svg>
    );
  }
  if (name === 'home') {
    return (
      <svg {...common}>
        <path d="M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9Z" />
      </svg>
    );
  }
  return null;
}

function GameCard({ game, to, featured }) {
  return (
    <Link to={to} className={`df-card${featured ? ' df-card--featured' : ''}`} draggable={false}>
      <span className="df-card-art">
        <img src={game.image} alt="" loading="lazy" decoding="async" draggable={false} />
      </span>
      <span className="df-card-name">{game.title}</span>
    </Link>
  );
}

function Rail({ title, games, to, action }) {
  if (!games.length) return null;
  return (
    <section className="df-rail">
      <div className="df-rail-head">
        <h2>{title}</h2>
        {action || (
          <Link to={to} className="df-view-all">
            View all
          </Link>
        )}
      </div>
      <div className="df-rail-track" role="list">
        {games.map((game) => (
          <GameCard key={game.title} game={game} to={to} />
        ))}
      </div>
    </section>
  );
}

export function Landing() {
  const { isAuthenticated } = useAuth();
  const [category, setCategory] = useState('hot');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const loginTo = isAuthenticated ? '/' : '/login';
  const signupTo = isAuthenticated ? '/' : '/register';
  const spinTo = isAuthenticated ? '/spinwheel' : '/register';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLATFORMS.filter((game) => !q || game.title.toLowerCase().includes(q));
  }, [query]);

  const hot = filtered.filter((g) => g.tag === 'hot');
  const slots = filtered.filter((g) => g.tag === 'slots' || g.tag === 'new');
  const fish = filtered.filter((g) => g.tag === 'fish');
  const featured = filtered[0] || PLATFORMS[0];
  const sideA = filtered[1] || PLATFORMS[1];
  const sideB = filtered[5] || PLATFORMS[5];

  const onCategory = (id) => {
    setCategory(id);
    if (id === 'spin') {
      document.getElementById('df-daily')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const map = { hot: 'df-hot', slots: 'df-slots', fish: 'df-fish', platforms: 'df-platforms', rewards: 'df-rewards' };
    document.getElementById(map[id])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="df-root">
      <div className="df-glow" aria-hidden />
      <div className="df-watermark" aria-hidden>
        FURY
      </div>

      <aside className="df-rail-nav" aria-label="Browse">
        {CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`df-rail-btn${category === item.id ? ' is-active' : ''}`}
            onClick={() => onCategory(item.id)}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </aside>

      <div className="df-shell">
        <header className="df-top">
          <Link to="/" className="df-brand" aria-label={site.platformName}>
            <DragonMark />
            <span className="df-brand-text">
              <b>DRAGON</b>
              <em>FURY</em>
            </span>
          </Link>

          <label className={`df-search${searchOpen ? ' is-open' : ''}`}>
            <Icon name="search" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setSearchOpen(false)}
              placeholder="Search platforms"
              aria-label="Search platforms"
            />
          </label>

          <div className="df-top-actions">
            <Link to={spinTo} className="df-icon-btn" aria-label="Daily spin">
              <Icon name="gift" />
            </Link>
            {isAuthenticated ? (
              <Link to="/" className="df-btn df-btn--green">
                Play now
              </Link>
            ) : (
              <>
                <Link to={loginTo} className="df-btn df-btn--ghost">
                  Sign in
                </Link>
                <Link to={signupTo} className="df-btn df-btn--green">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </header>

        <nav className="df-chips" aria-label="Categories">
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`df-chip${category === item.id ? ' is-active' : ''}`}
              onClick={() => onCategory(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>

        <section className="df-stage" aria-label="Featured">
          <Link to={signupTo} className="df-hero">
            <img src={featured.image} alt="" />
            <div className="df-hero-copy">
              <p>Tonight’s drop</p>
              <h1>{featured.title}</h1>
              <span>Join free · play instantly</span>
            </div>
          </Link>
          <div className="df-stage-side">
            <Link to={spinTo} className="df-promo df-promo--spin" id="df-daily">
              <span>Daily Fury</span>
              <strong>Free spin</strong>
              <em>Claim a bonus spin every day</em>
            </Link>
            <Link to={signupTo} className="df-promo df-promo--welcome">
              <img src={sideA.image} alt="" />
              <div>
                <span>New player pack</span>
                <strong>{sideA.title}</strong>
              </div>
            </Link>
            <Link to={signupTo} className="df-promo df-promo--fish">
              <img src={sideB.image} alt="" />
              <div>
                <span>Fish tables</span>
                <strong>{sideB.title}</strong>
              </div>
            </Link>
          </div>
        </section>

        <div className="df-ticker" aria-hidden>
          <div className="df-ticker-track">
            {[...LIVE_DROPS, ...LIVE_DROPS].map((drop, i) => (
              <span key={`${drop.user}-${i}`}>
                <b>LIVE</b> {drop.user} hit {drop.amt} on {drop.game}
              </span>
            ))}
          </div>
        </div>

        <div id="df-hot">
          <Rail title="Fury picks" games={hot} to={signupTo} />
        </div>
        <div id="df-slots">
          <Rail title="Slot rooms" games={slots} to={signupTo} />
        </div>
        <div id="df-fish">
          <Rail title="Fish hunts" games={fish} to={signupTo} />
        </div>

        <section id="df-platforms" className="df-platforms">
          <div className="df-rail-head">
            <h2>All platforms</h2>
            <Link to={signupTo} className="df-view-all">
              Play all
            </Link>
          </div>
          <div className="df-platform-grid">
            {filtered.map((game) => (
              <GameCard key={`all-${game.title}`} game={game} to={signupTo} />
            ))}
          </div>
        </section>

        <section id="df-rewards" className="df-stats">
          <article>
            <strong>50K+</strong>
            <span>Players in the pit</span>
          </article>
          <article>
            <strong>Fast</strong>
            <span>Cashout windows</span>
          </article>
          <article>
            <strong>18+</strong>
            <span>Play responsible</span>
          </article>
        </section>

        <footer className="df-foot">
          <Link to="/" className="df-brand df-brand--foot">
            <DragonMark size={28} />
            <span className="df-brand-text">
              <b>DRAGON</b>
              <em>FURY</em>
            </span>
          </Link>
          <div className="df-foot-links">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/help">Help</Link>
            <Link to="/faq">FAQ</Link>
          </div>
          <p>
            {site.platformName} is a free sweepstakes platform. No purchase necessary. Must be 18+.
            Void where prohibited. Play responsibly.
          </p>
          <small>
            © {site.year} {site.platformName}
          </small>
        </footer>
      </div>

      <nav className="df-dock" aria-label="Mobile">
        <button type="button" className="is-active" onClick={() => onCategory('hot')}>
          <Icon name="home" />
          Home
        </button>
        <button type="button" onClick={() => onCategory('slots')}>
          <Icon name="slots" />
          Slots
        </button>
        <Link to={spinTo} className="df-dock-center" aria-label="Daily spin">
          <Icon name="spin" />
        </Link>
        <button type="button" onClick={() => onCategory('fish')}>
          <Icon name="fish" />
          Fish
        </button>
        <Link to={signupTo}>
          <Icon name="gift" />
          Join
        </Link>
      </nav>
    </div>
  );
}

export default Landing;
