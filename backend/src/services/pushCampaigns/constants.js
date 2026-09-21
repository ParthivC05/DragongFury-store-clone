'use strict';

const PUSH_CAMPAIGN_STORE_CODE = 'dragonfury';

function normalizeStoreCode(storeCode) {
  return String(storeCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isPushCampaignStoreAllowed(storeCode) {
  return normalizeStoreCode(storeCode) === PUSH_CAMPAIGN_STORE_CODE;
}

module.exports = {
  PUSH_CAMPAIGN_STORE_CODE,
  normalizeStoreCode,
  isPushCampaignStoreAllowed
};
