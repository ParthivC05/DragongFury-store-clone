const db = require('../../db/models');
const { getWalletLimitsForUser } = require('./getWalletLimits.service');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('./getCurrencySetting.service');
const { getVipWithdrawalLimits } = require('../vip/getVipWithdrawalLimits.service');
const { assertSpinWheelWithdrawalAllowed } = require('./validateSpinWheelWithdrawal.service');
const { assertDailyWithdrawalLimit } = require('./assertDailyWithdrawalLimit.service');
const { rscAvailableToWithdraw } = require('./walletBuckets.service');

const MIN_AMOUNT = 10;

/**
 * Create a pending withdrawal request (no balance deduction).
 * Balance is deducted only when an admin approves the request.
 * For method 'scrypto', linkedAccountId (or cryptoAddress) must be the crypto wallet address for payout.
 * @param {number} userId
 * @param {{ linkedAccountId?: string, cryptoAddress?: string, method?: string, amount: number, currency?: string, reason?: string, routingType?: string, gameName?: string, gameUsername?: string }} body
 */
async function createWithdrawalRequest(userId, body) {
  const method = (body?.method && typeof body.method === 'string') ? body.method.trim().toLowerCase() : null;
  const linkedAccountIdRaw = (body?.linkedAccountId ?? body?.linked_account_id ?? '').toString().trim();
  const cryptoAddressRaw = (body?.cryptoAddress ?? body?.crypto_address ?? '').toString().trim();
  const linkedAccountId = linkedAccountIdRaw.length > 0 ? linkedAccountIdRaw.slice(0, 255) : null;
  const cryptoAddress = cryptoAddressRaw.length > 0 ? cryptoAddressRaw.slice(0, 255) : null;
  const effectiveAddress = cryptoAddress || linkedAccountId;

  if (method === 'scrypto') {
    if (!effectiveAddress) {
      const err = new Error('Crypto wallet address (cryptoAddress or linkedAccountId) is required for Speed withdrawals.');
      err.statusCode = 400;
      throw err;
    }
  }

  const amount = body?.amount != null ? Number(body.amount) : NaN;
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT) {
    const err = new Error('Amount must be a valid number and at least $10');
    err.statusCode = 400;
    throw err;
  }

  const [limits, displayCurrencyCode, vipLimits] = await Promise.all([
    getWalletLimitsForUser(userId),
    getCurrencySetting(),
    getVipWithdrawalLimits(userId).catch(() => ({ withdrawalLimit: null, platformWithdrawalLimit: null }))
  ]);
  const currencyCode = REDEEMABLE_CURRENCY_CODE;
  const { withdrawMin, withdrawMax } = limits;
  const effectiveWindowMax = (vipLimits.platformWithdrawalLimit != null && vipLimits.platformWithdrawalLimit > 0)
    ? Math.min(withdrawMax, vipLimits.platformWithdrawalLimit)
    : withdrawMax;
  const effectivePerRequestMax = (vipLimits.withdrawalLimit != null && vipLimits.withdrawalLimit > 0)
    ? Math.min(effectiveWindowMax, vipLimits.withdrawalLimit)
    : effectiveWindowMax;

  if (amount < withdrawMin) {
    const err = new Error(`Minimum withdrawal is ${displayCurrencyCode} ${withdrawMin}.00`);
    err.statusCode = 400;
    throw err;
  }
  if (amount > effectivePerRequestMax) {
    if (limits.neverDeposited) {
      const { neverDepositedWithdrawMaxError } = require('./neverDepositedWithdraw.service');
      throw neverDepositedWithdrawMaxError();
    }
    const err = new Error(`Maximum withdrawal per request is ${displayCurrencyCode} ${effectivePerRequestMax}.00`);
    err.statusCode = 400;
    throw err;
  }

  const currency = ((body?.currency ?? currencyCode) || 'USD').toString().trim().slice(0, 8) || 'USD';
  const reason = (body?.reason ?? '').toString().trim().slice(0, 2000) || null;
  const routingType = (body?.routingType ?? body?.routing_type ?? '').toString().trim().slice(0, 64) || null;
  const gameName = (body?.gameName ?? body?.game_name ?? '').toString().trim().slice(0, 255) || null;
  const gameUsername = (body?.gameUsername ?? body?.game_username ?? '').toString().trim().slice(0, 255) || null;
  const resolvedMethod = method === 'scrypto' ? 'scrypto' : (effectiveAddress ? 'linked-account' : 'platform');

  const request = await db.sequelize.transaction(async (t) => {
    let wallet = await db.Wallet.findOne({
      where: { userId, currencyCode },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!wallet) {
      wallet = await db.Wallet.create(
        { userId, currencyCode, balance: 0, playBalance: 0, frozenBalance: 0 },
        { transaction: t }
      );
      wallet = await db.Wallet.findOne({
        where: { userId, currencyCode },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
    }

    const availableToWithdraw = rscAvailableToWithdraw(wallet);
    if (amount > availableToWithdraw) {
      const err = new Error(
        'Insufficient redeemable balance (RSC). Withdrawals use funds from game wins and redemptions only.'
      );
      err.statusCode = 400;
      throw err;
    }

    await assertSpinWheelWithdrawalAllowed(userId, amount, availableToWithdraw);
    await assertDailyWithdrawalLimit(userId, amount, {
      displayCurrency: displayCurrencyCode,
      transaction: t
    });

    const createPayload = {
      userId,
      amount: Number(amount),
      method: resolvedMethod,
      status: 'pending',
      linkedAccountId: linkedAccountId || (method === 'scrypto' ? effectiveAddress : null),
      currency,
      reason,
      routingType,
      gameName,
      gameUsername
    };
    if (cryptoAddress) createPayload.cryptoAddress = cryptoAddress;
    const req = await db.WithdrawalRequest.create(createPayload, { transaction: t });
    await wallet.increment('frozenBalance', { by: Number(amount), transaction: t });
    return req;
  });

  return {
    success: true,
    message: 'Withdrawal request submitted successfully. It will be reviewed by an admin or partner.',
    data: {
      id: request.id,
      status: request.status,
      amount: Number(request.amount),
      currency: request.currency,
      createdAt: request.created_at
    }
  };
}

module.exports = { createWithdrawalRequest };
