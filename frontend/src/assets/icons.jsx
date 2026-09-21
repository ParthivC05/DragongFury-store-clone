import { useId } from 'react';

/**
 * SVG icon components – add new icons here and export.
 */

export function EyeIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

/** Nav / layout icons (24x24, stroke) */
export function HomeIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

export function GamesIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <line x1="6" y1="12" x2="18" y2="12" />
      <line x1="12" y1="6" x2="12" y2="18" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

export function SlotIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <line x1="9" y1="5" x2="9" y2="19" />
      <line x1="15" y1="5" x2="15" y2="19" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function PromoIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

export function SpinIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function AccountIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function DepositIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

export function WithdrawIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

export function ChevronDownIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function ChevronLeftIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

export function BellIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function MenuIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

export function CloseIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function SearchIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

/** Three vertical dots (more menu) */
export function MoreVerticalIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="12" cy="6" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="18" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function LockIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function EnvelopeIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

export function CameraIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function SCCoinIcon(props) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      {...props}
    >
      <defs>
        <radialGradient id={`sc-coin-${uid}`} cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#9bffd4" />
          <stop offset="42%" stopColor="#2ee59a" />
          <stop offset="100%" stopColor="#0a8f62" />
        </radialGradient>
        <linearGradient id={`sc-ring-${uid}`} x1="8" y1="4" x2="24" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#d8ffe8" />
          <stop offset="100%" stopColor="#067a52" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#sc-coin-${uid})`} />
      <circle cx="16" cy="16" r="15" fill="none" stroke={`url(#sc-ring-${uid})`} strokeWidth="1.6" />
      <circle cx="16" cy="16" r="11.2" fill="none" stroke="rgba(255,255,255,0.38)" strokeWidth="1" />
      <ellipse cx="12" cy="10" rx="7" ry="4.2" fill="rgba(255,255,255,0.28)" />
      <text
        x="16"
        y="20.5"
        textAnchor="middle"
        fill="#fff"
        fontSize="9.5"
        fontWeight="800"
        fontFamily="Rajdhani, system-ui, sans-serif"
        letterSpacing="0.4"
      >
        SC
      </text>
    </svg>
  );
}

export function GCCoinIcon(props) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      {...props}
    >
      <defs>
        <radialGradient id={`gc-coin-${uid}`} cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#ffe9a0" />
          <stop offset="45%" stopColor="#f5c518" />
          <stop offset="100%" stopColor="#b8860b" />
        </radialGradient>
        <linearGradient id={`gc-ring-${uid}`} x1="8" y1="4" x2="24" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fff4c8" />
          <stop offset="100%" stopColor="#8a6508" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#gc-coin-${uid})`} />
      <circle cx="16" cy="16" r="15" fill="none" stroke={`url(#gc-ring-${uid})`} strokeWidth="1.6" />
      <circle cx="16" cy="16" r="11.2" fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth="1" />
      <ellipse cx="12" cy="10" rx="7" ry="4.2" fill="rgba(255,255,255,0.32)" />
      <text
        x="16"
        y="20.5"
        textAnchor="middle"
        fill="#fff"
        fontSize="9.5"
        fontWeight="800"
        fontFamily="Rajdhani, system-ui, sans-serif"
        letterSpacing="0.4"
      >
        GC
      </text>
    </svg>
  );
}

export function CopyIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function CheckIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function RefreshIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

export function PlayIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

/** Transaction type: money in / win (up arrow) */
export function ArrowUpIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

/** Transaction type: money out / credits to game (down arrow) */
export function ArrowDownIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  );
}

/** Transaction type: reward / spin (dollar) */
export function DollarIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

/** VIP / crown for bottom nav */
export function CrownIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z" />
      <path d="M2 4h20" />
    </svg>
  );
}

/** Refer & Earn – users/share */
export function ReferEarnIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/** Plus – add / increase (e.g. add funds, new item) */
export function PlusIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/** Gift – gift box (e.g. Refer & Earn, rewards) */
export function GiftIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}

/** Ticket / voucher – daily bonus discount reward */
export function TicketIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M2 9a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v0a3 3 0 0 0 0 6v0a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v0a3 3 0 0 0 0-6z" />
      <path d="M13 5v2" />
      <path d="M13 17v2" />
      <path d="M13 11v2" />
    </svg>
  );
}

/** Trophy – final day / bigger rewards */
export function TrophyIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

