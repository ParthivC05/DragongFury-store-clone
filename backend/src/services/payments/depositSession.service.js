'use strict';

const db = require('../../db/models');
const payment = require('../payment');
const paymentProviders = require('../paymentProviders');
const { getWalletLimitsForUser } = require('../wallet/getWalletLimits.service');
const { getCurrencySetting } = require('../wallet/getCurrencySetting.service');
const { paymentLog, paymentErrorLog, logger } = require('../../libs/logger');
const { resolveDepositPackageForUser } = require('../depositPackages/resolveDepositPackage.service');
const {
  applyActivePayDiscountForUser,
  payDiscountMetadata
} = require('../payDiscount/applyActivePayDiscount.service');
const {
  encryptPaymentPassword,
  isPaymentPasswordEncryptionConfigured
} = require('../../utils/paymentPasswordEncryption');
const { isCryptoOptionAllowed } = require('../../constants/cryptoDepositRails');

const PROVIDER_META = {
  selfcrypto: {
    isCrypto: true,
    supportedAssets: ['BTC', 'ETH', 'TRX', 'SOL'],
    supportedNetworks: ['bitcoin', 'lightning', 'ethereum', 'tron', 'solana'],
    targetCurrencies: ['BTC', 'ETH', 'TRX', 'SOL'],
    paymentMethodsByTargetCurrency: {
      BTC: ['onchain', 'lightning'],
      ETH: ['ethereum'],
      TRX: ['tron'],
      SOL: ['solana']
    },
    defaultMaxAmount: 10000
  },
  scrypto: {
    isCrypto: true,
    supportedAssets: ['BTC', 'ETH', 'USDT', 'USDC'],
    supportedNetworks: ['bitcoin', 'ethereum', 'polygon'],
    targetCurrencies: ['SATS', 'USDT', 'USDC'],
    paymentMethodsByTargetCurrency: {
      SATS: ['onchain', 'lightning'],
      USDT: ['lightning', 'ethereum', 'solana'],
      USDC: ['lightning', 'ethereum', 'solana']
    },
    defaultMaxAmount: 10000
  },
  orionstarspay: {
    isCrypto: false,
    supportedAssets: [],
    supportedNetworks: [],
    defaultMaxAmount: 5000
  },
  dollarpay: {
    isCrypto: false,
    supportedAssets: [],
    supportedNetworks: [],
    defaultMaxAmount: 5000
  }
};

/**
 * Create an OrionStars pay-in session (internal). Used for primary Orion deposits and
 * DollarPay → Orion amount fallback (admin DollarPay setting unchanged).
 */
