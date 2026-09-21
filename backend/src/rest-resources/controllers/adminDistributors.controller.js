const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { encryptPassword, validatePasswordStrength } = require('../../utils/common');
const { Op } = require('sequelize');
const { USER_CREATED_AT, USER_UPDATED_AT, resolveUserOrderColumn } = require('../../utils/userModelSequelize');

function checkMasterAdmin(req) {
  if (req.role !== ROLES.MASTER_ADMIN) {
    const err = new Error('Forbidden. Master admin only.');
    err.statusCode = 403;
    throw err;
  }
}

/** Slug for distributor code: alphanumeric lowercase, no spaces */
function toDistributorCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 64) || '';
}

async function list(req, res) {
  try {
    checkMasterAdmin(req);
    const query = req.query || {};
    const conditions = [{ role: ROLES.DISTRIBUTOR_ADMIN }];

    const search = query.search != null ? String(query.search).trim() : null;
    if (search) {
      const pattern = `%${search.replace(/%/g, '\\%')}%`;
      conditions.push({
        [Op.or]: [
          { email: { [Op.like]: pattern } },
          { username: { [Op.like]: pattern } },
          { distributorCode: { [Op.like]: pattern } }
        ]
      });
    }

    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
    const dateTo = query.dateTo ? new Date(query.dateTo) : null;
    if (dateFrom && !isNaN(dateFrom.getTime())) {
      conditions.push({ createdAt: { [Op.gte]: dateFrom } });
    }
    if (dateTo && !isNaN(dateTo.getTime())) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      conditions.push({ createdAt: { [Op.lte]: endOfDay } });
    }

    const where = conditions.length === 1 ? conditions[0] : { [Op.and]: conditions };

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const allowedSort = ['userId', 'email', 'username', 'distributorCode', 'isActive', USER_CREATED_AT, USER_UPDATED_AT];
    const orderColumn = resolveUserOrderColumn(query.sortBy, allowedSort, USER_CREATED_AT);
    const sortOrder = (query.sortOrder || query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { rows: list, count: total } = await db.User.findAndCountAll({
      where,
      attributes: ['userId', 'username', 'email', 'firstName', 'lastName', 'distributorCode', 'isActive', USER_CREATED_AT, USER_UPDATED_AT],
      order: [[orderColumn, sortOrder]],
      limit,
      offset
    });
    const withCounts = await Promise.all(
      list.map(async (u) => {
        const code = u.distributorCode;
        if (!code) return { ...u.toJSON(), storesCount: 0, usersCount: 0 };
        const [storesCount, usersCount] = await Promise.all([
          db.User.count({ where: { distributorCode: code, role: ROLES.STORE_ADMIN } }),
          db.User.count({ where: { distributorCode: code, role: ROLES.USER } })
        ]);
        return { ...u.toJSON(), storesCount, usersCount };
      })
    );
    sendSuccess(res, { list: withCounts, total, page, limit });
  } catch (err) {
    sendError(res, err.message || 'Failed to list distributors', err.statusCode || 500);
  }
}

async function create(req, res) {
  try {
    checkMasterAdmin(req);
    const { email, password, username: rawUsername, firstName, lastName, distributorCode: rawCode, isActive } = req.body || {};
    const emailNorm = (email != null && String(email).trim()) ? String(email).trim().toLowerCase() : '';
    if (!emailNorm || emailNorm.length < 3) return sendError(res, 'Email is required', 400);
    if (!password || typeof password !== 'string') return sendError(res, 'Password is required', 400);

    const pwdCheck = validatePasswordStrength(password);
    if (!pwdCheck.valid) return sendError(res, pwdCheck.error, 400);

    const username = (rawUsername != null && String(rawUsername).trim()) ? String(rawUsername).trim() : (emailNorm.split('@')[0] || `dist_${Date.now()}`);
    const codeFromUsername = toDistributorCode(username);
    const code = (rawCode != null && String(rawCode).trim()) ? toDistributorCode(String(rawCode).trim()) : codeFromUsername;
    if (!code) return sendError(res, 'Distributor code is required (or provide a username to generate one)', 400);

    const existingEmail = await db.User.findOne({ where: { email: emailNorm } });
    if (existingEmail) return sendError(res, 'An account with this email already exists.', 400);

    const existingUsername = await db.User.findOne({
      where: db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('username')), Op.eq, username.toLowerCase())
    });
    if (existingUsername) return sendError(res, 'This username is already taken.', 400);

    const existingCode = await db.User.findOne({ where: { role: ROLES.DISTRIBUTOR_ADMIN, distributorCode: code } });
    if (existingCode) return sendError(res, 'This distributor code is already in use. Choose another.', 400);

    const user = await db.User.create({
      email: emailNorm,
      password: encryptPassword(password.trim()),
      username,
      firstName: (firstName != null && String(firstName).trim()) ? String(firstName).trim() : null,
      lastName: (lastName != null && String(lastName).trim()) ? String(lastName).trim() : null,
      role: ROLES.DISTRIBUTOR_ADMIN,
      isAdmin: true,
      distributorCode: code,
      isActive: isActive !== false,
      isEmailVerified: true,
      signInType: 'NORMAL'
    });

    const safe = user.toJSON();
    delete safe.password;
    sendSuccess(res, safe, 201);
  } catch (err) {
    sendError(res, err.message || 'Failed to create distributor', err.statusCode || 500);
  }
}

