const { Op } = require('sequelize');
const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES } = require('../../constants/roles');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');
const { USER_CREATED_AT, USER_UPDATED_AT, resolveUserOrderColumn } = require('../../utils/userModelSequelize');
const { canViewPlayerEmail, omitPlayerEmailAttr } = require('../../utils/playerEmailVisibility');

const SAFE_ATTRS = ['userId', 'username', 'firstName', 'lastName', 'email', 'role', 'distributorCode', 'storeCode', 'isActive', USER_CREATED_AT, USER_UPDATED_AT];

async function list(req, res) {
  if (!can(req, STORE_FEATURE_KEYS.USERS_LIST)) return sendError(res, 'You don\'t have access to Users. Please contact your administrator if you need access.', 403);
  const role = req.role;
  const myDistributorCode = req.distributorCode;
  const myStoreCode = req.storeCode;
  const query = req.query || {};

  let where = { role: ROLES.USER };

  if (role === ROLES.MASTER_ADMIN) {
    const filterDist = query.distributorCode != null ? String(query.distributorCode).trim() || null : null;
    const filterStore = query.storeCode != null ? String(query.storeCode).trim() || null : null;
    if (filterDist) where.distributorCode = filterDist;
    if (filterStore) where.storeCode = filterStore;
  } else if (role === ROLES.DISTRIBUTOR_ADMIN && myDistributorCode) {
    where.distributorCode = myDistributorCode;
    const filterStore = query.storeCode != null ? String(query.storeCode).trim() || null : null;
    if (filterStore) where.storeCode = filterStore;
  } else if (role === ROLES.STORE_ADMIN && myDistributorCode != null && myStoreCode != null) {
    where.distributorCode = myDistributorCode;
    where.storeCode = myStoreCode;
  } else {
    return sendError(res, 'You don\'t have access to this area. Please contact your administrator.', 403);
  }

  const dateFrom = query.dateFrom ? new Date(query.dateFrom) : null;
  const dateTo = query.dateTo ? new Date(query.dateTo) : null;
  if (dateFrom && !isNaN(dateFrom.getTime())) {
    where[USER_CREATED_AT] = where[USER_CREATED_AT] || {};
    where[USER_CREATED_AT][Op.gte] = dateFrom;
  }
  if (dateTo && !isNaN(dateTo.getTime())) {
    const endOfDay = new Date(dateTo);
    endOfDay.setHours(23, 59, 59, 999);
    where[USER_CREATED_AT] = where[USER_CREATED_AT] || {};
    where[USER_CREATED_AT][Op.lte] = endOfDay;
  }

  const activityFilter = query.activityFilter ? String(query.activityFilter).trim() : null;
  if (activityFilter) {
    if (activityFilter === 'deposit') {
      const tx = await db.UserTransaction.findAll({ where: { type: 'deposit' }, attributes: ['userId'], raw: true });
      const userIds = [...new Set(tx.map(t => t.userId))];
      where.userId = { [Op.in]: userIds };
    } else if (activityFilter === 'spin_wheel') {
      const spinTx = await db.UserTransaction.findAll({ where: { type: 'spin_wheel' }, attributes: ['userId'], raw: true });
      const otherTx = await db.UserTransaction.findAll({ where: { type: { [Op.in]: ['deposit', 'withdraw'] } }, attributes: ['userId'], raw: true });
      const otherIds = new Set(otherTx.map(t => t.userId));
      const spinIds = [...new Set(spinTx.map(t => t.userId).filter(id => !otherIds.has(id)))];
      where.userId = { [Op.in]: spinIds.length ? spinIds : [0] }; // use [0] if empty to return no results
    } else if (activityFilter === 'withdrawal') {
      const withdrawTx = await db.UserTransaction.findAll({ where: { type: 'withdraw' }, attributes: ['userId'], raw: true });
      const depositTx = await db.UserTransaction.findAll({ where: { type: 'deposit' }, attributes: ['userId'], raw: true });
      const depositIds = new Set(depositTx.map(t => t.userId));
      const withdrawIds = [...new Set(withdrawTx.map(t => t.userId).filter(id => !depositIds.has(id)))];
      where.userId = { [Op.in]: withdrawIds.length ? withdrawIds : [0] };
    } else if (activityFilter === 'deposit_withdrawal') {
      const depositTx = await db.UserTransaction.findAll({ where: { type: 'deposit' }, attributes: ['userId'], raw: true });
      const withdrawTx = await db.UserTransaction.findAll({ where: { type: 'withdraw' }, attributes: ['userId'], raw: true });
      const depositIds = new Set(depositTx.map(t => t.userId));
      const bothIds = [...new Set(withdrawTx.map(t => t.userId).filter(id => depositIds.has(id)))];
      where.userId = { [Op.in]: bothIds.length ? bothIds : [0] };
    } else if (activityFilter === 'phone_verified') {
      where.isPhoneVerified = true;
    } else if (activityFilter === 'email_verified') {
      where.isEmailVerified = true;
    }
  }

  const search = query.search != null ? String(query.search).trim() : null;
  if (search) {
    const pattern = `%${search.replace(/%/g, '\\%')}%`;
    const orConditions = canViewPlayerEmail(role)
      ? [
          { email: { [Op.like]: pattern } },
          { username: { [Op.like]: pattern } }
        ]
      : [{ username: { [Op.like]: pattern } }];

    // Allow lookup by numeric userId without exposing email.
    const asId = parseInt(search, 10);
    if (Number.isFinite(asId) && String(asId) === search) {
      orConditions.push({ userId: asId });
    }

    if (db.UserGameAccount) {
      const matchingAccounts = await db.UserGameAccount.findAll({
        where: { botUsername: { [Op.iLike]: `%${search}%` } },
        attributes: ['userId'],
        raw: true
      });
      const userIds = [...new Set(matchingAccounts.map((a) => a.userId))];
      if (userIds.length > 0) {
        orConditions.push({ userId: { [Op.in]: userIds } });
      }
    }

    where[Op.or] = orConditions;
  }

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const includePhone = String(query.includePhone || '').trim() === '1' || String(query.includePhone || '').toLowerCase() === 'true';
  const canViewPhone = role === ROLES.MASTER_ADMIN;
  const allowedSortBase = ['userId', 'username', 'distributorCode', 'storeCode', USER_CREATED_AT, USER_UPDATED_AT];
  const allowedSort = canViewPlayerEmail(role)
    ? ['userId', 'email', 'username', 'distributorCode', 'storeCode', USER_CREATED_AT, USER_UPDATED_AT]
    : allowedSortBase;
  if (includePhone && canViewPhone && !allowedSort.includes('phone')) {
    allowedSort.push('phone');
  }
  const orderColumn = resolveUserOrderColumn(query.sortBy, allowedSort, USER_CREATED_AT);
  const sortOrder = (query.sortOrder || query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  let attrs = omitPlayerEmailAttr(SAFE_ATTRS, role);
  if (canViewPhone && (activityFilter === 'phone_verified' || includePhone) && !attrs.includes('phone')) {
    attrs = [...attrs, 'phone'];
  }

  try {
    const { rows, count } = await db.User.findAndCountAll({
      where,
      attributes: attrs,
      order: [[orderColumn, sortOrder]],
      limit,
      offset
    });
    const list = rows.map((row) => {
      const plain = row.get ? row.get({ plain: true }) : row;
      if (!canViewPlayerEmail(role)) {
        delete plain.email;
      }
      if (!canViewPhone) {
        delete plain.phone;
      }
      return plain;
    });
    sendSuccess(res, { list, total: count, page, limit });
  } catch (err) {
    sendError(res, err.message || 'Failed to list users', 500);
  }
}

async function filterOptions(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.USERS_LIST)) return sendError(res, 'You don\'t have access to Users. Please contact your administrator if you need access.', 403);
    const role = req.role;
    const myDistributorCode = req.distributorCode;

    if (role === ROLES.MASTER_ADMIN) {
      const [distributors, stores] = await Promise.all([
        db.User.findAll({ where: { role: ROLES.DISTRIBUTOR_ADMIN, isActive: true }, attributes: ['distributorCode'], raw: true }),
        db.User.findAll({ where: { role: ROLES.STORE_ADMIN, isActive: true, deletedAt: null }, attributes: ['distributorCode', 'storeCode'], raw: true })
      ]);
      const distributorCodes = [...new Set(distributors.map((d) => d.distributorCode).filter(Boolean))].sort();
      const storeSet = new Map();
      stores.forEach((s) => {
        if (s.distributorCode && s.storeCode) storeSet.set(`${s.distributorCode}:${s.storeCode}`, { distributorCode: s.distributorCode, storeCode: s.storeCode });
      });
      const storesList = [...storeSet.values()].sort((a, b) => (a.distributorCode + a.storeCode).localeCompare(b.distributorCode + b.storeCode));
      return sendSuccess(res, { distributorCodes, stores: storesList });
    }

    if (role === ROLES.DISTRIBUTOR_ADMIN && myDistributorCode) {
      const storeRows = await db.User.findAll({
        where: { role: ROLES.STORE_ADMIN, distributorCode: myDistributorCode, isActive: true, deletedAt: null },
        attributes: ['storeCode'],
        raw: true
      });
      const storeCodes = [...new Set(storeRows.map((s) => s.storeCode).filter(Boolean))].sort();
      return sendSuccess(res, { storeCodes });
    }

    sendSuccess(res, {});
  } catch (err) {
    sendError(res, err.message || 'Failed to load filter options', 500);
  }
}

module.exports = { list, filterOptions };
