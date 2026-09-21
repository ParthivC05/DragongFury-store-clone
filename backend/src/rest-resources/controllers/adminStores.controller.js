const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { ROLES, isMasterAdmin } = require('../../constants/roles');
const { encryptPassword, validatePasswordStrength } = require('../../utils/common');
const { Op } = require('sequelize');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { seedDefaultStorePaymentProviders } = require('../../services/store/seedDefaultStorePaymentProviders.service');
const { validateAndNormalizeUserSiteUrl } = require('../../services/store/userSiteUrl.service');
const { USER_CREATED_AT, USER_UPDATED_AT, resolveUserOrderColumn } = require('../../utils/userModelSequelize');
const {
  OWNER_PAGE_PERMISSIONS_SLUG,
  getOwnerPagePermissions,
  setOwnerPagePermissions
} = require('../../services/store/storeOwnerPermissions.service');
const { canAdmin } = require('../../utils/permissionHelpers');
const { ADMIN_FEATURE_KEYS } = require('../../constants/permissions');

const SAFE_ATTRS = ['userId', 'username', 'email', 'firstName', 'lastName', 'distributorCode', 'storeCode', 'storeRoleId', 'isActive', 'deletedAt', 'userSiteUrl', 'drawer', USER_CREATED_AT, USER_UPDATED_AT];

/** Active (non soft-deleted) rows only. */
const NOT_DELETED = { deletedAt: null };

function toStoreCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 64) || '';
}

/** Golden Dragon moneybox stored on the main store admin row. Empty string clears. */
function normalizeDrawerFromBody(raw) {
  if (raw === undefined) return { ok: true, omit: true };
  if (raw === null || raw === '') return { ok: true, omit: false, value: null };
  const n = parseInt(String(raw).trim(), 10);
  if (Number.isNaN(n) || n < 1) {
    return { ok: false, error: 'Drawer (Golden Dragon moneybox) must be a positive whole number, or empty to clear.' };
  }
  return { ok: true, omit: false, value: n };
}

/** Require master_admin or distributor_admin. Distributor admin is scoped to req.distributorCode. */
function requireStoresAccess(req) {
  if (req.role === ROLES.MASTER_ADMIN) return;
  if (req.role === ROLES.DISTRIBUTOR_ADMIN && req.distributorCode) return;
  const err = new Error('Forbidden. Admin or distributor admin only.');
  err.statusCode = 403;
  throw err;
}

/** Super admin / technical staff may set primary store page permissions on edit store. */
function canManageStorePagePermissions(req) {
  return isMasterAdmin(req.role) && canAdmin(req, ADMIN_FEATURE_KEYS.STORES);
}

/** List stores: master_admin sees all (optional filter); distributor_admin sees only their distributor. Supports search (email/username) and dateFrom/dateTo. */
async function list(req, res) {
  try {
    requireStoresAccess(req);
    const query = req.query || {};
    const conditions = [{ role: ROLES.STORE_ADMIN, storeRoleId: null, ...NOT_DELETED }];

    if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
      conditions.push({ distributorCode: req.distributorCode });
    } else {
      const filterDist = query.distributorCode != null ? String(query.distributorCode).trim() || null : null;
      if (filterDist) conditions.push({ distributorCode: filterDist });
    }

    const search = query.search != null ? String(query.search).trim() : null;
    if (search) {
      const pattern = `%${search.replace(/%/g, '\\%')}%`;
      conditions.push({
        [Op.or]: [
          { email: { [Op.like]: pattern } },
          { username: { [Op.like]: pattern } }
        ]
      });
    }

    const dateFrom = toDateRangeStart(query.dateFrom);
    const dateTo = toDateRangeEnd(query.dateTo);
    if (dateFrom) {
      conditions.push({ createdAt: { [Op.gte]: dateFrom } });
    }
    if (dateTo) {
      conditions.push({ createdAt: { [Op.lte]: dateTo } });
    }

    const where = conditions.length === 1 ? conditions[0] : { [Op.and]: conditions };

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const allowedSort = ['userId', 'email', 'username', 'distributorCode', 'storeCode', 'isActive', USER_CREATED_AT, USER_UPDATED_AT];
    const orderColumn = resolveUserOrderColumn(query.sortBy, allowedSort, USER_CREATED_AT);
    const sortOrder = (query.sortOrder || query.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const { rows: list, count: total } = await db.User.findAndCountAll({
      where,
      attributes: SAFE_ATTRS,
      order: [[orderColumn, sortOrder]],
      limit,
      offset
    });
    const withCounts = await Promise.all(
      list.map(async (u) => {
        const dc = u.distributorCode;
        const sc = u.storeCode;
        const userCount = dc && sc
          ? await db.User.count({ where: { distributorCode: dc, storeCode: sc, role: ROLES.USER, ...NOT_DELETED } })
          : 0;
        return { ...u.toJSON(), userCount };
      })
    );
    sendSuccess(res, { list: withCounts, total, page, limit });
  } catch (err) {
    sendError(res, err.message || 'Failed to list stores', err.statusCode || 500);
  }
}

