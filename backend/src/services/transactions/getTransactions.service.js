const db = require('../../db/models');
const { Op } = require('sequelize');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const VALID_TYPES = [
  'deposit',
  'withdraw',
  'spin_wheel',
  'welcome_signup',
  'referral_friend_signup',
  'daily_bonus',
  'daily_bonus_spin',
  'promotion',
  'bonus_code',
  'affiliate',
  'vip_bonus',
  'game_deposit',
  'game_withdraw',
  'deposit_courtesy'
];

/** Game topup/redeem is written to both user_transactions and game_activities. */
const GAME_ACTIVITY_DUPLICATE_WINDOW_MS = 15 * 1000;

function roundAmount(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function gameActivityToTxType(activityType) {
  return activityType === 'topup' ? 'game_deposit' : 'game_withdraw';
}

function gameActivityMatchesUserTransaction(activity, tx) {
  if (tx.type !== gameActivityToTxType(activity.activityType)) return false;
  if (roundAmount(tx.amount) !== roundAmount(activity.amount)) return false;
  const activityAt = new Date(activity.createdAt).getTime();
  const txAt = new Date(tx.createdAt).getTime();
  return (
    Number.isFinite(activityAt) &&
    Number.isFinite(txAt) &&
    Math.abs(activityAt - txAt) <= GAME_ACTIVITY_DUPLICATE_WINDOW_MS
  );
}

function excludeDuplicateGameActivities(activities, userTransactions) {
  return (activities || []).filter(
    (activity) => !(userTransactions || []).some((tx) => gameActivityMatchesUserTransaction(activity, tx))
  );
}

/**
 * Skip game_activities that already have a matching user_transactions row
 * (same user, amount, deposit/withdraw type, within 15 seconds).
 */
function unmatchedGameActivityLiteral() {
  return db.sequelize.literal(`NOT EXISTS (
    SELECT 1
    FROM user_transactions ut
    WHERE ut.user_id = "GameActivity"."user_id"
      AND ut.type = CASE
        WHEN "GameActivity"."activity_type" = 'topup' THEN 'game_deposit'
        ELSE 'game_withdraw'
      END
      AND ut.amount = "GameActivity"."amount"
      AND ut.created_at BETWEEN "GameActivity"."created_at" - INTERVAL '15 seconds'
                           AND "GameActivity"."created_at" + INTERVAL '15 seconds'
  )`);
}

/**
 * List user transactions with filters and pagination.
 * @param {number} userId
 * @param {object} query - { page, limit, dateFrom, dateTo, category, gameName }
 */
async function getTransactions(userId, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT)
  );
  const offset = (page - 1) * limit;
  const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
  const dateTo = query.dateTo ? new Date(query.dateTo) : null;
  const category = query.category && VALID_TYPES.includes(query.category) ? query.category : null;
  const gameName =
    query.gameName && typeof query.gameName === 'string'
      ? query.gameName.trim().slice(0, 128)
      : null;

  const where = { userId };
  const isGameCategory = category === 'game_deposit' || category === 'game_withdraw';
  const includeGameActivities = !category || isGameCategory;

  if (category) {
    where.type = category;
  }

  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt[Op.gte] = dateFrom;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.createdAt[Op.lte] = end;
    }
  }

  if (gameName) {
    const escapeLike = (s) =>
      String(s).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_').replace(/'/g, "''");
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push(
      db.sequelize.literal(`(metadata->>'game_name') ILIKE '%${escapeLike(gameName)}%'`)
    );
  }

  const fetchCount = page * limit;

  const [txCount, txRows] = await Promise.all([
    db.UserTransaction.count({ where }),
    db.UserTransaction.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: fetchCount,
      attributes: ['id', 'type', 'amount', 'currencyCode', 'description', 'metadata', 'createdAt']
    })
  ]);

  let gaCount = 0;
  let gaRows = [];
  if (includeGameActivities) {
    const gaWhere = { userId };
    if (category === 'game_deposit') gaWhere.activityType = 'topup';
    else if (category === 'game_withdraw') gaWhere.activityType = 'redeem';
    else gaWhere.activityType = { [Op.in]: ['topup', 'redeem'] };

    if (dateFrom || dateTo) {
      gaWhere.createdAt = {};
      if (dateFrom) gaWhere.createdAt[Op.gte] = dateFrom;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        gaWhere.createdAt[Op.lte] = end;
      }
    }

    gaWhere[Op.and] = gaWhere[Op.and] || [];
    gaWhere[Op.and].push(unmatchedGameActivityLiteral());

    const gameInclude = {
      model: db.Game,
      as: 'Game',
      attributes: ['name'],
      required: false
    };
    if (gameName) {
      gameInclude.required = true;
      gameInclude.where = {
        name: { [Op.iLike]: `%${gameName}%` }
      };
    }

    [gaCount, gaRows] = await Promise.all([
      db.GameActivity.count({ where: gaWhere, include: [gameInclude] }),
      db.GameActivity.findAll({
        where: gaWhere,
        include: [gameInclude],
        order: [['createdAt', 'DESC']],
        limit: fetchCount,
        attributes: ['id', 'activityType', 'amount', 'createdAt']
      })
    ]);

    gaRows = excludeDuplicateGameActivities(gaRows, txRows);
  }

  const txTransactions = (txRows || []).map((r) => ({
    id: r.id,
    type: r.type,
    amount: Number(r.amount),
    currency_code: r.currencyCode,
    description: r.description || null,
    game_name: (r.metadata && r.metadata.game_name) || null,
    created_at: r.createdAt
  }));

  const gaTransactions = (gaRows || []).map((r) => ({
    id: `ga-${r.id}`,
    type: r.activityType === 'topup' ? 'game_deposit' : 'game_withdraw',
    amount: Number(r.amount) || 0,
    currency_code: null,
    description:
      r.activityType === 'topup'
        ? 'Game deposit'
        : 'Game redeem',
    game_name: r.Game?.name || null,
    created_at: r.createdAt
  }));

  const merged = [...txTransactions, ...gaTransactions]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const transactions = merged.slice(offset, offset + limit);
  const total = txCount + gaCount;

  return {
    transactions,
    total,
    page,
    limit,
    total_pages: Math.max(1, Math.ceil(total / limit))
  };
}

module.exports = { getTransactions, VALID_TYPES };
