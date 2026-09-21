'use strict';

/**
 * Deposit flow: either (1) Speed provider: create checkout session, save pending, return link;
 * or (2) OrionStarsPay: create payment link and create one row in deposit_orders.
 * Wallet is credited only after sync/complete confirms provider transaction SUCCESS.
 */
const db = require('../../db/models');
const payment = require('../payment');
const paymentProviders = require('../paymentProviders');
const { getWalletLimitsForUser } = require('./getWalletLimits.service');
const { getCurrencySetting } = require('./getCurrencySetting.service');
const { paymentLog, paymentErrorLog } = require('../../libs/logger');
const { resolveDepositPackageForUser } = require('../depositPackages/resolveDepositPackage.service');
const {
  applyActivePayDiscountForUser,
  payDiscountMetadata
} = require('../payDiscount/applyActivePayDiscount.service');

const DEFAULT_PROVIDER = 'orionstarspay';

function normalizeMethodKey(raw) {
  if (typeof raw !== 'string') return null;
  const k = raw.trim().toLowerCase();
  if (!k) return null;
  if (k === 'apple pay') return 'apple_pay';
  if (k === 'google pay') return 'google_pay';
  return k;
}

function resolveSelectedDepositMethod(options) {
  const accepted = options?.acceptedPaymentOptions;
  if (Array.isArray(accepted) && accepted.length > 0) {
    for (const item of accepted) {
      const normalized = normalizeMethodKey(item);
      if (normalized) return normalized;
    }
  } else {
    const normalizedAccepted = normalizeMethodKey(accepted);
    if (normalizedAccepted) return normalizedAccepted;
  }

  const normalizedType = normalizeMethodKey(options?.paymentType);
  if (normalizedType) return normalizedType;

  const normalizedMethod = normalizeMethodKey(options?.paymentMethod);
  if (normalizedMethod) return normalizedMethod;

  return null;
}

