/**
 * Fallback guest wheel — 8 segments, cream + orange only (matches `/spinwheel` UI).
 * Used only when public config cannot be loaded.
 */
export const GUEST_SPIN_WHEEL_SEGMENTS = [
  { type: 'no_win', value: 0, label: 'No Win', color: '#F5E6C8' },
  { type: 'sc_coins', value: 2, label: '2 SC', color: '#FF8C00' },
  { type: 'sc_coins', value: 5, label: '5 SC', color: '#F5E6C8' },
  { type: 'free_spin', value: 1, label: '1 Free Spin', color: '#FF8C00' },
  { type: 'sc_coins', value: 1, label: '1 SC', color: '#F5E6C8' },
  { type: 'no_win', value: 0, label: 'No Win', color: '#FF8C00' },
  { type: 'free_spin', value: 10, label: '10 Free Spins', color: '#F5E6C8' },
  { type: 'sc_coins', value: 3, label: '3 SC', color: '#FF8C00' },
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
