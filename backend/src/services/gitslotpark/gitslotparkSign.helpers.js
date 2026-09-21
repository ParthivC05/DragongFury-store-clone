'use strict';

const crypto = require('crypto');

/**
 * HMAC-SHA256 sign (uppercase hex), per GitSlotPark spec.
 */
function getSign(key, message) {
  const hmac = crypto.createHmac('sha256', Buffer.from(key, 'utf8'));
  hmac.update(Buffer.from(message, 'utf8'));
  return hmac.digest('hex').toUpperCase();
}

function formatAmount(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';
  return num.toFixed(2);
}

function buildGetBalanceSignMessage(agentID, userID, gameID) {
  return `${agentID}${userID}${gameID}`;
}

function buildBetWinSignMessage(agentID, userID, betAmount, winAmount, transactionID, roundID, gameID) {
  return `${agentID}${userID}${formatAmount(betAmount)}${formatAmount(winAmount)}${transactionID}${roundID}${gameID}`;
}

function buildWithdrawSignMessage(agentID, userID, amount, transactionID, roundID, gameID) {
  return `${agentID}${userID}${formatAmount(amount)}${transactionID}${roundID}${gameID}`;
}

function buildDepositSignMessage(agentID, userID, amount, refTransactionID, transactionID, roundID, gameID) {
  return `${agentID}${userID}${formatAmount(amount)}${refTransactionID}${transactionID}${roundID}${gameID}`;
}

function buildRollbackSignMessage(agentID, userID, refTransactionID, gameID) {
  return `${agentID}${userID}${refTransactionID}${gameID}`;
}

function verifySign(secretKey, expectedMessage, providedSign) {
  if (!secretKey || !providedSign) return false;
  const expected = getSign(secretKey, expectedMessage);
  const provided = String(providedSign).trim().toUpperCase();
  if (expected.length !== provided.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

function formatBalance(value) {
  return Number(formatAmount(value));
}

function newPlatformTransactionId() {
  return (crypto.randomUUID && crypto.randomUUID()) || crypto.randomBytes(16).toString('hex');
}

module.exports = {
  getSign,
  formatAmount,
  formatBalance,
  verifySign,
  newPlatformTransactionId,
  buildGetBalanceSignMessage,
  buildBetWinSignMessage,
  buildWithdrawSignMessage,
  buildDepositSignMessage,
  buildRollbackSignMessage
};