async function get(req, res) {
  try {
    checkMasterAdmin(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 'Invalid distributor id', 400);
    const user = await db.User.findOne({
      where: { userId: id, role: ROLES.DISTRIBUTOR_ADMIN },
      attributes: ['userId', 'username', 'email', 'firstName', 'lastName', 'distributorCode', 'isActive', USER_CREATED_AT, USER_UPDATED_AT]
    });
    if (!user) return sendError(res, 'Distributor not found', 404);
    const code = user.distributorCode;
    const userCount = code
      ? await db.User.count({ where: { distributorCode: code, role: { [Op.in]: [ROLES.STORE_ADMIN, ROLES.USER] } } })
      : 0;
    sendSuccess(res, { ...user.toJSON(), userCount });
  } catch (err) {
    sendError(res, err.message || 'Failed to get distributor', err.statusCode || 500);
  }
}

async function update(req, res) {
  try {
    checkMasterAdmin(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 'Invalid distributor id', 400);
    const user = await db.User.findOne({ where: { userId: id, role: ROLES.DISTRIBUTOR_ADMIN } });
    if (!user) return sendError(res, 'Distributor not found', 404);

    const { email, username: rawUsername, firstName, lastName, distributorCode: rawCode, isActive } = req.body || {};
    if (email !== undefined) {
      const emailNorm = String(email).trim().toLowerCase();
      if (!emailNorm) return sendError(res, 'Email cannot be empty', 400);
      const existing = await db.User.findOne({ where: { email: emailNorm } });
      if (existing && existing.userId !== id) return sendError(res, 'An account with this email already exists.', 400);
      user.email = emailNorm;
    }
    if (rawUsername !== undefined) {
      const un = String(rawUsername).trim();
      if (un) {
        const existing = await db.User.findOne({
          where: db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('username')), Op.eq, un.toLowerCase())
        });
        if (existing && existing.userId !== id) return sendError(res, 'This username is already taken.', 400);
        user.username = un;
      }
    }
    if (firstName !== undefined) user.firstName = (firstName != null && String(firstName).trim()) ? String(firstName).trim() : null;
    if (lastName !== undefined) user.lastName = (lastName != null && String(lastName).trim()) ? String(lastName).trim() : null;
    if (rawCode !== undefined) {
      const code = toDistributorCode(String(rawCode).trim());
      if (!code) return sendError(res, 'Distributor code cannot be empty', 400);
      const existing = await db.User.findOne({ where: { role: ROLES.DISTRIBUTOR_ADMIN, distributorCode: code } });
      if (existing && existing.userId !== id) return sendError(res, 'This distributor code is already in use.', 400);
      user.distributorCode = code;
    }
    if (typeof isActive === 'boolean') user.isActive = isActive;

    await user.save();
    const safe = user.toJSON();
    delete safe.password;
    sendSuccess(res, safe);
  } catch (err) {
    sendError(res, err.message || 'Failed to update distributor', err.statusCode || 500);
  }
}

