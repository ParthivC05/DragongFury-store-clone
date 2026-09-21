'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { normalizeStoreCode, normalizeBonusCodeInput } = require('./resolveSignupBonusCodeForRegister.service');
const { stripPlayerEmailFields } = require('../../utils/playerEmailVisibility');

function assertScope(req, row) {
  if (req.role === ROLES.MASTER_ADMIN) return;
  if (req.role === ROLES.STORE_ADMIN) {
    const sc = normalizeStoreCode(req.storeCode);
    if (!sc || normalizeStoreCode(row.storeCode) !== sc) {
      const err = new Error('Bonus code not found.');
      err.statusCode = 404;
      throw err;
    }
    return;
  }
  const err = new Error('Forbidden.');
  err.statusCode = 403;
  throw err;
}

function listScopeWhere(req) {
  if (req.role === ROLES.MASTER_ADMIN) {
    const q = req.query || {};
    const storeCode = q.storeCode && typeof q.storeCode === 'string' ? normalizeStoreCode(q.storeCode) : null;
    if (storeCode) return { storeCode };
    return {};
  }
  if (req.role === ROLES.STORE_ADMIN) {
    const sc = normalizeStoreCode(req.storeCode);
    return sc ? { storeCode: sc } : { id: -1 };
  }
  return { id: -1 };
}

async function listCodes(req, query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const where = listScopeWhere(req);
  if (query.isActive === 'true') where.isActive = true;
  if (query.isActive === 'false') where.isActive = false;
  if (query.search && typeof query.search === 'string') {
    const s = normalizeBonusCodeInput(query.search);
    if (s) where.code = { [Op.iLike]: `%${s}%` };
  }

  const { count, rows } = await db.BonusCode.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    attributes: [
      'id',
      'code',
      'storeCode',
      'distributorCode',
      'bonusType',
      'claimScope',
      'maxClaimsPerUser',
      'valueType',
      'value',
      'maxBonusCap',
      'minDeposit',
      'isActive',
      'createdByUserId',
      'createdAt',
      'updatedAt'
    ]
  });

  return {
    bonus_codes: rows.map((r) => r.get({ plain: true })),
    total: count,
    page,
    limit,
    total_pages: Math.ceil(count / limit) || 1
  };
}

