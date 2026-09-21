'use strict';

/** DragonFury-only email campaign feature. Never enable for other stores. */
const EMAIL_CAMPAIGN_STORE_CODE = 'dragonfury';

function normalizeStoreCode(storeCode) {
  return String(storeCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isEmailCampaignStoreAllowed(storeCode) {
  return normalizeStoreCode(storeCode) === EMAIL_CAMPAIGN_STORE_CODE;
}

module.exports = {
  EMAIL_CAMPAIGN_STORE_CODE,
  normalizeStoreCode,
  isEmailCampaignStoreAllowed
};