async function requestDeposit(userId, options) {
  const provider = (options?.provider && typeof options.provider === 'string')
    ? options.provider.trim().toLowerCase()
    : DEFAULT_PROVIDER;

  const [limits, currencyCode] = await Promise.all([getWalletLimitsForUser(userId), getCurrencySetting()]);
  const minDeposit = limits.depositMin;
  const maxDeposit = limits.depositMax;
  let amount = options?.amount != null ? Number(options.amount) : NaN;
  const packageId = options?.packageId ?? options?.package_id ?? null;
  let packageMeta = null;
  if (packageId != null && packageId !== '') {
    const voucherId = options?.voucherId ?? options?.voucher_id ?? null;
    const pkg = await resolveDepositPackageForUser(userId, packageId, {
      voucherId,
      consumeVoucher: true
    });
    amount = pkg.payAmount;
    packageMeta = pkg.metadata;
    const clientAmount = options?.amount != null ? Number(options.amount) : NaN;
    if (Number.isFinite(clientAmount) && Math.abs(clientAmount - amount) > 0.01) {
      const err = new Error('Package price does not match the selected amount.');
      err.statusCode = 400;
      throw err;
    }
  } else {
    const listAmountRaw = options?.listAmount ?? options?.list_amount;
    const listAmount = listAmountRaw != null && listAmountRaw !== '' ? Number(listAmountRaw) : NaN;
    if (Number.isFinite(listAmount) && listAmount > 0) {
      const discountApplied = await applyActivePayDiscountForUser(userId, listAmount);
      if (discountApplied.applied) {
        amount = discountApplied.payAmount;
        packageMeta = {
          creditAmount: listAmount,
          ...(payDiscountMetadata(discountApplied) || {})
        };
        const clientAmount = options?.amount != null ? Number(options.amount) : NaN;
        if (Number.isFinite(clientAmount) && Math.abs(clientAmount - amount) > 0.01) {
          const err = new Error('Discounted amount does not match. Refresh and try again.');
          err.statusCode = 400;
          throw err;
        }
      }
    }
  }
  if (!Number.isFinite(amount) || (packageId == null && amount < minDeposit)) {
    const err = new Error(`Minimum deposit is ${currencyCode} ${minDeposit}.00`);
    err.statusCode = 400;
    throw err;
  }
  if (packageId != null && amount <= 0) {
    const err = new Error('Package price is invalid.');
    err.statusCode = 400;
    throw err;
  }
  // Package catalog prices are trusted; wallet max applies only to custom amounts.
  if (packageId == null && amount > maxDeposit) {
    const err = new Error(`Maximum deposit is ${currencyCode} ${maxDeposit}.00`);
    err.statusCode = 400;
    throw err;
  }

  const currency = options?.currency && typeof options.currency === 'string'
    ? options.currency.trim()
    : (currencyCode === 'SC' ? 'USD' : currencyCode);

  // --- Speed provider: no token required ---
  if (provider === 'scrypto') {
    const scryptoProvider = paymentProviders.getProvider('scrypto');
    if (!scryptoProvider) {
      paymentErrorLog('requestDeposit: Speed provider not configured');
      const err = new Error('Speed payment is not available. Please use another method.');
      err.statusCode = 503;
      throw err;
    }

    const result = await scryptoProvider.createDepositLink({
      userId,
      amount,
      currency,
      metadata: options?.metadata || {},
      title: options?.name || 'Wallet Deposit'
    });

    const pending = await db.PaymentPendingDeposit.create({
      userId,
      amount,
      paymentLink: result.paymentUrl,
      status: 'pending',
      provider: 'scrypto',
      providerSessionId: result.providerSessionId || null,
      providerMetadata: result.metadata ? { ...result.metadata } : null
    });

    paymentLog('requestDeposit: Speed pending saved', { pendingId: pending.id, userId, amount });

    return {
      paymentLink: result.paymentUrl,
      amount,
      currency: currency,
      provider: 'scrypto',
      pendingId: pending.id,
      providerSessionId: result.providerSessionId,
      message: 'Complete your deposit at the link below. Speed will notify us when payment is received.'
    };
  }

  // --- OrionStarsPay: requires token from controller ---
  const paymentToken = options?.paymentToken;
  if (!paymentToken || typeof paymentToken !== 'string') {
    paymentErrorLog('requestDeposit: missing payment token for orionstarspay');
    const err = new Error('Payment token is required.');
    err.statusCode = 400;
    throw err;
  }

  const name = options?.name && typeof options.name === 'string'
    ? options.name.trim().slice(0, 256)
    : 'Deposit';

  const payinParams = {
    amount,
    currency,
    name,
    expiredAt: null,
    customUrlPath: null,
    acceptedPaymentOptions: options?.acceptedPaymentOptions,
    paymentType: options?.paymentType,
    paymentMethod: options?.paymentMethod
  };
  paymentLog('--- requestDeposit: createPayin params ---');
  paymentLog('userId:', userId, 'params:', payinParams);

  let data;
  try {
    data = await payment.createPayinLinkWithAuthRetry(
      paymentToken,
      payinParams,
      options?.paymentEmail && options?.paymentPassword
        ? {
            email: options.paymentEmail,
            password: options.paymentPassword,
            partnerCode: options.paymentPartnerCode
          }
        : undefined
    );
  } catch (err) {
    paymentErrorLog('requestDeposit: createPayinLink failed', err.message, err.response || err.statusCode);
    throw err;
  }

  paymentLog('--- requestDeposit: Payment API createPayin response (shape only) ---');
  paymentLog('hasPaymentLink:', Boolean(data?.paymentLink || data?.payment_link));

  const rawLink = data.paymentLink || data.payment_link;
  const paymentLink = typeof rawLink === 'string'
    ? rawLink
    : (rawLink && (rawLink.url || rawLink.payment_url));
  if (!paymentLink || typeof paymentLink !== 'string') {
    paymentErrorLog('requestDeposit: no paymentLink (url) in response', data);
    const err = new Error('Payment API did not return a payment link');
    err.statusCode = 502;
    throw err;
  }

  const linkObj = rawLink && typeof rawLink === 'object' ? rawLink : null;
  const centryosApplicationId = linkObj?.applicationId != null ? String(linkObj.applicationId).trim() : null;
  const payinToken = linkObj?.token != null ? String(linkObj.token) : null;
  const payinExpiredAt = linkObj?.expiredAt != null ? linkObj.expiredAt : null;
  const providerMetadata = (centryosApplicationId || payinToken || payinExpiredAt)
    ? {
        ...(centryosApplicationId && { centryosApplicationId }),
        ...(payinToken && { payinToken }),
        ...(payinExpiredAt && { payinExpiredAt })
      }
    : null;
  const selectedMethod = resolveSelectedDepositMethod(options);

  const depositOrder = await db.DepositOrder.create({
    userId,
    provider: DEFAULT_PROVIDER,
    requestedAmount: amount,
    currency: data.currency || currency || 'USD',
    // Pending until provider confirms SUCCESS/FAILED (or auto-expires after 3h).
    status: 'PENDING',
    paymentLinkUrl: paymentLink,
    paymentLinkToken: payinToken,
    providerApplicationId: centryosApplicationId,
    linkExpiresAt: payinExpiredAt || null,
    metadata: {
      ...(providerMetadata || {}),
      ...(packageMeta || {}),
      ...(selectedMethod && { selectedDepositMethod: selectedMethod }),
      awaitingProviderConfirmation: true
    }
  });

  const depositOrderId = String(depositOrder.id);
  paymentLog('requestDeposit: deposit order saved to DB:', { orderId: depositOrderId, userId, amount, status: 'PENDING' });

  const result = {
    paymentLink,
    amount,
    currency: data.currency || currency,
    provider: DEFAULT_PROVIDER,
    status: 'pending',
    message: 'Your payment is ready. Complete it in the secure window.',
    pendingId: depositOrderId,
    depositOrderId
  };
  paymentLog('--- requestDeposit: returning to client ---');
  paymentLog('return keys:', Object.keys(result));
  return result;
}

module.exports = { requestDeposit };
