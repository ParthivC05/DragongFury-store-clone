import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { site } from '../config/site';
import { useStoreFooter } from '../hooks/useStoreFooter';

const FOOTER_PARTICLES = [
  { id: 1, e: '✦', style: { top: '18%', left: '8%' }, delay: 0 },
  { id: 2, e: '★', style: { top: '62%', left: '14%' }, delay: 0.6 },
  { id: 3, e: '✦', style: { top: '28%', right: '10%' }, delay: 1.1 },
  { id: 4, e: '🪙', style: { top: '72%', right: '16%' }, delay: 0.3 },
];

const TRUST_BADGES = [
  { id: 'secure', icon: '🔒', label: 'Secure' },
  { id: 'fair', icon: '⚖️', label: 'Fair Play' },
  { id: 'support', icon: '💬', label: '24/7 Help' },
];

const DEFAULT_NAV_LINKS = [
  { to: '/blog', label: 'Blog' },
  { to: '/install', label: 'Install' },
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/help', label: 'Help' },
];

export function AppFooter() {
  const reduceMotion = useReducedMotion();
  const { menus } = useStoreFooter();

  const cmsLinks = menus.flatMap((menu) =>
    (menu.pages || []).map((page) => ({
      to: `/${encodeURIComponent(page.slug)}`,
      label: page.title,
      key: `cms-${page.id || page.slug}`
    }))
  );
  // Keep default links; append CMS pages (skip duplicates by path)
  const seen = new Set(DEFAULT_NAV_LINKS.map((l) => l.to));
  const navLinks = [
    ...DEFAULT_NAV_LINKS,
    ...cmsLinks.filter((l) => {
      if (seen.has(l.to)) return false;
      seen.add(l.to);
      return true;
    })
  ];

  return (
    <footer className="dash-footer dash-footer--gamified flex-shrink-0 w-full">
      <div className="dash-footer-particles" aria-hidden>
        {FOOTER_PARTICLES.map((p) => (
          <span
            key={p.id}
            className="dash-footer-particle"
            style={{ ...p.style, animationDelay: `${p.delay}s` }}
          >
            {p.e}
          </span>
        ))}
      </div>

      <div className="w-full min-w-0 max-w-content mx-auto py-5 sm:py-6 px-4 sm:px-6 relative z-[1]">
        <div className="dash-footer-trust" role="list" aria-label="Platform trust badges">
          {TRUST_BADGES.map((badge, i) => (
            <motion.span
              key={badge.id}
              className="dash-footer-trust-badge"
              role="listitem"
              initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.35 }}
            >
              <span className="dash-footer-trust-icon" aria-hidden>
                {badge.icon}
              </span>
              {badge.label}
            </motion.span>
          ))}
        </div>

        <nav className="dash-footer-nav" aria-label="Footer">
          {navLinks.map((link) => (
            <Link key={link.key || link.to} to={link.to} className="dash-footer-nav-link">
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="dash-footer-copy m-0 text-center min-w-0 break-words">{site.copyright}</p>
      </div>
    </footer>
  );
}
