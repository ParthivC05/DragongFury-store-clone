'use strict';

const { Op } = require('sequelize');

/** Operations logged but excluded from automation usage reporting. */
const EXCLUDED_AUTOMATION_USAGE_OPERATIONS = ['link_account'];

/**
 * Transient provider session messages (especially Orion Stars) — recovered by re-login.
 * Keep out of admin Automation usage success/failure counts and the failed-calls list.
 */
const EXCLUDED_AUTOMATION_USAGE_ERROR_PATTERNS = [
  'session timeout',
  'session expired',
  'session invalid',
  'session not found',
  'no winnings available to redeem'
];

function isExcludedAutomationUsageOperation(operation) {
  return EXCLUDED_AUTOMATION_USAGE_OPERATIONS.includes(String(operation || '').trim());
}

function isExcludedAutomationUsageSessionError(errorMessage) {
  const msg = String(errorMessage || '').toLowerCase();
  if (!msg) return false;
  return EXCLUDED_AUTOMATION_USAGE_ERROR_PATTERNS.some((p) => msg.includes(p));
}

function excludeOperationsFromSequelizeWhere(where = {}) {
  const existing = where.operation;
  let next = { ...where };
  if (existing != null && typeof existing === 'string') {
    if (isExcludedAutomationUsageOperation(existing)) {
      next = { ...next, operation: { [Op.eq]: '__excluded_automation_operation__' } };
    }
  } else if (existing && typeof existing === 'object') {
    next = {
      ...next,
      operation: { [Op.and]: [existing, { [Op.notIn]: EXCLUDED_AUTOMATION_USAGE_OPERATIONS }] }
    };
  } else {
    next = {
      ...next,
      operation: { [Op.notIn]: EXCLUDED_AUTOMATION_USAGE_OPERATIONS }
    };
  }
  return excludeSessionTimeoutFromSequelizeWhere(next);
}

/**
 * Drop rows whose error_message is a recoverable provider session timeout/expiry.
 * Successful calls are unchanged; failed session rows are omitted from all usage queries.
 */
function excludeSessionTimeoutFromSequelizeWhere(where = {}) {
  const sessionExclude = {
    [Op.or]: [
      { errorMessage: null },
      {
        errorMessage: {
          [Op.and]: EXCLUDED_AUTOMATION_USAGE_ERROR_PATTERNS.map((pattern) => ({
            [Op.notILike]: `%${pattern}%`
          }))
        }
      }
    ]
  };
  const existingAnd = where[Op.and];
  if (Array.isArray(existingAnd)) {
    return { ...where, [Op.and]: [...existingAnd, sessionExclude] };
  }
  return { ...where, [Op.and]: [sessionExclude] };
}

function appendExcludedOperationsSql(conditions, alias = 'l') {
  if (EXCLUDED_AUTOMATION_USAGE_OPERATIONS.length === 1) {
    conditions.push(`${alias}.operation <> :excludedAutomationOperation`);
    return {
      excludedAutomationOperation: EXCLUDED_AUTOMATION_USAGE_OPERATIONS[0],
      ...appendExcludedSessionTimeoutSql(conditions, alias)
    };
  }
  const placeholders = EXCLUDED_AUTOMATION_USAGE_OPERATIONS
    .map((_, index) => `:excludedAutomationOp${index}`)
    .join(', ');
  conditions.push(`${alias}.operation NOT IN (${placeholders})`);
  const replacements = {};
  EXCLUDED_AUTOMATION_USAGE_OPERATIONS.forEach((operation, index) => {
    replacements[`excludedAutomationOp${index}`] = operation;
  });
  Object.assign(replacements, appendExcludedSessionTimeoutSql(conditions, alias));
  return replacements;
}

function appendExcludedSessionTimeoutSql(conditions, alias = 'l') {
  const replacements = {};
  const parts = EXCLUDED_AUTOMATION_USAGE_ERROR_PATTERNS.map((_, index) => {
    const key = `excludedSessionError${index}`;
    replacements[key] = `%${EXCLUDED_AUTOMATION_USAGE_ERROR_PATTERNS[index]}%`;
    return `${alias}.error_message NOT ILIKE :${key}`;
  });
  conditions.push(`(${alias}.error_message IS NULL OR (${parts.join(' AND ')}))`);
  return replacements;
}

module.exports = {
  EXCLUDED_AUTOMATION_USAGE_OPERATIONS,
  EXCLUDED_AUTOMATION_USAGE_ERROR_PATTERNS,
  isExcludedAutomationUsageOperation,
  isExcludedAutomationUsageSessionError,
  excludeOperationsFromSequelizeWhere,
  excludeSessionTimeoutFromSequelizeWhere,
  appendExcludedOperationsSql,
  appendExcludedSessionTimeoutSql
};
