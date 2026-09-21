const db = require('../../db/models');
const { Op } = require('sequelize');
const { ROLES } = require('../../constants/roles');

/**
 * Top list for analytics bar chart: by distributor or by store, metric = recharge (deposit sum).
 * Response shape: [{ key, label, value }, ...] sorted by value desc.
 * @param {object} params
 * @param {string} params.role - master_admin | distributor_admin | store_admin
 * @param {string} [params.distributorCode] - for distributor_admin scope
 * @param {string} [params.storeCode] - not used for top list (we aggregate by store or distributor)
 * @param {string} [params.startDate] - YYYY-MM-DD
 * @param {string} [params.endDate] - YYYY-MM-DD
 * @param {string} params.by - 'distributor' | 'store'
 * @param {string} [params.metric] - 'recharge' (default)
 * @returns {Promise<Array<{ key: string, label: string, value: number }>>}
 */
async function getAnalyticsTop({ role, distributorCode, startDate, endDate, by, metric }) {
  if (by !== 'distributor' && by !== 'store') return [];
  const useRecharge = !metric || metric === 'recharge';

  const dateFilter = {};
  if (startDate) {
    const from = new Date(startDate);
    if (!isNaN(from.getTime())) dateFilter[Op.gte] = from;
  }
  if (endDate) {
    const to = new Date(endDate);
    to.setHours(23, 59, 59, 999);
    if (!isNaN(to.getTime())) dateFilter[Op.lte] = to;
  }

  const dialect = db.sequelize.getDialect();
  const isPg = dialect === 'postgres';

  if (by === 'distributor' && role === ROLES.MASTER_ADMIN) {
    // Platform: group by distributor_code (from users), sum deposits for users in that distributor
    if (!isPg) return fallbackTopByDistributor({ dateFilter });
    const replacements = {};
    const dateCond = [];
    if (startDate) {
      dateCond.push('ut."created_at" >= :startDate');
      replacements.startDate = new Date(startDate);
    }
    if (endDate) {
      dateCond.push('ut."created_at" <= :endDate');
      replacements.endDate = new Date(endDate + 'T23:59:59.999Z');
    }
    const dateClause = dateCond.length ? ' AND ' + dateCond.join(' AND ') : '';
    const rows = await db.sequelize.query(
      `SELECT u.distributor_code AS key,
              COALESCE(u.distributor_code, '—') AS label,
              COALESCE(SUM(CASE WHEN ut.type = 'deposit' THEN ut.amount ELSE 0 END), 0)::float AS value
       FROM users u
       INNER JOIN user_transactions ut ON ut.user_id = u.user_id AND ut.type = 'deposit' ${dateClause}
       WHERE u.role = :userRole
       GROUP BY u.distributor_code
       ORDER BY value DESC
       LIMIT 20`,
      {
        replacements: { ...replacements, userRole: ROLES.USER },
        type: db.Sequelize.QueryTypes.SELECT
      }
    );
    return (Array.isArray(rows) ? rows : []).map((r) => ({ key: r.key || '—', label: r.label || '—', value: Number(r.value) || 0 }));
  }

  if (by === 'store' && (role === ROLES.MASTER_ADMIN || (role === ROLES.DISTRIBUTOR_ADMIN && distributorCode))) {
    // Master: group by (distributor_code, store_code); Distributor: filter by distributorCode then group by store_code
    if (!isPg) return fallbackTopByStore({ role, distributorCode, dateFilter });
    const replacements = { userRole: ROLES.USER };
    const dateCond = [];
    if (startDate) {
      dateCond.push('ut."created_at" >= :startDate');
      replacements.startDate = new Date(startDate);
    }
    if (endDate) {
      dateCond.push('ut."created_at" <= :endDate');
      replacements.endDate = new Date(endDate + 'T23:59:59.999Z');
    }
    const dateClause = dateCond.length ? ' AND ' + dateCond.join(' AND ') : '';
    let whereClause = 'WHERE u.role = :userRole';
    if (role === ROLES.DISTRIBUTOR_ADMIN && distributorCode) {
      whereClause += ' AND u.distributor_code = :distributorCode';
      replacements.distributorCode = distributorCode;
    }
    const rows = await db.sequelize.query(
      `SELECT u.distributor_code || ' / ' || COALESCE(u.store_code, '—') AS key,
              COALESCE(u.store_code, '—') AS label,
              COALESCE(SUM(CASE WHEN ut.type = 'deposit' THEN ut.amount ELSE 0 END), 0)::float AS value
       FROM users u
       INNER JOIN user_transactions ut ON ut.user_id = u.user_id AND ut.type = 'deposit' ${dateClause}
       ${whereClause}
       GROUP BY u.distributor_code, u.store_code
       ORDER BY value DESC
       LIMIT 20`,
      { replacements, type: db.Sequelize.QueryTypes.SELECT }
    );
    return (Array.isArray(rows) ? rows : []).map((r) => ({ key: r.key || '—', label: r.label || '—', value: Number(r.value) || 0 }));
  }

  return [];
}

async function fallbackTopByDistributor({ dateFilter }) {
  const users = await db.User.findAll({
    where: { role: ROLES.USER },
    attributes: ['userId', 'distributorCode'],
    raw: true
  });
  const userIdsByDist = {};
  (users || []).forEach((u) => {
    const key = u.distributorCode || '—';
    if (!userIdsByDist[key]) userIdsByDist[key] = [];
    userIdsByDist[key].push(u.userId);
  });
  const result = [];
  for (const [key, ids] of Object.entries(userIdsByDist)) {
    const where = { userId: { [Op.in]: ids }, type: 'deposit' };
    if (Object.keys(dateFilter).length > 0) where.created_at = dateFilter;
    const sum = await db.UserTransaction.sum('amount', { where });
    result.push({ key, label: key, value: Number(sum) || 0 });
  }
  result.sort((a, b) => b.value - a.value);
  return result.slice(0, 20);
}

async function fallbackTopByStore({ role, distributorCode, dateFilter }) {
  const where = { role: ROLES.USER };
  if (role === ROLES.DISTRIBUTOR_ADMIN && distributorCode) where.distributorCode = distributorCode;
  const users = await db.User.findAll({
    where,
    attributes: ['userId', 'distributorCode', 'storeCode'],
    raw: true
  });
  const userIdsByStore = {};
  (users || []).forEach((u) => {
    const key = [u.distributorCode, u.storeCode].filter(Boolean).join(' / ') || '—';
    const label = u.storeCode || '—';
    if (!userIdsByStore[key]) userIdsByStore[key] = { label, ids: [] };
    userIdsByStore[key].ids.push(u.userId);
  });
  const result = [];
  for (const [key, { label, ids }] of Object.entries(userIdsByStore)) {
    const txWhere = { userId: { [Op.in]: ids }, type: 'deposit' };
    if (Object.keys(dateFilter).length > 0) txWhere.created_at = dateFilter;
    const sum = await db.UserTransaction.sum('amount', { where: txWhere });
    result.push({ key, label, value: Number(sum) || 0 });
  }
  result.sort((a, b) => b.value - a.value);
  return result.slice(0, 20);
}

module.exports = { getAnalyticsTop };
