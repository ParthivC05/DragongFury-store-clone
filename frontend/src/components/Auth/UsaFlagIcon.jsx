/** Inline USA flag — emoji flags often fail on Windows. */
export function UsaFlagIcon({ className = '', title = 'United States' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 11"
      width="22"
      height="15"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
    >
      {title ? <title>{title}</title> : null}
      <rect width="16" height="11" fill="#B22234" rx="1" />
      <path
        fill="#fff"
        d="M0 1.2h16v1.05H0zm0 2.1h16v1.05H0zm0 2.1h16v1.05H0zm0 2.1h16v1.05H0zm0 2.1h16V11H0z"
      />
      <rect width="7.2" height="5.9" fill="#3C3B6E" />
      <g fill="#fff">
        <circle cx="1.2" cy="1" r="0.35" />
        <circle cx="2.6" cy="1" r="0.35" />
        <circle cx="4" cy="1" r="0.35" />
        <circle cx="5.4" cy="1" r="0.35" />
        <circle cx="1.9" cy="1.95" r="0.35" />
        <circle cx="3.3" cy="1.95" r="0.35" />
        <circle cx="4.7" cy="1.95" r="0.35" />
        <circle cx="1.2" cy="2.9" r="0.35" />
        <circle cx="2.6" cy="2.9" r="0.35" />
        <circle cx="4" cy="2.9" r="0.35" />
        <circle cx="5.4" cy="2.9" r="0.35" />
        <circle cx="1.9" cy="3.85" r="0.35" />
        <circle cx="3.3" cy="3.85" r="0.35" />
        <circle cx="4.7" cy="3.85" r="0.35" />
        <circle cx="1.2" cy="4.8" r="0.35" />
        <circle cx="2.6" cy="4.8" r="0.35" />
        <circle cx="4" cy="4.8" r="0.35" />
        <circle cx="5.4" cy="4.8" r="0.35" />
      </g>
    </svg>
  );
}
