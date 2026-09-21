'use strict';

const db = require('../../db/models');
const {
  STORE_FEATURE_KEYS_LIST,
  fullStorePermissions
} = require('../../constants/permissions');

/** Reserved slug: page permissions for the primary store owner (store_role_id stays null). */
const OWNER_PAGE_PERMISSIONS_SLUG = '__owner_page_permissions';
const OWNER_PAGE_PERMISSIONS_NAME = 'Store owner page access';

function validateStorePermissions(permissions) {
  if (!permissions || typeof permissions !== 'object') return {};
  const out = {};
  STORE_FEATURE_KEYS_LIST.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(permissions, k)) out[k] = !!permissions[k];
  });
  return out;
}

function isFullStorePermissions(permissions) {
  if (!permissions || typeof permissions !== 'object') return true;
  const full = fullStorePermissions();
  return STORE_FEATURE_KEYS_LIST.every((k) => permissions[k] === full[k]);
}

/**
 * Effective page permissions for a primary store owner (storeRoleId null).
 * Missing reserved role → full access (legacy behaviour).
 */
async function getOwnerPagePermissions(distributorCode, storeCode) {
  if (!distributorCode || !storeCode) return fullStorePermissions();
  const role = await db.StoreRole.findOne({
    where: {
      distributorCode: String(distributorCode).trim(),
      storeCode: String(storeCode).trim(),
      slug: OWNER_PAGE_PERMISSIONS_SLUG
    }
  });
  if (!role || !role.permissions || typeof role.permissions !== 'object') {
    return fullStorePermissions();
  }
  return { ...fullStorePermissions(), ...validateStorePermissions(role.permissions) };
}

/**
 * Upsert or clear primary-owner page permissions for a store.
 * Full access (all true) removes the reserved role so behaviour matches legacy full admin.
 */
async function setOwnerPagePermissions(distributorCode, storeCode, permissions) {
  const dc = String(distributorCode || '').trim();
  const sc = String(storeCode || '').trim();
  if (!dc || !sc) {
    const err = new Error('Store scope is required to set page permissions.');
    err.statusCode = 400;
    throw err;
  }
  const perms = validateStorePermissions(permissions);
  const existing = await db.StoreRole.findOne({
    where: { distributorCode: dc, storeCode: sc, slug: OWNER_PAGE_PERMISSIONS_SLUG }
  });

  if (isFullStorePermissions(perms)) {
    if (existing) await existing.destroy();
    return fullStorePermissions();
  }

  if (existing) {
    existing.name = OWNER_PAGE_PERMISSIONS_NAME;
    existing.permissions = perms;
    await existing.save();
    return { ...fullStorePermissions(), ...perms };
  }

  await db.StoreRole.create({
    distributorCode: dc,
    storeCode: sc,
    name: OWNER_PAGE_PERMISSIONS_NAME,
    slug: OWNER_PAGE_PERMISSIONS_SLUG,
    permissions: perms
  });
  return { ...fullStorePermissions(), ...perms };
}

module.exports = {
  OWNER_PAGE_PERMISSIONS_SLUG,
  OWNER_PAGE_PERMISSIONS_NAME,
  validateStorePermissions,
  isFullStorePermissions,
  getOwnerPagePermissions,
  setOwnerPagePermissions
};
