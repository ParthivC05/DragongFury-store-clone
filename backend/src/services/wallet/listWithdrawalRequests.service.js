const db = require('../../db/models');
const { Op } = require('sequelize');
const {
  APPROVER_USER_ATTRS,
  approverUserNestedIncludes,
  buildApproverPayload
} = require('../../utils/approverUserPayload');

const approverUserInclude = {
  model: db.User,
  as: 'ApprovedByUser',
  attributes: APPROVER_USER_ATTRS,
  required: false,
  include: approverUserNestedIncludes(db)
};

/**
 * List withdrawal requests. Role-based:
 * - Regular user: only their own requests (card + crypto/Speed)
 * - Admin: all requests
 * Merges WithdrawalRequest (card/linked-account) and SpeedWithdrawRequest (crypto) so both appear in history.
 * @param {number} userId - current user id
 * @param {boolean} isAdmin
 * @param {{ limit?: number, offset?: number, currency?: string, status?: string }} query
 */
async function listWithdrawalRequests(userId, isAdmin, query = {}) {
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 20), 100);
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);

  const where = {};
  if (!isAdmin) {
    where.userId = userId;
  }
  if (query.currency && String(query.currency).trim()) {
    where.currency = { [Op.iLike]: String(query.currency).trim() };
  }
  if (query.status && String(query.status).trim()) {
    where.status = { [Op.iLike]: String(query.status).trim() };
  }

  const includeUsers = [{ ...approverUserInclude }];
  if (isAdmin) {
    includeUsers.unshift({
      model: db.User,
      as: 'User',
      attributes: ['userId', 'username', 'email', 'firstName', 'lastName'],
      required: false
    });
  }

  const { rows, count } = await db.WithdrawalRequest.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: 500,
    offset: 0,
    attributes: [
      'id', 'userId', 'amount', 'method', 'status', 'currency',
      'linkedAccountId', 'cryptoAddress', 'reason', 'routingType', 'gameName', 'gameUsername',
      'rejectionReason', 'paymentApiRequestId', 'approvedByUserId', 'created_at', 'updated_at'
    ],
    include: includeUsers
  });

  const cardRequests = (rows || []).map((r) => {
    const item = {
      id: r.id,
      _sortKey: r.created_at,
      _source: 'card',
      userId: r.userId,
      amount: Number(r.amount),
      method: r.method || '',
      status: r.status,
      currency: r.currency || null,
      linkedAccountId: r.linkedAccountId || null,
      cryptoAddress: r.cryptoAddress || null,
      reason: r.reason || null,
      routingType: r.routingType || null,
      gameName: r.gameName || null,
      gameUsername: r.gameUsername || null,
      rejectionReason: r.rejectionReason || null,
      paymentApiRequestId: r.paymentApiRequestId != null ? Number(r.paymentApiRequestId) : null,
      approvedByUserId: r.approvedByUserId != null ? Number(r.approvedByUserId) : null,
      approvedBy: buildApproverPayload(r.ApprovedByUser),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
    if (r.User) {
      item.user = {
        userId: r.User.userId,
        username: r.User.username,
        email: r.User.email,
        firstName: r.User.firstName,
        lastName: r.User.lastName
      };
    }
    return item;
  });

  let speedRequests = [];
  if (db.SpeedWithdrawRequest) {
    const speedWhere = isAdmin ? {} : { userId };
    try {
      const speedRows = await db.SpeedWithdrawRequest.findAll({
        where: speedWhere,
        order: [['created_at', 'DESC']],
        limit: 500,
        attributes: ['id', 'userId', 'amount', 'currency', 'status', 'created_at', 'updated_at', 'completedAt', 'claimedAt']
      });
      speedRequests = (speedRows || []).map((r) => {
        const status = (r.status || 'active').toLowerCase();
        const normalizedStatus = status === 'paid' ? 'completed' : status === 'active' ? 'pending' : status;
        return {
          id: `speed-${r.id}`,
          _sortKey: r.created_at,
          _source: 'speed',
          userId: r.userId,
          amount: Number(r.amount),
          method: 'scrypto',
          status: normalizedStatus,
          currency: r.currency || null,
          linkedAccountId: null,
          cryptoAddress: null,
          reason: null,
          routingType: null,
          gameName: null,
          gameUsername: null,
          rejectionReason: null,
          paymentApiRequestId: null,
          createdAt: r.created_at,
          updatedAt: r.updated_at
        };
      });
    } catch {
      speedRequests = [];
    }
  }

  const merged = [...cardRequests, ...speedRequests]
    .sort((a, b) => new Date(b._sortKey) - new Date(a._sortKey));
  const total = merged.length;
  const requests = merged
    .slice(offset, offset + limit)
    .map(({ _sortKey, _source, ...rest }) => rest);

  return {
    success: true,
    data: requests,
    total
  };
}

module.exports = { listWithdrawalRequests };
