'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const {
  roundMoney,
  VOUCHER_TTL_MS,
  voucherExpiresAt,
  isVoucherPastTtl
} = require('./dailyBonus.constants');

function voucherAppliesToPackage(voucher, packageId) {
  if (!voucher || voucher.status !== 'available') return false;
  if (voucher.packageScope === 'all') return true;
  const ids = Array.isArray(voucher.packageIds) ? voucher.packageIds.map((id) => Number(id)) : [];
  return ids.includes(Number(packageId));
}

function serializeVoucher(v) {
  const createdAt = v.createdAt || v.created_at || null;
  const expiresAt = voucherExpiresAt(createdAt);
  return {
    id: v.id,
    percent_off: Number(v.percentOff),
    package_scope: v.packageScope,
    package_ids: Array.isArray(v.packageIds) ? v.packageIds : [],
    status: v.status,
    created_at: createdAt ? new Date(createdAt).toISOString() : null,
    expires_at: expiresAt ? expiresAt.toISOString() : null
  };
}

/**
 * Mark available vouchers past the 24h TTL as expired.
 * @returns {Promise<number>} number of rows updated
 */
async function expireStaleDailyBonusVouchers(options = {}) {
  const now = options.now || new Date();
  const cutoff = new Date(now.getTime() - VOUCHER_TTL_MS);
  const where = {
    status: 'available',
    createdAt: { [Op.lt]: cutoff }
  };
  if (options.userId != null) where.userId = options.userId;

  const [count] = await db.UserDailyBonusVoucher.update(
    { status: 'expired', updatedAt: now },
    { where, transaction: options.transaction || null }
  );
  return count;
}

/**
 * Validate voucher for package checkout. Optionally consume (mark used) in same transaction.
 * Consuming happens at checkout/request create — not when payment later completes.
 * @returns {{ voucherId, percentOff, originalPayAmount, payAmount, discountAmount } | null}
 */
async function applyDailyBonusVoucher(userId, packageId, originalPayAmount, options = {}) {
  const voucherIdRaw = options.voucherId ?? options.voucher_id ?? null;
  if (voucherIdRaw == null || voucherIdRaw === '') return null;

  const voucherId = parseInt(voucherIdRaw, 10);
  if (!Number.isInteger(voucherId) || voucherId < 1) {
    const err = new Error('Invalid daily bonus voucher.');
    err.statusCode = 400;
    throw err;
  }

  const pay = Number(originalPayAmount);
  if (!Number.isFinite(pay) || pay <= 0) {
    const err = new Error('Package price is invalid.');
    err.statusCode = 400;
    throw err;
  }

  const run = async (t) => {
    await expireStaleDailyBonusVouchers({ userId, transaction: t });

    const voucher = await db.UserDailyBonusVoucher.findOne({
      where: { id: voucherId, userId },
      transaction: t,
      lock: t ? t.LOCK.UPDATE : undefined
    });
    if (!voucher || voucher.status !== 'available') {
      const err = new Error(
        voucher?.status === 'expired'
          ? 'This discount voucher has expired.'
          : 'This discount voucher is not available.'
      );
      err.statusCode = 400;
      throw err;
    }
    if (isVoucherPastTtl(voucher)) {
      await voucher.update({ status: 'expired', updatedAt: new Date() }, { transaction: t });
      const err = new Error('This discount voucher has expired.');
      err.statusCode = 400;
      throw err;
    }
    if (!voucherAppliesToPackage(voucher, packageId)) {
      const err = new Error('This voucher cannot be used on the selected package.');
      err.statusCode = 400;
      throw err;
    }

    const percentOff = Number(voucher.percentOff);
    const discountAmount = roundMoney((pay * percentOff) / 100);
    let payAmount = roundMoney(pay - discountAmount);
    if (!(payAmount > 0)) {
      // Keep a minimum payable amount of $0.01 so payment providers accept the session.
      payAmount = 0.01;
    }

    if (options.consume) {
      // Mark used immediately when the deposit/manual request is created — do not wait for settlement.
      await voucher.update(
        {
          status: 'used',
          usedAt: new Date(),
          usedOnPackageId: packageId,
          depositRequestId: options.depositRequestId || null,
          updatedAt: new Date()
        },
        { transaction: t }
      );
    }

    return {
      voucherId: voucher.id,
      percentOff,
      originalPayAmount: roundMoney(pay),
      payAmount,
      discountAmount: roundMoney(pay - payAmount)
    };
  };

  if (options.transaction) return run(options.transaction);
  if (options.consume) return db.sequelize.transaction(run);
  return run(null);
}

async function listAvailableVouchersForUser(userId) {
  await expireStaleDailyBonusVouchers({ userId });
  const rows = await db.UserDailyBonusVoucher.findAll({
    where: { userId, status: 'available' },
    order: [['id', 'ASC']]
  });
  return rows.filter((v) => !isVoucherPastTtl(v)).map(serializeVoucher);
}

module.exports = {
  applyDailyBonusVoucher,
  voucherAppliesToPackage,
  listAvailableVouchersForUser,
  expireStaleDailyBonusVouchers,
  serializeVoucher
};
