import { Link } from 'react-router-dom';

const SIGNUP_TO = '/register';

/**
 * Inspo final CTA strip before the footer — guest home only.
 */
export function GuestFinalCta() {
  return (
    <section className="dash-final-cta dash-animate-in" aria-label="Create account">
      <h2 className="dash-final-cta-title">
        Ready to play? <em>Create a free account.</em>
      </h2>
      <p className="dash-final-cta-copy">
        2 SC on signup. Spin, platforms, and instant casino — one login.
      </p>
      <Link to={SIGNUP_TO} className="dash-final-cta-btn">
        Join Dragon Fury
      </Link>
    </section>
  );
}
