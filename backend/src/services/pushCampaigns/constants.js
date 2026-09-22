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

/** Live user-site origins for push click/image URLs. Not read from env. */
const PUSH_STORE_FRONTEND_ORIGINS = {
  playjuwa: 'https://playjuwa.com',
  myvepower: 'https://myvepower.com',
  goodwork: 'https://luckywinnerspower.com',
  luckywinner: 'https://luckywinnerspower.com',
  goodgdragon: 'https://goodgdragon.com',
  casinoslots: 'https://casinoslots.casino',
  sweepstakebet: 'https://sweepstakebet.com',
  grandsweeps: 'https://grandsweep.xyz',
  grandsweep: 'https://grandsweep.xyz',
  winners4: 'https://winner4.com',
  winner4: 'https://winner4.com',
  dragonfury: 'https://dragonfury.com',
  betgamezone: 'https://betgamezone.com'
};

function getPushFrontendOrigin(storeCode) {
  const code = normalizeStoreCode(storeCode);
  const origin = PUSH_STORE_FRONTEND_ORIGINS[code] || '';
  return origin.replace(/\/+$/, '');
}

module.exports = {
  normalizeStoreCode,
  isPushCampaignStoreAllowed,
  PUSH_STORE_FRONTEND_ORIGINS,
  getPushFrontendOrigin
};
