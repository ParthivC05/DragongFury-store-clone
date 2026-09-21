'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../db/models');
const { computeCampaignPayDiscount, roundMoney } = require('../emailCampaigns/applyCampaignPayDiscount.service');

const COUPON_STATUS = {
  ISSUED: 'issued',
  APPLIED: 'applied',
  REDEEMED: 'redeemed'
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function err(message, statusCode = 400) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function couponLabel(percent) {
  const n = Number(percent);
  const pretty = Number.isInteger(n) ? String(n) : String(n);
  return `${pretty}% off next deposit`;
}

function publicCoupon(row) {
  const percent = Number(row.discountPercent);
  return {
    id: row.id,
    code: String(row.code || '').toUpperCase(),
    discount_percent: percent,
    status: row.status,
    label: couponLabel(percent)
  };
}

function appliedPayload(row, extra = {}) {
  const percent = Number(row.discountPercent);
  const code = String(row.code || '').toUpperCase();
  return {
    applied: true,
    discountCode: code,
    discountValueType: 'percentage',
    discountValue: percent,
    label: couponLabel(percent),
    appliesTo: 'all_packages',
    source: 'spin_wheel',
    ...extra
  };
}

function randomCodeSuffix(len = 6) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function buildCouponCode(percent) {
  const n = Math.max(1, parseInt(percent, 10) || 1);
  return `SW${n}-${randomCodeSuffix(6)}`;
}

async function issueSpinWheelCoupon({ userId, discountPercent, spinTransactionId = null, transaction = null }) {
  const percent = Number(discountPercent);
  if (!userId || !(percent > 0)) return null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = buildCouponCode(percent);
    try {
      return await db.SpinWheelCoupon.create(
        {
          userId,
          code,
          discountPercent: percent,
          status: COUPON_STATUS.ISSUED,
          spinTransactionId
        },
        { transaction }
      );
    } catch (e) {
      const name = e?.name || '';
      if (name === 'SequelizeUniqueConstraintError' && attempt < 7) continue;
      throw e;
    }
  }
  return null;
}

async function listUsableCoupons(userId, options = {}) {
  if (!userId || !db.SpinWheelCoupon) return [];
  const rows = await db.SpinWheelCoupon.findAll({
    where: {
      userId,
      status: { [Op.in]: [COUPON_STATUS.ISSUED, COUPON_STATUS.APPLIED] }
    },
    order: [['createdAt', 'DESC']],
    transaction: options.transaction || null
  });
  const usable = [];
  for (const row of rows) {
    const checked = await markRedeemedIfAlreadyUsed(row, userId, options);
    if (checked.status === COUPON_STATUS.ISSUED || checked.status === COUPON_STATUS.APPLIED) {
      usable.push(publicCoupon(checked));
    }
  }
  return usable;
}

async function couponUsedOnPastDeposit(userId, coupon, options = {}) {
  if (!userId || !coupon || !db.UserTransaction) return false;
  const code = String(coupon.code || '').toUpperCase();
  const rows = await db.UserTransaction.findAll({
    where: { userId, type: 'deposit' },
    attributes: ['metadata'],
    order: [['id', 'DESC']],
    limit: 50,
    transaction: options.transaction || null
  });
  return rows.some((row) => {
    const m = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const id = parseInt(m.spin_wheel_coupon_id ?? m.spinWheelCouponId, 10);
    const txCode = String(m.spin_wheel_coupon_code ?? m.spinWheelCouponCode ?? '').trim().toUpperCase();
    return (Number.isInteger(id) && id === Number(coupon.id)) || (txCode && txCode === code);
  });
}

async function markRedeemedIfAlreadyUsed(coupon, userId, options = {}) {
  if (!coupon || coupon.status === COUPON_STATUS.REDEEMED) return coupon;
  const already = Boolean(coupon.redeemedAt || coupon.depositRequestId)
    || await couponUsedOnPastDeposit(userId, coupon, options);
  if (!already) return coupon;
  await coupon.update(
    {
      status: COUPON_STATUS.REDEEMED,
      redeemedAt: coupon.redeemedAt || new Date()
    },
    { transaction: options.transaction || null }
  );
  await coupon.reload({ transaction: options.transaction || null });
  return coupon;
}

async function getAppliedCoupon(userId, options = {}) {
  if (!userId || !db.SpinWheelCoupon) return null;
  const coupon = await db.SpinWheelCoupon.findOne({
    where: { userId, status: COUPON_STATUS.APPLIED },
    order: [['appliedAt', 'DESC']],
    transaction: options.transaction || null
  });
  if (!coupon) return null;
  const checked = await markRedeemedIfAlreadyUsed(coupon, userId, options);
  return checked.status === COUPON_STATUS.APPLIED ? checked : null;
}

async function unapplyApplied(userId, options = {}) {
  if (!userId || !db.SpinWheelCoupon) return;
  await db.SpinWheelCoupon.update(
    { status: COUPON_STATUS.ISSUED, appliedAt: null },
    {
      where: { userId, status: COUPON_STATUS.APPLIED },
      transaction: options.transaction || null
    }
  );
}

