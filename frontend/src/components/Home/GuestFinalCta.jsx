import { Link } from 'react-router-dom';

const SIGNUP_TO = '/register';

/**
 * Inspo final CTA strip before the footer — guest home only.
 */
export function GuestFinalCta() {
  return (
    <section className="dash-final-cta dash-animate-in" aria-label="Create account">
      <h2 className="dash-final-cta-title">
        One account. <em>20+ platforms + instant casino.</em>
      </h2>
      <p className="dash-final-cta-copy">
        Get 2 SC free on signup — no purchase necessary, free to join, instant access.
      </p>
      <Link to={SIGNUP_TO} className="dash-final-cta-btn">
        🎁 Create Free Account
      </Link>
    </section>
  );
}
