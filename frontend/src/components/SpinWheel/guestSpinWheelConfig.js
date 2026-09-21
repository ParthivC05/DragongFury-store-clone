/**
 * Fallback guest wheel — 8 lime / ink segments for Dragon Fury.
 * Used only when public config cannot be loaded.
 */
export const GUEST_SPIN_WHEEL_SEGMENTS = [
  { type: 'no_win', value: 0, label: 'No Win', color: '#152015' },
  { type: 'sc_coins', value: 2, label: '2 SC', color: '#B6FF2A' },
  { type: 'sc_coins', value: 5, label: '5 SC', color: '#1C2A14' },
  { type: 'free_spin', value: 1, label: '1 Free Spin', color: '#8FE31A' },
  { type: 'sc_coins', value: 1, label: '1 SC', color: '#0E160C' },
  { type: 'no_win', value: 0, label: 'No Win', color: '#6FBF00' },
  { type: 'free_spin', value: 10, label: '10 Free Spins', color: '#243318' },
  { type: 'sc_coins', value: 3, label: '3 SC', color: '#D4FF6A' },
];

/** Guest landing wheels always award this SC amount. */
export const GUEST_LANDING_SPIN_WIN_SC = 1;

/** Rigged guest landing outcome — always lands on the configured SC wedge. */
export const GUEST_SPIN_WHEEL_WIN_INDEX = GUEST_SPIN_WHEEL_SEGMENTS.findIndex(
  (seg) => seg.type === 'sc_coins' && Number(seg.value) === GUEST_LANDING_SPIN_WIN_SC
);

export const GUEST_SPIN_WHEEL_WIN_SEGMENT =
  GUEST_SPIN_WHEEL_SEGMENTS[GUEST_SPIN_WHEEL_WIN_INDEX >= 0 ? GUEST_SPIN_WHEEL_WIN_INDEX : 7];

export function findScSegmentIndex(segments, scAmount = GUEST_LANDING_SPIN_WIN_SC) {
  const list = Array.isArray(segments) && segments.length > 0 ? segments : GUEST_SPIN_WHEEL_SEGMENTS;
  const exact = list.findIndex((seg) => seg?.type === 'sc_coins' && Number(seg?.value) === scAmount);
  if (exact >= 0) return exact;
  const anySc = list.findIndex((seg) => seg?.type === 'sc_coins');
  if (anySc >= 0) return anySc;
  return GUEST_SPIN_WHEEL_WIN_INDEX >= 0 ? GUEST_SPIN_WHEEL_WIN_INDEX : 0;
}

/** @deprecated Use findScSegmentIndex */
export function findTenScSegmentIndex(segments) {
  return findScSegmentIndex(segments, GUEST_LANDING_SPIN_WIN_SC);
}
