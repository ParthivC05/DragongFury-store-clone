import { site } from '../config/site';
import { LandingTestimonials } from './LandingTestimonials';
import { JOIN_REASONS } from '../constants/landingJoinReasons';
import { LANDING_FAQ } from '../constants/landingFaq';

/**
 * Guest home lower sections — why join, testimonials, FAQ (inspo order).
 * Top Players Live is in SpinWinSection; footer stays separate.
 */
export function LandingInfoSections() {
  return (
    <div className="dash-guest-lower">
      <section className="dash-join-reasons-section dash-animate-in" aria-labelledby="dash-join-reasons-title">
        <div className="dash-join-reasons-head">
          <p className="dash-join-reasons-kick">WHY {site.platformName.toUpperCase()}</p>
          <h2 id="dash-join-reasons-title" className="dash-join-reasons-title">
            More reasons to join
          </h2>
        </div>

        <div className="dash-join-reasons-grid">
          {JOIN_REASONS.map((reason) => (
            <article key={reason.id} className="dash-reason-card">
              <div
                className="dash-reason-icon"
                style={{ background: reason.gradient }}
                aria-hidden
              >
                {reason.emoji}
              </div>
              <h3>{reason.title}</h3>
              <p>{reason.text}</p>
            </article>
          ))}
        </div>
      </section>

      <LandingTestimonials />

      <section id="faq" className="dash-faq-section dash-animate-in" aria-labelledby="dash-faq-title">
        <div className="dash-faq-head">
          <p className="dash-faq-kick">GOT QUESTIONS?</p>
          <h2 id="dash-faq-title" className="dash-faq-title">
            Everything you need to know about {site.platformName}
          </h2>
        </div>

        <div className="dash-faq-list">
          {LANDING_FAQ.map((item) => (
            <details key={item.q} className="dash-faq-item">
              <summary>{item.q}</summary>
              <div className="dash-faq-answer">{item.a}</div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
