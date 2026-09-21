'use strict';

const db = require('../../db/models');
const { REDEEMABLE_CURRENCY_CODE, getCurrencySetting } = require('./getCurrencySetting.service');
const { assertDailyWithdrawalLimit } = require('./assertDailyWithdrawalLimit.service');

/**
 * Create a local withdrawal_requests record and freeze funds when pending.
 * Re-checks daily withdrawal limit under wallet row lock so concurrent Orion
 * withdrawals cannot bypass the daily cap.
 *
 * @param {number} userId
 * @param {{ linkedAccountId: string, amount: number, currency?: string, reason?: string, routingType?: string, gameName?: string, gameUsername?: string }} body
 * @param {{ success: boolean, data?: { id: number, status: string, amount: string, currency: string, createdAt: string } }} paymentResult
 */
async function recordPaymentWithdrawalLocally(userId, body, paymentResult) {
  const amount = body?.amount != null ? Number(body.amount) : Number(paymentResult?.data?.amount) || 0;
  const currency = (body?.currency ?? paymentResult?.data?.currency ?? 'USD').toString().trim().slice(0, 8) || 'USD';
  const linkedAccountId = (body?.linkedAccountId ?? body?.linked_account_id ?? '').toString().trim().slice(0, 255) || null;
  const reason = (body?.reason ?? 'Withdrawal').toString().trim().slice(0, 2000) || null;
  const routingType = (body?.routingType ?? body?.routing_type ?? 'RTP').toString().trim().slice(0, 64) || null;
  const gameName = (body?.gameName ?? body?.game_name ?? '').toString().trim().slice(0, 255) || null;
  const gameUsername = (body?.gameUsername ?? body?.game_username ?? '').toString().trim().slice(0, 255) || null;
  const status = (paymentResult?.data?.status ?? 'pending').toString().trim().slice(0, 32) || 'pending';
  const paymentApiRequestId = paymentResult?.data?.id != null ? Number(paymentResult.data.id) : null;

  const walletCurrencyCode = REDEEMABLE_CURRENCY_CODE;
  const displayCurrency = await getCurrencySetting().catch(() => 'SC');

  await db.sequelize.transaction(async (t) => {
    let wallet = await db.Wallet.findOne({
      where: { userId, currencyCode: walletCurrencyCode },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!wallet) {
      wallet = await db.Wallet.create(
        { userId, currencyCode: walletCurrencyCode, balance: 0, playBalance: 0, frozenBalance: 0 },
        { transaction: t }
      );
      wallet = await db.Wallet.findOne({
        where: { userId, currencyCode: walletCurrencyCode },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
    }

    if (amount > 0) {
      await assertDailyWithdrawalLimit(userId, amount, {
        displayCurrency,
        transaction: t
      });
    }

    await db.WithdrawalRequest.create({
      userId,
      amount,
      method: 'payment-api',
      status,
      linkedAccountId,
      currency,
      reason,
      routingType,
      gameName,
      gameUsername,
      paymentApiRequestId
    }, { transaction: t });

    if (status === 'pending' && amount > 0 && wallet) {
      const currentFrozen = Number(wallet.frozenBalance) || 0;
      await wallet.update(
        { frozenBalance: Math.round((currentFrozen + amount) * 100) / 100 },
        { transaction: t }
      );
    }

    if (db.UserTransaction) {
      await db.UserTransaction.create({
        userId,
        type: 'withdraw',
        amount,
        currencyCode: walletCurrencyCode,
        description: `Withdrawal request (${status})`
      }, { transaction: t });
    }
  });
}

module.exports = { recordPaymentWithdrawalLocally };
