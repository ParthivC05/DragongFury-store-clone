/** Chime brand green (common marketing / UI reference). */
const CHIME_GREEN = '#1EC677';

/**
 * Chime wordmark (vector paths). Single brand color throughout.
 * @param {{ className?: string, color?: string }} props
 */
export function ChimeLogo({ className = '', color = CHIME_GREEN }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-203 444 672 193"
      className={className}
      role="img"
      aria-label="Chime"
    >
      <g fill={color}>
        <path d="M245.6,500.1c-11.8,0-25.9,4.2-39.4,18.8c-13.5-14.6-27.7-18.8-39.4-18.8c0,0-45.1-3.4-45.1,49.3v85.3h32.7v-80.5c0-23.6,15.8-24.1,18.9-23.4c0,0,5.7,0.3,10.9,5.7c0,0-10.4,13.6-11.2,30.7c0,0-2.3,44.3,33.2,44.3s33.2-44.3,33.2-44.3c-0.8-17.1-11.2-30.7-11.2-30.7c5.2-5.4,10.9-5.7,10.9-5.7c3-0.7,18.9-0.2,18.9,23.4v80.5h32.7v-85.3C290.6,496.7,245.6,500.1,245.6,500.1zM206.1,587.5c-7,0-9.3-8.8-9.4-17.2c-0.2-14.6,9.3-25.1,9.4-25.3c0.2,0.2,9.6,10.7,9.4,25.3C215.5,578.7,213.1,587.5,206.1,587.5z" />
        <path d="M103.3,502.3H70.6v132.5h32.7V502.3z" />
        <path d="M87,444.9c-10.9,0-19.9,8.8-19.9,19.6c0,10.9,8.9,19.9,19.9,19.9c10.8,0,19.6-8.9,19.6-19.9C106.6,453.9,97.7,444.9,87,444.9z" />
        <path d="M-32.9,511.2V444h-32.4v190.8h32.4v-95.5c53.7-26.1,51.7,15.2,51.7,15.2v80.3h32.5v-80.3C51.2,476.9-16.6,502.5-32.9,511.2z" />
        <path d="M335.6,575c17.4,6.1,39.5,5.6,39.5,5.6c52.4-0.3,50.9-38.4,50.9-38.4c-1.3-42.9-51.7-42.1-51.7-42.1c-41.7,0-70.9,28.6-70.9,69.5c0,40.9,28.6,67.3,72.8,67.3c18.8,0,36.7-5.2,49.2-14.3v-31.5c-13.1,11.3-28.8,17.3-45.4,17.3C380.1,608.4,334.7,610.7,335.6,575z" />
        <path d="M-132.4,636.9c23,0,39.3-8.7,49-16v-31.7c-14.3,11.3-31.1,17.8-46,17.8c-23.8,0-40.5-16.4-40.5-40c0-22.4,15.2-38,36.9-38c7.1,0,13.2,1.8,19.7,3.6c6.7,1.9,13.7,4,22,4c2.6,0,5.2-0.2,7.8-0.6v-30.2c-2.2,0.2-4.3,0.4-6.5,0.4c-7.5,0-14.3-1.4-21.4-2.9c-7.5-1.6-15.2-3.2-24.3-3.2c-18.1,0-34.9,6.4-47.2,18.2c-13.1,12.5-20.1,29.9-20.1,50.2C-203,608.8-174,636.9-132.4,636.9z" />
      </g>
    </svg>
  );
}

export function ChimeLogoMark({ className = '' }) {
  return <ChimeLogo className={`h-8 w-auto max-w-[5rem] shrink-0 ${className}`.trim()} />;
}

/** Same logo + color; kept for call sites that chose a “light tile” variant before we unified color. */
export function ChimeLogoMarkLight({ className = '' }) {
  return <ChimeLogo className={`h-8 w-auto max-w-[5rem] shrink-0 ${className}`.trim()} />;
}

export function ChimeLogoHeader({ className = '' }) {
  return <ChimeLogo className={`h-9 w-auto max-w-[7rem] shrink-0 ${className}`.trim()} />;
}

/**
 * Withdraw “Payout method” row: logo in a white rounded square so Chime green reads clearly on dark cards.
 */
export function ChimeLogoWithdrawTile({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center justify-center size-12 shrink-0 rounded-xl bg-white p-2 shadow-[inset_0_0_0_1px_rgba(0,200,83,0.15)] ring-1 ring-black/5 ${className}`.trim()}
      aria-hidden
    >
      <ChimeLogo className="h-[1.75rem] w-auto max-w-[4.5rem] object-contain object-center" />
    </span>
  );
}
