import { Link } from 'react-router-dom';
import { site } from '../config/site';
import { openSupportWidget } from './intercomApi';
import { SiteLogo } from './SiteLogo';
import { LandingSocialLinks } from './LandingSocialLinks';
import { useStoreFooter } from '../hooks/useStoreFooter';
import '../pages/Landing/landing-footer.css';

function footerPageHref(page) {
  if (page?.redirectPath) return page.redirectPath;
  return `/${encodeURIComponent(page.slug)}`;
}

function isExternalHref(href) {
  return /^https?:\/\//i.test(String(href || ''));
}

/**
 * Marketing footer: optional built-in Platforms / Support + CMS menus.
 * CMS links may be content pages (/{slug}) or redirects (/download or https://…).
 */
export function LandingFooter() {
  const { menus, showDefaultMenus } = useStoreFooter();
  const cmsMenus = menus.filter((m) => Array.isArray(m.pages) && m.pages.length > 0);

  return (
    <footer className="lp-footer-standalone">
      <div className="lp-s6-inner lp-footer-root">
        <div className="lp-footer-brandmark" aria-hidden>
          <SiteLogo variant="footer" />
        </div>

        <div className="lp-footer-cols">
          {showDefaultMenus && (
            <>
              <div className="lp-footer-col">
                <div className="lp-footer-col-head">Platforms</div>
                <Link to="/" className="lp-footer-col-link">
                  All Platforms
                </Link>
                <Link to="/games" className="lp-footer-col-link">
                  Our Games
                </Link>
                <Link to="/link2play" className="lp-footer-col-link">
                  Link2Play
                </Link>
              </div>
              <div className="lp-footer-col">
                <div className="lp-footer-col-head">Support</div>
                <Link to="/privacy" className="lp-footer-col-link">
                  Privacy Policy
                </Link>
                <Link to="/terms" className="lp-footer-col-link">
                  Terms &amp; Conditions
                </Link>
                <Link to="/faq" className="lp-footer-col-link">
                  FAQ
                </Link>
                <Link to="/contact" className="lp-footer-col-link">
                  Contact
                </Link>
                <Link to="/help" className="lp-footer-col-link">
                  Help Center
                </Link>
                <Link to="/blog" className="lp-footer-col-link">
                  Blog
                </Link>
                <button
                  type="button"
                  onClick={openSupportWidget}
                  className="lp-footer-col-link bg-transparent border-0 text-left cursor-pointer p-0 font-normal hover:text-white"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                >
                  Support
                </button>
              </div>
            </>
          )}

          {cmsMenus.map((menu) => (
            <div key={menu.id || menu.label} className="lp-footer-col">
              <div className="lp-footer-col-head">{menu.label}</div>
              {(menu.pages || []).map((page) => {
                const href = footerPageHref(page);
                if (isExternalHref(href)) {
                  return (
                    <a
                      key={page.id || page.slug}
                      href={href}
                      className="lp-footer-col-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {page.title}
                    </a>
                  );
                }
                return (
                  <Link
                    key={page.id || page.slug}
                    to={href}
                    className="lp-footer-col-link"
                  >
                    {page.title}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        <div className="lp-footer-rule" aria-hidden />

        <LandingSocialLinks variant="inline" className="lp-footer-social" />

        <div className="lp-footer-trust">
          <span className="lp-footer-trust-badge lp-footer-trust-badge--text" title="18+ only">
            18+
          </span>
          <span className="lp-footer-trust-badge" aria-hidden>
            🛡️
          </span>
          <span className="lp-footer-trust-badge" aria-hidden>
            ✅
          </span>
          <span className="lp-footer-trust-badge" aria-hidden>
            💯
          </span>
          <span className="lp-footer-trust-badge" aria-hidden>
            ☑️
          </span>
          <span className="lp-footer-trust-badge" aria-hidden>
            🔒
          </span>
          <span className="lp-footer-trust-badge" aria-hidden>
            🎯
          </span>
        </div>

        <p className="lp-footer-disclaimer">
          {site.platformName} is a free sweepstakes platform. No purchase necessary. Void where prohibited. Must be 18+ to
          participate. Not available in all states. Sweeps Coins have no cash value until redeemed. T&amp;Cs apply. Please play
          responsibly.
        </p>
        <div className="lp-footer-copyline">
          © {site.year} {site.platformName} · All Rights Reserved
        </div>
      </div>
    </footer>
  );
}
