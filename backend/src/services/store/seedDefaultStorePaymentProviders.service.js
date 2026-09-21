'use strict';

const db = require('../../db/models');

const ORIONSTARSPAY_CODE = 'orionstarspay';
const MANUAL_CODE = 'manual';
const SELFCRYPTO_CODE = 'selfcrypto';

/**
 * When a new store is created, seed store_payment_providers:
 * Orionstars + Manual + Direct Crypto enabled by default; DollarPay and others off until opted in.
 * @param {string} distributorCode
 * @param {string} storeCode
 */
async function seedDefaultStorePaymentProviders(distributorCode, storeCode) {
  if (!distributorCode || !storeCode) return;

  const providers = await db.PaymentProvider.findAll({
    attributes: ['code'],
    raw: true
  });
  const codes = (providers || []).map((p) => (p.code || '').toString().toLowerCase()).filter(Boolean);

  for (const code of codes) {
    const enabledByDefault =
      code === ORIONSTARSPAY_CODE ||
      code === MANUAL_CODE ||
      code === SELFCRYPTO_CODE;
    await db.StorePaymentProvider.findOrCreate({
      where: { distributorCode, storeCode, providerCode: code },
      defaults: {
        enabled: enabledByDefault,
        depositEnabled: enabledByDefault,
        withdrawEnabled: code === SELFCRYPTO_CODE ? false : enabledByDefault
      }
    });
  }
}

module.exports = { seedDefaultStorePaymentProviders };
