'use strict';

function normalizeStoreCode(storeCode) {
  return String(storeCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isPushCampaignStoreAllowed(storeCode) {
  return Boolean(normalizeStoreCode(storeCode));
}

module.exports = {
  normalizeStoreCode,
  isPushCampaignStoreAllowed
};
