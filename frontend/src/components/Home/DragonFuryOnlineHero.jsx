import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { site } from '../../config/site';

const JACKPOTS = [
  { id: 'grand', label: 'Grand', start: 2100829.54, step: 0.37 },
  { id: 'major', label: 'Major', start: 555517.71, step: 0.21 },
  { id: 'minor', label: 'Minor', start: 160791.96, step: 0.13 },
  { id: 'mini', label: 'Mini', start: 57651.66, step: 0.07 },
];

function formatJackpot(n) {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function DragonFuryOnlineHero() {
  const { search } = useLocation();
  const registerPath = `/register${search || ''}`;
  const loginPath = `/login${search || ''}`;
  const [amounts, setAmounts] = useState(() => JACKPOTS.map((j) => j.start));

  useEffect(() => {
    const id = window.setInterval(() => {
      setAmounts((prev) => prev.map((value, i) => value + JACKPOTS[i].step));
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  const logo = useMemo(() => site.logoUrl || '/logo.webp', []);

  return (
    <section className="df-online-hero" aria-label="DragonFury welcome">
      <div className="df-online-hero__inner">
        <img
          className="df-online-hero__logo"
          src={logo}
          alt={site.platformName || 'DragonFury'}
          width={460}
          height={348}
          decoding="async"
          fetchPriority="high"
        />
        <p className="df-online-hero__tagline">
          Dragon Fury is the game platform featured here. Browse its listed games; use
          DragonFury.casino for your player account, wallet tools and support.
        </p>
        <div className="df-jackpots" role="group" aria-label="Jackpot marquee">
          {JACKPOTS.map((jackpot, i) => (
            <div key={jackpot.id} className={`df-jackpot df-jackpot--${jackpot.id}`}>
              <span className="df-jackpot__bulbs" aria-hidden />
              <span className="df-jackpot__label">{jackpot.label}</span>
              <span className="df-jackpot__amount">
                <span className="df-jackpot__currency">$</span>
                {formatJackpot(amounts[i])}
              </span>
            </div>
          ))}
        </div>
        <div className="df-online-hero__cta">
          <Link to={registerPath} className="df-pill df-pill--signup">
            <span>Sign Up</span>
          </Link>
          <Link to={loginPath} className="df-pill df-pill--login">
            <span>Login</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
