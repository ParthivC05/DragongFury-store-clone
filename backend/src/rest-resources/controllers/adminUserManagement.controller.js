'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES, isMasterAdmin, isDistributorAdmin } = require('../../constants/roles');
const { can, canAdmin } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS, ADMIN_FEATURE_KEYS } = require('../../constants/permissions');
const { USER_CREATED_AT, USER_UPDATED_AT } = require('../../utils/userModelSequelize');
const { canViewPlayerEmail, omitPlayerEmailAttr } = require('../../utils/playerEmailVisibility');
const { loadEndUserInScope } = require('../../services/adminUsers/endUserScope.service');
const { getBalance } = require('../../services/wallet/getBalance.service');
const { adminDeductWallets, adminAddSc } = require('../../services/adminUsers/adminWalletDeduct.service');
const { listDepositRequestsAdmin } = require('../../services/wallet/listDepositRequestsAdmin.service');
const { listWithdrawalRequestsAdmin } = require('../../services/wallet/listWithdrawalRequestsAdmin.service');
const { attachGameUsernamesToManualRequests } = require('../../utils/gameManualRequest.helpers');
const {
  findApprovedRegisterManualRequest,
  getManualRegisterCredentials,
  updateManualRegisterCredentials,
  listManualRegisterCredentialLogs
} = require('../../services/games/manualRegisterCredentials.service');
const {
  deleteSingleGameCredentials,
  deleteAllGameCredentials,
  getGameCredentialsHistory
} = require('../../services/games/deleteGameCredentials.service');
const {
  assertGameUsernameAvailable,
  createGameUsernameTakenError,
  isGameUsernameTakenDbError,
  isGameUsernameTakenError
} = require('../../services/games/assertGameUsernameAvailable.service');
const { getGamesList } = require('../../services/gitslotpark/getGamesList.service');
const { getGamesList: getScorpioGamesList } = require('../../services/scorpioplay/getGamesList.service');

function getOperationDoneBy(role) {
  switch (role) {
    case ROLES.STORE_ADMIN: return 'store_admin';
    case ROLES.DISTRIBUTOR_ADMIN: return 'distributor_admin';
    case ROLES.MASTER_ADMIN: return 'master_admin';
    default: return 'admin';
  }
}

async function loadGameAccountForEditing(req, userId, accountId) {
  const scoped = await loadEndUserInScope(req, userId);
  if (scoped.status) return { error: { message: scoped.message, status: scoped.status } };

  const id = parseInt(accountId, 10);
  if (Number.isNaN(id)) return { error: { message: 'Invalid game account id', status: 400 } };

  const account = await db.UserGameAccount.findOne({
    where: { id, userId: scoped.user.userId },
    include: [{ model: db.Game, attributes: ['id', 'name', 'isActive'], required: false }]
  });
  if (!account) return { error: { message: 'Game account not found', status: 404 } };

  const manualReq = await findApprovedRegisterManualRequest(scoped.user.userId, account.gameId);

  return { user: scoped.user, account, manualReq };
}

function requireUsersAccess(req, res) {
  if (!can(req, STORE_FEATURE_KEYS.USERS_LIST)) {
    return sendError(res, 'You don\'t have access to Users. Please contact your administrator if you need access.', 403);
  }
  return null;
}

/** Add/remove SC: separate from Users view. Store staff need wallet_adjust; master technical staff need admin wallet_adjust. */
function requireWalletAdjustAccess(req, res) {
  const denied = requireUsersAccess(req, res);
  if (denied) return denied;
  if (isDistributorAdmin(req.role)) return null;
  if (isMasterAdmin(req.role)) {
    if (!canAdmin(req, ADMIN_FEATURE_KEYS.WALLET_ADJUST)) {
      return sendError(res, 'You don\'t have access to add or remove SC. Please contact your administrator if you need access.', 403);
    }
    return null;
  }
  if (!can(req, STORE_FEATURE_KEYS.WALLET_ADJUST)) {
    return sendError(res, 'You don\'t have access to add or remove SC. Please contact your administrator if you need access.', 403);
  }
  return null;
}