/** Filter options: master_admin gets all distributor codes; distributor_admin gets only their code. */
async function filterOptions(req, res) {
  try {
    requireStoresAccess(req);
    if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
      sendSuccess(res, { distributorCodes: req.distributorCode ? [req.distributorCode] : [] });
      return;
    }
    const rows = await db.User.findAll({
      where: { role: ROLES.DISTRIBUTOR_ADMIN, isActive: true },
      attributes: ['distributorCode'],
      raw: true
    });
    const distributorCodes = [...new Set(rows.map((r) => r.distributorCode).filter(Boolean))].sort();
    sendSuccess(res, { distributorCodes });
  } catch (err) {
    sendError(res, err.message || 'Failed to load filter options', err.statusCode || 500);
  }
}

/** Create store: master_admin picks distributor; distributor_admin creates under their own distributor. */
async function create(req, res) {
  try {
    requireStoresAccess(req);
    const { email, password, username: rawUsername, firstName, lastName, distributorCode: rawDistCode, storeCode: rawStoreCode, isActive, drawer: rawDrawer } = req.body || {};
    const emailNorm = (email != null && String(email).trim()) ? String(email).trim().toLowerCase() : '';
    if (!emailNorm || emailNorm.length < 3) return sendError(res, 'Email is required', 400);
    if (!password || typeof password !== 'string') return sendError(res, 'Password is required', 400);

    let distCode;
    if (req.role === ROLES.DISTRIBUTOR_ADMIN) {
      distCode = req.distributorCode;
      if (!distCode) return sendError(res, 'Your distributor account has no distributor code.', 400);
    } else {
      distCode = rawDistCode != null ? toStoreCode(String(rawDistCode).trim()) : '';
      if (!distCode) return sendError(res, 'Distributor code is required. Select a distributor.', 400);
      const distAdmin = await db.User.findOne({
        where: { role: ROLES.DISTRIBUTOR_ADMIN, distributorCode: distCode, isActive: true },
        attributes: ['distributorCode']
      });
      if (!distAdmin) return sendError(res, 'Selected distributor is not valid or inactive.', 400);
    }
    const distAdmin = await db.User.findOne({
      where: { role: ROLES.DISTRIBUTOR_ADMIN, distributorCode: distCode, isActive: true },
      attributes: ['distributorCode']
    });
    if (!distAdmin) return sendError(res, 'Selected distributor is not valid or inactive.', 400);


    const pwdCheck = validatePasswordStrength(password);
    if (!pwdCheck.valid) return sendError(res, pwdCheck.error, 400);

    const username = (rawUsername != null && String(rawUsername).trim()) ? String(rawUsername).trim() : (emailNorm.split('@')[0] || `store_${Date.now()}`);
    const storeFromUsername = toStoreCode(username);
    const storeCode = (rawStoreCode != null && String(rawStoreCode).trim()) ? toStoreCode(String(rawStoreCode).trim()) : storeFromUsername;
    if (!storeCode) return sendError(res, 'Store code is required (or provide a username to generate one)', 400);

    // Per-store uniqueness (matches DB indexes and customer registration): same email may exist on other stores.
    const existingEmail = await db.User.findOne({ where: { email: emailNorm, storeCode, ...NOT_DELETED } });
    if (existingEmail) {
      return sendError(res, 'An account with this email already exists for this store. Use a different email or store code.', 400);
    }

    const existingUsername = await db.User.findOne({
      where: {
        [Op.and]: [
          db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('username')), Op.eq, username.toLowerCase()),
          { storeCode, ...NOT_DELETED }
        ]
      }
    });
    if (existingUsername) return sendError(res, 'This username is already taken for this store.', 400);

    const existingStore = await db.User.findOne({
      where: { role: ROLES.STORE_ADMIN, storeRoleId: null, distributorCode: distCode, storeCode, ...NOT_DELETED }
    });
    if (existingStore) return sendError(res, 'A store with this store code already exists under this distributor. Choose another.', 400);

    let userSiteUrlVal = null;
    if (req.body && req.body.userSiteUrl != null && String(req.body.userSiteUrl).trim()) {
      const v = validateAndNormalizeUserSiteUrl(req.body.userSiteUrl);
      if (!v.ok) return sendError(res, v.error, 400);
      userSiteUrlVal = v.value;
    }

    const drawerNorm = normalizeDrawerFromBody(rawDrawer);
    if (!drawerNorm.ok) return sendError(res, drawerNorm.error, 400);

    const createPayload = {
      email: emailNorm,
      password: encryptPassword(password.trim()),
      username,
      firstName: (firstName != null && String(firstName).trim()) ? String(firstName).trim() : null,
      lastName: (lastName != null && String(lastName).trim()) ? String(lastName).trim() : null,
      role: ROLES.STORE_ADMIN,
      isAdmin: true,
      distributorCode: distCode,
      storeCode,
      userSiteUrl: userSiteUrlVal,
      isActive: isActive !== false,
      isEmailVerified: true,
      signInType: 'NORMAL'
    };
    if (!drawerNorm.omit) createPayload.drawer = drawerNorm.value;

    const user = await db.User.create(createPayload);

    await seedDefaultStorePaymentProviders(distCode, storeCode).catch(() => { });

    const safe = user.toJSON();
    delete safe.password;
    sendSuccess(res, safe, 201);
  } catch (err) {
    sendError(res, err.message || 'Failed to create store', err.statusCode || 500);
  }
}

