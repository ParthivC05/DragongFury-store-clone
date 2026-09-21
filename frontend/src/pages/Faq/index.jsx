import { Link } from 'react-router-dom';
import { usePageContentReady } from '../../context/PageReadyContext';
import { site } from '../../config/site';
import { SEO_FAQ } from '../../constants/landingFaq';
import { openIntercomChat } from '../../components/intercomApi';
import '../Games/SeoGames.css';

export function FaqPage() {
  usePageContentReady(true);

  return (
    <div className="pj-seo-games">
      <nav className="pj-seo-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>FAQ</span>
      </nav>
      <header className="pj-seo-head">
        <p className="pj-seo-label">Help</p>
        <h1 className="pj-seo-title">Frequently asked questions</h1>
        <p className="pj-seo-lead">
          Answers about free play, Sweepstakes Coins, redemption, eligibility, and support on{' '}
          {site.platformName}.
        </p>
      </header>
      <section className="pj-seo-faq" aria-label="FAQ">
        {SEO_FAQ.map((item) => (
          <div key={item.q} className="pj-seo-faq-item">
            <h2>{item.q}</h2>
            <p>{item.a}</p>
          </div>
        ))}
      </section>
      <p className="pj-seo-lead" style={{ marginTop: '1.5rem' }}>
        Still need help?{' '}
        <button
          type="button"
          className="pj-seo-btn"
          onClick={openIntercomChat}
          style={{ marginLeft: '0.35rem' }}
        >
          Open live chat
        </button>
        {' '}
        or <Link to="/contact">contact support</Link>.
      </p>
    </div>
  );
}
