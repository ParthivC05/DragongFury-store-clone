'use strict';

/**
 * Payment provider factory. Returns a provider by name.
 * Providers implement: createDepositLink({ userId, amount, currency, metadata? }) -> { paymentUrl, providerSessionId }
 * Optional: getDepositStatus({ transactionId }), createWithdrawal({ amount, currency, address })
 */
const paymentProviderFactory = require('./payment-provider.factory');

module.exports = {
  getProvider: paymentProviderFactory.getProvider,
  registerProvider: paymentProviderFactory.registerProvider,
  isProviderAvailable: paymentProviderFactory.isProviderAvailable
};
