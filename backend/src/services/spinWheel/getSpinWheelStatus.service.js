const db = require('../../db/models');
const { Op } = require('sequelize');
const { hasUserCompletedDeposit } = require('../games/gamePlayEligibility.service');
const { listUsableCoupons } = require('./spinWheelCoupon.service');

const SPIN_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours for daily spin
const SIGNUP_FREE_SPIN_DAYS = 3;
const SIGNUP_FREE_SPIN_WINDOW_MS = SIGNUP_FREE_SPIN_DAYS * SPIN_COOLDOWN_MS;
const DEPOSIT_REQUIRED_REASON = 'deposit_required';
// Hard ceiling on total spins (daily + free-spin chained) within a rolling 24h window.
// Prevents free-spin tokens from being chained into many spins in one day. Tune as needed.
const MAX_SPINS_PER_24H = 3;
const DAILY_LIMIT_REASON = 'daily_limit_reached';

/** Count spin_wheel transactions for a user within the trailing SPIN_COOLDOWN_MS window. */
async function countRecentSpins(userId, options = {}) {
  const now = options.now || new Date();
  const since = new Date(now.getTime() - SPIN_COOLDOWN_MS);
  return db.UserTransaction.count({
    where: {
      userId,
      type: 'spin_wheel',
      createdAt: { [Op.gte]: since }
    },
    transaction: options.transaction
  });
}

/** Sequelize UserTransaction uses attribute `createdAt` (column `created_at`). */
function parseUserTransactionCreatedAt(row) {
  if (!row) return null;
  const raw =
    row.get && typeof row.get === 'function'
      ? row.get('createdAt')
      : row.createdAt != null
        ? row.createdAt
        : row.created_at;
  if (raw == null) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

function parseDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

async function getSpinWheelDepositEligibility(userId, options = {}) {
  const user = options.user || await db.User.findByPk(userId, {
    attributes: ['userId', 'createdAt'],
    transaction: options.transaction
  });
  if (!user) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  const createdAt = parseDate(user.createdAt);
  const now = options.now || new Date();
  const signupFreeSpinEndsAt = createdAt
    ? new Date(createdAt.getTime() + SIGNUP_FREE_SPIN_WINDOW_MS)
    : null;
  const withinSignupFreeSpinWindow = !signupFreeSpinEndsAt || now < signupFreeSpinEndsAt;
  const hasDeposit = await hasUserCompletedDeposit(userId, { transaction: options.transaction });
  const spinLocked = !hasDeposit && !withinSignupFreeSpinWindow;

  return {
    hasDeposit,
    spinLocked,
    spinLockReason: spinLocked ? DEPOSIT_REQUIRED_REASON : null,
    signupFreeSpinDays: SIGNUP_FREE_SPIN_DAYS,
    signupFreeSpinEndsAt: signupFreeSpinEndsAt ? signupFreeSpinEndsAt.toISOString() : null
  };
}

/**
 * Get user's spin wheel status: can_spin, next_spin_at, pending_free_spins, spin_cooldown_ms.
 * Single source of truth for timing: used by GET /status (frontend) and by performSpin before allowing a spin.
 * Can spin if: (1) never spun or last spin was > SPIN_COOLDOWN_MS ago, OR (2) user has pending_free_spins > 0.
 */
async function getSpinWheelStatus(userId) {
  const now = new Date();
  const user = await db.User.findByPk(userId, {
    attributes: ['userId', 'pendingFreeSpins', 'createdAt']
  });
  const pendingFreeSpins = user ? Math.max(0, parseInt(user.pendingFreeSpins, 10) || 0) : 0;
  const eligibility = await getSpinWheelDepositEligibility(userId, { user, now });

  const lastSpin = await db.UserTransaction.findOne({
    where: { userId, type: 'spin_wheel' },
    order: [['createdAt', 'DESC']],
    attributes: ['createdAt']
  });

  const spinsInWindow = await countRecentSpins(userId, { now });
  const dailyLimitReached = spinsInWindow >= MAX_SPINS_PER_24H;

  let nextSpinAt = null;
  let canSpin = false;

  if (eligibility.spinLocked) {
    canSpin = false;
    nextSpinAt = null;
  } else if (!lastSpin) {
    canSpin = true;
    nextSpinAt = null; // can spin now
  } else {
    const lastAt = parseUserTransactionCreatedAt(lastSpin);
    if (!lastAt) {
      canSpin = true;
      nextSpinAt = null;
    } else {
      const nextAt = new Date(lastAt.getTime() + SPIN_COOLDOWN_MS);
      if (now >= nextAt) {
        canSpin = true;
        nextSpinAt = null;
      } else {
        nextSpinAt = nextAt.toISOString();
        canSpin = pendingFreeSpins > 0;
      }
    }
  }

  // Cap total spins per rolling 24h regardless of free-spin tokens.
  if (dailyLimitReached) {
    canSpin = false;
  }

  const usableCoupons = await listUsableCoupons(userId).catch(() => []);

  return {
    can_spin: canSpin,
    next_spin_at: nextSpinAt,
    pending_free_spins: pendingFreeSpins,
    usable_coupons: usableCoupons,
    spin_cooldown_ms: SPIN_COOLDOWN_MS,
    spin_locked: eligibility.spinLocked,
    spin_lock_reason: eligibility.spinLockReason,
    has_deposit: eligibility.hasDeposit,
    signup_free_spin_days: eligibility.signupFreeSpinDays,
    signup_free_spin_ends_at: eligibility.signupFreeSpinEndsAt,
    spins_used_today: spinsInWindow,
    max_spins_per_day: MAX_SPINS_PER_24H,
    daily_limit_reached: dailyLimitReached,
    daily_limit_reason: dailyLimitReached ? DAILY_LIMIT_REASON : null
  };
}

module.exports = {
  getSpinWheelStatus,
  getSpinWheelDepositEligibility,
  countRecentSpins,
  SPIN_COOLDOWN_MS,
  SIGNUP_FREE_SPIN_DAYS,
  MAX_SPINS_PER_24H,
  DEPOSIT_REQUIRED_REASON,
  DAILY_LIMIT_REASON,
  parseUserTransactionCreatedAt
};
