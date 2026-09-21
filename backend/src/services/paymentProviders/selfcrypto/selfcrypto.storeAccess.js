'use strict';

/**
 * Direct Crypto (selfcrypto) is available for every store.
 * Store admins still turn it on/off in Payment Methods (store_payment_providers).
 */
function storeAllowsSelfcrypto(_storeCode) {
  return true;
}

module.exports = {
  storeAllowsSelfcrypto
};
