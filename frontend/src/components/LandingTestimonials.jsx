import { site } from '../config/site';

const TESTIMONIALS = [
  {
    id: 't1',
    name: 'Marcus T.',
    location: 'Phoenix, AZ',
    quote: `I signed up on ${site.platformName} in under two minutes. Hit a solid session on Juwa and cashed out the same week.`,
    badge: '512 SC WON',
    avatar: 'M',
    gradient: 'linear-gradient(135deg, #8b5cf6, #4c1d95)',
  },
  {
    id: 't2',
    name: 'Priya K.',
    location: 'Austin, TX',
    quote: 'Love the daily spin and how fast the lobby loads on my phone. Feels like a real casino app.',
    badge: 'DAILY PLAYER',
    avatar: 'P',
    gradient: 'linear-gradient(135deg, #f472b6, #9d174d)',
  },
  {
    id: 't3',
    name: 'Carlos R.',
    location: 'Miami, FL',
    quote: 'Support answered in minutes when I had a question. Deposits and redemptions were straightforward.',
    badge: '24/7 SUPPORT',
    avatar: 'C',
    gradient: 'linear-gradient(135deg, #22d3ee, #155e75)',
  },
  {
    id: 't4',
    name: 'Dana L.',
    location: 'Denver, CO',
    quote: 'Huge game selection — fish, casino, sweepstakes titles. I keep finding new platforms to try.',
    badge: '20+ GAMES',
    avatar: 'D',
    gradient: 'linear-gradient(135deg, #4ade80, #15803d)',
  },
  {
    id: 't5',
    name: 'Sam W.',
    location: 'Seattle, WA',
    quote: 'Referral bonus was a nice surprise. My friends joined and we all play on the same lobby now.',
    badge: 'REFER & EARN',
    avatar: 'S',
    gradient: 'linear-gradient(135deg, #ffd75e, #b07c00)',
  },
  {
    id: 't6',
    name: 'Mia F.',
    location: 'Orlando, FL',
    quote: 'The welcome bonus got me started without any purchase. Spin wheel and promos keep it fun.',
    badge: 'FREE TO JOIN',
    avatar: 'M',
    gradient: 'linear-gradient(135deg, #fb923c, #9a3412)',
  },
];

const STATS = [
  { value: '4.9', label: 'AVG. RATING' },
  { value: '50K+', label: 'ACTIVE PLAYERS' },
  { value: '24/7', label: 'LIVE SUPPORT' },
  { value: '20+', label: 'GAME PROVIDERS' },
];

function TestimonialCard({ item }) {
  return (
    <article className="dash-quote-card">
      <div className="dash-quote-top">
        <div className="dash-quote-avatar" style={{ background: item.gradient }} aria-hidden>
          {item.avatar}
        </div>
        <div className="dash-quote-who">
          <b>{item.name}</b>
          <span>{item.location}</span>
        </div>
        <span className="dash-quote-badge">{item.badge}</span>
      </div>
      <div className="dash-quote-stars" aria-hidden>
        ★★★★★
      </div>
      <p>&ldquo;{item.quote}&rdquo;</p>
    </article>
  );
}

/** Inspo testimonials grid + stats row. */
export function LandingTestimonials() {
  return (
    <section
      id="lp-sec-testimonials"
      className="dash-testimonials-section dash-animate-in"
      aria-labelledby="dash-testimonials-title"
    >
      <div className="dash-testimonials-head">
        <p className="dash-testimonials-kick">REAL PLAYERS · REAL WINS</p>
        <h2 id="dash-testimonials-title" className="dash-testimonials-title">
          What players say about {site.platformName}
        </h2>
      </div>

      <div className="dash-quotes-grid">
        {TESTIMONIALS.map((item) => (
          <TestimonialCard key={item.id} item={item} />
        ))}
      </div>

      <div className="dash-testimonials-stats" aria-hidden>
        {STATS.map((stat) => (
          <div key={stat.label} className="dash-testimonial-stat">
            <b>{stat.value}</b>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
