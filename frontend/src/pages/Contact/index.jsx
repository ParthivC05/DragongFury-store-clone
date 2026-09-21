import { Link } from 'react-router-dom';
import { usePageContentReady } from '../../context/PageReadyContext';
import { site } from '../../config/site';
import { openIntercomChat } from '../../components/intercomApi';
import '../Games/SeoGames.css';

export function ContactPage() {
  usePageContentReady(true);

  return (
    <div className="pj-seo-games">
      <nav className="pj-seo-crumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">/</span>
        <span>Contact</span>
      </nav>
      <header className="pj-seo-head">
        <p className="pj-seo-label">Support</p>
        <h1 className="pj-seo-title">Contact {site.platformName}</h1>
        <p className="pj-seo-lead">
          Reach customer support via live chat, email, or the help center. Use official channels
          only, and never share your login details.
        </p>
      </header>
      <ul className="pj-seo-contact-list">
        <li>
          Email:{' '}
          <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
        </li>
        <li>
          Help center: <Link to="/help">dragonfury.com/help</Link>
        </li>
        <li>
          FAQ: <Link to="/faq">dragonfury.com/faq</Link>
        </li>
      </ul>
      <div className="pj-seo-actions">
        <button type="button" className="pj-seo-btn pj-seo-btn-primary" onClick={openIntercomChat}>
          Open live chat
        </button>
        <Link to="/help" className="pj-seo-btn">
          Help center
        </Link>
      </div>
    </div>
  );
}
