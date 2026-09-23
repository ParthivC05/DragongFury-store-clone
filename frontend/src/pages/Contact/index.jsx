import { Link } from 'react-router-dom';
import { usePageContentReady } from '../../context/PageReadyContext';
import { site } from '../../config/site';
import { openIntercomChat } from '../../components/intercomApi';
import '../Games/SeoGames.css';
import '../df-content-pages.css';

export function ContactPage() {
  usePageContentReady(true);

  return (
    <div className="df-content-page">
      <div className="df-content-card">
        <nav className="df-content-crumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span>Contact</span>
        </nav>
        <span className="df-content-badge">Support</span>
        <h1 className="df-content-title">Contact {site.platformName}</h1>
        <p className="df-content-lead">
          Reach customer support via live chat, email, or the help center. Use official channels
          only, and never share your login details.
        </p>
        <ul className="pj-seo-contact-list">
          <li>
            Email:{' '}
            <a href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>
          </li>
          <li>
            Help center: <Link to="/help">Help Center</Link>
          </li>
          <li>
            FAQ: <Link to="/faq">FAQ</Link>
          </li>
        </ul>
        <div className="df-content-actions">
          <button type="button" className="df-content-btn" onClick={openIntercomChat}>
            Open live chat
          </button>
          <Link to="/help" className="df-content-btn df-content-btn--ghost">
            Help center
          </Link>
        </div>
      </div>
    </div>
  );
}