/** All store admin accounts for this store (primary owner + staff). Master/distributor; scoped like get(). */
async function listStoreAdmins(req, res) {
  try {
    requireStoresAccess(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid store id', 400);
    const wherePrimary = { userId: id, role: ROLES.STORE_ADMIN, storeRoleId: null, ...NOT_DELETED };
    if (req.role === ROLES.DISTRIBUTOR_ADMIN) wherePrimary.distributorCode = req.distributorCode;

    const primary = await db.User.findOne({
      where: wherePrimary,
      attributes: ['distributorCode', 'storeCode']
    });
    if (!primary) return sendError(res, 'Store not found', 404);

    const dc = primary.distributorCode;
    const sc = primary.storeCode;

    const rows = await db.User.findAll({
      where: {
        role: ROLES.STORE_ADMIN,
        distributorCode: dc,
        storeCode: sc,
        ...NOT_DELETED
      },
      attributes: ['userId', 'username', 'email', 'firstName', 'lastName', 'storeRoleId', 'isActive', USER_CREATED_AT, USER_UPDATED_AT],
      include: [{ model: db.StoreRole, as: 'StoreRole', required: false, attributes: ['id', 'name', 'slug'] }],
      order: [[USER_CREATED_AT, 'DESC']]
    });

    const list = rows.map((r) => {
      const j = r.toJSON();
      if (j.StoreRole) {
        j.storeRole = j.StoreRole;
        delete j.StoreRole;
      }
      j.isPrimaryOwner = Number(j.userId) === id;
      if (req.role === ROLES.DISTRIBUTOR_ADMIN) delete j.email;
      return j;
    });

    sendSuccess(res, { list });
  } catch (err) {
    sendError(res, err.message || 'Failed to list store admins', err.statusCode || 500);
  }
}

/** List store roles for a store (by store userId). Used when master/distributor edits a store to assign a role. */
async function getStoreRoles(req, res) {
  try {
    requireStoresAccess(req);
    const id = parseInt(req.params.id, 10);
    if (!id) return sendError(res, 'Invalid store id', 400);
    const store = await db.User.findOne({
      where: { userId: id, role: ROLES.STORE_ADMIN, storeRoleId: null, ...NOT_DELETED },
      attributes: ['distributorCode', 'storeCode']
    });
    if (!store) return sendError(res, 'Store not found', 404);
    if (req.role === ROLES.DISTRIBUTOR_ADMIN && store.distributorCode !== req.distributorCode) return sendError(res, 'Forbidden', 403);
    const rows = await db.StoreRole.findAll({
      where: {
        distributorCode: store.distributorCode,
        storeCode: store.storeCode,
        slug: { [Op.ne]: OWNER_PAGE_PERMISSIONS_SLUG }
      },
      attributes: ['id', 'name', 'slug', 'permissions'],
      order: [['name', 'ASC']]
    });
    sendSuccess(res, {
      list: rows.map((r) => r.toJSON()),
      distributorCode: store.distributorCode,
      storeCode: store.storeCode
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to load store roles', err.statusCode || 500);
  }
}

/** Get one store. Distributor admin only for stores in their distributor. */
async function get(req, res) {
  try {
    requireStoresAccess(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 'Invalid store id', 400);
    const where = { userId: id, role: ROLES.STORE_ADMIN, storeRoleId: null, ...NOT_DELETED };
    if (req.role === ROLES.DISTRIBUTOR_ADMIN) where.distributorCode = req.distributorCode;

    const user = await db.User.findOne({
      where,
      attributes: [...SAFE_ATTRS, 'updated_at'],
      include: [{ model: db.StoreRole, as: 'StoreRole', required: false, attributes: ['id', 'name', 'slug'] }]
    });
    if (!user) return sendError(res, 'Store not found', 404);
    const dc = user.distributorCode;
    const sc = user.storeCode;
    const userCount = dc && sc
      ? await db.User.count({ where: { distributorCode: dc, storeCode: sc, role: ROLES.USER, ...NOT_DELETED } })
      : 0;
    const out = { ...user.toJSON(), userCount };
    if (out.StoreRole) { out.storeRole = out.StoreRole; delete out.StoreRole; }
    if (canManageStorePagePermissions(req) && dc && sc) {
      out.permissions = await getOwnerPagePermissions(dc, sc);
      out.canManagePagePermissions = true;
    }
    sendSuccess(res, out);
  } catch (err) {
    sendError(res, err.message || 'Failed to get store', err.statusCode || 500);
  }
}

/** Update store. Distributor admin only for stores in their distributor. */
async function update(req, res) {
  try {
    requireStoresAccess(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 'Invalid store id', 400);
    const where = { userId: id, role: ROLES.STORE_ADMIN, ...NOT_DELETED };
    if (req.role === ROLES.DISTRIBUTOR_ADMIN) where.distributorCode = req.distributorCode;

    const user = await db.User.findOne({ where });
    if (!user) return sendError(res, 'Store not found', 404);

    const { email, password, username: rawUsername, firstName, lastName, storeCode: rawStoreCode, isActive, userSiteUrl: rawUserSiteUrl, drawer: rawDrawer } = req.body || {};
    if (password !== undefined && req.role === ROLES.MASTER_ADMIN) {
      if (password) {
        const pwdCheck = validatePasswordStrength(password);
        if (!pwdCheck.valid) return sendError(res, pwdCheck.error, 400);
        user.password = encryptPassword(password.trim());
      }
    }
    if (email !== undefined) {
      const emailNorm = String(email).trim().toLowerCase();
      if (!emailNorm) return sendError(res, 'Email cannot be empty', 400);
      const existing = await db.User.findOne({
        where: { email: emailNorm, storeCode: user.storeCode, ...NOT_DELETED }
      });
      if (existing && existing.userId !== id) {
        return sendError(res, 'An account with this email already exists for this store.', 400);
      }
      user.email = emailNorm;
    }
    if (rawUsername !== undefined) {
      const un = String(rawUsername).trim();
      if (un) {
        const existing = await db.User.findOne({
          where: {
            [Op.and]: [
              db.sequelize.where(db.sequelize.fn('LOWER', db.sequelize.col('username')), Op.eq, un.toLowerCase()),
              { storeCode: user.storeCode, ...NOT_DELETED }
            ]
          }
        });
        if (existing && existing.userId !== id) return sendError(res, 'This username is already taken for this store.', 400);
        user.username = un;
      }
    }
    if (firstName !== undefined) user.firstName = (firstName != null && String(firstName).trim()) ? String(firstName).trim() : null;
    if (lastName !== undefined) user.lastName = (lastName != null && String(lastName).trim()) ? String(lastName).trim() : null;
    if (rawStoreCode !== undefined) {
      const sc = toStoreCode(String(rawStoreCode).trim());
      if (sc) {
        const existing = await db.User.findOne({
          where: { role: ROLES.STORE_ADMIN, storeRoleId: null, distributorCode: user.distributorCode, storeCode: sc, ...NOT_DELETED }
        });
        if (existing && existing.userId !== id) return sendError(res, 'Another store with this store code exists under this distributor.', 400);
        const prevStoreCode = user.storeCode;
        user.storeCode = sc;
        if (prevStoreCode && prevStoreCode !== sc) {
          await db.StoreRole.update(
            { storeCode: sc },
            {
              where: {
                distributorCode: user.distributorCode,
                storeCode: prevStoreCode,
                slug: OWNER_PAGE_PERMISSIONS_SLUG
              }
            }
          );
        }
      }
    }
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (rawUserSiteUrl !== undefined) {
      const v = validateAndNormalizeUserSiteUrl(
        rawUserSiteUrl === null || rawUserSiteUrl === '' ? null : rawUserSiteUrl
      );
      if (!v.ok) return sendError(res, v.error, 400);
      user.userSiteUrl = v.value;
    }
    // Store admin or master/technical staff can assign a store role / full-admin (null).
    if ((req.role === ROLES.STORE_ADMIN || isMasterAdmin(req.role)) && req.body && 'storeRoleId' in req.body) {
      const sid = req.body.storeRoleId;
      if (sid === null || sid === '') user.storeRoleId = null;
      else {
        const storeRoleId = parseInt(sid, 10);
        if (storeRoleId) {
          const sr = await db.StoreRole.findOne({ where: { id: storeRoleId, distributorCode: user.distributorCode, storeCode: user.storeCode } });
          if (sr) user.storeRoleId = storeRoleId;
        }
      }
    }

    if (rawDrawer !== undefined) {
      const dr = normalizeDrawerFromBody(rawDrawer);
      if (!dr.ok) return sendError(res, dr.error, 400);
      if (!dr.omit) user.drawer = dr.value;
    }

    await user.save();

    let pagePermissions = null;
    if (canManageStorePagePermissions(req) && req.body && Object.prototype.hasOwnProperty.call(req.body, 'permissions')) {
      pagePermissions = await setOwnerPagePermissions(
        user.distributorCode,
        user.storeCode,
        req.body.permissions
      );
    }

    const safe = user.toJSON();
    delete safe.password;
    if (pagePermissions) safe.permissions = pagePermissions;
    sendSuccess(res, safe);
  } catch (err) {
    sendError(res, err.message || 'Failed to update store', err.statusCode || 500);
  }
}

/** Soft-delete store: deactivate all store users and stamp deletedAt. Keeps history/transactions. */
async function remove(req, res) {
  try {
    requireStoresAccess(req);
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return sendError(res, 'Invalid store id', 400);
    const where = { userId: id, role: ROLES.STORE_ADMIN, storeRoleId: null, ...NOT_DELETED };
    if (req.role === ROLES.DISTRIBUTOR_ADMIN) where.distributorCode = req.distributorCode;

    const user = await db.User.findOne({ where });
    if (!user) return sendError(res, 'Store not found', 404);
    const dc = user.distributorCode;
    const sc = user.storeCode;
    if (!dc || !sc) return sendError(res, 'Store is missing distributor/store code.', 400);

    const deletedAt = new Date();
    const result = await db.sequelize.transaction(async (transaction) => {
      const [updatedUsers] = await db.User.update(
        { isActive: false, deletedAt },
        {
          where: {
            distributorCode: dc,
            storeCode: sc,
            deletedAt: null
          },
          transaction
        }
      );
      return { softDeletedUsers: updatedUsers };
    });

    sendSuccess(res, {
      deleted: true,
      softDeleted: true,
      message: 'Store soft-deleted. Users and history were kept and marked inactive.',
      softDeletedUsers: result.softDeletedUsers
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to delete store', err.statusCode || 500);
  }
}

module.exports = { list, filterOptions, create, get, listStoreAdmins, getStoreRoles, update, remove };
