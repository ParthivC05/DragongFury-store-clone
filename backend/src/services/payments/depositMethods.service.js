'use strict';

const db = require('../../db/models');
const { getWalletLimits, getWalletLimitsForScope } = require('../wallet/getWalletLimits.service');
const { PAYMENT_TYPE_KEYS, getPaymentTypeLabel, isMethodEnabledInMap } = require('../../constants/paymentTypes');
const selfcryptoConfig = require('../paymentProviders/selfcrypto/selfcrypto.config');
const { filterCryptoMethods } = require('../../constants/cryptoDepositRails');

/**
 * Provider-specific metadata for deposit method cards (icon, type, isCrypto, assets, networks, badge).
 * supportedPaymentTypes: keys for deposit (and for "pay by Card / Crypto" UX).
 * supportedWithdrawPaymentTypes: keys that support withdraw for this provider; only these show a Withdraw toggle in admin.
 *
 * Matrix (product):
 * Pay-in:  card→Orion+DollarPay+XXPay | cashapp→Orion+DollarPay+XXPay | apple/google→Orion+DollarPay (+XXPay for dragonfury/myvepower/goodgdragon/goodwork) | chime→Manual+XXPay | crypto→SCrypto+Direct
 * Payout:  card→Orion | cashapp/chime→Manual+DollarPay+XXPay | paypal→DollarPay+XXPay | bank→none | crypto→SCrypto
 */
const PROVIDER_META = {
  selfcrypto: {
    icon: null,
    type: 'crypto',
    isCrypto: true,
    supportedPaymentTypes: ['crypto'],
    supportedWithdrawPaymentTypes: [],
    supportedAssets: ['BTC', 'ETH', 'TRX', 'SOL'],
    supportedNetworks: ['bitcoin', 'lightning', 'ethereum', 'tron', 'solana'],
    targetCurrencies: ['BTC', 'ETH', 'TRX', 'SOL'],
    paymentMethodsByTargetCurrency: {
      BTC: ['onchain', 'lightning'],
      ETH: ['ethereum'],
      TRX: ['tron'],
      SOL: ['solana']
    },
    badgeLabel: 'Direct Crypto',
    defaultMaxAmount: 10000
  },
  scrypto: {
    icon: null,
    type: 'crypto',
    isCrypto: true,
    supportedPaymentTypes: ['crypto'],
    supportedWithdrawPaymentTypes: ['crypto'],
    supportedAssets: ['BTC', 'ETH', 'USDT', 'USDC'],
    supportedNetworks: ['bitcoin', 'ethereum', 'polygon'],
    targetCurrencies: ['SATS', 'USDT', 'USDC'],
    paymentMethodsByTargetCurrency: {
      SATS: ['onchain', 'lightning'],
      USDT: ['lightning', 'ethereum', 'solana'],
      USDC: ['lightning', 'ethereum', 'solana']
    },
    badgeLabel: 'Crypto',
    defaultMaxAmount: 10000
  },
  orionstarspay: {
    icon: null,
    type: 'card',
    isCrypto: false,
    supportedPaymentTypes: ['card', 'apple_pay', 'google_pay', 'cashapp'],
    supportedWithdrawPaymentTypes: ['card'],
    supportedAssets: [],
    supportedNetworks: [],
    badgeLabel: 'Card / Bank',
    defaultMaxAmount: 5000
  },
  dollarpay: {
    icon: null,
    type: 'wallet',
    isCrypto: false,
    supportedPaymentTypes: ['card', 'cashapp', 'apple_pay', 'google_pay'],
    supportedWithdrawPaymentTypes: ['cashapp', 'chime', 'paypal'],
    supportedAssets: [],
    supportedNetworks: [],
    badgeLabel: 'DollarPay',
    defaultMaxAmount: 5000
  },
  xxpay: {
    icon: null,
    type: 'wallet',
    isCrypto: false,
    // Base: Cash App + Chime + Card (deposit). PayPal withdraw. Apple/Google via storeAccess overlay.
    supportedPaymentTypes: ['cashapp', 'chime', 'card'],
    supportedWithdrawPaymentTypes: ['cashapp', 'chime', 'paypal'],
    supportedAssets: [],
    supportedNetworks: [],
    badgeLabel: 'XXPay',
    defaultMaxAmount: 5000
  },
  manual: {
    icon: null,
    type: 'manual',
    isCrypto: false,
    supportedPaymentTypes: ['chime'],
    supportedWithdrawPaymentTypes: ['cashapp', 'chime'],
    supportedAssets: [],
    supportedNetworks: [],
    badgeLabel: 'Manual',
    defaultMaxAmount: 5000
  }
};

