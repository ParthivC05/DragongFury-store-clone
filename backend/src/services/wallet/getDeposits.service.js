'use strict';

const db = require('../../db/models');
const { getPaymentTypeLabel } = require('../../constants/paymentTypes');
const { Op } = require('sequelize');

/** Match DollarPay/Orion reconcile: unpaid awaiting confirmation stays pending for 3h. */
const AWAITING_PAYMENT_PENDING_MS = 3 * 60 * 60 * 1000;

function depositMethodDisplayLabel(method, provider) {
  const key = (method || '').toString().toLowerCase().trim();
  const providerKey = (provider || '').toString().toLowerCase().trim();
  if (providerKey === 'selfcrypto' || key === 'selfcrypto') return 'Direct Crypto';
  if (providerKey === 'scrypto' || key === 'scrypto') return 'Crypto';
  const label = getPaymentTypeLabel(key);
  if (label) return label;
  if (providerKey === 'orionstarspay' || key === 'orionstarspay' || key === 'payment') return 'Card';
  return key || '—';
}

function orderCreatedMs(row) {
  const raw = row?.created_at ?? row?.createdAt;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/**
 * Legacy rows were saved as EXPIRED while still awaiting payment.
 * Treat those as pending until the 3h auto-expire window passes.
 */
function isAwaitingProviderPayment(row) {
  const meta = row?.metadata && typeof row.metadata === 'object' ? row.metadata : null;
  if (!meta?.awaitingProviderConfirmation) return false;
  const createdMs = orderCreatedMs(row);
  if (!Number.isFinite(createdMs)) return false;
  return Date.now() - createdMs < AWAITING_PAYMENT_PENDING_MS;
}

/** Map internal DB statuses to stable client-facing values (no internal step names). */
function mapUserVisibleDepositStatus(internal, row = null) {
  const s = String(internal || '').toUpperCase();
  if (s === 'SUCCESS') return 'completed';
  if (s === 'FAILED') return 'failed';
  if (s === 'CLOSED') return 'closed';
  if (s === 'EXPIRED') {
    if (row && isAwaitingProviderPayment(row)) return 'pending';
    return 'expired';
  }
  if (s === 'LINK_CREATED' || s === 'PENDING') return 'pending';
  return (internal && String(internal).toLowerCase()) || 'pending';
}

function extractFeeCharged(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const fee =
    rawPayload?.rawPayload?.payload?.feeCharged
    ?? rawPayload?.payload?.feeCharged
    ?? rawPayload?.feeCharged
    ?? null;
  if (fee == null || fee === '') return null;
  const n = Number(fee);
  return Number.isFinite(n) ? n : null;
}

function normalizeMethodKey(raw) {
  if (typeof raw !== 'string') return null;
  const k = raw.trim().toLowerCase();
  if (!k) return null;
  if (k === 'apple pay') return 'apple_pay';
  if (k === 'google pay') return 'google_pay';
  return k;
}

function resolveDepositMethod(row) {
  if ((row?.provider || '').toLowerCase() === 'scrypto') return 'crypto';
  if ((row?.provider || '').toLowerCase() === 'selfcrypto') return 'crypto';
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : null;
  const selected =
    normalizeMethodKey(metadata?.selectedDepositMethod)
    || normalizeMethodKey(metadata?.paymentType)
    || normalizeMethodKey(metadata?.paymentMethod)
    || normalizeMethodKey(Array.isArray(metadata?.acceptedPaymentOptions) ? metadata.acceptedPaymentOptions[0] : metadata?.acceptedPaymentOptions);
  return selected || 'card';
}

function mapOrderToPendingDeposit(r) {
  const methodKey = resolveDepositMethod(r);
  const provider = r.provider || null;
  return {
    id: `pending-${r.id}`,
    amount: Number(r.requestedAmount),
    feeCharged: null,
    method: methodKey,
    methodDisplayLabel: depositMethodDisplayLabel(methodKey, provider),
    status: 'pending',
    provider,
    date: r.created_at
  };
}

function mapPendingSelfcryptoDeposit(r) {
  const provider = r.provider || 'selfcrypto';
  const st = String(r.status || 'pending').toLowerCase();
  const cryptoCurrency = r.targetCurrency || r.target_currency || null;
  return {
    id: `selfcrypto-pending-${r.id}`,
    amount: Number(r.amount),
    feeCharged: null,
    method: 'crypto',
    methodDisplayLabel: depositMethodDisplayLabel('crypto', provider),
    status: st === 'confirming' ? 'pending' : (st || 'pending'),
    provider,
    providerTransactionId: r.providerSessionId || null,
    cryptoCurrency,
    paymentMethod: r.paymentMethod || r.payment_method || null,
    date: r.createdAt || r.created_at
  };
}

function mapSelfcryptoDepositRequest(r) {
  const provider = r.provider || 'selfcrypto';
  const cryptoCurrency = r.cryptoCurrency || r.crypto_currency || null;
  return {
    id: `deposit-req-${r.id}`,
    amount: Number(r.amount),
    feeCharged: null,
    method: 'crypto',
    methodDisplayLabel: depositMethodDisplayLabel(r.method || 'crypto', provider),
    status: mapUserVisibleDepositStatus(r.status, r),
    provider,
    providerTransactionId: r.providerTransactionId || null,
    cryptoCurrency,
    date: r.createdAt || r.created_at
  };
}

/** Wallet credits from admin-approved manual Chime/Cash App requests (see approveChimeDepositRequest). */
const MANUAL_CHIME_DEPOSIT_PROVIDER = 'manual-chime-deposit';
const SELFCRYPTO_PROVIDER = 'selfcrypto';

async function getDeposits(userId, query = {}) {
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 20), 100);
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);

  try {
    const awaitingSince = new Date(Date.now() - AWAITING_PAYMENT_PENDING_MS);
    const [
      completedResult,
      manualDepositRows,
      manualDepositCount,
      selfcryptoCompletedRows,
      selfcryptoCompletedCount,
      selfcryptoClosedRows,
      selfcryptoPendingRows
    ] = await Promise.all([
      db.DepositOrder.findAndCountAll({
        where: {
          userId,
          status: { [Op.in]: ['SUCCESS', 'FAILED', 'EXPIRED', 'CLOSED'] }
        },
        order: [['created_at', 'DESC']],
        limit: 1000,
        offset: 0,
        attributes: ['id', 'requestedAmount', 'status', 'provider', 'providerTransactionId', 'metadata', 'created_at']
      }),
      db.DepositRequest.findAll({
        where: { userId, provider: MANUAL_CHIME_DEPOSIT_PROVIDER },
        order: [['created_at', 'DESC']],
        limit: 500,
        attributes: ['id', 'amount', 'method', 'status', 'provider', 'providerTransactionId', 'created_at']
      }),
      db.DepositRequest.count({
        where: { userId, provider: MANUAL_CHIME_DEPOSIT_PROVIDER }
      }),
      db.DepositRequest.findAll({
        where: { userId, provider: SELFCRYPTO_PROVIDER },
        order: [['created_at', 'DESC']],
        limit: 500,
        attributes: ['id', 'amount', 'method', 'status', 'provider', 'providerTransactionId', 'cryptoCurrency', 'created_at']
      }),
      db.DepositRequest.count({
        where: { userId, provider: SELFCRYPTO_PROVIDER }
      }),
      db.PaymentPendingDeposit.findAll({
        where: {
          userId,
          provider: SELFCRYPTO_PROVIDER,
          status: { [Op.in]: ['expired', 'failed'] }
        },
        order: [['id', 'DESC']],
        limit: 100,
        attributes: ['id', 'amount', 'status', 'provider', 'providerSessionId', 'targetCurrency', 'paymentMethod', 'createdAt']
      }),
      db.PaymentPendingDeposit.findAll({
        where: {
          userId,
          provider: SELFCRYPTO_PROVIDER,
          status: { [Op.in]: ['pending', 'confirming'] }
        },
        order: [['id', 'DESC']],
        limit: 40,
        attributes: ['id', 'amount', 'status', 'provider', 'providerSessionId', 'targetCurrency', 'paymentMethod', 'createdAt']
      })
    ]);

    const pendingRows = await db.DepositOrder.findAll({
      where: {
        userId,
        status: { [Op.in]: ['LINK_CREATED', 'PENDING'] }
      },
      order: [['created_at', 'DESC']],
      limit: 20,
      attributes: ['id', 'requestedAmount', 'status', 'provider', 'metadata', 'created_at']
    });

    // Legacy DollarPay/Orion rows saved as EXPIRED while still awaiting payment (< 3h).
    const legacyAwaitingExpired = await db.DepositOrder.findAll({
      where: {
        userId,
        status: 'EXPIRED',
        created_at: { [Op.gte]: awaitingSince }
      },
      order: [['created_at', 'DESC']],
      limit: 40,
      attributes: ['id', 'requestedAmount', 'status', 'provider', 'metadata', 'created_at']
    });

    const { rows, count } = completedResult;
    const awaitingExpiredIds = new Set(
      (legacyAwaitingExpired || [])
        .filter((r) => isAwaitingProviderPayment(r))
        .map((r) => String(r.id))
    );

    const txIds = (rows || [])
      .map((r) => (r.providerTransactionId || '').toString().trim())
      .filter(Boolean);
    let feeByTxId = new Map();
    if (txIds.length > 0 && db.ProviderTransactionEvent) {
      try {
        const txRows = await db.ProviderTransactionEvent.findAll({
          where: { userId, providerTransactionId: txIds },
          attributes: ['providerTransactionId', 'rawPayload'],
          raw: true
        });
        feeByTxId = new Map(
          (txRows || []).map((t) => [String(t.providerTransactionId), extractFeeCharged(t.rawPayload)])
        );
      } catch {
        feeByTxId = new Map();
      }
    }

    const orderDeposits = (rows || [])
      .filter((r) => !awaitingExpiredIds.has(String(r.id)))
      .map((r) => {
        const provider = r.provider || null;
        const txId = (r.providerTransactionId || '').toString().trim();
        const method = resolveDepositMethod(r);
        return {
          id: r.id,
          amount: Number(r.requestedAmount),
          feeCharged: txId ? (feeByTxId.get(txId) ?? null) : null,
          method,
          methodDisplayLabel: depositMethodDisplayLabel(method, provider),
          status: mapUserVisibleDepositStatus(r.status, r),
          provider,
          providerTransactionId: r.providerTransactionId || null,
          date: r.created_at
        };
      });

    const manualDeposits = (manualDepositRows || []).map((r) => {
      const provider = r.provider || null;
      const methodKey = normalizeMethodKey(r.method) || 'chime';
      return {
        id: `deposit-req-${r.id}`,
        amount: Number(r.amount),
        feeCharged: null,
        method: methodKey,
        methodDisplayLabel: depositMethodDisplayLabel(methodKey, provider),
        status: mapUserVisibleDepositStatus(r.status, r),
        provider,
        providerTransactionId: r.providerTransactionId || null,
        date: r.created_at
      };
    });

    const selfcryptoDeposits = (selfcryptoCompletedRows || []).map(mapSelfcryptoDepositRequest);
    const selfcryptoClosed = (selfcryptoClosedRows || []).map(mapPendingSelfcryptoDeposit);

    const mergedDeposits = [...orderDeposits, ...manualDeposits, ...selfcryptoDeposits, ...selfcryptoClosed].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );
    const deposits = mergedDeposits.slice(offset, offset + limit);

    const pendingFromActive = (pendingRows || []).map(mapOrderToPendingDeposit);
    const pendingFromLegacyExpired = (legacyAwaitingExpired || [])
      .filter((r) => awaitingExpiredIds.has(String(r.id)))
      .map(mapOrderToPendingDeposit);
    const pendingFromSelfcrypto = (selfcryptoPendingRows || []).map(mapPendingSelfcryptoDeposit);
    const pendingDeposits = [...pendingFromActive, ...pendingFromLegacyExpired, ...pendingFromSelfcrypto]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 40);

    const orderTotal = count != null ? count : 0;
    const total =
      orderTotal +
      (Number.isFinite(manualDepositCount) ? manualDepositCount : 0) +
      (Number.isFinite(selfcryptoCompletedCount) ? selfcryptoCompletedCount : 0) +
      (selfcryptoClosedRows || []).length;

    return {
      deposits,
      pendingDeposits,
      total
    };
  } catch (err) {
    return { deposits: [], pendingDeposits: [], total: 0 };
  }
}

module.exports = { getDeposits, mapUserVisibleDepositStatus, isAwaitingProviderPayment };