async function createOrionstarsPayinSession(userId, {
  amount,
  currency,
  paymentType,
  paymentToken,
  paymentLogin,
  acceptedPaymentOptions,
  packageMeta,
  fallbackFromDollarpay = false,
  originalDollarpayAmount = null
}) {
  if (!paymentToken || typeof paymentToken !== 'string') {
    const err = new Error('Payment credentials are required for this method.');
    err.statusCode = 400;
    err.code = 'ORION_PAYMENT_ACCOUNT_REQUIRED';
    throw err;
  }
  const options = Array.isArray(acceptedPaymentOptions) && acceptedPaymentOptions.length > 0
    ? acceptedPaymentOptions
    : undefined;
  let data;
  try {
    data = await payment.createPayinLinkWithAuthRetry(
      paymentToken,
      {
        amount,
        currency,
        name: 'Wallet Deposit',
        expiredAt: null,
        customUrlPath: null,
        ...(options && { acceptedPaymentOptions: options })
      },
      paymentLogin && paymentLogin.email && paymentLogin.password
        ? {
            email: paymentLogin.email,
            password: paymentLogin.password,
            partnerCode: paymentLogin.partnerCode
          }
        : undefined
    );
  } catch (err) {
    paymentErrorLog('createDepositSession Orionstar Pay createPayinLink failed', err.message);
    err.statusCode = err.statusCode || 502;
    throw err;
  }
  const rawLink = data.paymentLink || data.payment_link;
  const paymentLink = typeof rawLink === 'string' ? rawLink : (rawLink && (rawLink.url || rawLink.payment_url));
  if (!paymentLink || typeof paymentLink !== 'string') {
    const err = new Error('Payment API did not return a payment link.');
    err.statusCode = 502;
    throw err;
  }
  const linkObj = rawLink && typeof rawLink === 'object' ? rawLink : null;
  const centryosApplicationId = linkObj?.applicationId != null ? String(linkObj.applicationId).trim() : null;
  const payinToken = linkObj?.token != null ? String(linkObj.token) : null;
  const payinExpiredAt = linkObj?.expiredAt != null ? linkObj.expiredAt : null;
  const pending = await db.PaymentPendingDeposit.create({
    userId,
    amount,
    paymentLink,
    status: 'pending',
    provider: 'orionstarspay',
    providerSessionId: data.sessionId || data.id || null,
    assetCode: null,
    network: null,
    providerMetadata: {
      paymentType,
      ...(centryosApplicationId && { centryosApplicationId }),
      ...(payinToken && { payinToken }),
      ...(payinExpiredAt && { payinExpiredAt }),
      ...(fallbackFromDollarpay
        ? {
            dollarpayOrionFallback: true,
            ...(originalDollarpayAmount != null
              ? { originalRequestedAmount: Number(originalDollarpayAmount) }
              : {})
          }
        : {}),
      ...(packageMeta || {})
    }
  });

  if (payinToken || centryosApplicationId) {
    await db.DepositOrder.create({
      userId,
      provider: 'orionstarspay',
      requestedAmount: amount,
      currency: currency || 'USD',
      status: 'PENDING',
      paymentLinkUrl: paymentLink,
      paymentLinkToken: payinToken,
      providerApplicationId: centryosApplicationId,
      linkExpiresAt: payinExpiredAt || null,
      metadata: {
        legacyPaymentPendingDepositId: String(pending.id),
        ...(fallbackFromDollarpay ? { dollarpayOrionFallback: true } : {}),
        ...(packageMeta || {})
      }
    });
  }
  paymentLog('createDepositSession Orionstar Pay pending created', {
    depositId: pending.id,
    userId,
    amount,
    fallbackFromDollarpay: !!fallbackFromDollarpay
  });
  return {
    depositId: pending.id,
    providerCode: 'orionstarspay',
    sessionType: 'embed',
    status: 'pending',
    paymentUrl: paymentLink,
    qrCodeUrl: null,
    walletAddress: null,
    paymentUri: null,
    providerSessionId: data.sessionId || data.id ? String(data.sessionId || data.id) : null,
    assetCode: null,
    network: null,
    amount: Number(amount),
    expiresAt: null,
    embeddedFormConfig: paymentLink ? { url: paymentLink } : null,
    displayData: fallbackFromDollarpay ? { dollarpayOrionFallback: true } : {}
  };
}

/**
 * Create a deposit session: validate, call provider, create pending row, return normalized modal payload.
 * Speed: use targetCurrency + paymentMethod (POST /payments); no checkout-sessions. No Tron.
 * @param {number} userId
 * @param {{ providerCode: string, amount: number, currency?: string, targetCurrency?: string, paymentMethod?: string, assetCode?: string, network?: string, paymentToken?: string }} params
 * @returns {Promise<{ depositId, providerCode, sessionType, status, amount, currency, targetCurrency, targetAmount, paymentMethod, address?, paymentRequest?, expiresAt, ttl, qrPayload, displayData, ... }>}
 */
