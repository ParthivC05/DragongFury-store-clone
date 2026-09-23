import { Link } from 'react-router-dom';
import { usePageContentReady } from '../../context/PageReadyContext';
import { site } from '../../config/site';
import { SEO_FAQ } from '../../constants/landingFaq';
import { openIntercomChat } from '../../components/intercomApi';
import '../Games/SeoGames.css';
import '../df-content-pages.css';

export function FaqPage() {
  usePageContentReady(true);

  return (
    <div className="df-content-page">
      <div className="df-content-card">
        <nav className="df-content-crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span>FAQ</span>
        </nav>
        <span className="df-content-badge">Help</span>
        <h1 className="df-content-title">Frequently asked questions</h1>
        <p className="df-content-lead">
          Answers about free play, Sweepstakes Coins, redemption, eligibility, and support on{' '}
          {site.platformName}.
        </p>
        <section className="pj-seo-faq" aria-label="FAQ">
          {SEO_FAQ.map((item) => (
            <div key={item.q} className="pj-seo-faq-item">
              <h2>{item.q}</h2>
              <p>{item.a}</p>
            </div>
          ))}
        </section>
        <div className="df-content-actions">
          <button type="button" className="df-content-btn" onClick={openIntercomChat}>
            Open live chat
          </button>
          <Link to="/contact" className="df-content-btn df-content-btn--ghost">
            Contact support
          </Link>
        </div>
      </div>
    </div>
  );
}