/** Share – share link / send */
export function ShareIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

/** Payment type: Cards (credit/debit) – card with stripe and chip */
export function PaymentCardIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><path fill="#ffac33" d="M4 5a4 4 0 0 0-4 4v18a4 4 0 0 0 4 4h28a4 4 0 0 0 4-4V9s0-4-4-4z" /><path fill="#292f33" d="M0 10h36v5H0z" /><path fill="#f4f7f9" d="M4 19h28v6H4z" /><path fill="#8899a6" d="M19 24c-1.703 0-2.341-1.21-2.469-1.801c-.547.041-1.08.303-1.805.764C13.961 23.449 13.094 24 12 24c-1.197 0-1.924-.675-2-2c-.003-.056.038-.188.021-.188c-1.858 0-3.202 1.761-3.215 1.779a.997.997 0 0 1-1.397.215a1 1 0 0 1-.215-1.398C5.271 22.303 7.11 20 10 20c1.937 0 2.048 1.375 2.078 1.888l.007.109c.486-.034.991-.354 1.57-.723c.961-.61 2.153-1.371 3.75-.962c.871.223 1.007 1.031 1.059 1.336c.013.076.032.19.049.226c.007 0 .146.091.577.13c.82.075 1.721-.279 2.675-.653c.988-.388 2.01-.788 3.111-.788c3.389 0 4.767 1.635 4.913 1.821a1 1 0 1 1-1.575 1.232c-.024-.027-.93-1.054-3.337-1.054c-.723 0-1.528.315-2.381.649c-1.009.396-2.434.789-3.496.789" /></svg>
  );
}

/** Payment type: Apple Pay – apple shape */
export function ApplePayIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={512} height={211} viewBox="0 0 512 211"><path fill="#fff" d="M93.552 27.103c-6 7.1-15.602 12.702-25.203 11.901c-1.2-9.6 3.5-19.802 9.001-26.103C83.35 5.601 93.852.4 102.353 0c1 10.001-2.9 19.802-8.8 27.103m8.701 13.802c-13.902-.8-25.803 7.9-32.404 7.9c-6.7 0-16.802-7.5-27.803-7.3c-14.301.2-27.603 8.3-34.904 21.202c-15.002 25.803-3.9 64.008 10.601 85.01c7.101 10.401 15.602 21.802 26.803 21.402c10.602-.4 14.802-6.9 27.604-6.9c12.901 0 16.602 6.9 27.803 6.7c11.601-.2 18.902-10.4 26.003-20.802c8.1-11.801 11.401-23.303 11.601-23.903c-.2-.2-22.402-8.7-22.602-34.304c-.2-21.402 17.502-31.603 18.302-32.203c-10.002-14.802-25.603-16.402-31.004-16.802m80.31-29.004V167.82h24.202v-53.306h33.504c30.603 0 52.106-21.002 52.106-51.406c0-30.403-21.103-51.206-51.306-51.206zm24.202 20.403h27.903c21.003 0 33.004 11.201 33.004 30.903s-12.001 31.004-33.104 31.004h-27.803zM336.58 169.019c15.202 0 29.303-7.7 35.704-19.902h.5v18.702h22.403V90.21c0-22.502-18.002-37.004-45.706-37.004c-25.703 0-44.705 14.702-45.405 34.904h21.803c1.8-9.601 10.7-15.902 22.902-15.902c14.802 0 23.103 6.901 23.103 19.603v8.6l-30.204 1.8c-28.103 1.7-43.304 13.202-43.304 33.205c0 20.202 15.701 33.603 38.204 33.603m6.5-18.502c-12.9 0-21.102-6.2-21.102-15.702c0-9.8 7.901-15.501 23.003-16.401l26.903-1.7v8.8c0 14.602-12.401 25.003-28.803 25.003m82.01 59.707c23.603 0 34.704-9 44.405-36.304L512 54.706h-24.603l-28.503 92.11h-.5l-28.503-92.11h-25.303l41.004 113.513l-2.2 6.901c-3.7 11.701-9.701 16.202-20.402 16.202c-1.9 0-5.6-.2-7.101-.4v18.702c1.4.4 7.4.6 9.201.6"></path></svg>
  );
}

