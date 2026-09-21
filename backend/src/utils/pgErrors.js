'use strict';

function pgErrorCode(err) {
  if (!err) return '';
  return String(err.parent?.code || err.original?.code || err.code || '');
}

function pgErrorMessage(err) {
  if (!err) return '';
  return String(err.parent?.message || err.original?.message || err.message || '');
}

function isUniqueConstraintError(err) {
  if (!err) return false;
  if (err.name === 'SequelizeUniqueConstraintError') return true;
  return pgErrorCode(err) === '23505';
}

/** Postgres 25P02 — a prior query failed in this transaction; further queries must not be retried on it. */
function isAbortedTransactionError(err) {
  if (!err) return false;
  if (pgErrorCode(err) === '25P02') return true;
  return pgErrorMessage(err).toLowerCase().includes('current transaction is aborted');
}

module.exports = {
  isUniqueConstraintError,
  isAbortedTransactionError
};