async function getCodeById(req, id) {
  const row = await db.BonusCode.findByPk(id);
  if (!row) {
    const err = new Error('Bonus code not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  return row.get({ plain: true });
}

async function createCode(req, body) {
  const code = normalizeBonusCodeInput(body.code || '');
  if (!code || code.length < 2) {
    const err = new Error('Bonus code must be at least 2 characters (letters and numbers).');
    err.statusCode = 400;
    throw err;
  }

  let storeCode;
  let distributorCode = null;
  if (req.role === ROLES.STORE_ADMIN) {
    storeCode = normalizeStoreCode(req.storeCode);
    distributorCode = req.distributorCode || null;
    if (!storeCode) {
      const err = new Error('Store admin must have a store code.');
      err.statusCode = 400;
      throw err;
    }
  } else if (req.role === ROLES.MASTER_ADMIN) {
    storeCode = normalizeStoreCode(body.storeCode || '');
    if (!storeCode) {
      const err = new Error('storeCode is required.');
      err.statusCode = 400;
      throw err;
    }
    distributorCode =
      body.distributorCode && typeof body.distributorCode === 'string'
        ? body.distributorCode.trim().slice(0, 64) || null
        : null;
  } else {
    const err = new Error('Forbidden.');
    err.statusCode = 403;
    throw err;
  }

  const claimScope = (body.claimScope || '').toLowerCase();
  if (!['every_deposit', 'fixed_count'].includes(claimScope)) {
    const err = new Error('claimScope must be every_deposit or fixed_count.');
    err.statusCode = 400;
    throw err;
  }

  let maxClaimsPerUser = null;
  if (claimScope === 'fixed_count') {
    maxClaimsPerUser = parseInt(body.maxClaimsPerUser, 10);
    if (!Number.isFinite(maxClaimsPerUser) || maxClaimsPerUser < 1 || maxClaimsPerUser > 9999) {
      const err = new Error('maxClaimsPerUser must be between 1 and 9999 for fixed_count.');
      err.statusCode = 400;
      throw err;
    }
  }

  const valueType = (body.valueType || '').toLowerCase();
  if (!['fixed', 'percentage'].includes(valueType)) {
    const err = new Error('valueType must be fixed or percentage.');
    err.statusCode = 400;
    throw err;
  }

  const value = Number(body.value);
  if (!Number.isFinite(value) || value <= 0) {
    const err = new Error('value must be a positive number.');
    err.statusCode = 400;
    throw err;
  }
  if (valueType === 'percentage' && value > 500) {
    const err = new Error('Percentage value cannot exceed 500.');
    err.statusCode = 400;
    throw err;
  }

  const maxBonusCap =
    body.maxBonusCap != null && body.maxBonusCap !== ''
      ? Number(body.maxBonusCap)
      : null;
  if (maxBonusCap != null && (!Number.isFinite(maxBonusCap) || maxBonusCap < 0)) {
    const err = new Error('maxBonusCap must be a non-negative number.');
    err.statusCode = 400;
    throw err;
  }

  const minDeposit =
    body.minDeposit != null && body.minDeposit !== '' ? Number(body.minDeposit) : null;
  if (minDeposit != null && (!Number.isFinite(minDeposit) || minDeposit < 0)) {
    const err = new Error('minDeposit must be a non-negative number.');
    err.statusCode = 400;
    throw err;
  }

  const bonusType = (body.bonusType || 'deposit').toLowerCase();
  if (bonusType !== 'deposit') {
    const err = new Error('Only bonus type "deposit" is supported.');
    err.statusCode = 400;
    throw err;
  }

  try {
    const row = await db.BonusCode.create({
      code,
      storeCode,
      distributorCode,
      bonusType: 'deposit',
      claimScope,
      maxClaimsPerUser,
      valueType,
      value,
      maxBonusCap: maxBonusCap != null ? maxBonusCap : null,
      minDeposit: minDeposit != null ? minDeposit : null,
      isActive: body.isActive !== false,
      createdByUserId: req.user?.userId || null
    });
    return row.get({ plain: true });
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      const err = new Error('A bonus code with this name already exists for this store.');
      err.statusCode = 400;
      throw err;
    }
    throw e;
  }
}

async function updateCode(req, id, body) {
  const row = await db.BonusCode.findByPk(id);
  if (!row) {
    const err = new Error('Bonus code not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);

  const patch = {};
  if (body.isActive !== undefined) patch.isActive = Boolean(body.isActive);

  if (body.valueType !== undefined) {
    const valueType = String(body.valueType).toLowerCase();
    if (!['fixed', 'percentage'].includes(valueType)) {
      const err = new Error('valueType must be fixed or percentage.');
      err.statusCode = 400;
      throw err;
    }
    patch.valueType = valueType;
  }
  if (body.value !== undefined) {
    const value = Number(body.value);
    if (!Number.isFinite(value) || value <= 0) {
      const err = new Error('value must be a positive number.');
      err.statusCode = 400;
      throw err;
    }
    patch.value = value;
  }
  if (body.maxBonusCap !== undefined) {
    patch.maxBonusCap =
      body.maxBonusCap === null || body.maxBonusCap === ''
        ? null
        : Number(body.maxBonusCap);
    if (patch.maxBonusCap != null && (!Number.isFinite(patch.maxBonusCap) || patch.maxBonusCap < 0)) {
      const err = new Error('maxBonusCap must be a non-negative number.');
      err.statusCode = 400;
      throw err;
    }
  }
  if (body.minDeposit !== undefined) {
    patch.minDeposit =
      body.minDeposit === null || body.minDeposit === '' ? null : Number(body.minDeposit);
    if (patch.minDeposit != null && (!Number.isFinite(patch.minDeposit) || patch.minDeposit < 0)) {
      const err = new Error('minDeposit must be a non-negative number.');
      err.statusCode = 400;
      throw err;
    }
  }

  if (body.claimScope !== undefined) {
    const claimScope = String(body.claimScope).toLowerCase();
    if (!['every_deposit', 'fixed_count'].includes(claimScope)) {
      const err = new Error('claimScope must be every_deposit or fixed_count.');
      err.statusCode = 400;
      throw err;
    }
    patch.claimScope = claimScope;
    if (claimScope === 'every_deposit') {
      patch.maxClaimsPerUser = null;
    } else if (body.maxClaimsPerUser !== undefined) {
      const mc = parseInt(body.maxClaimsPerUser, 10);
      if (!Number.isFinite(mc) || mc < 1 || mc > 9999) {
        const err = new Error('maxClaimsPerUser must be between 1 and 9999 for fixed_count.');
        err.statusCode = 400;
        throw err;
      }
      patch.maxClaimsPerUser = mc;
    }
  } else if (body.maxClaimsPerUser !== undefined && row.claimScope === 'fixed_count') {
    const mc = parseInt(body.maxClaimsPerUser, 10);
    if (!Number.isFinite(mc) || mc < 1 || mc > 9999) {
      const err = new Error('maxClaimsPerUser must be between 1 and 9999.');
      err.statusCode = 400;
      throw err;
    }
    patch.maxClaimsPerUser = mc;
  }

  if (req.role === ROLES.MASTER_ADMIN && body.storeCode !== undefined) {
    const sc = normalizeStoreCode(body.storeCode);
    if (!sc) {
      const err = new Error('storeCode cannot be empty.');
      err.statusCode = 400;
      throw err;
    }
    patch.storeCode = sc;
  }

  await row.update(patch);
  return row.reload().then((r) => r.get({ plain: true }));
}

async function deleteCode(req, id) {
  const row = await db.BonusCode.findByPk(id);
  if (!row) {
    const err = new Error('Bonus code not found.');
    err.statusCode = 404;
    throw err;
  }
  assertScope(req, row);
  await row.destroy();
  return { success: true };
}

async function listTransactions(req, query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const bonusWhere = listScopeWhere(req);
  const bonusIds = await db.BonusCode.findAll({
    where: bonusWhere,
    attributes: ['id'],
    raw: true
  });
  const idList = bonusIds.map((b) => b.id);
  if (idList.length === 0) {
    return { grants: [], total: 0, page, limit, total_pages: 1 };
  }

  const grantWhere = { bonusCodeId: { [Op.in]: idList } };
  if (query.bonusCodeId) {
    const bid = parseInt(query.bonusCodeId, 10);
    if (Number.isFinite(bid) && idList.includes(bid)) grantWhere.bonusCodeId = bid;
  }
  if (query.userId) {
    const uid = parseInt(query.userId, 10);
    if (Number.isFinite(uid)) grantWhere.userId = uid;
  }

  const { count, rows } = await db.UserBonusCodeGrant.findAndCountAll({
    where: grantWhere,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    include: [
      {
        model: db.BonusCode,
        attributes: ['id', 'code', 'storeCode']
      },
      {
        model: db.User,
        attributes: ['userId', 'email', 'username', 'storeCode']
      }
    ]
  });

  const grants = rows.map((g) => {
    const plain = g.get({ plain: true });
    const user = plain.User
      ? stripPlayerEmailFields({
          user_id: plain.User.userId,
          email: plain.User.email,
          username: plain.User.username,
          store_code: plain.User.storeCode
        }, req.role)
      : null;
    return {
      id: plain.id,
      amount: Number(plain.amount),
      currency_code: plain.currencyCode,
      deposit_request_id: plain.depositRequestId,
      created_at: plain.createdAt,
      bonus_code: plain.BonusCode
        ? { id: plain.BonusCode.id, code: plain.BonusCode.code, store_code: plain.BonusCode.storeCode }
        : null,
      user
    };
  });

  return {
    grants,
    total: count,
    page,
    limit,
    total_pages: Math.ceil(count / limit) || 1
  };
}

module.exports = {
  listCodes,
  getCodeById,
  createCode,
  updateCode,
  deleteCode,
  listTransactions
};
