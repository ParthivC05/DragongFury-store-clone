'use strict';

/** Short in-memory cache so residual HTTP polls don't hammer DB under load. */
const CACHE_TTL_MS = 2500;
const cache = new Map();

function getCachedBalance(userId) {
  const id = String(userId);
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(id);
    return null;
  }
  return entry.data;
}

function setCachedBalance(userId, data) {
  cache.set(String(userId), { at: Date.now(), data });
}

function invalidateBalanceCache(userId) {
  if (userId == null) {
    cache.clear();
    return;
  }
  cache.delete(String(userId));
}

module.exports = {
  getCachedBalance,
  setCachedBalance,
  invalidateBalanceCache,
  CACHE_TTL_MS
};
