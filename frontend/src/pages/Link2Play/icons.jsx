/** Small Link2Play-specific icons (kept local to avoid bloating shared icons). */

export function GlobeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </svg>
  );
}

export function AndroidIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M6 18c0 .6.4 1 1 1h1v2.5a1.5 1.5 0 0 0 3 0V19h2v2.5a1.5 1.5 0 0 0 3 0V19h1c.6 0 1-.4 1-1v-8H6v8ZM4 9v7a1 1 0 0 0 2 0V9a1 1 0 0 0-2 0Zm14 0v7a1 1 0 0 0 2 0V9a1 1 0 0 0-2 0ZM7.2 5.8l-.9-1.6a.5.5 0 0 1 .9-.5l1 1.7a5.4 5.4 0 0 1 7.6 0l1-1.7a.5.5 0 1 1 .9.5l-.9 1.6A5.5 5.5 0 0 1 18 9.5H6a5.5 5.5 0 0 1 1.2-3.7Z" />
    </svg>
  );
}

export function AppleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M17.5 12.6c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1.9-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.7c1.3 0 2.2-1.2 3-2.4.6-.9.9-1.7 1.1-2.2-.1 0-2.1-.8-2.1-3.5Zm-2-7.1c.7-.8 1.1-1.9 1-3-1 .1-2.1.7-2.8 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.1-.5 2.8-1.5Z" />
    </svg>
  );
}

export function NotifyLockIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