const DETAIL_ATTRS = [
  'userId',
  'username',
  'firstName',
  'lastName',
  'email',
  'phone',
  'role',
  'distributorCode',
  'storeCode',
  'isActive',
  'pendingFreeSpins',
  'userReferralCode',
  'userReferredBy',
  'onboardingCompleted',
  'profileImageUrl',
  'signInType',
  'kycStatus',
  'kycProvider',
  'diditSessionId',
  'kycVerifiedAt',
  'kycUpdatedAt',
  'kycDeclineReason',
  'isPhoneVerified',
  'phoneVerifiedAt',
  'deviceVisitorId',
  USER_CREATED_AT,
  USER_UPDATED_AT
];

async function getById(req, res) {
  const denied = requireUsersAccess(req, res);
  if (denied) return denied;
  const scoped = await loadEndUserInScope(req, req.params.userId);
  if (scoped.status) return sendError(res, scoped.message, scoped.status);

  const user = scoped.user;
  let attrs = omitPlayerEmailAttr(DETAIL_ATTRS, req.role);

  // Phone numbers: super admin + platform technical staff only (all master_admin).
  const canViewPhone = isMasterAdmin(req.role);
  if (!canViewPhone) {
    attrs = attrs.filter((a) => a !== 'phone');
  }
  await user.reload({ attributes: attrs });
  const plain = user.get({ plain: true });
  if (!canViewPhone) {
    plain.phone = null;
    plain.phoneHidden = true;
  }
  if (!canViewPlayerEmail(req.role)) {
    plain.email = null;
    plain.emailHidden = true;
  }
  const balance = await getBalance(user.userId);

  // PlayJuwa email-campaign offer status (claimed / applied / redeemed), if any.
  let emailCampaignOffer = null;
  try {
    if (
      db.EmailCampaignSend &&
      String(plain.storeCode || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') === 'playjuwa'
    ) {
      const send = await db.EmailCampaignSend.findOne({
        where: { userId: user.userId, claimStatus: 'claimed' },
        include: [{ model: db.EmailCampaign, as: 'Campaign' }],
        order: [['claimedAt', 'DESC']]
      });
      if (send?.Campaign) {
        const bonusCodeId = send.Campaign.bonusCodeId;
        let redeemed = false;
        if (bonusCodeId && db.UserBonusCodeGrant) {
          const used = await db.UserBonusCodeGrant.count({
            where: { userId: user.userId, bonusCodeId }
          });
          redeemed = used >= 1;
        }
        const valueType = String(send.Campaign.discountValueType || 'fixed').toLowerCase();
        const normalizedType =
          valueType === 'percent' || valueType === 'percentage' ? 'percentage' : 'fixed';
        emailCampaignOffer = {
          claimed: true,
          claimedAt: send.claimedAt || null,
          codeApplied: Boolean(send.codeAppliedAt),
          codeAppliedAt: send.codeAppliedAt || null,
          redeemed,
          discountCode: send.discountCodeSnapshot || send.Campaign.discountCode || null,
          discountValueType: normalizedType,
          discountValue:
            send.Campaign.discountValue != null ? Number(send.Campaign.discountValue) : null,
          campaignName: send.Campaign.name || null,
          campaignId: send.campaignId
        };
      }
    }
  } catch (_) {
    emailCampaignOffer = null;
  }

  return sendSuccess(res, { user: plain, balance, emailCampaignOffer });
}

async function patchUser(req, res) {
  const denied = requireUsersAccess(req, res);
  if (denied) return denied;
  const scoped = await loadEndUserInScope(req, req.params.userId);
  if (scoped.status) return sendError(res, scoped.message, scoped.status);

  const body = req.body || {};
  if (body.isActive === undefined) {
    return sendError(res, 'Body must include isActive (boolean).', 400);
  }
  const next = body.isActive === true || body.isActive === 1 || body.isActive === 'true';
  await scoped.user.update({ isActive: next });
  return sendSuccess(res, { userId: scoped.user.userId, isActive: next });
}

async function walletDeduct(req, res) {
  const denied = requireWalletAdjustAccess(req, res);
  if (denied) return denied;
  const scoped = await loadEndUserInScope(req, req.params.userId);
  if (scoped.status) return sendError(res, scoped.message, scoped.status);

  const body = req.body || {};
  const psc = body.psc != null ? Number(body.psc) : null;
  const bsc = body.bsc != null ? Number(body.bsc) : null;
  const rsc = body.rsc != null ? Number(body.rsc) : null;
  const sc = body.sc != null ? Number(body.sc) : null;
  const reason = body.reason != null ? String(body.reason) : '';

  try {
    await adminDeductWallets({
      targetUserId: scoped.user.userId,
      adminUserId: req.user?.userId,
      pscAmount: psc,
      bscAmount: bsc,
      rscAmount: rsc,
      scAmount: sc,
      reason
    });
    const balance = await getBalance(scoped.user.userId, { skipCache: true });
    return sendSuccess(res, { ok: true, balance });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Deduction failed.', status);
  }
}

async function walletAddSc(req, res) {
  const denied = requireWalletAdjustAccess(req, res);
  if (denied) return denied;
  const scoped = await loadEndUserInScope(req, req.params.userId);
  if (scoped.status) return sendError(res, scoped.message, scoped.status);

  const body = req.body || {};
  const psc = body.psc != null ? Number(body.psc) : null;
  const bsc = body.bsc != null ? Number(body.bsc) : null;
  const rsc = body.rsc != null ? Number(body.rsc) : null;
  const sc = body.sc != null ? Number(body.sc) : null;
  const description = body.description != null ? String(body.description) : '';

  try {
    await adminAddSc({
      targetUserId: scoped.user.userId,
      adminUserId: req.user?.userId,
      pscAmount: psc,
      bscAmount: bsc,
      rscAmount: rsc,
      scAmount: sc,
      description
    });
    const balance = await getBalance(scoped.user.userId, { skipCache: true });
    return sendSuccess(res, { ok: true, balance });
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Credit failed.', status);
  }
}

function parsePageLimit(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

async function listUserTransactions(req, res) {
  const denied = requireUsersAccess(req, res);
  if (denied) return denied;
  const scoped = await loadEndUserInScope(req, req.params.userId);
  if (scoped.status) return sendError(res, scoped.message, scoped.status);

  const query = req.query || {};
  const { page, limit, offset } = parsePageLimit(query);
  const type = query.type != null ? String(query.type).trim() : null;
  const types = query.types != null ? String(query.types).trim() : null;

  const where = { userId: scoped.user.userId };
  if (type) {
    where.type = type;
  } else if (types) {
    where.type = { [Op.in]: types.split(',').map((t) => t.trim()) };
  }

  const { rows, count } = await db.UserTransaction.findAndCountAll({
    where,
    order: [[db.sequelize.col('UserTransaction.created_at'), 'DESC']],
    limit,
    offset
  });

  return sendSuccess(res, {
    list: rows.map((r) => r.get({ plain: true })),
    total: count,
    page,
    limit
  });
}

async function listGameActivities(req, res) {
  const denied = requireUsersAccess(req, res);
  if (denied) return denied;
  const scoped = await loadEndUserInScope(req, req.params.userId);
  if (scoped.status) return sendError(res, scoped.message, scoped.status);

  const query = req.query || {};
  const { page, limit, offset } = parsePageLimit(query);
  const activityType = query.activityType != null ? String(query.activityType).trim() : null;

  const where = { userId: scoped.user.userId };
  if (activityType) where.activityType = activityType;

  const { rows, count } = await db.GameActivity.findAndCountAll({
    where,
    include: [{ model: db.Game, attributes: ['id', 'name'] }],
    order: [[db.sequelize.col('GameActivity.created_at'), 'DESC']],
    limit,
    offset
  });

  const list = rows.map((r) => {
    const o = r.get({ plain: true });
    if (o.Game) o.game = o.Game;
    delete o.Game;
    return o;
  });

  const topupsNeedingDiscount = list.filter((o) => {
    if (o.activityType !== 'topup') return false;
    const meta = o.metadata && typeof o.metadata === 'object' ? o.metadata : null;
    return !(meta && Number(meta.deposit_discount_percent) > 0);
  });
  if (topupsNeedingDiscount.length > 0 && db.UserTransaction) {
    const txs = await db.UserTransaction.findAll({
      where: { userId: scoped.user.userId, type: 'game_deposit' },
      attributes: ['amount', 'metadata', 'createdAt'],
      order: [[db.sequelize.col('created_at'), 'DESC']],
      limit: 250
    });
    for (const o of topupsNeedingDiscount) {
      const activityTime = o.createdAt ? new Date(o.createdAt).getTime() : 0;
      const credited = Number(o.amount);
      const match = txs.find((tx) => {
        const meta = tx.metadata && typeof tx.metadata === 'object' ? tx.metadata : {};
        const pct = Number(meta.deposit_discount_percent) || 0;
        if (!(pct > 0)) return false;
        const txTime = tx.createdAt ? new Date(tx.createdAt).getTime() : 0;
        if (Math.abs(txTime - activityTime) > 3 * 60 * 1000) return false;
        const gameCredit = Number(meta.game_credit);
        if (Number.isFinite(gameCredit) && Number.isFinite(credited) && Math.abs(gameCredit - credited) <= 0.011) {
          return true;
        }
        return false;
      });
      if (!match) continue;
      const meta = match.metadata && typeof match.metadata === 'object' ? match.metadata : {};
      o.metadata = {
        ...(o.metadata && typeof o.metadata === 'object' ? o.metadata : {}),
        wallet_amount: Number(meta.wallet_amount != null ? meta.wallet_amount : match.amount),
        game_credit: Number(meta.game_credit != null ? meta.game_credit : o.amount),
        deposit_discount_percent: Number(meta.deposit_discount_percent) || 0,
        game_name: meta.game_name || o.game?.name || null
      };
    }
  }

  return sendSuccess(res, { list, total: count, page, limit });
}

async function listGameAccounts(req, res) {
  try {
    const denied = requireUsersAccess(req, res);
    if (denied) return denied;
    const scoped = await loadEndUserInScope(req, req.params.userId);
    if (scoped.status) return sendError(res, scoped.message, scoped.status);

    // ORDER BY must use Sequelize's table alias "UserGameAccount" (not "user_game_accounts") so PostgreSQL accepts it with JOINs.
    const rows = await db.UserGameAccount.findAll({
      where: { userId: scoped.user.userId },
      include: [{ model: db.Game, attributes: ['id', 'name', 'isActive'], required: false }],
      order: [[db.sequelize.col('UserGameAccount.created_at'), 'DESC']]
    });

    const gameIds = rows.map((r) => r.gameId);
    const manualRequestByGameId = {};
    if (gameIds.length > 0) {
      const manualRequests = await db.GameManualRequest.findAll({
        where: {
          userId: scoped.user.userId,
          gameId: { [Op.in]: gameIds },
          requestType: 'register',
          status: 'approved'
        },
        attributes: ['id', 'gameId'],
        order: [[db.sequelize.col('resolved_at'), 'DESC NULLS LAST'], [db.sequelize.col('created_at'), 'DESC']]
      });
      for (const mr of manualRequests) {
        if (!manualRequestByGameId[mr.gameId]) {
          manualRequestByGameId[mr.gameId] = mr.id;
        }
      }
    }

    const list = rows.map((r) => {
      const o = r.get({ plain: true });
      if (o.Game) o.game = o.Game;
      delete o.Game;
      const manualRequestId = manualRequestByGameId[o.gameId] || null;
      o.manualRequestId = manualRequestId;
      o.credentialsEditable = Boolean(manualRequestId);
      return o;
    });

    return sendSuccess(res, { list });
  } catch (err) {
    return sendError(res, err.message || 'Failed to load game accounts', 500);
  }
}

async function listGameManualRequests(req, res) {
  const denied = requireUsersAccess(req, res);
  if (denied) return denied;
  const scoped = await loadEndUserInScope(req, req.params.userId);
  if (scoped.status) return sendError(res, scoped.message, scoped.status);

  const query = req.query || {};
  const { page, limit, offset } = parsePageLimit(query);

  const { rows, count } = await db.GameManualRequest.findAndCountAll({
    where: { userId: scoped.user.userId },
    include: [{ model: db.Game, as: 'Game', attributes: ['id', 'name'] }],
    order: [[db.sequelize.col('GameManualRequest.created_at'), 'DESC']],
    limit,
    offset
  });

  let list = rows.map((r) => {
    const o = r.get({ plain: true });
    if (o.Game) o.game = o.Game;
    delete o.Game;
    if (o.gamePassword) o.gamePassword = '••••••••';
    return o;
  });

  list = await attachGameUsernamesToManualRequests(db, list);

  return sendSuccess(res, { list, total: count, page, limit });
}

async function listWithdrawalRequests(req, res) {
  const denied = requireUsersAccess(req, res);
  if (denied) return denied;
  const scoped = await loadEndUserInScope(req, req.params.userId);
  if (scoped.status) return sendError(res, scoped.message, scoped.status);

  const query = { ...(req.query || {}), userId: String(scoped.user.userId) };
  try {
    const result = await listWithdrawalRequestsAdmin(req, query);
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Failed to load withdrawals', status);
  }
}

async function listDepositRequestsForUser(req, res) {
  const denied = requireUsersAccess(req, res);
  if (denied) return denied;
  const scoped = await loadEndUserInScope(req, req.params.userId);
  if (scoped.status) return sendError(res, scoped.message, scoped.status);

  const query = { ...(req.query || {}), userId: String(scoped.user.userId) };
  try {
    const result = await listDepositRequestsAdmin(req, query);
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load deposits.', status);
  }
}

async function listGitslotparkTransactions(req, res) {
  try {
    const denied = requireUsersAccess(req, res);
    if (denied) return denied;
    const scoped = await loadEndUserInScope(req, req.params.userId);
    if (scoped.status) return sendError(res, scoped.message, scoped.status);

    const query = req.query || {};
    const { page, limit, offset } = parsePageLimit(query);
    const userId = scoped.user.userId;

    const [gspCountRow, scorpioCountRow] = await Promise.all([
      db.sequelize.query(
        `SELECT COUNT(*)::int AS total FROM gitslotpark_transactions WHERE user_id = :userId`,
        { replacements: { userId }, type: db.Sequelize.QueryTypes.SELECT }
      ),
      db.ScorpioTransaction
        ? db.sequelize.query(
          `SELECT COUNT(*)::int AS total FROM scorpio_transactions WHERE user_id = :userId`,
          { replacements: { userId }, type: db.Sequelize.QueryTypes.SELECT }
        )
        : Promise.resolve([{ total: 0 }])
    ]);
    const total = Number(gspCountRow?.[0]?.total || 0) + Number(scorpioCountRow?.[0]?.total || 0);

    const unionRows = await db.sequelize.query(
      `
      SELECT * FROM (
        SELECT
          ('gsp-' || gt.id::text) AS id,
          gt.created_at AS created_at,
          gt.operation AS operation,
          gt.amount AS amount,
          CAST(gt.game_id AS TEXT) AS game_id,
          'gitslotpark'::text AS provider
        FROM gitslotpark_transactions gt
        WHERE gt.user_id = :userId
        UNION ALL
        SELECT
          ('scorpio-' || st.id::text) AS id,
          st.created_at AS created_at,
          st.command AS operation,
          st.amount AS amount,
          CAST(st.game_code AS TEXT) AS game_id,
          'scorpio'::text AS provider
        FROM scorpio_transactions st
        WHERE st.user_id = :userId
      ) t
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset
      `,
      { replacements: { userId, limit, offset }, type: db.Sequelize.QueryTypes.SELECT }
    );

    let gamesMap = {};
    try {
      const { games } = await getGamesList(req);
      if (Array.isArray(games)) {
        games.forEach((g) => {
          const gId = g.id || g.gameId || g.gameid;
          const gName = g.name || g.title || g.gameName;
          if (gId) gamesMap[String(gId)] = gName;
        });
      }
    } catch (err) {
      // Ignore errors if config is missing or API fails, fallback to ID
    }

    let scorpioGamesMap = {};
    try {
      const { games } = await getScorpioGamesList();
      if (Array.isArray(games)) {
        games.forEach((g) => {
          const gId = g.gameCode || g.gameId || g.id;
          const gName = g.name || g.title || g.gameName;
          if (gId) scorpioGamesMap[String(gId)] = gName;
        });
      }
    } catch (err) {
      // Catalog is optional
    }

    const list = (unionRows || []).map((row) => {
      const gameId = row.game_id != null ? String(row.game_id) : '';
      const provider = String(row.provider || 'gitslotpark').toLowerCase();
      const nameMap = provider === 'scorpio' ? scorpioGamesMap : gamesMap;
      const gameName = gameId && nameMap[gameId]
        ? nameMap[gameId]
        : (gameId ? `Game ${gameId}` : (provider === 'scorpio' ? 'Scorpio Play' : 'GitSlotsPark'));
      return {
        id: row.id,
        operation: row.operation,
        amount: row.amount,
        gameId: gameId || null,
        gameName,
        provider,
        createdAt: row.created_at
      };
    });

    return sendSuccess(res, { list, total, page, limit });
  } catch (err) {
    return sendError(res, err.message || 'Failed to load Gitslotpark transactions', 500);
  }
}

async function getGameAccountCredentials(req, res) {
  try {
    const denied = requireUsersAccess(req, res);
    if (denied) return denied;

    const loaded = await loadGameAccountForEditing(req, req.params.userId, req.params.accountId);
    if (loaded.error) return sendError(res, loaded.error.message, loaded.error.status);

    const gameUsername = loaded.account.botUsername || '';
    const gamePassword = loaded.account.botPassword || '';

    return sendSuccess(res, { game_username: gameUsername, game_password: gamePassword });
  } catch (err) {
    return sendError(res, err.message || 'Failed to load credentials', err.statusCode || 500);
  }
}

async function updateGameAccountCredentials(req, res) {
  try {
    const denied = requireUsersAccess(req, res);
    if (denied) return denied;

    const loaded = await loadGameAccountForEditing(req, req.params.userId, req.params.accountId);
    if (loaded.error) return sendError(res, loaded.error.message, loaded.error.status);

    const body = req.body || {};
    const gameUsername = String(body.game_username || '').trim();
    const gamePassword = String(body.game_password || '').trim();

    if (!gameUsername) return sendError(res, 'Game username is required.', 400);
    if (!gamePassword) return sendError(res, 'Game password is required.', 400);

    const previousGameUsername = loaded.account.botUsername || '';
    const previousGamePassword = loaded.account.botPassword || '';

    const performedByUserId = req.user?.userId || null;
    const operationDoneBy = getOperationDoneBy(req.role);

    await assertGameUsernameAvailable(loaded.account.gameId, gameUsername, loaded.user.userId, {
      gameName: loaded.account.Game?.name
    });

    try {
      await db.sequelize.transaction(async (t) => {
        await assertGameUsernameAvailable(
          loaded.account.gameId,
          gameUsername,
          loaded.user.userId,
          {
            gameName: loaded.account.Game?.name,
            transaction: t
          }
        );

        // 1. Update UserGameAccount
        await loaded.account.update({
          botUsername: gameUsername,
          botPassword: gamePassword
        }, { transaction: t });

        // 2. Update GameManualRequest if it exists
        if (loaded.manualReq) {
          await loaded.manualReq.update({
            gameUsername,
            gamePassword
          }, { transaction: t });

          const { recordGameManualRequestLog } = require('../../services/games/recordGameManualRequestLog.service');
          await recordGameManualRequestLog({
            manualRequestId: loaded.manualReq.id,
            userId: loaded.user.userId,
            gameId: loaded.account.gameId,
            actionType: 'credentials_updated',
            gameUsername,
            gamePassword,
            previousGameUsername,
            previousGamePassword,
            performedByUserId,
            operationDoneBy
          }, t);
        }

        // 3. Record history
        const { recordUserGameCredentialHistory } = require('../../services/games/recordUserGameCredentialHistory.service');
        await recordUserGameCredentialHistory({
          userId: loaded.user.userId,
          gameId: loaded.account.gameId,
          action: 'updated',
          oldUsername: previousGameUsername,
          oldPassword: previousGamePassword,
          newUsername: gameUsername,
          newPassword: gamePassword,
          performedByUserId,
          operationDoneBy
        }, t);
      });
    } catch (err) {
      if (isGameUsernameTakenError(err) || isGameUsernameTakenDbError(err)) {
        const mapped = isGameUsernameTakenError(err)
          ? err
          : createGameUsernameTakenError(loaded.account.Game?.name);
        return sendError(res, mapped.message, mapped.statusCode || 409, mapped.code);
      }
      throw err;
    }

    return sendSuccess(res, {
      id: loaded.account.id,
      botUsername: gameUsername,
      manualRequestId: loaded.manualReq?.id || null
    });
  } catch (err) {
    return sendError(res, err.message || 'Failed to update credentials', err.statusCode || 500);
  }
}

async function listGameAccountCredentialLogs(req, res) {
  try {
    const denied = requireUsersAccess(req, res);
    if (denied) return denied;

    const loaded = await loadGameAccountForEditing(req, req.params.userId, req.params.accountId);
    if (loaded.error) return sendError(res, loaded.error.message, loaded.error.status);

    if (!loaded.manualReq) {
      return sendSuccess(res, { list: [] });
    }

    const list = await listManualRegisterCredentialLogs(loaded.manualReq.id);
    return sendSuccess(res, { list });
  } catch (err) {
    return sendError(res, err.message || 'Failed to load credential logs', err.statusCode || 500);
  }
}

async function deleteGameAccountCredentials(req, res) {
  try {
    const denied = requireUsersAccess(req, res);
    if (denied) return denied;

    const userId = parseInt(req.params.userId, 10);
    const accountId = parseInt(req.params.accountId, 10);

    if (Number.isNaN(userId) || Number.isNaN(accountId)) {
      return sendError(res, 'Invalid user id or account id', 400);
    }

    const result = await deleteSingleGameCredentials({
      userId,
      accountId,
      performedByUserId: req.user?.userId || null,
      operationDoneBy: getOperationDoneBy(req.role)
    });

    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, err.message || 'Failed to delete credentials', 500);
  }
}

async function deleteAllGameAccountsCredentials(req, res) {
  try {
    const denied = requireUsersAccess(req, res);
    if (denied) return denied;

    const userId = parseInt(req.params.userId, 10);
    if (Number.isNaN(userId)) {
      return sendError(res, 'Invalid user id', 400);
    }

    const result = await deleteAllGameCredentials({
      userId,
      performedByUserId: req.user?.userId || null,
      operationDoneBy: getOperationDoneBy(req.role)
    });

    return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, err.message || 'Failed to delete credentials for all games', 500);
  }
}

async function getGameAccountCredentialHistory(req, res) {
  try {
    const denied = requireUsersAccess(req, res);
    if (denied) return denied;

    const userId = parseInt(req.params.userId, 10);
    if (Number.isNaN(userId)) {
      return sendError(res, 'Invalid user id', 400);
    }

    const list = await getGameCredentialsHistory(userId);
    return sendSuccess(res, { list });
  } catch (err) {
    return sendError(res, err.message || 'Failed to fetch credentials history', 500);
  }
}

module.exports = {
  getById,
  patchUser,
  walletDeduct,
  walletAddSc,
  listUserTransactions,
  listGameActivities,
  listGameAccounts,
  getGameAccountCredentials,
  updateGameAccountCredentials,
  listGameAccountCredentialLogs,
  deleteGameAccountCredentials,
  deleteAllGameAccountsCredentials,
  getGameAccountCredentialHistory,
  listGameManualRequests,
  listWithdrawalRequests,
  listDepositRequestsForUser,
  listGitslotparkTransactions
};
