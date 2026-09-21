'use strict';

/**
 * User / UserTransaction models define createdAt & updatedAt as real attributes with field: created_at / updated_at.
 * That fixes Sequelize 6 generating invalid SQL like "User"."createdAt" (column does not exist in PostgreSQL).
 *
 * Use these constants in admin code for sort whitelists. API clients may send createdAt, created_at, updatedAt, or updated_at.
 */

const USER_CREATED_AT = 'createdAt';
const USER_UPDATED_AT = 'updatedAt';

const TIMESTAMP_SORT_ALIASES = {
  created_at: USER_CREATED_AT,
  createdAt: USER_CREATED_AT,
  updated_at: USER_UPDATED_AT,
  updatedAt: USER_UPDATED_AT
};

/**
 * @param {string|undefined} sortKey - e.g. query.sortBy
 * @returns {string} model attribute name if alias matched, else original trimmed string
 */
function mapUserSortKeyToAttribute(sortKey) {
  if (sortKey == null || sortKey === '') return USER_CREATED_AT;
  const s = String(sortKey).trim();
  return TIMESTAMP_SORT_ALIASES[s] !== undefined ? TIMESTAMP_SORT_ALIASES[s] : s;
}

/**
 * Resolve sort column for User queries: whitelist model attributes, accept timestamp aliases.
 * @param {string|undefined} requestedSort
 * @param {string[]} allowedModelAttributes - User model attribute names
 * @param {string} [defaultAttr]
 */
function resolveUserOrderColumn(requestedSort, allowedModelAttributes, defaultAttr = USER_CREATED_AT) {
  const mapped = mapUserSortKeyToAttribute(requestedSort);
  if (allowedModelAttributes.includes(mapped)) return mapped;
  const raw = requestedSort != null ? String(requestedSort).trim() : '';
  if (raw && allowedModelAttributes.includes(raw)) return raw;
  return defaultAttr;
}

module.exports = {
  USER_CREATED_AT,
  USER_UPDATED_AT,
  mapUserSortKeyToAttribute,
  resolveUserOrderColumn
};
