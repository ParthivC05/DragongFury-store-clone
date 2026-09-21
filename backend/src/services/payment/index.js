'use strict';

/**
 * Payment module — CentryOS API: Signup → Login → Create Payment Link.
 * Flow: 1) signupUser (create payment account), 2) loginUser (get token), 3) createPayinLink (get deposit link).
 */
const { signupUser } = require('./signupUser.service');
const { signupUserDirect } = require('./signupUserDirect.service');
const { loginUser, getCentryosUserIdFromToken } = require('./loginUser.service');
const { createPayinLink, createPayinLinkWithAuthRetry } = require('./createPayinLink.service');
const { getTransactionStatus } = require('./getTransactionStatus.service');
const { getMyPaymentTransactions } = require('./getMyPaymentTransactions.service');
const { listPaymentTransactionsWithAuthRetry } = require('./listPaymentTransactions.service');
const { sendPaymentOTP } = require('./sendPaymentOTP.service');
const { verifyPaymentOTP } = require('./verifyPaymentOTP.service');
const { getPaymentLinkedAccounts } = require('./getPaymentLinkedAccounts.service');
const { createPaymentWithdrawalRequest } = require('./createPaymentWithdrawalRequest.service');
const {
  checkPaymentUserDirect,
  requestPaymentPasswordResetOtp,
  verifyPaymentPasswordResetOtp,
  confirmPaymentPasswordReset
} = require('./resetPaymentPassword.service');
const { getPaymentConfig, getPaymentPartnerCodeFromRequest, isPaymentConfigured } = require('./payment.config');

module.exports = {
  signupUser,
  signupUserDirect,
  loginUser,
  createPayinLink,
  createPayinLinkWithAuthRetry,
  getTransactionStatus,
  getMyPaymentTransactions,
  listPaymentTransactionsWithAuthRetry,
  getCentryosUserIdFromToken,
  sendPaymentOTP,
  verifyPaymentOTP,
  checkPaymentUserDirect,
  requestPaymentPasswordResetOtp,
  verifyPaymentPasswordResetOtp,
  confirmPaymentPasswordReset,
  getPaymentLinkedAccounts,
  createPaymentWithdrawalRequest,
  getPaymentConfig,
  getPaymentPartnerCodeFromRequest,
  isPaymentConfigured
};
