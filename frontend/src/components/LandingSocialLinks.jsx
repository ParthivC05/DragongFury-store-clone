import { createPortal } from 'react-dom';
import { useStoreSocialLinks } from '../hooks/useStoreSocialLinks';
import '../pages/Landing/landing-social-links.css';

const SOCIAL_PLATFORMS = [
  {
    id: 'facebook',
    label: 'Facebook',
    className: 'lp-social-link--facebook',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden className="lp-social-icon">
        <path
          fill="currentColor"
          d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
        />
      </svg>
    ),
  },
  {
    id: 'telegram',
    label: 'Facebook Group',
    className: 'lp-social-link--facebook-group',
    icon: (
      <img
        src="/icons/facebook-group.jfif"
        alt=""
        aria-hidden
        className="lp-social-icon lp-social-icon--image"
        width={22}
        height={22}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
      />
    ),
  },
  {
    id: 'messenger',
    label: 'Messenger',
    className: 'lp-social-link--messenger',
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden className="lp-social-icon">
        <path
          fill="currentColor"
          d="M12 0C5.373 0 0 4.975 0 11.111c0 3.497 1.745 6.616 4.472 8.652V24l4.086-2.242c1.09.3 2.246.464 3.442.464 6.627 0 12-4.974 12-11.111C24 4.975 18.627 0 12 0zm1.191 14.963-3.055-3.26-5.963 3.26 6.559-6.963 3.13 3.26 5.889-3.26-6.56 6.963z"
        />
      </svg>
    ),
  },
];

export function LandingSocialLinks({ className = '', variant = 'inline' }) {
  const { socialLinks } = useStoreSocialLinks();
  const isDock = variant === 'dock';
  const rootClass = isDock
    ? `lp-social-dock ${className}`.trim()
    : `lp-social-row ${className}`.trim();

  const visiblePlatforms = SOCIAL_PLATFORMS.filter((platform) => socialLinks[platform.id]);

  if (visiblePlatforms.length === 0) return null;

  const node = (
    <div className={rootClass} role="group" aria-label="Follow us on social media">
      {visiblePlatforms.map(({ id, label, className: platformClass, icon }) => {
        const href = socialLinks[id];
        return (
          <a
            key={id}
            href={href}
            className={`lp-social-link ${platformClass}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={label}
            title={label}
          >
            {icon}
          </a>
        );
      })}
    </div>
  );

  /* Portal the dock to body so `.dash-root > * { position: relative }` and
     overflow-x: clip cannot unpin it (same pattern as background music). */
  if (isDock && typeof document !== 'undefined') {
    return createPortal(node, document.body);
  }

  return node;
}
