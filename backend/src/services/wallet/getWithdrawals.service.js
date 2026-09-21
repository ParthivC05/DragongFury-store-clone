const db = require('../../db/models');

async function getWithdrawals(userId, query = {}) {
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 20), 100);
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);

  try {
    const { rows, count } = await db.WithdrawalRequest.findAndCountAll({
      where: { userId },
      order: [['created_at', 'DESC']],
      limit,
      offset,
      attributes: ['id', 'amount', 'method', 'status', 'created_at']
    });

    return {
      withdrawals: (rows || []).map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        method: r.method || '',
        status: r.status,
        date: r.created_at
      })),
      total: count != null ? count : 0
    };
  } catch (err) {
    return { withdrawals: [], total: 0 };
  }
}

module.exports = { getWithdrawals };