async function createDepositSession(userId, params) {
  const providerCode = (params?.providerCode && typeof params.providerCode === 'string')
    ? params.providerCode.trim().toLowerCase()
    : '';
  let amount = params?.amount != null ? Number(params.amount) : NaN;
  const packageId = params?.packageId ?? params?.package_id ?? null;
  let packageMeta = null;

  if (packageId != null && packageId !== '') {
    const voucherId = params?.voucherId ?? params?.voucher_id ?? null;
    const pkg = await resolveDepositPackageForUser(userId, packageId, {
      voucherId,
      consumeVoucher: true
    });
    amount = pkg.payAmount;
    packageMeta = pkg.metadata;
    const clientAmount = params?.amount != null ? Number(params.amount) : NaN;
    if (Number.isFinite(clientAmount) && Math.abs(clientAmount - amount) > 0.01) {
      const err = new Error('Package price does not match the selected amount.');
      err.statusCode = 400;
      throw err;
    }
  } else {
    // Custom amount: list_amount is pre-discount list/SC price; amount is discounted pay.
    const listAmountRaw = params?.listAmount ?? params?.list_amount;
    const listAmount = listAmountRaw != null && listAmountRaw !== '' ? Number(listAmountRaw) : NaN;
    if (Number.isFinite(listAmount) && listAmount > 0) {
      const discountApplied = await applyActivePayDiscountForUser(userId, listAmount);
      if (discountApplied.applied) {
        amount = discountApplied.payAmount;
        packageMeta = {
          creditAmount: listAmount,
          ...(payDiscountMetadata(discountApplied) || {})
        };
        const clientAmount = params?.amount != null ? Number(params.amount) : NaN;
        if (Number.isFinite(clientAmount) && Math.abs(clientAmount - amount) > 0.01) {
          const err = new Error('Discounted amount does not match. Refresh and try again.');
          err.statusCode = 400;
          throw err;
        }
      }
    }
  }
  const assetCode = (params?.assetCode && typeof params.assetCode === 'string') ? params.assetCode.trim().slice(0, 32) : null;
  const network = (params?.network && typeof params.network === 'string') ? params.network.trim().slice(0, 64) : null;
  const targetCurrency = (params?.targetCurrency && typeof params.targetCurrency === 'string') ? params.targetCurrency.trim().toUpperCase().slice(0, 8) : null;
  const paymentMethod = (params?.paymentMethod && typeof params.paymentMethod === 'string') ? params.paymentMethod.trim().toLowerCase().slice(0, 32) : null;
  const paymentType = (params?.paymentType && typeof params.paymentType === 'string') ? params.paymentType.trim().toLowerCase().slice(0, 32) : (providerCode === 'scrypto' || providerCode === 'selfcrypto' ? 'crypto' : 'card');

  if (!providerCode) {
    const err = new Error('Provider code is required.');
    err.statusCode = 400;
    throw err;
  }

  const providerRow = await db.PaymentProvider.findOne({
    where: { code: providerCode }
  });
  if (!providerRow) {
    const err = new Error('Payment provider not found.');
    err.statusCode = 404;
    throw err;
  }
  if (!providerRow.isActive || !providerRow.supportsDeposit || !providerRow.depositEnabled) {
    const err = new Error('This payment method is not available.');
    err.statusCode = 400;
    throw err;
  }

  const user = await db.User.findByPk(userId, { attributes: ['distributorCode', 'storeCode'], raw: true });
  if (providerCode === 'xxpay') {
    const {
      storeAllowsXxpay,
      isXxpayDepositTypeAllowedForStore
    } = require('../paymentProviders/xxpay/xxpay.storeAccess');
    if (!storeAllowsXxpay(user?.storeCode)) {
      const err = new Error('XXPay is not available for this store.');
      err.statusCode = 400;
      throw err;
    }
    if (!isXxpayDepositTypeAllowedForStore(user?.storeCode, paymentType)) {
      const err = new Error('XXPay does not support this deposit method for this store.');
      err.statusCode = 400;
      throw err;
    }
  }
  let storeOverride = null;
  if (user?.distributorCode && user?.storeCode) {
    storeOverride = await db.StorePaymentProvider.findOne({
      where: {
        distributorCode: user.distributorCode,
        storeCode: user.storeCode,
        providerCode: providerCode
      },
      attributes: ['enabled', 'depositEnabled', 'depositMethodsEnabled'],
      raw: true
    });
    if (storeOverride && (storeOverride.enabled === false || storeOverride.depositEnabled === false)) {
      const err = new Error('This payment method is not available for your store.');
      err.statusCode = 400;
      throw err;
    }
    if (providerCode === 'xxpay') {
      const { isXxpayDepositMethodEnabledInMaps } = require('../paymentProviders/xxpay/xxpay.storeAccess');
      if (
        !isXxpayDepositMethodEnabledInMaps(
          user.storeCode,
          paymentType,
          providerRow.depositMethodsEnabled,
          storeOverride?.depositMethodsEnabled
        )
      ) {
        const err = new Error('This payment method is not enabled for XXPay on your store.');
        err.statusCode = 400;
        throw err;
      }
    }
  }

  const [limits, currencyCode] = await Promise.all([getWalletLimitsForUser(userId), getCurrencySetting()]);
  /** Custom (non-package) deposits: platform wallet-limits depositMin (applies to all stores). */
  const minAmount = Number(limits?.depositMin) >= 0 ? Number(limits.depositMin) : 10;
  const platformMaxAmount = Number(limits?.depositMax) > 0 ? Number(limits.depositMax) : 5000;
  const meta = PROVIDER_META[providerCode] || { isCrypto: false, supportedAssets: [], supportedNetworks: [], defaultMaxAmount: 5000 };
  const providerMaxAmount = Number(meta.defaultMaxAmount) > 0 ? Number(meta.defaultMaxAmount) : 5000;
  const maxAmount = Math.min(platformMaxAmount, providerMaxAmount);

  // Package catalog prices are trusted; wallet min/max apply only to custom amounts.
  // For campaign pay discounts, enforce min/max on the list amount (pre-discount).
  if (packageId == null) {
    const listForLimits =
      packageMeta?.emailCampaignOriginalPayAmount != null
        ? Number(packageMeta.emailCampaignOriginalPayAmount)
        : amount;
    const limitBase = Number.isFinite(listForLimits) && listForLimits > 0 ? listForLimits : amount;
    if (!Number.isFinite(limitBase) || limitBase < minAmount) {
      const err = new Error(`Minimum deposit is ${currencyCode} ${minAmount}`);
      err.statusCode = 400;
      throw err;
    }
    if (limitBase > maxAmount) {
      const err = new Error(`Maximum deposit is ${currencyCode} ${maxAmount}.00`);
      err.statusCode = 400;
      throw err;
    }
  } else if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error('Package price is invalid.');
    err.statusCode = 400;
    throw err;
  }

  if (meta.isCrypto && (assetCode || network)) {
    if (assetCode && Array.isArray(meta.supportedAssets) && meta.supportedAssets.length > 0 && !meta.supportedAssets.includes(assetCode)) {
      const err = new Error(`Unsupported asset. Supported: ${meta.supportedAssets.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
    if (network && Array.isArray(meta.supportedNetworks) && meta.supportedNetworks.length > 0 && !meta.supportedNetworks.includes(network)) {
      const err = new Error(`Unsupported network. Supported: ${meta.supportedNetworks.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }
  }

  const currency = (currencyCode === 'SC' ? 'USD' : currencyCode) || 'USD';

  if (providerCode === 'scrypto') {
    if (!targetCurrency || !['SATS', 'USDT', 'USDC'].includes(targetCurrency)) {
      const err = new Error('Target currency is required and must be SATS, USDT, or USDC.');
      err.statusCode = 400;
      throw err;
    }
    const allowedMethods = meta.paymentMethodsByTargetCurrency && meta.paymentMethodsByTargetCurrency[targetCurrency];
    if (!paymentMethod || !Array.isArray(allowedMethods) || !allowedMethods.includes(paymentMethod)) {
      const err = new Error(`Valid payment method is required for ${targetCurrency}. Allowed: ${(allowedMethods || []).join(', ')}.`);
      err.statusCode = 400;
      throw err;
    }
    if (
      !isCryptoOptionAllowed(
        'scrypto',
        targetCurrency,
        paymentMethod,
        providerRow.depositMethodsEnabled,
        storeOverride?.depositMethodsEnabled
      )
    ) {
      const err = new Error('This crypto option is turned off for your store.');
      err.statusCode = 400;
      throw err;
    }

    const scryptoProvider = paymentProviders.getProvider('scrypto');
    if (!scryptoProvider || typeof scryptoProvider.createPayment !== 'function') {
      const err = new Error('Crypto payment is not available. Please try another method.');
      err.statusCode = 503;
      throw err;
    }
    let result;
    try {
      result = await scryptoProvider.createPayment({
        currency,
        amount,
        targetCurrency,
        paymentMethod,
        metadata: { userId }
      });
    } catch (err) {
      paymentErrorLog('createDepositSession Speed createPayment failed', err.message);
      err.statusCode = err.statusCode || 502;
      throw err;
    }

    const providerPaymentId = result.providerPaymentId || result.id || null;
    const qrPayload = result.address || result.paymentRequest || '';
    const paymentLinkPlaceholder = providerPaymentId ? `scrypto:${providerPaymentId}` : 'scrypto:in-app';

    const pending = await db.PaymentPendingDeposit.create({
      userId,
      amount,
      paymentLink: paymentLinkPlaceholder,
      status: 'pending',
      provider: 'scrypto',
      providerSessionId: providerPaymentId,
      targetCurrency: result.targetCurrency || targetCurrency,
      paymentMethod: result.paymentMethod || paymentMethod,
      targetAmount: result.targetAmount ?? null,
      walletAddress: result.address || null,
      paymentRequest: result.paymentRequest || null,
      paymentUri: result.paymentRequest || null,
      expiresAt: result.expiresAt || null,
      ttl: result.ttl ?? null,
      rawProviderResponse: result.rawResponse ? { ...result.rawResponse } : null,
      providerMetadata: {
        providerPaymentId: providerPaymentId || null,
        paymentType: 'crypto',
        ...(packageMeta || {})
      }
    });
    paymentLog('createDepositSession SCrypto pending created', { depositId: pending.id, userId, amount, providerPaymentId });

    const networkLabel = paymentMethod === 'onchain' ? 'Bitcoin (on-chain)' : paymentMethod === 'lightning' ? 'Lightning' : paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1);
    return {
      depositId: pending.id,
      providerCode: 'scrypto',
      providerPaymentId: providerPaymentId != null ? String(providerPaymentId) : null,
      sessionType: 'crypto_qr',
      status: result.status || 'pending',
      amount: Number(result.amount) || Number(amount),
      currency: result.currency || currency,
      targetCurrency: result.targetCurrency || targetCurrency,
      targetAmount: result.targetAmount ?? null,
      paymentMethod: result.paymentMethod || paymentMethod,
      address: result.address || null,
      paymentRequest: result.paymentRequest || null,
      expiresAt: result.expiresAt || null,
      ttl: result.ttl ?? null,
      qrPayload: qrPayload || null,
      embeddedFormConfig: null,
      displayData: { networkLabel }
    };
  }

  if (providerCode === 'selfcrypto') {
    const selfcryptoConfig = require('../paymentProviders/selfcrypto/selfcrypto.config');
    const allowed = selfcryptoConfig.paymentMethodsByTargetCurrency();
    const tc = (targetCurrency || '').toUpperCase();
    const pm = paymentMethod;
    if (!tc || !allowed[tc] || !pm || !allowed[tc].includes(pm)) {
      const err = new Error(
        `Choose a Direct Crypto network. Allowed: ${Object.entries(allowed)
          .map(([asset, methods]) => `${asset} (${methods.join(', ')})`)
          .join('; ') || 'none configured'}.`
      );
      err.statusCode = 400;
      throw err;
    }
    if (
      !isCryptoOptionAllowed(
        'selfcrypto',
        tc,
        pm,
        providerRow.depositMethodsEnabled,
        storeOverride?.depositMethodsEnabled
      )
    ) {
      const err = new Error('This crypto option is turned off for your store.');
      err.statusCode = 400;
      throw err;
    }

    const selfProvider = paymentProviders.getProvider('selfcrypto');
    if (!selfProvider || typeof selfProvider.createPayment !== 'function' || !selfcryptoConfig.isConfigured()) {
      const err = new Error('Direct crypto is not available. Please try Speed Crypto or another method.');
      err.statusCode = 503;
      throw err;
    }

    let result;
    try {
      result = await selfProvider.createPayment({
        currency,
        amount,
        targetCurrency: tc,
        paymentMethod: pm,
        metadata: { userId }
      });
    } catch (err) {
      paymentErrorLog('createDepositSession selfcrypto createPayment failed', err.message);
      err.statusCode = err.statusCode || 502;
      throw err;
    }

    const providerPaymentId = result.providerPaymentId || result.id || null;
    const qrPayload = result.qrPayload || result.address || result.paymentRequest || '';
    const paymentLinkPlaceholder = providerPaymentId ? `selfcrypto:${providerPaymentId}` : 'selfcrypto:in-app';

    const pending = await db.PaymentPendingDeposit.create({
      userId,
      amount,
      paymentLink: paymentLinkPlaceholder,
      status: 'pending',
      provider: 'selfcrypto',
      providerSessionId: providerPaymentId,
      targetCurrency: result.targetCurrency || tc,
      paymentMethod: result.paymentMethod || pm,
      targetAmount: result.targetAmount ?? null,
      walletAddress: result.address || null,
      paymentRequest: result.paymentRequest || null,
      paymentUri: result.qrPayload || result.paymentRequest || result.address || null,
      expiresAt: result.expiresAt || null,
      ttl: result.ttl ?? null,
      rawProviderResponse: result.rawResponse ? { ...result.rawResponse } : null,
      providerMetadata: {
        providerPaymentId: providerPaymentId || null,
        paymentType: 'crypto',
        ...(result.extraMetadata || {}),
        ...(packageMeta || {})
      }
    });
    paymentLog('createDepositSession selfcrypto pending created', {
      depositId: pending.id,
      userId,
      amount,
      providerPaymentId,
      paymentMethod: pm
    });

    return {
      depositId: pending.id,
      providerCode: 'selfcrypto',
      providerPaymentId: providerPaymentId != null ? String(providerPaymentId) : null,
      sessionType: 'crypto_qr',
      status: result.status || 'pending',
      amount: Number(result.amount) || Number(amount),
      currency: result.currency || currency,
      targetCurrency: result.targetCurrency || tc,
      targetAmount: result.targetAmount ?? null,
      paymentMethod: result.paymentMethod || pm,
      address: result.address || null,
      paymentRequest: result.paymentRequest || null,
      expiresAt: result.expiresAt || null,
      ttl: result.ttl ?? null,
      qrPayload: qrPayload || null,
      embeddedFormConfig: null,
      displayData: { networkLabel: selfcryptoConfig.networkLabelFor(pm, tc) }
    };
  }

  if (providerCode === 'orionstarspay') {
    return createOrionstarsPayinSession(userId, {
      amount,
      currency,
      paymentType,
      paymentToken: params?.paymentToken,
      paymentLogin: params?.paymentLogin,
      acceptedPaymentOptions: params?.acceptedPaymentOptions,
      packageMeta
    });
  }

  if (providerCode === 'dollarpay') {
    const dollarpay = require('../paymentProviders/dollarpay/dollarpay.client');
    const { resolveDollarpayPayinAmount } = require('../paymentProviders/dollarpay/dollarpay.amounts');
    const merchantId = params?.dollarpayMerchantId;
    const apiKey = params?.dollarpayApiKey;
    if (!merchantId || !apiKey) {
      const err = new Error(
        'DollarPay credentials missing. Set VITE_DOLLARPAY_MERCHANT_ID and VITE_DOLLARPAY_KEY on the store frontend.'
      );
      err.statusCode = 400;
      throw err;
    }
    const dollarpayPaymentType = ['card', 'credit_card', 'cashapp', 'apple_pay', 'google_pay'].includes(paymentType)
      ? (paymentType === 'credit_card' ? 'card' : paymentType)
      : 'cashapp';
    // Packages: exact DollarPay amount only (never undercharge). Custom: exact or whole-dollar .99 snap.
    // If DollarPay cannot take the amount → OrionStars with the original amount (admin stays DollarPay).
    const requestedAmount = amount;
    const isPackage = packageId != null;
    const resolved = resolveDollarpayPayinAmount(amount, dollarpayPaymentType, {
      allowWholeDollarSnap: !isPackage
    });

    if (!resolved) {
      paymentLog('createDepositSession DollarPay amount unsupported — falling back to OrionStars', {
        userId,
        paymentType: dollarpayPaymentType,
        requestedAmount,
        packageId: packageId ?? null
      });
      return createOrionstarsPayinSession(userId, {
        amount: requestedAmount,
        currency,
        paymentType,
        paymentToken: params?.paymentToken,
        paymentLogin: params?.paymentLogin,
        acceptedPaymentOptions: params?.acceptedPaymentOptions,
        packageMeta,
        fallbackFromDollarpay: true,
        originalDollarpayAmount: requestedAmount
      });
    }

    if (resolved.snapped) {
      paymentLog('createDepositSession DollarPay amount adjusted', {
        userId,
        paymentType: dollarpayPaymentType,
        requestedAmount,
        adjustedAmount: resolved.amount,
        packageId: packageId ?? null
      });
      amount = resolved.amount;
    }

    const orderSn = `DP${userId}T${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 64);
    const notifyBase = (process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_BASE_URL || '')
      .toString()
      .replace(/\/+$/, '');
    if (!notifyBase || /dollarpaywallet\.com/i.test(notifyBase)) {
      const err = new Error(
        'BACKEND_PUBLIC_URL must be your public API URL (not DollarPay). Example: https://api.yourdomain.com'
      );
      err.statusCode = 503;
      throw err;
    }
    let data;
    try {
      data = await dollarpay.createPayin({
        merchantId,
        apiKey,
        orderSn,
        amount,
        paymentType: dollarpayPaymentType,
        notifyUrl: `${notifyBase}/api/webhooks/dollarpay`,
        userName: params?.userName || `user${userId}`,
        ip: params?.clientIp || '127.0.0.1',
        deviceId: params?.deviceId || `web-${userId}`
      });
    } catch (err) {
      paymentErrorLog('createDepositSession DollarPay failed', err.message);
      err.statusCode = err.statusCode || 502;
      throw err;
    }
    const paymentLink = data.pay_url || data.payment_url || data.payUrl || null;
    if (!paymentLink) {
      const err = new Error('DollarPay did not return a payment URL.');
      err.statusCode = 502;
      throw err;
    }
    // Pending until webhook/cron confirms success/fail (or auto-expires after 3h).
    // Store encrypted key when possible so webhooks can verify signatures.
    let dollarpayKeyEncrypted = null;
    if (isPaymentPasswordEncryptionConfigured()) {
      dollarpayKeyEncrypted = encryptPaymentPassword(String(apiKey));
    }
    if (!dollarpayKeyEncrypted) {
      logger.warn(
        '[createDepositSession] DollarPay key not stored encrypted — webhook verify disabled for this order; status sync still credits'
      );
    }
    const pending = await db.PaymentPendingDeposit.create({
      userId,
      amount,
      paymentLink,
      status: 'pending',
      provider: 'dollarpay',
      providerSessionId: orderSn,
      providerMetadata: {
        paymentType: dollarpayPaymentType,
        merchantId: String(merchantId),
        outerOrderSn: orderSn,
        awaitingProviderConfirmation: true,
        ...(Number(requestedAmount) !== Number(amount)
          ? { originalRequestedAmount: Number(requestedAmount), dollarpayAdjustedAmount: Number(amount) }
          : {}),
        ...(dollarpayKeyEncrypted ? { dollarpayKeyEncrypted } : {}),
        ...(packageMeta || {})
      }
    });
    await db.DepositOrder.create({
      userId,
      provider: 'dollarpay',
      requestedAmount: amount,
      currency: currency || 'USD',
      status: 'PENDING',
      paymentLinkUrl: paymentLink,
      paymentLinkToken: orderSn,
      metadata: {
        legacyPaymentPendingDepositId: String(pending.id),
        paymentType: dollarpayPaymentType,
        merchantId: String(merchantId),
        awaitingProviderConfirmation: true,
        ...(Number(requestedAmount) !== Number(amount)
          ? { originalRequestedAmount: Number(requestedAmount), dollarpayAdjustedAmount: Number(amount) }
          : {}),
        ...(packageMeta || {})
      }
    }).catch(() => {});
    paymentLog('createDepositSession DollarPay pending created', { depositId: pending.id, orderSn });
    return {
      depositId: pending.id,
      providerCode: 'dollarpay',
      sessionType: 'embed',
      status: 'pending',
      paymentUrl: paymentLink,
      providerSessionId: orderSn,
      amount: Number(amount),
      embeddedFormConfig: { url: paymentLink },
      displayData: { paymentType: dollarpayPaymentType }
    };
  }

  if (providerCode === 'xxpay') {
    const xxpay = require('../paymentProviders/xxpay/xxpay.client');
    const { DEPOSIT_WAY_CODE } = require('../paymentProviders/xxpay/xxpay.wayCodes');
    const mchNo = params?.xxpayMchNo;
    const apiKey = params?.xxpayApiKey;
    const xxpayBaseUrl = params?.xxpayBaseUrl || null;
    if (!mchNo || !apiKey) {
      const err = new Error(
        'XXPay credentials missing. Set VITE_XXPAY_MCH_NO and VITE_XXPAY_API_KEY on the store frontend.'
      );
      err.statusCode = 400;
      throw err;
    }
    const xxpayPaymentType = DEPOSIT_WAY_CODE[(paymentType || '').toLowerCase()]
      ? (paymentType === 'credit_card' || paymentType === 'debit_card' ? 'card' : paymentType)
      : null;
    if (!xxpayPaymentType) {
      const err = new Error('XXPay does not support this deposit method.');
      err.statusCode = 400;
      throw err;
    }

    amount = Number(amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      const err = new Error('Invalid deposit amount.');
      err.statusCode = 400;
      throw err;
    }
    const { assertAllowedXxpayPayinAmount } = require('../paymentProviders/xxpay/xxpay.amounts');
    assertAllowedXxpayPayinAmount(amount, xxpayPaymentType);

    const orderSn = `XXP${userId}T${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 100);
    const notifyBase = (process.env.BACKEND_PUBLIC_URL || process.env.API_PUBLIC_BASE_URL || '')
      .toString()
      .replace(/\/+$/, '');
    if (!notifyBase) {
      const err = new Error(
        'BACKEND_PUBLIC_URL must be your public API URL. Example: https://api.yourdomain.com'
      );
      err.statusCode = 503;
      throw err;
    }

    let data;
    try {
      data = await xxpay.createPayin({
        mchNo,
        apiKey,
        baseUrl: xxpayBaseUrl,
        mchOrderNo: orderSn,
        amount,
        paymentType: xxpayPaymentType,
        currency: (currency || 'usd').toString().toLowerCase(),
        notifyUrl: `${notifyBase}/api/webhooks/xxpay`,
        returnUrl: params?.returnUrl || undefined,
        clientIp: params?.clientIp || '127.0.0.1',
        clientId: String(params?.clientId || `user${userId}`).slice(0, 64),
        deviceId: params?.deviceId || `web-${userId}`,
        extParam: params?.extParam
      });
    } catch (err) {
      paymentErrorLog('createDepositSession XXPay failed', err.message);
      err.statusCode = err.statusCode || 502;
      throw err;
    }

    const paymentLink = data?.data?.cashierUrl || data?.data?.payUrl || data?.cashierUrl || null;
    if (!paymentLink) {
      const err = new Error('XXPay did not return a cashier URL.');
      err.statusCode = 502;
      throw err;
    }

    let xxpayKeyEncrypted = null;
    if (isPaymentPasswordEncryptionConfigured()) {
      xxpayKeyEncrypted = encryptPaymentPassword(String(apiKey));
    }

    const payOrderNo = data?.data?.payOrderNo || null;
    const pending = await db.PaymentPendingDeposit.create({
      userId,
      amount,
      paymentLink,
      status: 'pending',
      provider: 'xxpay',
      providerSessionId: orderSn,
      providerMetadata: {
        paymentType: xxpayPaymentType,
        mchNo: String(mchNo),
        payOrderNo,
        awaitingProviderConfirmation: true,
        ...(xxpayBaseUrl ? { xxpayBaseUrl } : {}),
        ...(xxpayKeyEncrypted ? { xxpayKeyEncrypted } : {}),
        ...(packageMeta || {})
      }
    });
    await db.DepositOrder.create({
      userId,
      provider: 'xxpay',
      requestedAmount: amount,
      currency: currency || 'USD',
      status: 'PENDING',
      paymentLinkUrl: paymentLink,
      paymentLinkToken: orderSn,
      metadata: {
        legacyPaymentPendingDepositId: String(pending.id),
        paymentType: xxpayPaymentType,
        mchNo: String(mchNo),
        payOrderNo,
        awaitingProviderConfirmation: true,
        ...(packageMeta || {})
      }
    }).catch(() => {});

    paymentLog('createDepositSession XXPay pending created', {
      depositId: pending.id,
      orderSn,
      payOrderNo,
      amount: Number(amount),
      paymentType: xxpayPaymentType,
      userId
    });
    console.log('[XXPay] PAYIN SESSION CREATED', {
      depositId: pending.id,
      orderSn,
      payOrderNo,
      amount: Number(amount),
      paymentType: xxpayPaymentType,
      userId,
      hasPaymentUrl: Boolean(paymentLink)
    });
    return {
      depositId: pending.id,
      providerCode: 'xxpay',
      sessionType: 'embed',
      status: 'pending',
      paymentUrl: paymentLink,
      providerSessionId: orderSn,
      amount: Number(amount),
      embeddedFormConfig: { url: paymentLink },
      displayData: { paymentType: xxpayPaymentType, payOrderNo }
    };
  }

  const err = new Error('Unsupported payment provider.');
  err.statusCode = 400;
  throw err;
}

module.exports = { createDepositSession };
