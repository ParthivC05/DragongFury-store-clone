const db = require('../../db/models');
const { Op } = require('sequelize');

/** Paginated VIP ledger history for user (xp_grant, level_up_reward). */
async function getVipLedgerHistory(userId, query = {}) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  const { rows, count } = await db.VipLedger.findAndCountAll({
    where: { userId },
    order: [['created_at', 'DESC']],
    limit,
    offset,
    attributes: ['id', 'entryType', 'amount', 'currencyCode', 'referenceType', 'referenceId', 'metadata', 'created_at'],
    raw: true
  });
  return {
    entries: rows.map((r) => ({
      id: r.id,
      entry_type: r.entryType,
      amount: Number(r.amount),
      currency_code: r.currencyCode,
      reference_type: r.referenceType,
      reference_id: r.referenceId,
      metadata: r.metadata,
      created_at: r.created_at
    })),
    total: count
  };
}

module.exports = { getVipLedgerHistory };