async function remove(req, res) {
  try {
    checkMasterAdmin(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 'Invalid distributor id', 400);
    const user = await db.User.findOne({ where: { userId: id, role: ROLES.DISTRIBUTOR_ADMIN } });
    if (!user) return sendError(res, 'Distributor not found', 404);
    const code = user.distributorCode;

    const result = await db.sequelize.transaction(async (transaction) => {
      const scopedUsers = await db.User.findAll({
        where: { distributorCode: code },
        attributes: ['userId', 'storeCode'],
        transaction
      });
      const scopedUserIds = scopedUsers.map((row) => row.userId);
      const scopedStoreCodes = [...new Set(scopedUsers.map((row) => row.storeCode).filter(Boolean))];

      if (scopedUserIds.length > 0) {
        const whereUserId = { userId: { [Op.in]: scopedUserIds } };

        // Null-out external references first to avoid FK failures when deleting scoped users.
        await db.User.update(
          { userReferredBy: null },
          { where: { userReferredBy: { [Op.in]: scopedUserIds } }, transaction }
        );
        await db.WithdrawalRequest.update(
          { approvedByUserId: null },
          { where: { approvedByUserId: { [Op.in]: scopedUserIds } }, transaction }
        );
        await db.ChimeDepositRequest.update(
          { approvedByUserId: null },
          { where: { approvedByUserId: { [Op.in]: scopedUserIds } }, transaction }
        );
        await db.ChimeCashappWithdrawalRequest.update(
          { approvedByUserId: null },
          { where: { approvedByUserId: { [Op.in]: scopedUserIds } }, transaction }
        );
        await db.StoreSubscriptionRequest.update(
          { requestedByUserId: null },
          { where: { requestedByUserId: { [Op.in]: scopedUserIds } }, transaction }
        );
        await db.StoreSubscriptionRequest.update(
          { approvedByUserId: null },
          { where: { approvedByUserId: { [Op.in]: scopedUserIds } }, transaction }
        );
        await db.GameManualRequest.update(
          { resolvedByUserId: null },
          { where: { resolvedByUserId: { [Op.in]: scopedUserIds } }, transaction }
        );
        await db.GameActivity.update(
          { operationDoneByUserId: null },
          { where: { operationDoneByUserId: { [Op.in]: scopedUserIds } }, transaction }
        );
        await db.BonusCode.update(
          { createdByUserId: null },
          { where: { createdByUserId: { [Op.in]: scopedUserIds } }, transaction }
        );

        // Delete all user-owned transactional and history rows for this distributor scope.
        await db.ReferralDepositReward.destroy({
          where: {
            [Op.or]: [
              { referrerUserId: { [Op.in]: scopedUserIds } },
              { referredUserId: { [Op.in]: scopedUserIds } }
            ]
          },
          transaction
        });
        await db.UserBonusCodeGrant.destroy({ where: whereUserId, transaction });
        await db.UserPromotionBonus.destroy({ where: whereUserId, transaction });
        await db.Notification.destroy({ where: whereUserId, transaction });
        await db.GameManualRequest.destroy({ where: whereUserId, transaction });
        await db.GameActivity.destroy({ where: whereUserId, transaction });
        await db.UserGameAccount.destroy({ where: whereUserId, transaction });
        await db.UserTransaction.destroy({ where: whereUserId, transaction });
        await db.VipLedger.destroy({ where: whereUserId, transaction });
        await db.VipUserState.destroy({ where: whereUserId, transaction });
        await db.WalletLedger.destroy({ where: whereUserId, transaction });
        await db.Wallet.destroy({ where: whereUserId, transaction });
        await db.ProviderTransactionEvent.destroy({ where: whereUserId, transaction });
        await db.PaymentTransaction.destroy({ where: whereUserId, transaction });
        await db.PaymentDepositCompletion.destroy({ where: whereUserId, transaction });
        await db.PaymentPendingDeposit.destroy({ where: whereUserId, transaction });
        await db.DepositOrder.destroy({ where: whereUserId, transaction });
        await db.SpeedWithdrawRequest.destroy({ where: whereUserId, transaction });
        await db.DepositRequest.destroy({ where: whereUserId, transaction });
        await db.WithdrawalRequest.destroy({ where: whereUserId, transaction });
        await db.ChimeDepositRequest.destroy({ where: whereUserId, transaction });
        await db.ChimeCashappWithdrawalRequest.destroy({ where: whereUserId, transaction });

        // Finally remove users under this distributor (distributor admin, stores, staff, users).
        await db.User.destroy({
          where: { userId: { [Op.in]: scopedUserIds } },
          transaction
        });
      }

      // Remove distributor/store scoped configuration and business records.
      await db.StorePaymentProvider.destroy({ where: { distributorCode: code }, transaction });
      await db.StoreSubscription.destroy({ where: { distributorCode: code }, transaction });
      await db.StoreSubscriptionRequest.destroy({ where: { distributorCode: code }, transaction });
      await db.StoreRole.destroy({ where: { distributorCode: code }, transaction });
      await db.BonusCode.destroy({ where: { distributorCode: code }, transaction });
      await db.Subscription.destroy({ where: { distributorCode: code }, transaction });
      await db.Setting.destroy({ where: { distributorCode: code }, transaction });

      if (scopedStoreCodes.length > 0) {
        await db.HelpContent.destroy({ where: { storeCode: { [Op.in]: scopedStoreCodes } }, transaction });
        await db.Setting.destroy({ where: { storeCode: { [Op.in]: scopedStoreCodes } }, transaction });
      }

      return {
        deletedUsers: scopedUserIds.length,
        deletedStores: scopedStoreCodes.length
      };
    });

    sendSuccess(res, {
      deleted: true,
      message: 'Distributor and all child stores/users/history/transactions were deleted successfully.',
      deletedUsers: result.deletedUsers,
      deletedStores: result.deletedStores
    });
  } catch (err) {
    const message = String(err?.message || '');
    if (/foreign key|constraint/i.test(message)) {
      return sendError(res, 'Distributor delete failed because related records still exist. Please contact support if this persists.', 400);
    }
    sendError(res, err.message || 'Failed to delete distributor', err.statusCode || 500);
  }
}

module.exports = { list, create, get, update, remove };
