'use strict';

/**
 * Factory for payment providers. Each provider implements:
 * - createDepositLink(params) -> Promise<{ paymentUrl, providerSessionId }>
 *   params: { userId, amount, currency, metadata?, paymentToken? } (paymentToken for orionstarspay)
 * Optional: getDepositStatus({ transactionId }), createWithdrawal({ amount, currency, address })
 *
 * Registration is env-based (e.g. SPEED_API_KEY). Whether a provider is active for deposits
 * is determined by payment_providers.is_active in the DB; deposit-methods and deposit-session
 * services validate against the DB before returning or creating sessions.
 */
const speedProvider = require('./speed/speed.provider');
const selfcryptoProvider = require('./selfcrypto/selfcrypto.provider');

const providers = new Map();

function registerProvider(name, impl) {
  if (name && impl && typeof impl.createDepositLink === 'function') {
    providers.set(name.toLowerCase(), impl);
  }
}

function getProvider(name) {
  if (!name || typeof name !== 'string') return null;
  return providers.get(name.toLowerCase()) || null;
}

function isProviderAvailable(name) {
  return getProvider(name) != null;
}

// Register built-in providers when configured (env-based). Active state is enforced via payment_providers table.
function init() {
  const speedApiKey = process.env.SPEED_API_KEY || process.env.SPEED_SECRET_KEY;
  if (speedApiKey) {
    registerProvider('scrypto', speedProvider.create(speedApiKey));
  }
  registerProvider('selfcrypto', selfcryptoProvider.create());
}

init();

module.exports = {
  getProvider,
  registerProvider,
  isProviderAvailable
};