/** Payment type: Google Pay – four-color bar (blue, green, yellow, red) */
export function GooglePayIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={512} height={204} viewBox="0 0 512 204"><path fill="#bababa" d="M362.927 55.057c14.075 0 24.952 3.839 33.27 11.517c8.317 7.677 12.155 17.914 12.155 30.71v61.42h-17.914V144.63h-.64c-7.677 11.517-18.554 17.275-31.35 17.275c-10.877 0-20.474-3.2-28.151-9.597c-7.038-6.398-11.517-15.355-11.517-24.952q0-15.356 11.517-24.953c7.677-6.398 18.554-8.957 31.35-8.957c11.516 0 20.474 1.92 27.511 6.398v-4.478c0-5.972-2.229-11.943-6.688-15.834l-.99-.801c-5.118-4.479-11.516-7.038-18.553-7.038q-16.315 0-24.953 13.436L321.34 74.89c10.236-13.436 23.672-19.834 41.587-19.834M272.715 11.55c11.48 0 22.39 3.995 31.113 11.445l1.517 1.35c8.957 7.678 13.435 19.195 13.435 31.351s-4.478 23.033-13.435 31.35s-19.834 12.796-32.63 12.796l-30.71-.64v59.502H222.81V11.55zm92.77 97.25q-11.516 0-19.193 5.758q-7.678 4.798-7.678 13.435c0 5.119 2.56 9.597 6.398 12.157c4.479 3.199 9.597 5.118 14.716 5.118c7.165 0 14.331-2.787 19.936-7.84l1.177-1.117c6.398-5.758 9.597-12.796 9.597-20.474c-5.758-4.478-14.076-7.038-24.952-7.038m-91.49-79.336h-31.99V80.65h31.99c7.037 0 14.075-2.559 18.554-7.677c10.236-9.597 10.236-25.592.64-35.19l-.64-.64c-5.119-5.118-11.517-8.317-18.555-7.677M512 58.256l-63.34 145.235h-19.194l23.672-50.544l-41.587-94.051h20.474l30.07 72.297h.64l29.431-72.297H512z"></path><path fill="#4285f4" d="M165.868 86.407c0-5.758-.64-11.516-1.28-17.274H84.615v32.63h45.425c-1.919 10.236-7.677 19.833-16.634 25.592v21.113h27.511c15.995-14.715 24.952-36.469 24.952-62.06"></path><path fill="#34a853" d="M84.614 168.942c23.032 0 42.226-7.678 56.302-20.474l-27.511-21.113c-7.678 5.118-17.275 8.317-28.791 8.317c-21.754 0-40.948-14.715-47.346-35.189H9.118v21.753c14.715 28.791 43.506 46.706 75.496 46.706"></path><path fill="#fbbc04" d="M37.268 100.483c-3.838-10.237-3.838-21.753 0-32.63V46.1H9.118c-12.157 23.673-12.157 51.824 0 76.136z"></path><path fill="#ea4335" d="M84.614 33.304c12.156 0 23.672 4.479 32.63 12.796l24.312-24.312C126.2 7.712 105.727-.605 85.253.034c-31.99 0-61.42 17.915-75.496 46.706l28.151 21.753c5.758-20.474 24.952-35.189 46.706-35.189"></path></svg>
  );
}

/** Payment type: Cash App – green square with $ */
export function CashAppIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="#00D54B" width="800px" height="800px" viewBox="0 0 32 32"><g id="SVGRepo_bgCarrier" strokeWidth="0" /><g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" /><g id="SVGRepo_iconCarrier"> <path d="M31.453 4.625c-0.688-1.891-2.177-3.375-4.068-4.063-1.745-0.563-3.333-0.563-6.557-0.563h-9.682c-3.198 0-4.813 0-6.531 0.531-1.896 0.693-3.385 2.188-4.068 4.083-0.547 1.734-0.547 3.333-0.547 6.531v9.693c0 3.214 0 4.802 0.531 6.536 0.688 1.891 2.177 3.375 4.068 4.063 1.734 0.547 3.333 0.547 6.536 0.547h9.703c3.214 0 4.813 0 6.536-0.531 1.896-0.688 3.391-2.182 4.078-4.078 0.547-1.734 0.547-3.333 0.547-6.536v-9.667c0-3.214 0-4.813-0.547-6.547zM23.229 10.802l-1.245 1.24c-0.25 0.229-0.635 0.234-0.891 0.010-1.203-1.010-2.724-1.568-4.292-1.573-1.297 0-2.589 0.427-2.589 1.615 0 1.198 1.385 1.599 2.984 2.198 2.802 0.938 5.12 2.109 5.12 4.854 0 2.99-2.318 5.042-6.104 5.266l-0.349 1.604c-0.063 0.302-0.328 0.516-0.635 0.516h-2.391l-0.12-0.010c-0.354-0.078-0.578-0.432-0.505-0.786l0.375-1.693c-1.438-0.359-2.76-1.083-3.844-2.094v-0.016c-0.25-0.25-0.25-0.656 0-0.906l1.333-1.292c0.255-0.234 0.646-0.234 0.896 0 1.214 1.146 2.839 1.786 4.521 1.76 1.734 0 2.891-0.734 2.891-1.896s-1.172-1.464-3.385-2.292c-2.349-0.839-4.573-2.026-4.573-4.802 0-3.224 2.677-4.797 5.854-4.943l0.333-1.641c0.063-0.302 0.333-0.516 0.641-0.51h2.37l0.135 0.016c0.344 0.078 0.573 0.411 0.495 0.76l-0.359 1.828c1.198 0.396 2.333 1.026 3.302 1.849l0.031 0.031c0.25 0.266 0.25 0.667 0 0.906z" /> </g></svg>
  );
}

