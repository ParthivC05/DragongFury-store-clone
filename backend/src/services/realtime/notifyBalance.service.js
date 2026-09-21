'use strict';

const { emitToUser } = require('./socket.service');
const { invalidateBalanceCache } = require('../wallet/balanceCache');

/** Debounce timers so burst wallet updates (deposit credit + play balance) emit once. */
const pending = new Map();
const DEBOUNCE_MS = 150;

/**
 * Invalidate cache and push fresh balance to the user's socket room.
 * Safe to call fire-and-forget from wallet hooks / services.
 * @param {number|string} userId
 * @param {{ delayMs?: number }} [options] - optional delay before UI push (wallet is already updated)
 */
function notifyUserBalanceChanged(userId, options = {}) {
  const id = userId != null ? Number(userId) : null;
  if (!Number.isInteger(id) || id <= 0) return;

  invalidateBalanceCache(id);

  const requestedWait = options.delayMs != null
    ? Math.max(0, Number(options.delayMs) || 0)
    : DEBOUNCE_MS;
  const now = Date.now();
  const requestedFireAt = now + requestedWait;

  const existing = pending.get(id);
  // Never pull an already-scheduled delayed win push earlier (e.g. wallet hook at 150ms).
  const fireAt = existing && existing.fireAt > requestedFireAt
    ? existing.fireAt
    : requestedFireAt;
  const wait = Math.max(0, fireAt - now);

  if (existing?.timer) clearTimeout(existing.timer);

  pending.set(id, {
    fireAt,
    timer: setTimeout(() => {
      pending.delete(id);
      pushBalance(id).catch(() => {
        /* never throw into hooks */
      });
    }, wait)
  });
}

async function pushBalance(userId) {
  const { getBalance } = require('../wallet/getBalance.service');
  // Cache was just invalidated; force a fresh read for the push payload.
  const data = await getBalance(userId, { skipCache: true });
  emitToUser(userId, 'wallet:balance', data);
}

module.exports = {
  notifyUserBalanceChanged
};
