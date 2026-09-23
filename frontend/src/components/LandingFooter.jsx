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

function FooterNavLink({ to, children, onClick }) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="premium-footer__nav-link">
        {children}
      </button>
    );
  }
  return (
    <Link to={to} className="premium-footer__nav-link">
      {children}
    </Link>
  );
}

function TrustIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      {children}
    </svg>
  );
}

/** Drop CMS links that collide with built-in footer destinations. */
function filterCmsPages(pages, reservedPaths) {
  return (pages || []).filter((page) => {
    const href = footerPageHref(page);
    if (isExternalHref(href)) return true;
    const path = String(href).replace(/\/+$/, '') || '/';
    return !reservedPaths.has(path.toLowerCase());
  });
}

export function LandingFooter() {
  const { menus, showDefaultMenus } = useStoreFooter();
  const reservedPaths = new Set([
    '/',
    '/contact',
    '/help',
    '/faq',
    '/login',
    '/register',
    '/bonus',
    '/casino',
    '/blog',
    '/privacy',
    '/terms',
    '/responsible-gaming',
  ]);
  const cmsMenus = menus
    .map((m) => ({
      ...m,
      pages: filterCmsPages(m.pages, reservedPaths),
    }))
    .filter((m) => Array.isArray(m.pages) && m.pages.length > 0);
  const brandCopy =
    site.seoDescription ||
    `${site.platformName} brings supported games, account tools, transfers and rewards together. Availability and eligibility depend on current rules. No purchase necessary where provided by the Sweepstakes Rules.`;

  return (
    <footer className="premium-footer premium-footer--landing" aria-label={`${site.platformName} site footer`}>
      <div className="premium-footer__light" aria-hidden />
      <div className="premium-footer__container">
        <section className="premium-footer__brand premium-footer__section" aria-labelledby="premium-footer-title">
          <h2 className="premium-footer__sr-only" id="premium-footer-title">
            {site.platformName}
          </h2>
          <Link to="/" className="premium-footer__logo" aria-label={`${site.platformName} home`}>
            <SiteLogo variant="footer" className="premium-footer__logo-img" />
          </Link>
          <p>{brandCopy}</p>
        </section>

        {showDefaultMenus ? (
          <>
            <section className="premium-footer__company premium-footer__section" aria-labelledby="premium-footer-company">
              <h3 id="premium-footer-company">Company</h3>
              <nav aria-label="Company information">
                <FooterNavLink to="/contact">Contact Us</FooterNavLink>
                <FooterNavLink to="/help">Help Center</FooterNavLink>
                <FooterNavLink onClick={openSupportWidget}>Support</FooterNavLink>
                <FooterNavLink to="/faq">FAQ</FooterNavLink>
              </nav>
            </section>

            <section className="premium-footer__explore premium-footer__section" aria-labelledby="premium-footer-explore">
              <h3 id="premium-footer-explore">Explore</h3>
              <nav aria-label={`Explore ${site.platformName}`}>
                <FooterNavLink to="/">{site.platformName}</FooterNavLink>
                <FooterNavLink to="/login">{site.platformName} Login</FooterNavLink>
                <FooterNavLink to="/register">Create a {site.platformName} Account</FooterNavLink>
                <FooterNavLink to="/bonus">{site.platformName} Bonuses</FooterNavLink>
                <FooterNavLink to="/casino">Casino</FooterNavLink>
                <FooterNavLink to="/blog">Blog</FooterNavLink>
              </nav>
            </section>

            <section className="premium-footer__legal premium-footer__section" aria-labelledby="premium-footer-legal">
              <h3 id="premium-footer-legal">Legal</h3>
              <nav aria-label="Legal information">
                <FooterNavLink to="/privacy">Privacy Policy</FooterNavLink>
                <FooterNavLink to="/terms">Terms &amp; Conditions</FooterNavLink>
                <FooterNavLink to="/responsible-gaming">Responsible Social Gaming</FooterNavLink>
              </nav>
            </section>
          </>
        ) : null}

        {cmsMenus.map((menu) => (
          <section
            key={menu.id || menu.label}
            className="premium-footer__company premium-footer__section"
            aria-label={menu.label}
          >
            <h3>{menu.label}</h3>
            <nav aria-label={menu.label}>
              {(menu.pages || []).map((page) => {
                const href = footerPageHref(page);
                if (isExternalHref(href)) {
                  return (
                    <a
                      key={page.id || page.slug}
                      href={href}
                      className="premium-footer__nav-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {page.title}
                    </a>
                  );
                }
                return (
                  <Link key={page.id || page.slug} to={href} className="premium-footer__nav-link">
                    {page.title}
                  </Link>
                );
              })}
            </nav>
          </section>
        ))}

        <section className="premium-footer__social premium-footer__section" aria-labelledby="premium-footer-social">
          <h3 id="premium-footer-social">Follow Us</h3>
          <LandingSocialLinks variant="inline" className="premium-footer__social-list" />
        </section>

        <section className="premium-footer__trust premium-footer__section" aria-label="Platform trust information">
          <div>
            <span className="premium-footer__age-mark">18+</span>
            <span>Adults Only</span>
          </div>
          <div>
            <TrustIcon>
              <path d="M12 3 4.5 6v5.3c0 4.7 3.1 8.2 7.5 9.7 4.4-1.5 7.5-5 7.5-9.7V6L12 3Z" />
              <path d="m8.5 12 2.2 2.2 4.8-5" />
            </TrustIcon>
            <span>Responsible Social Gaming</span>
          </div>
          <div>
            <TrustIcon>
              <rect x="5" y="10" width="14" height="10" rx="3" />
              <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
              <circle cx="12" cy="15" r="1.2" />
            </TrustIcon>
            <span>Secure Platform</span>
          </div>
          <div>
            <TrustIcon>
              <rect x="5" y="10" width="14" height="10" rx="3" />
              <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
              <path d="M12 14v2.5" />
            </TrustIcon>
            <span>Encrypted Payments</span>
          </div>
        </section>

        <section className="premium-footer__bottom premium-footer__section" aria-label="Copyright and platform notice">
          <p>
            © {site.year} {site.platformName}. All Rights Reserved.
          </p>
          <small>
            {site.platformName} is a social casino account platform. Eligibility, purchases and redemptions are
            subject to the current Terms and Sweepstakes Rules.
          </small>
          <p className="premium-footer__disclaimer" role="note">
            <strong>Disclaimer.</strong> {site.platformName} is a website for playing supported games. All game
            titles, logos, characters, artwork and other elements shown on this site are the material and property
            of their respective third-party owners and are used for identification only. Play is subject to the
            game provider&apos;s own terms and to our Terms of Service.
          </p>
        </section>
      </div>
    </footer>
  );
}
