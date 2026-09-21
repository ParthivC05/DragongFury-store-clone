const STORAGE_KEY = 'pj_selected_coin';

/** DragonFury default is Sweep Coins. */
export function readStoredCoinType() {
  if (typeof window === 'undefined') return 'SC';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === 'GC' || saved === 'SC' ? saved : 'SC';
  } catch {
    return 'SC';
  }
}

export function normalizeClientCoinType(coinType) {
  const raw = String(coinType || '').trim().toUpperCase();
  if (raw === 'GC' || raw === 'GOC' || raw === 'GOLD') return 'GC';
  return 'SC';
}

export function persistCoinType(coinType) {
  const next = normalizeClientCoinType(coinType);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  return next;
}
