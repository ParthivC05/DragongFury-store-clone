'use strict';

const { getActiveCatalogForScope } = require('./getDepositPackagesCatalog.service');
const { getDepositPackageSettings, normalizeScope } = require('./getDepositPackageSettings.service');
const { resolveDepositPackageForUser } = require('./resolveDepositPackage.service');
const adminDepositPackages = require('./adminDepositPackages.service');

module.exports = {
  getActiveCatalogForScope,
  getDepositPackageSettings,
  normalizeScope,
  resolveDepositPackageForUser,
  ...adminDepositPackages
};
