'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES, isMasterAdmin } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { NOTIFICATION_CATEGORIES } = require('../../constants/notificationCategories');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('../../services/wallet/getCurrencySetting.service');
const { parseDepositFundingFromNotes, refundPlayable } = require('../../services/wallet/walletBuckets.service');
const {
  enrichManualRequestDiscount,
  resolveManualDepositGameCredit,
  parseDepositDiscountFromNotes,
  buildGameDepositActivityMetadata
} = require('../../utils/depositDiscount.helpers');
const { recordRscWin } = require('../../services/wallet/scLedger.service');
const { classifyProduct, winEventForProduct } = require('../../services/wallet/scProduct.service');
const {
  attachGameUsernamesToManualRequests,
  appendGameUsernameSearchToWhere
} = require('../../utils/gameManualRequest.helpers');
const { recordGameManualRequestLog } = require('../../services/games/recordGameManualRequestLog.service');
const {
  getManualRegisterCredentials,
  updateManualRegisterCredentials,
  listManualRegisterCredentialLogs
} = require('../../services/games/manualRegisterCredentials.service');
const {
  assertGameUsernameAvailable,
  createGameUsernameTakenError,
  isGameUsernameTakenDbError,
  isGameUsernameTakenError
} = require('../../services/games/assertGameUsernameAvailable.service');
const { omitPlayerEmailAttr, stripPlayerEmailFields } = require('../../utils/playerEmailVisibility');

/**
 * Map the acting admin's role to the operation_done_by label stored in the DB.
 */
function getOperationDoneBy(role) {
  switch (role) {
    case ROLES.STORE_ADMIN: return 'store_admin';
    case ROLES.DISTRIBUTOR_ADMIN: return 'distributor_admin';
    case ROLES.MASTER_ADMIN: return 'master_admin';
    default: return 'admin';
  }
}

/**
 * Check if the current admin can access a particular manual request.
 * - store_admin: only requests for their store
 * - distributor_admin: only requests for their distributor
 * - master_admin: all requests
 */
function isAuthorizedForRequest(req, manualReq) {
  if (req.role === ROLES.MASTER_ADMIN) return true;
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return manualReq.distributorCode === req.distributorCode;
  if (req.role === ROLES.STORE_ADMIN) return manualReq.storeCode === req.storeCode;
  return false;
}

function hasManualRequestsPageAccess(req) {
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return true;
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS) ||
      canAdmin(req, ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER) ||
      canAdmin(req, ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT) ||
      canAdmin(req, ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM);
  }
  return can(req, STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS) ||
    can(req, STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER) ||
    can(req, STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT) ||
    can(req, STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM);
}

function hasManualRequestTypePermission(req, requestType) {
  const typeToStoreKey = {
    register: STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER,
    deposit: STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT,
    redeem: STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM
  };
  const typeToAdminKey = {
    register: ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REGISTER,
    deposit: ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_DEPOSIT,
    redeem: ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS_REDEEM
  };
  if (req.role === ROLES.MASTER_ADMIN) {
    return canAdmin(req, ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS) || canAdmin(req, typeToAdminKey[requestType]);
  }
  return can(req, STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS) || can(req, typeToStoreKey[requestType]);
}

function getAllowedManualRequestTypes(req) {
  const allTypes = ['register', 'deposit', 'redeem'];
  if (req.role === ROLES.DISTRIBUTOR_ADMIN) return allTypes;
  if ((req.role === ROLES.MASTER_ADMIN && canAdmin(req, ADMIN_FEATURE_KEYS.GAME_MANUAL_REQUESTS)) ||
    (req.role !== ROLES.MASTER_ADMIN && can(req, STORE_FEATURE_KEYS.GAME_MANUAL_REQUESTS))) {
    return allTypes;
  }
  return allTypes.filter((type) => hasManualRequestTypePermission(req, type));
}

/**
 * GET /api/admin/game-manual-requests
 * List manual requests. Scoped by the admin's role.
 * Deposit requests: if not approved/rejected within 3 hours, they are auto-refunded (amount + 1 SC) and rejected.
 * Withdrawal (redeem) and register requests: no time limit; admin can approve or reject whenever.
 * Query params: status, requestType, gameUsername, gameId, storeCode (master only), distributorCode (master only), page, limit
 */
