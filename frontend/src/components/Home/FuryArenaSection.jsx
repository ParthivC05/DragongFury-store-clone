import { Link } from 'react-router-dom';

const SIGNUP_TO = '/register';

const FEATURES = [
  {
    id: 'spin',
    kick: 'Daily drop',
    title: 'Spin the wheel',
    text: 'One free bonus spin on your schedule. Prizes shown before you tap.',
    href: '#spin',
  },
  {
    id: 'platforms',
    kick: '20+ titles',
    title: 'Game platforms',
    text: 'Golden Dragon, Juwa, Firekirin, Orion Stars — one Dragon Fury login.',
    href: '#games',
  },
  {
    id: 'casino',
    kick: 'No download',
    title: 'Instant casino',
    text: 'Slots and fishing games in the browser. Same SC wallet.',
    href: '#casino',
  },
  {
    id: 'cash',
    kick: 'Fast out',
    title: 'Same-day cashout',
    text: 'Withdraw SC when you win. Cards, Cash App, crypto, and bank.',
    href: SIGNUP_TO,
  },
];

export function FuryArenaSection() {
  return (
    <section className="dash-fury-arena dash-animate-in" aria-label="Dragon Fury features">
      <div className="dash-fury-arena-head">
        <p className="dash-fury-arena-kick">The lobby</p>
        <h2 className="dash-fury-arena-title">Play. Spin. Cash out.</h2>
      </div>
      <div className="dash-fury-arena-grid">
        {FEATURES.map((feature) => {
          const inner = (
            <>
              <p>{feature.kick}</p>
              <h3>{feature.title}</h3>
              <span>{feature.text}</span>
            </>
          );
          if (feature.href.startsWith('#')) {
            return (
              <a key={feature.id} href={feature.href} className={`dash-fury-arena-card dash-fury-arena-card--${feature.id}`}>
                {inner}
              </a>
            );
          }
          return (
            <Link key={feature.id} to={feature.href} className={`dash-fury-arena-card dash-fury-arena-card--${feature.id}`}>
              {inner}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
