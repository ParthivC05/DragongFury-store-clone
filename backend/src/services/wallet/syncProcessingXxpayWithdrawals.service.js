'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const xxpay = require('../paymentProviders/xxpay/xxpay.client');
const {
  finalizeDollarpayWithdrawalSuccess,
  finalizeDollarpayWithdrawalFailure
} = require('./settleDollarpayWithdrawal.service');
const { decryptPaymentPassword } = require('../../utils/paymentPasswordEncryption');
const {
  XXPAY_ALLOWED_STORE_CODES,
  storeAllowsXxpay
} = require('../paymentProviders/xxpay/xxpay.storeAccess');
const { logger, paymentLog, paymentErrorLog } = require('../../libs/logger');

const ALLOWED_STORES = [...XXPAY_ALLOWED_STORE_CODES];
const BATCH_LIMIT = 100;

/**
 * Query XXPay transfer status for one processing withdrawal and settle if terminal.
 * Only for paymentProvider=xxpay on allowlisted stores.
 */
async function syncXxpayWithdrawalStatus(row) {
  if (!row || String(row.paymentProvider || '').toLowerCase() !== 'xxpay') return null;
  if (String(row.status) !== 'processing') return null;
  if (!storeAllowsXxpay(row.storeCode)) {
    paymentLog('XXPay payout cron skip: store not allowed', {
      requestId: row.id,
      storeCode: row.storeCode || null
    });
    return { skippedStore: true };
  }
  if (!row.outerOrderSn || !row.dollarpayMerchantId || !row.dollarpayKeyEncrypted) return null;

  let apiKey;
  try {
    apiKey = decryptPaymentPassword(row.dollarpayKeyEncrypted);
  } catch {
    return null;
  }
  if (!apiKey) return null;

  const mchOrderNo = String(row.outerOrderSn).trim();
  const transferOrderNo = row.providerTransactionId
    ? String(row.providerTransactionId).trim()
    : undefined;

  console.log('[XXPay] CRON PAYOUT QUERY', {
    requestId: row.id,
    userId: row.userId,
    storeCode: row.storeCode,
    mchOrderNo,
    transferOrderNo: transferOrderNo || null
  });

  const data = await xxpay.queryTransfer({
    mchNo: row.dollarpayMerchantId,
    apiKey,
    baseUrl: row.xxpayBaseUrl || null,
    mchOrderNo,
    transferOrderNo: transferOrderNo && transferOrderNo !== mchOrderNo ? transferOrderNo : undefined
  });

  const payload = data?.data && typeof data.data === 'object' ? data.data : data;
  const stateNum = Number(payload?.state);
  const transactionId = String(
    payload?.transferOrderNo || payload?.orderNo || transferOrderNo || mchOrderNo
  ).trim();

  paymentLog('XXPay payout cron query result', {
    requestId: row.id,
    mchOrderNo,
    state: stateNum,
    transferOrderNo: transactionId,
    storeCode: row.storeCode || null
  });

  if (stateNum === 2) {
    const result = await finalizeDollarpayWithdrawalSuccess(row, { transactionId });
    console.log('[XXPay] CRON PAYOUT SUCCESS', {
      requestId: row.id,
      userId: row.userId,
      mchOrderNo,
      transferOrderNo: transactionId
    });
    return result;
  }

  if (stateNum === 3 || stateNum === 4 || stateNum === 5 || stateNum === 6) {
    const reason =
      (payload?.errMsg || payload?.errCode || `XXPay transfer state ${stateNum}`).toString();
    const result = await finalizeDollarpayWithdrawalFailure(row, { reason });
    console.log('[XXPay] CRON PAYOUT FAIL', {
      requestId: row.id,
      userId: row.userId,
      mchOrderNo,
      state: stateNum,
      reason
    });
    return result;
  }

  return { pending: true, state: stateNum };
}

/**
 * Poll XXPay transfer query for in-flight withdrawals on allowed stores only.
 * Does not touch DollarPay / other-store withdrawals.
 */
async function syncProcessingXxpayWithdrawals() {
  const rows = await db.ChimeCashappWithdrawalRequest.findAll({
    where: {
      status: 'processing',
      paymentProvider: 'xxpay',
      storeCode: { [Op.in]: ALLOWED_STORES }
    },
    order: [['id', 'ASC']],
    limit: BATCH_LIMIT
  });

  let checked = 0;
  let completed = 0;
  let failed = 0;
  let pending = 0;
  let skippedStore = 0;
  let errors = 0;

  paymentLog('XXPay payout cron start', {
    candidateCount: rows.length,
    allowedStores: ALLOWED_STORES
  });
  console.log('[XXPay] CRON PAYOUT START', {
    candidateCount: rows.length,
    allowedStores: ALLOWED_STORES
  });

  for (const row of rows) {
    checked += 1;
    try {
      if (!storeAllowsXxpay(row.storeCode)) {
        skippedStore += 1;
        continue;
      }
      const result = await syncXxpayWithdrawalStatus(row);
      await row.reload().catch(() => {});
      const status = String(row.status);
      if (result?.skippedStore) skippedStore += 1;
      else if (status === 'completed') completed += 1;
      else if (status === 'failed') failed += 1;
      else if (result?.pending || status === 'processing') pending += 1;
    } catch (err) {
      errors += 1;
      paymentErrorLog('syncProcessingXxpayWithdrawals failed', row.outerOrderSn, err.message);
      logger.warn(
        {
          err: err.message,
          requestId: row.id,
          outerOrderSn: row.outerOrderSn,
          storeCode: row.storeCode
        },
        'XXPay withdrawal sync failed'
      );
      console.log('[XXPay] CRON PAYOUT ERROR', {
        requestId: row.id,
        mchOrderNo: row.outerOrderSn,
        message: err.message
      });
    }
  }

  const summary = {
    checked,
    completed,
    failed,
    pending,
    skippedStore,
    errors,
    allowedStores: ALLOWED_STORES
  };
  paymentLog('syncProcessingXxpayWithdrawals done', summary);
  console.log('[XXPay] CRON PAYOUT DONE', summary);
  return summary;
}

module.exports = {
  syncProcessingXxpayWithdrawals,
  syncXxpayWithdrawalStatus
};