async function list(req, res) {
  try {
    if (!hasManualRequestsPageAccess(req)) {
      return sendError(res, 'You do not have access to Game Manual Requests.', 403);
    }

    const query = req.query || {};
    const where = {};

    if (req.role === ROLES.STORE_ADMIN) {
      where.storeCode = req.storeCode;
    } else if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
      where.distributorCode = req.distributorCode;
    } else if (req.role === ROLES.MASTER_ADMIN) {
      if (query.storeCode) where.storeCode = String(query.storeCode).trim();
      if (query.distributorCode) where.distributorCode = String(query.distributorCode).trim();
    }

    if (query.status) where.status = String(query.status).trim();
    if (query.requestType) {
      const requestType = String(query.requestType).trim();
      if (!hasManualRequestTypePermission(req, requestType)) {
        return sendError(res, `You do not have access to ${requestType} manual requests.`, 403);
      }
      where.requestType = requestType;
    } else {
      const allowedTypes = getAllowedManualRequestTypes(req);
      if (allowedTypes.length === 0) {
        return sendSuccess(res, { list: [], total: 0, page: 1, limit: 20 });
      }
      where.requestType = { [Op.in]: allowedTypes };
    }
    if (query.gameId) {
      const gid = parseInt(query.gameId, 10);
      if (!Number.isNaN(gid)) where.gameId = gid;
    }

    const gameUsernameSearch = query.gameUsername || query.game_username;
    const whereWithSearch = gameUsernameSearch
      ? await appendGameUsernameSearchToWhere(db, where, gameUsernameSearch)
      : where;

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const userAttrs = omitPlayerEmailAttr(['userId', 'username', 'email', 'phone'], req.role)
      .filter((a) => (isMasterAdmin(req.role) ? true : a !== 'phone'));

    const { rows, count: total } = await db.GameManualRequest.findAndCountAll({
      where: whereWithSearch,
      include: [
        { model: db.User, as: 'User', attributes: userAttrs },
        { model: db.Game, as: 'Game', attributes: ['id', 'name'] }
      ],
      order: [[db.sequelize.col('created_at'), 'DESC']],
      limit,
      offset
    });

    // Attach resolver usernames for approved/rejected requests
    const resolverIds = [...new Set(rows.filter(r => r.resolvedByUserId).map(r => r.resolvedByUserId))];
    const resolversMap = {};
    if (resolverIds.length > 0) {
      const resolvers = await db.User.findAll({
        where: { userId: resolverIds },
        attributes: ['userId', 'username', 'role']
      });
      for (const r of resolvers) {
        resolversMap[r.userId] = { username: r.username, role: r.role };
      }
    }

    let list = rows.map((r) => {
      const j = r.toJSON();
      if (j.resolvedByUserId && resolversMap[j.resolvedByUserId]) {
        j.resolvedByUsername = resolversMap[j.resolvedByUserId].username;
      }
      // Never expose stored game password in list view
      delete j.gamePassword;
      if (j.User) stripPlayerEmailFields(j.User, req.role);
      return enrichManualRequestDiscount(j);
    });

    list = await attachGameUsernamesToManualRequests(db, list);

    sendSuccess(res, { list, total, page, limit });
  } catch (err) {
    sendError(res, err.message || 'Failed to load manual requests', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/game-manual-requests/:id
 * Get a single manual request.
 */
async function get(req, res) {
  try {
    if (!hasManualRequestsPageAccess(req)) {
      return sendError(res, 'You do not have access to Game Manual Requests.', 403);
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid request id', 400);

    const userAttrs = omitPlayerEmailAttr(['userId', 'username', 'email', 'phone'], req.role)
      .filter((a) => (isMasterAdmin(req.role) ? true : a !== 'phone'));

    const manualReq = await db.GameManualRequest.findByPk(id, {
      include: [
        { model: db.User, as: 'User', attributes: userAttrs },
        { model: db.Game, as: 'Game', attributes: ['id', 'name'] }
      ]
    });

    if (!manualReq) return sendError(res, 'Request not found', 404);
    if (!isAuthorizedForRequest(req, manualReq)) return sendError(res, 'Forbidden', 403);
    if (!hasManualRequestTypePermission(req, manualReq.requestType)) {
      return sendError(res, `You do not have access to ${manualReq.requestType} manual requests.`, 403);
    }

    let j = manualReq.toJSON();
    delete j.gamePassword;
    if (j.User) stripPlayerEmailFields(j.User, req.role);
    [j] = await attachGameUsernamesToManualRequests(db, [j]);
    sendSuccess(res, enrichManualRequestDiscount(j));
  } catch (err) {
    sendError(res, err.message || 'Failed to load request', err.statusCode || 500);
  }
}

/**
 * POST /api/admin/game-manual-requests/:id/approve
 * Approve a pending manual request.
 *
 * For 'register': body must include { game_username, game_password }
 *   → creates the UserGameAccount with the provided credentials
 *
 * For 'deposit': no extra body needed
 *   → wallet was already deducted when the request was created; just log the activity
 *
 * For 'redeem': no extra body needed
 *   → credits the user's wallet now
 */
async function approve(req, res) {
  try {
    if (!hasManualRequestsPageAccess(req)) {
      return sendError(res, 'You do not have access to Game Manual Requests.', 403);
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid request id', 400);

    const manualReq = await db.GameManualRequest.findByPk(id, {
      include: [{ model: db.Game, as: 'Game', attributes: ['id', 'name'] }]
    });

    if (!manualReq) return sendError(res, 'Request not found', 404);
    if (manualReq.status !== 'pending') return sendError(res, 'This request has already been processed.', 400);
    if (!isAuthorizedForRequest(req, manualReq)) return sendError(res, 'Forbidden', 403);
    if (!hasManualRequestTypePermission(req, manualReq.requestType)) {
      return sendError(res, `You do not have access to ${manualReq.requestType} manual requests.`, 403);
    }

    const body = req.body || {};
    const operationDoneBy = getOperationDoneBy(req.role);
    const resolvedByUserId = req.user?.userId || null;

    await db.sequelize.transaction(async (t) => {
      if (manualReq.requestType === 'register') {
        const gameUsername = String(body.game_username || '').trim();
        const gamePassword = String(body.game_password || '').trim();

        if (!gameUsername) throw Object.assign(new Error('Game username is required.'), { statusCode: 400 });
        if (!gamePassword) throw Object.assign(new Error('Game password is required.'), { statusCode: 400 });

        await assertGameUsernameAvailable(manualReq.gameId, gameUsername, manualReq.userId, {
          gameName: manualReq.Game?.name,
          transaction: t
        });

        const existing = await db.UserGameAccount.findOne({
          where: { userId: manualReq.userId, gameId: manualReq.gameId },
          transaction: t
        });

        if (existing) {
          await existing.update({
            botUsername: gameUsername,
            botPassword: gamePassword,
            status: 'active',
            operationDoneBy
          }, { transaction: t });
        } else {
          await db.UserGameAccount.create({
            userId: manualReq.userId,
            gameId: manualReq.gameId,
            botUsername: gameUsername,
            botPassword: gamePassword,
            status: 'active',
            operationDoneBy
          }, { transaction: t });
        }

        await db.GameActivity.create({
          userId: manualReq.userId,
          gameId: manualReq.gameId,
          activityType: 'register',
          operationDoneBy,
          operationDoneByUserId: resolvedByUserId
        }, { transaction: t });

        await manualReq.update({
          status: 'approved',
          gameUsername,
          gamePassword,
          resolvedByUserId,
          resolvedAt: new Date(),
          operationDoneBy
        }, { transaction: t });

        await recordGameManualRequestLog({
          manualRequestId: manualReq.id,
          userId: manualReq.userId,
          gameId: manualReq.gameId,
          actionType: 'register_approved',
          gameUsername,
          gamePassword,
          performedByUserId: resolvedByUserId,
          operationDoneBy
        }, t);

      } else if (manualReq.requestType === 'deposit') {
        const discount = parseDepositDiscountFromNotes(manualReq.notes);
        const gameCredit = resolveManualDepositGameCredit(manualReq);
        // Wallet was already deducted when the request was created — just log the activity
        await db.GameActivity.create({
          userId: manualReq.userId,
          gameId: manualReq.gameId,
          activityType: 'topup',
          amount: gameCredit,
          metadata: buildGameDepositActivityMetadata({
            walletAmount: Number(manualReq.amount),
            gameCredit,
            discountPercent: discount ? discount.percent : 0,
            gameName: manualReq.Game?.name
          }),
          operationDoneBy,
          operationDoneByUserId: resolvedByUserId
        }, { transaction: t });

        if (db.UserTransaction) {
          const primaryCurrencyCode = await getCurrencySetting();
          await db.UserTransaction.create({
            userId: manualReq.userId,
            type: 'game_deposit',
            amount: Number(manualReq.amount),
            currencyCode: primaryCurrencyCode,
            description: discount
              ? `${Number(manualReq.amount)} ${primaryCurrencyCode} deposited to game account (${gameCredit} SC credited, ${discount.percent}% extra)`
              : `${Number(manualReq.amount)} ${primaryCurrencyCode} deposited to game account`,
            metadata: {
              game_name: manualReq.Game?.name || null,
              wallet_amount: Number(manualReq.amount),
              game_credit: gameCredit,
              deposit_discount_percent: discount ? discount.percent : 0
            }
          }, { transaction: t });
        }

        await manualReq.update({
          status: 'approved',
          resolvedByUserId,
          resolvedAt: new Date(),
          operationDoneBy
        }, { transaction: t });

      } else if (manualReq.requestType === 'redeem') {
        const product = classifyProduct(manualReq.Game);
        const win = await recordRscWin({
          userId: manualReq.userId,
          grossAmount: Number(manualReq.amount),
          creditWallet: true,
          ledger: {
            eventType: winEventForProduct(product.productId),
            sourceType: 'MANUAL_REDEEM',
            sourceId: manualReq.id,
            productId: product.productId,
            productType: product.productType,
            providerId: product.providerId,
            gameId: product.gameId || manualReq.gameId,
            createdBy: resolvedByUserId,
            remarks: `Manual redeem from ${product.label}`
          },
          transaction: t
        });

        await db.GameActivity.create({
          userId: manualReq.userId,
          gameId: manualReq.gameId,
          activityType: 'redeem',
          amount: win.eligible,
          operationDoneBy,
          operationDoneByUserId: resolvedByUserId
        }, { transaction: t });

        if (db.UserTransaction) {
          await db.UserTransaction.create({
            userId: manualReq.userId,
            type: 'game_withdraw',
            amount: Number(manualReq.amount),
            currencyCode: REDEEMABLE_CURRENCY_CODE,
            description: `${Number(manualReq.amount)} SC redeemed from game account`,
            metadata: { game_name: manualReq.Game?.name || null }
          }, { transaction: t });
        }

        await manualReq.update({
          status: 'approved',
          resolvedByUserId,
          resolvedAt: new Date(),
          operationDoneBy
        }, { transaction: t });
      }
    });

    const updated = await db.GameManualRequest.findByPk(id, {
      include: [
        { model: db.User, as: 'User', attributes: ['userId', 'username'] },
        { model: db.Game, as: 'Game', attributes: ['id', 'name'] }
      ]
    });

    // Notify the user instantly
    if (db.Notification && updated) {
      const gameName = updated.Game ? updated.Game.name : 'Game';
      const amountStr = updated.amount != null ? Number(updated.amount).toFixed(2) : '';
      let title = '';
      let message = '';
      let type = 'game_request';
      if (updated.requestType === 'register') {
        title = 'Game registration approved';
        message = `Your request to register for ${gameName} has been approved.`;
      } else if (updated.requestType === 'deposit') {
        title = 'Top-up approved';
        const credit = resolveManualDepositGameCredit(updated);
        const walletStr = amountStr;
        message = walletStr
          ? (Number(credit) !== Number(updated.amount)
            ? `Your top-up of ${walletStr} for ${gameName} has been approved. ${Number(credit).toFixed(2)} SC was credited in the game.`
            : `Your top-up of ${walletStr} for ${gameName} has been approved.`)
          : `Your top-up for ${gameName} has been approved.`;
      } else if (updated.requestType === 'redeem') {
        title = 'Withdrawal approved';
        message = amountStr ? `Your withdrawal of ${amountStr} from ${gameName} has been approved.` : `Your withdrawal from ${gameName} has been approved.`;
      }
      if (title) {
        await db.Notification.create({
          userId: updated.userId,
          type,
          category: NOTIFICATION_CATEGORIES.OTHER,
          title,
          message,
          actionUrl: '/'
        }).catch(() => {});
      }
    }

    const j = updated.toJSON();
    delete j.gamePassword;
    sendSuccess(res, j);
  } catch (err) {
    if (isGameUsernameTakenError(err) || isGameUsernameTakenDbError(err)) {
      const mapped = isGameUsernameTakenError(err) ? err : createGameUsernameTakenError();
      return sendError(res, mapped.message, mapped.statusCode || 409, mapped.code);
    }
    sendError(res, err.message || 'Failed to approve request', err.statusCode || 500);
  }
}

/**
 * POST /api/admin/game-manual-requests/:id/reject
 * Reject a pending manual request.
 *
 * Body (optional): { rejection_reason: string }
 *
 * For 'deposit': automatically refunds the reserved wallet funds.
 * For 'register' / 'redeem': no wallet change needed.
 */
async function reject(req, res) {
  try {
    if (!hasManualRequestsPageAccess(req)) {
      return sendError(res, 'You do not have access to Game Manual Requests.', 403);
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid request id', 400);

    const manualReq = await db.GameManualRequest.findByPk(id, {
      include: [{ model: db.Game, as: 'Game', attributes: ['id', 'name'] }]
    });
    if (!manualReq) return sendError(res, 'Request not found', 404);
    if (manualReq.status !== 'pending') return sendError(res, 'This request has already been processed.', 400);
    if (!isAuthorizedForRequest(req, manualReq)) return sendError(res, 'Forbidden', 403);
    if (!hasManualRequestTypePermission(req, manualReq.requestType)) {
      return sendError(res, `You do not have access to ${manualReq.requestType} manual requests.`, 403);
    }

    const body = req.body || {};
    const resolvedByUserId = req.user?.userId || null;

    await db.sequelize.transaction(async (t) => {
      // Deposit funds were reserved when the request was created — refund them on rejection
      if (manualReq.requestType === 'deposit' && manualReq.amount) {
        const funding = parseDepositFundingFromNotes(manualReq.notes, manualReq.amount);
        const product = classifyProduct(manualReq.Game);
        await refundPlayable(manualReq.userId, funding, t, {
          sourceType: 'MANUAL_DEPOSIT_REJECT',
          sourceId: manualReq.id,
          productId: product.productId,
          productType: product.productType,
          eventType: 'REFUND',
          remarks: 'Rejected manual game deposit refunded'
        });
      }

      await manualReq.update({
        status: 'rejected',
        rejectionReason: body.rejection_reason ? String(body.rejection_reason).trim() : null,
        resolvedByUserId,
        resolvedAt: new Date(),
        operationDoneBy: getOperationDoneBy(req.role)
      }, { transaction: t });
    });

    // Notify the user instantly
    if (db.Notification && manualReq) {
      const gameName = manualReq.Game ? manualReq.Game.name : 'Game';
      const amountStr = manualReq.amount != null ? Number(manualReq.amount).toFixed(2) : '';
      let title = '';
      let message = '';
      const type = 'game_request';
      if (manualReq.requestType === 'register') {
        title = 'Game registration rejected';
        message = `Your request to register for ${gameName} was rejected.`;
      } else if (manualReq.requestType === 'deposit') {
        title = 'Top-up rejected';
        message = `Your top-up request for ${gameName} was rejected. The amount has been refunded to your wallet.`;
      } else if (manualReq.requestType === 'redeem') {
        title = 'Withdrawal rejected';
        message = amountStr ? `Your withdrawal of ${amountStr} from ${gameName} was rejected.` : `Your withdrawal request from ${gameName} was rejected.`;
      }
      if (title) {
        const reason = manualReq.rejectionReason || body.rejection_reason;
        if (reason) message += ` Reason: ${String(reason).slice(0, 200)}`;
        await db.Notification.create({
          userId: manualReq.userId,
          type,
          category: NOTIFICATION_CATEGORIES.OTHER,
          title,
          message,
          actionUrl: '/'
        }).catch(() => {});
      }
    }

    sendSuccess(res, manualReq.toJSON());
  } catch (err) {
    sendError(res, err.message || 'Failed to reject request', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/game-manual-requests/:id/credentials
 * Return stored game credentials for an approved register request (for edit modal).
 */
async function getCredentials(req, res) {
  try {
    if (!hasManualRequestsPageAccess(req)) {
      return sendError(res, 'You do not have access to Game Manual Requests.', 403);
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid request id', 400);

    const manualReq = await db.GameManualRequest.findByPk(id);
    if (!manualReq) return sendError(res, 'Request not found', 404);
    if (manualReq.requestType !== 'register' || manualReq.status !== 'approved') {
      return sendError(res, 'Credentials can only be viewed for approved register requests.', 400);
    }
    if (!isAuthorizedForRequest(req, manualReq)) return sendError(res, 'Forbidden', 403);
    if (!hasManualRequestTypePermission(req, 'register')) {
      return sendError(res, 'You do not have access to register manual requests.', 403);
    }

    const creds = await getManualRegisterCredentials(manualReq);
    sendSuccess(res, creds);
  } catch (err) {
    sendError(res, err.message || 'Failed to load credentials', err.statusCode || 500);
  }
}

/**
 * PATCH /api/admin/game-manual-requests/:id/credentials
 * Update game credentials for an approved register request.
 * Body: { game_username, game_password }
 */
async function updateCredentials(req, res) {
  try {
    if (!hasManualRequestsPageAccess(req)) {
      return sendError(res, 'You do not have access to Game Manual Requests.', 403);
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid request id', 400);

    const manualReq = await db.GameManualRequest.findByPk(id, {
      include: [
        { model: db.User, as: 'User', attributes: ['userId', 'username'] },
        { model: db.Game, as: 'Game', attributes: ['id', 'name'] }
      ]
    });

    if (!manualReq) return sendError(res, 'Request not found', 404);
    if (manualReq.requestType !== 'register' || manualReq.status !== 'approved') {
      return sendError(res, 'Credentials can only be updated for approved register requests.', 400);
    }
    if (!isAuthorizedForRequest(req, manualReq)) return sendError(res, 'Forbidden', 403);
    if (!hasManualRequestTypePermission(req, 'register')) {
      return sendError(res, 'You do not have access to register manual requests.', 403);
    }

    const body = req.body || {};
    const gameUsername = String(body.game_username || '').trim();
    const gamePassword = String(body.game_password || '').trim();

    if (!gameUsername) throw Object.assign(new Error('Game username is required.'), { statusCode: 400 });
    if (!gamePassword) throw Object.assign(new Error('Game password is required.'), { statusCode: 400 });

    const performedByUserId = req.user?.userId || null;
    const operationDoneBy = getOperationDoneBy(req.role);

    await updateManualRegisterCredentials(manualReq, {
      gameUsername,
      gamePassword,
      performedByUserId,
      operationDoneBy
    });

    const j = manualReq.toJSON();
    j.gameUsername = gameUsername;
    delete j.gamePassword;
    sendSuccess(res, j);
  } catch (err) {
    sendError(res, err.message || 'Failed to update credentials', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/game-manual-requests/:id/logs
 * Audit trail for register approval and credential updates on a manual request.
 */
async function listLogs(req, res) {
  try {
    if (!hasManualRequestsPageAccess(req)) {
      return sendError(res, 'You do not have access to Game Manual Requests.', 403);
    }

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid request id', 400);

    const manualReq = await db.GameManualRequest.findByPk(id);
    if (!manualReq) return sendError(res, 'Request not found', 404);
    if (manualReq.requestType !== 'register') {
      return sendError(res, 'Logs are only available for register requests.', 400);
    }
    if (!isAuthorizedForRequest(req, manualReq)) return sendError(res, 'Forbidden', 403);
    if (!hasManualRequestTypePermission(req, 'register')) {
      return sendError(res, 'You do not have access to register manual requests.', 403);
    }

    const list = await listManualRegisterCredentialLogs(id);
    sendSuccess(res, { list });
  } catch (err) {
    sendError(res, err.message || 'Failed to load request logs', err.statusCode || 500);
  }
}

module.exports = { list, get, approve, reject, getCredentials, updateCredentials, listLogs };