/**
 * Apply a spin-wheel coupon code for the logged-in user.
 * @returns {object|null} payload when this is a spin-wheel code; null if code is not a spin coupon.
 */
async function tryApplyCode(userId, rawCode) {
  if (!userId) throw err('Unauthorized.', 401);
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code || !db.SpinWheelCoupon) return null;

  const coupon = await db.SpinWheelCoupon.findOne({
    where: { code }
  });
  if (!coupon) return null;

  if (coupon.userId !== userId) {
    throw err('This code is only for the account that won it on the spin wheel.', 403);
  }
  await markRedeemedIfAlreadyUsed(coupon, userId);
  if (coupon.status === COUPON_STATUS.REDEEMED) {
    throw err('Invalid coupon code.', 400);
  }

  if (coupon.status === COUPON_STATUS.APPLIED) {
    return appliedPayload(coupon, {
      alreadyApplied: true,
      message: `Code already applied (${couponLabel(coupon.discountPercent)}). Use it on your next deposit.`
    });
  }

  await db.sequelize.transaction(async (t) => {
    await unapplyApplied(userId, { transaction: t });
    await coupon.update(
      { status: COUPON_STATUS.APPLIED, appliedAt: new Date() },
      { transaction: t }
    );
  });

  return appliedPayload(coupon, {
    alreadyApplied: false,
    message: `Code applied: ${couponLabel(coupon.discountPercent)}. One-time use on your next deposit.`
  });
}

async function getAppliedPayload(userId) {
  const coupon = await getAppliedCoupon(userId);
  if (!coupon) return null;
  return appliedPayload(coupon, { codeAppliedAt: true });
}

async function removeApplied(userId) {
  const coupon = await getAppliedCoupon(userId);
  if (!coupon) return null;
  await coupon.update({ status: COUPON_STATUS.ISSUED, appliedAt: null });
  return {
    removed: true,
    message: 'Coupon removed. You can apply it again before depositing.'
  };
}

async function applyPayDiscountForUser(userId, basePay, options = {}) {
  const coupon = await getAppliedCoupon(userId, options);
  if (!coupon) {
    return { payAmount: roundMoney(basePay), discountAmount: 0, applied: false };
  }
  const computed = computeCampaignPayDiscount(basePay, {
    valueType: 'percentage',
    value: Number(coupon.discountPercent),
    code: String(coupon.code || '').toUpperCase(),
    minDeposit: 0,
    maxBonusCap: null
  });
  if (!computed.applied) return computed;
  return {
    ...computed,
    source: 'spin_wheel',
    couponId: coupon.id
  };
}

function spinWheelCouponMetadata(applied) {
  if (!applied?.applied || applied.source !== 'spin_wheel') return {};
  return {
    spinWheelCouponId: applied.couponId,
    spinWheelCouponCode: applied.code,
    spinWheelDiscountPercent: applied.value,
    spinWheelDiscountAmount: applied.discountAmount,
    spinWheelOriginalPayAmount: applied.originalPayAmount
  };
}

async function redeemSpinWheelCoupon(userId, meta, options = {}) {
  const transaction = options.transaction || null;
  if (!userId || !db.SpinWheelCoupon) return;

  const couponId = parseInt(meta?.spinWheelCouponId ?? meta?.spin_wheel_coupon_id, 10);
  const code = String(meta?.spinWheelCouponCode ?? meta?.spin_wheel_coupon_code ?? '').trim().toUpperCase();
  const query = { transaction };
  if (transaction) query.lock = transaction.LOCK.UPDATE;

  let coupon = null;
  if (Number.isInteger(couponId) && couponId > 0) {
    coupon = await db.SpinWheelCoupon.findByPk(couponId, query);
  }
  if (!coupon && code) {
    coupon = await db.SpinWheelCoupon.findOne({ where: { userId, code }, ...query });
  }
  if (!coupon) {
    coupon = await db.SpinWheelCoupon.findOne({
      where: { userId, status: COUPON_STATUS.APPLIED },
      order: [['appliedAt', 'DESC']],
      ...query
    });
  }
  if (!coupon || coupon.userId !== userId) return;
  if (coupon.status === COUPON_STATUS.REDEEMED) return;
  if (coupon.status !== COUPON_STATUS.APPLIED && coupon.status !== COUPON_STATUS.ISSUED) return;

  await coupon.update(
    {
      status: COUPON_STATUS.REDEEMED,
      redeemedAt: new Date(),
      depositRequestId: options.depositRequestId || coupon.depositRequestId || null
    },
    { transaction }
  );
}

module.exports = {
  COUPON_STATUS,
  couponLabel,
  issueSpinWheelCoupon,
  listUsableCoupons,
  getAppliedCoupon,
  unapplyApplied,
  tryApplyCode,
  getAppliedPayload,
  removeApplied,
  applyPayDiscountForUser,
  spinWheelCouponMetadata,
  redeemSpinWheelCoupon
};
