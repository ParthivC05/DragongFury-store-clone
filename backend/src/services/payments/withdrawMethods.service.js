'use strict';

const db = require('../../db/models');
const { PROVIDER_META } = require('./depositMethods.service');
const { PAYMENT_TYPE_KEYS, getPaymentTypeLabel, isMethodEnabledInMap } = require('../../constants/paymentTypes');

const FLOW_BY_CODE = {
  scrypto: 'speed_withdraw_request',
  orionstarspay: 'card_withdraw',
  dollarpay: 'dollarpay_payout',
  xxpay: 'chime_cashapp_manual',
  manual: 'chime_cashapp_manual'
};

/**
 * Get active withdraw methods for the frontend.
 * Returns paymentTypes (Cash App / Chime / PayPal / Crypto etc.) and methods (provider list).
 * Global: is_active, supports_withdraw, withdraw_enabled; per payment type: withdraw_methods_enabled (master + store).
 * @param {object} [storeContext] - Optional { distributorCode, storeCode } from req.user.
 * @returns {Promise<{ paymentTypes: Array, methods: Array }>}
 */
async function getActiveWithdrawMethods(storeContext = null) {
  const [providers, storeRows] = await Promise.all([
    db.PaymentProvider.findAll({
      where: { isActive: true, supportsWithdraw: true, withdrawEnabled: true },
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
      attributes: ['id', 'code', 'name', 'displayOrder', 'supportsWithdraw', 'withdrawMethodsEnabled'],
      raw: true
    }),
    storeContext?.distributorCode && storeContext?.storeCode
      ? db.StorePaymentProvider.findAll({
          where: {
            distributorCode: storeContext.distributorCode,
            storeCode: storeContext.storeCode
          },
          attributes: ['providerCode', 'enabled', 'withdrawEnabled', 'withdrawMethodsEnabled'],
          raw: true
        })
      : Promise.resolve([])
  ]);

  const storeByCode = new Map((storeRows || []).map((r) => [(r.providerCode || '').toString().toLowerCase(), r]));
  const { storeAllowsXxpay } = require('../paymentProviders/xxpay/xxpay.storeAccess');
  const xxpayAllowedForStore = storeAllowsXxpay(storeContext?.storeCode);

  function storeAllowsProvider(code) {
    const c = (code || '').toString().toLowerCase();
    if (c === 'xxpay' && !xxpayAllowedForStore) return false;
    const row = storeByCode.get(c);
    if (!row) {
      // Missing store row: keep legacy + manual available; DollarPay/XXPay must be enabled explicitly.
      return c !== 'dollarpay' && c !== 'xxpay';
    }
    return row.enabled !== false && row.withdrawEnabled !== false;
  }

  function isPaymentTypeEnabledForWithdraw(provider, typeKey) {
    const code = (provider.code || '').toString().toLowerCase();
    const meta = PROVIDER_META[code];
    const storeRow = storeByCode.get(code);
    if (code === 'xxpay') {
      const {
        isXxpayWithdrawMethodEnabledInMaps
      } = require('../paymentProviders/xxpay/xxpay.storeAccess');
      return isXxpayWithdrawMethodEnabledInMaps(
        typeKey,
        provider.withdrawMethodsEnabled,
        storeRow?.withdrawMethodsEnabled
      );
    }
    if (code === 'dollarpay' && typeKey === 'chime') {
      const storeOn = storeRow?.withdrawMethodsEnabled?.chime === true;
      const masterOn = !provider.withdrawMethodsEnabled || provider.withdrawMethodsEnabled.chime !== false;
      return storeOn && masterOn;
    }
    let withdrawTypes = Array.isArray(meta?.supportedWithdrawPaymentTypes)
      ? meta.supportedWithdrawPaymentTypes
      : Array.isArray(meta?.supportedPaymentTypes)
        ? meta.supportedPaymentTypes
        : [];
    if (withdrawTypes.length === 0) {
      withdrawTypes = Object.keys(provider.withdrawMethodsEnabled || {});
    }
    if (!withdrawTypes.includes(typeKey)) return false;
    const masterEnabled = isMethodEnabledInMap(provider.withdrawMethodsEnabled, typeKey);
    if (!masterEnabled) return false;
    return isMethodEnabledInMap(storeRow?.withdrawMethodsEnabled, typeKey);
  }

  const filteredProviders = (providers || []).filter((p) => storeAllowsProvider(p.code));

  const paymentTypes = [];
  for (const typeKey of PAYMENT_TYPE_KEYS) {
    const providersForType = filteredProviders
      .filter((p) => isPaymentTypeEnabledForWithdraw(p, typeKey))
      .map((p) => {
        const code = (p.code || '').toString().toLowerCase();
        const meta = PROVIDER_META[code] || {};
        return {
          providerCode: code,
          providerName: (p.name || code).toString(),
          badgeLabel: meta.badgeLabel || 'Payment',
          displayOrder: p.displayOrder != null ? Number(p.displayOrder) : 0,
          flow: FLOW_BY_CODE[code] || 'card_withdraw'
        };
      })
      .sort((a, b) => {
        const walletTypes = ['cashapp', 'chime', 'paypal', 'venmo', 'zelle', 'card', 'bank_transfer'];
        if (walletTypes.includes(typeKey)) {
          const rank = (code) =>
            code === 'xxpay' ? 0 : code === 'dollarpay' ? 1 : code === 'manual' ? 2 : code === 'orionstarspay' ? 3 : 4;
          const ra = rank(a.providerCode);
          const rb = rank(b.providerCode);
          if (ra !== rb) return ra - rb;
        }
        return a.displayOrder - b.displayOrder;
      });

    // One automatic provider per wallet method, except Chime: manual is always listed
    // and automatic Chime is added only when admin enabled it.
    let providersForTypeDeduped = providersForType;
    if (typeKey === 'chime') {
      const automatic = providersForType.find((p) => p.providerCode !== 'manual') || null;
      providersForTypeDeduped = [];
      if (automatic) providersForTypeDeduped.push(automatic);
      providersForTypeDeduped.push({
        providerCode: 'manual',
        providerName: 'Manual',
        badgeLabel: 'Manual',
        displayOrder: 50,
        flow: FLOW_BY_CODE.manual
      });
    } else if (
      typeKey === 'cashapp' ||
      typeKey === 'paypal' ||
      typeKey === 'venmo' ||
      typeKey === 'zelle' ||
      typeKey === 'card' ||
      typeKey === 'bank_transfer'
    ) {
      providersForTypeDeduped = providersForType.slice(0, 1);
    }

    if (providersForTypeDeduped.length > 0) {
      paymentTypes.push({
        key: typeKey,
        label: getPaymentTypeLabel(typeKey),
        providers: providersForTypeDeduped
      });
    }
  }

  const providerCodesInPaymentTypes = new Set(
    paymentTypes.flatMap((pt) => pt.providers.map((pr) => pr.providerCode))
  );

  const methods = filteredProviders
    .filter((p) => providerCodesInPaymentTypes.has((p.code || '').toString().toLowerCase()))
    .map((p) => {
      const code = (p.code || '').toString().toLowerCase();
      return {
        code,
        name: (p.name || p.code || '').toString(),
        displayOrder: p.displayOrder != null ? Number(p.displayOrder) : 0,
        withdrawEnabled: true,
        flow: FLOW_BY_CODE[code] || 'card_withdraw'
      };
    });

  return { methods, paymentTypes };
}

module.exports = { getActiveWithdrawMethods };