/**
 * Get active deposit methods for the frontend.
 * Returns paymentTypes (pay by Card / Cash App / Crypto etc.) and methods (provider list) for backward compat.
 * Global: is_active, supports_deposit, deposit_enabled; per payment type: deposit_methods_enabled (master + store).
 * @param {object} [storeContext] - Optional { distributorCode, storeCode } from req.user for store-scoped filtering.
 * @returns {Promise<{ paymentTypes: Array<{ key, label, providers }>, methods: Array<{ providerCode, providerName, ... }> }>}
 */
async function getActiveDepositMethods(storeContext = null) {
  const { getDepositBestDealMethods } = require('./depositBestDealMethods.service');
  const [limits, providers, storeRows, bestDealMethods] = await Promise.all([
    storeContext?.distributorCode || storeContext?.storeCode
      ? getWalletLimitsForScope(storeContext)
      : getWalletLimits(),
    db.PaymentProvider.findAll({
      where: { isActive: true, supportsDeposit: true, depositEnabled: true },
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
      attributes: ['id', 'code', 'name', 'displayOrder', 'depositMethodsEnabled'],
      raw: true
    }),
    storeContext?.distributorCode && storeContext?.storeCode
      ? db.StorePaymentProvider.findAll({
          where: {
            distributorCode: storeContext.distributorCode,
            storeCode: storeContext.storeCode
          },
          attributes: ['providerCode', 'enabled', 'depositEnabled', 'depositMethodsEnabled'],
          raw: true
        })
      : Promise.resolve([]),
    storeContext?.distributorCode && storeContext?.storeCode
      ? getDepositBestDealMethods(storeContext.distributorCode, storeContext.storeCode)
      : Promise.resolve([])
  ]);
  const bestDealSet = new Set(bestDealMethods || []);

  const storeByCode = new Map((storeRows || []).map((r) => [(r.providerCode || '').toString().toLowerCase(), r]));
  const selfcryptoReady = selfcryptoConfig.isConfigured();
  const selfcryptoMethods = selfcryptoReady ? selfcryptoConfig.paymentMethodsByTargetCurrency() : {};
  const minAmount = Number(limits?.depositMin) >= 0 ? Number(limits.depositMin) : 10;
  const platformMaxAmount = Number(limits?.depositMax) > 0 ? Number(limits.depositMax) : 5000;
  const {
    storeAllowsXxpay,
    getXxpaySupportedDepositTypes,
    isXxpayDepositMethodEnabledInMaps
  } = require('../paymentProviders/xxpay/xxpay.storeAccess');
  const xxpayAllowedForStore = storeAllowsXxpay(storeContext?.storeCode);

  /** Provider is allowed for store (enabled + deposit on). DollarPay/XXPay are opt-in only. Manual defaults on. */
  function storeAllowsProvider(code) {
    const c = (code || '').toString().toLowerCase();
    if (c === 'xxpay' && !xxpayAllowedForStore) return false;
    const row = storeByCode.get(c);
    if (!row) {
      // Missing store row: keep legacy + manual available; DollarPay/XXPay must be enabled explicitly.
      return c !== 'dollarpay' && c !== 'xxpay';
    }
    return row.enabled !== false && row.depositEnabled !== false;
  }

  /** Payment type is enabled for this provider (master + store). */
  function isPaymentTypeEnabledForDeposit(provider, typeKey) {
    const code = (provider.code || '').toString().toLowerCase();
    const meta = PROVIDER_META[code];
    const storeRow = storeByCode.get(code);
    if (code === 'xxpay') {
      return isXxpayDepositMethodEnabledInMaps(
        storeContext?.storeCode,
        typeKey,
        provider.depositMethodsEnabled,
        storeRow?.depositMethodsEnabled
      );
    }
    const supported =
      meta && Array.isArray(meta.supportedPaymentTypes) && meta.supportedPaymentTypes.length > 0
        ? meta.supportedPaymentTypes
        : Object.keys(provider.depositMethodsEnabled || {});
    if (!supported.includes(typeKey)) return false;
    const masterEnabled = isMethodEnabledInMap(provider.depositMethodsEnabled, typeKey);
    if (!masterEnabled) return false;
    const storeEnabled = isMethodEnabledInMap(storeRow?.depositMethodsEnabled, typeKey);
    if (!storeEnabled) return false;
    if (typeKey === 'crypto' && (code === 'selfcrypto' || code === 'scrypto')) {
      const baseMap =
        code === 'selfcrypto'
          ? selfcryptoMethods
          : (meta?.paymentMethodsByTargetCurrency || {});
      const filtered = filterCryptoMethods(
        code,
        baseMap,
        provider.depositMethodsEnabled,
        storeRow?.depositMethodsEnabled
      );
      if (!Object.keys(filtered).length) return false;
    }
    return true;
  }

  const filteredProviders = (providers || []).filter((p) => {
    const code = (p.code || '').toString().toLowerCase();
    if (code === 'selfcrypto' && !selfcryptoReady) return false;
    return storeAllowsProvider(p.code);
  });

  /** Build paymentTypes: for each type key, list providers that support it and have it enabled. */
  const paymentTypes = [];
  for (const typeKey of PAYMENT_TYPE_KEYS) {
    const providersForType = filteredProviders
      .filter((p) => isPaymentTypeEnabledForDeposit(p, typeKey))
      .map((p) => {
        const code = (p.code || '').toString().toLowerCase();
        const meta = PROVIDER_META[code] || {};
        return {
          providerCode: code,
          providerName: (p.name || code).toString(),
          icon: meta.icon,
          badgeLabel: meta.badgeLabel || 'Payment',
          displayOrder: p.displayOrder != null ? Number(p.displayOrder) : 0
        };
      })
      .sort((a, b) => {
        // Prefer XXPay, then DollarPay, then Orion for wallet/card types when multiple enabled.
        const preferWalletTypes = ['card', 'cashapp', 'apple_pay', 'google_pay', 'paypal', 'zelle', 'chime'];
        if (preferWalletTypes.includes(typeKey)) {
          const rank = (code) =>
            code === 'xxpay' ? 0 : code === 'dollarpay' ? 1 : code === 'manual' ? 2 : code === 'orionstarspay' ? 3 : 4;
          const ra = rank(a.providerCode);
          const rb = rank(b.providerCode);
          if (ra !== rb) return ra - rb;
        }
        return a.displayOrder - b.displayOrder;
      });
    if (providersForType.length > 0) {
      paymentTypes.push({
        key: typeKey,
        label: getPaymentTypeLabel(typeKey),
        bestDeal: bestDealSet.has(typeKey),
        bestDealDirect: typeKey === 'crypto' ? bestDealSet.has('crypto_direct') : false,
        bestDealManual: typeKey === 'chime' ? bestDealSet.has('chime_manual') : false,
        providers: providersForType
      });
    }
  }

  /** Methods: providers that appear in at least one payment type (so UX can use either flow). */
  const providerCodesInPaymentTypes = new Set(paymentTypes.flatMap((pt) => pt.providers.map((pr) => pr.providerCode)));
  const methods = filteredProviders
    .filter((p) => providerCodesInPaymentTypes.has((p.code || '').toString().toLowerCase()))
    .map((p) => {
      const code = (p.code || '').toString().toLowerCase();
      const meta = PROVIDER_META[code] || {
        icon: null,
        type: 'other',
        isCrypto: false,
        supportedAssets: [],
        supportedNetworks: [],
        targetCurrencies: [],
        paymentMethodsByTargetCurrency: {},
        badgeLabel: 'Payment',
        defaultMaxAmount: 5000
      };
      const method = {
        providerCode: code,
        providerName: (p.name || code).toString(),
        icon: meta.icon,
        type: meta.type,
        isCrypto: meta.isCrypto === true,
        supportedAssets: Array.isArray(meta.supportedAssets) ? meta.supportedAssets : [],
        supportedNetworks: Array.isArray(meta.supportedNetworks) ? meta.supportedNetworks : [],
        supportedPaymentTypes:
          code === 'xxpay'
            ? getXxpaySupportedDepositTypes(storeContext?.storeCode)
            : Array.isArray(meta.supportedPaymentTypes)
              ? meta.supportedPaymentTypes
              : [],
        minAmount,
        maxAmount: Math.min(
          platformMaxAmount,
          meta.defaultMaxAmount != null ? Number(meta.defaultMaxAmount) : 5000
        ),
        badgeLabel: meta.badgeLabel || 'Payment',
        displayOrder: p.displayOrder != null ? Number(p.displayOrder) : 0
      };
      if (code === 'scrypto' && Array.isArray(meta.targetCurrencies)) {
        const storeRow = storeByCode.get(code);
        const filtered = filterCryptoMethods(
          'scrypto',
          meta.paymentMethodsByTargetCurrency && typeof meta.paymentMethodsByTargetCurrency === 'object'
            ? meta.paymentMethodsByTargetCurrency
            : {},
          p.depositMethodsEnabled,
          storeRow?.depositMethodsEnabled
        );
        method.targetCurrencies = Object.keys(filtered);
        method.paymentMethodsByTargetCurrency = filtered;
      }
      if (code === 'selfcrypto') {
        const storeRow = storeByCode.get(code);
        const filtered = filterCryptoMethods(
          'selfcrypto',
          selfcryptoMethods,
          p.depositMethodsEnabled,
          storeRow?.depositMethodsEnabled
        );
        method.targetCurrencies = Object.keys(filtered);
        method.paymentMethodsByTargetCurrency = filtered;
        method.supportedAssets = Object.keys(filtered);
        method.supportedNetworks = Object.keys(filtered).flatMap((tc) => filtered[tc] || []);
      }
      return method;
    })
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return { paymentTypes, methods, bestDealMethods: [...bestDealSet] };
}

/**
 * Resolve a provider to use when user selected a payment type (e.g. 'card') but not a specific provider.
 * Returns first enabled provider that supports that payment type for deposit (e.g. for traffic-based selection later).
 * @param {object} [storeContext] - { distributorCode, storeCode }
 * @param {string} paymentTypeKey - e.g. 'card', 'crypto'
 * @returns {Promise<{ providerCode: string } | null>}
 */
async function resolveProviderForPaymentType(storeContext, paymentTypeKey) {
  const key = (paymentTypeKey || '').toString().trim().toLowerCase();
  const { paymentTypes } = await getActiveDepositMethods(storeContext);
  if (!key) return null;
  const pt = paymentTypes.find((p) => p.key === key);
  if (!pt || !pt.providers || pt.providers.length === 0) return null;
  const providerCode = pt.providers[0].providerCode;
  // Legacy manual Chime deposit (username/request) — only when Manual wins.
  if (key === 'chime' && providerCode === 'manual') return null;
  return { providerCode };
}

module.exports = { getActiveDepositMethods, resolveProviderForPaymentType, PROVIDER_META };
