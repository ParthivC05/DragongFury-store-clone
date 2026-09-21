'use strict';

const db = require('../../db/models');
const { DEPOSIT_PACKAGE_SETTINGS_KEY } = require('../../constants/depositPackageGroups');

const DEFAULT_SETTINGS = { enabled: false };

function normalizeScope(scope) {
  if (!scope?.distributorCode || !scope?.storeCode) return null;
  return {
    distributorCode: String(scope.distributorCode).trim().toLowerCase(),
    storeCode: String(scope.storeCode).trim().toLowerCase()
  };
}

function normalizeSettings(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  return {
    enabled: raw.enabled === true
  };
}

async function readSettingsForScope(scope) {
  const normalized = normalizeScope(scope);
  if (!normalized) return null;
  const row = await db.Setting.findOne({
    where: {
      key: DEPOSIT_PACKAGE_SETTINGS_KEY,
      distributorCode: normalized.distributorCode,
      storeCode: normalized.storeCode
    }
  });
  if (!row?.value) return null;
  try {
    return normalizeSettings(JSON.parse(row.value));
  } catch {
    return null;
  }
}

async function getDepositPackageSettings(scope) {
  const settings = await readSettingsForScope(scope);
  return settings || { ...DEFAULT_SETTINGS };
}

async function updateDepositPackageSettings(scope, payload) {
  const normalized = normalizeScope(scope);
  if (!normalized) {
    const err = new Error('Store scope is required.');
    err.statusCode = 400;
    throw err;
  }
  const next = normalizeSettings({
    enabled: payload?.enabled === true
  });
  const [row] = await db.Setting.findOrCreate({
    where: {
      key: DEPOSIT_PACKAGE_SETTINGS_KEY,
      distributorCode: normalized.distributorCode,
      storeCode: normalized.storeCode
    },
    defaults: {
      key: DEPOSIT_PACKAGE_SETTINGS_KEY,
      distributorCode: normalized.distributorCode,
      storeCode: normalized.storeCode,
      value: JSON.stringify(next)
    }
  });
  await row.update({ value: JSON.stringify(next) });
  return next;
}

module.exports = {
  getDepositPackageSettings,
  updateDepositPackageSettings,
  normalizeScope
};
