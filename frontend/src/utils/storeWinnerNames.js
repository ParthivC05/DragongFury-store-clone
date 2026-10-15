/**
 * Real player names only — invented name pools removed.
 */

export function winnerNamePrefix(name) {
  const letters = String(name || '').replace(/[^A-Za-z]/g, '');
  return letters.slice(0, 4) || 'Play';
}

export function winnerHandle(name) {
  const letters = String(name || '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();
  return `${letters.slice(0, 3) || 'PLY'}*****`;
}

export function getShuffledStoreWinnerNames() {
  return { female: [], male: [] };
}

export function getStoreWinnerNamePool() {
  return { prefixes: [], female: [], male: [], names: [] };
}

export function getStoreToastProfiles() {
  return [];
}

export function createPrefixDeck() {
  return { nextUniqueInBatch: () => 'Play' };
}

export function applyStoreWinnerHandles(_storeCode, boards = {}) {
  return boards;
}