/** Payment type: PayPal – square badge sized like Cash App tile icons */
export function PayPalIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width="32"
      height="32"
      aria-hidden
      {...props}
    >
      <rect width="32" height="32" rx="7" fill="#003087" />
      <g transform="translate(5.5 3.5) scale(0.88)">
        <path
          fill="#FFFFFF"
          d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.77.77 0 0 1 .757-.643h6.918c2.268 0 3.98.54 5.087 1.605 1.03.99 1.48 2.363 1.337 4.083-.02.23-.048.46-.084.69-.35 2.2-1.42 3.78-3.18 4.69-1.57.81-3.55 1.07-5.88 1.07H7.93l-.83 5.2a.77.77 0 0 1-.758.643l.734-2.721z"
        />
        <path
          fill="#009CDE"
          d="M19.916 7.465c-.02.15-.043.3-.07.45-.71 3.61-3.13 5.45-6.98 5.45h-1.76l-1.11 7.04a.64.64 0 0 1-.633.54H6.78l.95-6.02.03-.02h1.92c4.05 0 7.22-1.65 8.15-6.42.39-1.98.19-3.64-.914-4.82a4.46 4.46 0 0 0-.999.8c.62.93.85 2.12.999 3.492z"
        />
      </g>
    </svg>
  );
}

/** Payment type: Zelle – purple square with brand Z */
export function ZelleIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width="32"
      height="32"
      aria-hidden
      {...props}
    >
      <rect width="32" height="32" rx="7" fill="#6D1ED4" />
      <path
        fill="#FFFFFF"
        d="M9.2 8.4h13.1c.55 0 .9.55.66 1.03L16.2 21.2h5.9c.5 0 .9.4.9.9v1.5c0 .5-.4.9-.9.9H9.1c-.55 0-.9-.55-.66-1.03L15.2 10.8H9.2c-.5 0-.9-.4-.9-.9V9.3c0-.5.4-.9.9-.9z"
      />
    </svg>
  );
}

/** Payment type: Crypto currency */
export function CryptoPayIcon(props) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="16 23 98 70" fill="none">
      <rect x="16" y="36" width="80" height="54" rx="14" fill="#334155" stroke="#64748B" strokeWidth="1.5" />
      <rect x="16" y="44" width="80" height="10" rx="5" fill="#475569" />
      <rect x="68" y="52" width="36" height="22" rx="8" fill="#1E293B" />
      <circle cx="80" cy="63" r="3" fill="#22C55E" />
      <circle cx="36" cy="63" r="11" fill="#F59E0B" />
      <text x="36" y="67" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="9" fontWeight="700" fill="#FFFFFF">₿</text>
      <circle cx="60" cy="63" r="11" fill="#3B82F6" />
      <text x="60" y="67" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontSize="8" fontWeight="700" fill="#FFFFFF">Ξ</text>
      <path d="M99 23L114 29V41C114 52 107 60 99 64C91 60 84 52 84 41V29L99 23Z" fill="#22C55E" />
      <path d="M93 41L97 45L105 37" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChatIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function BlogIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6Z" />
    </svg>
  );
}

export function DownloadIcon(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}