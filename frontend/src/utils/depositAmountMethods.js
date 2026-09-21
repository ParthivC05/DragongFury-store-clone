/**
 * Deposit amount ↔ method visibility (user Deposit page).
 * Amount-first: build chips from enabled providers; filter methods to exact matches;
 * Chime stays visible when admin enabled it; XXPay→manual fallback for unsupported amounts.
 */

import {
  DOLLARPAY_CARD_AMOUNTS,
  DOLLARPAY_WALLET_AMOUNTS,
  isAllowedDollarpayAmount,
  toDollarpayPayinAmount
} from './dollarpayAmounts';
import {
  XXPAY_CASHAPP_AMOUNTS,
  XXPAY_CHIME_AMOUNTS,
  isAllowedXxpayAmount
} from './xxpayAmounts';

/** Common Orion / unconstrained presets (within store min/max). */
export const DEPOSIT_PRESET_MAX = 150;

export const ORION_COMMON_PRESET_AMOUNTS = [
  10, 20, 25, 50, 75, 100, 150
];

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function providerCodeOf(pr) {
  return String(pr?.providerCode || '').trim().toLowerCase();
}

export function isChimeManualProvider(providerCode, paymentTypeKey) {
  return (
    String(paymentTypeKey || '').trim().toLowerCase() === 'chime' &&
    providerCodeOf({ providerCode }) === 'manual'
  );
}

/** Auto / API providers (not Chime manual last-resort). */
export function isAutoDepositProvider(providerCode, paymentTypeKey) {
  const code = String(providerCode || '').trim().toLowerCase();
  if (!code) return false;
  if (isChimeManualProvider(code, paymentTypeKey)) return false;
  return true;
}

/**
 * Whether a specific provider can take this amount for a payment type.
 * Orion / crypto / unconstrained: admin gate is enough.
 * DollarPay / XXPay: exact allowlist (no soft-snap for gating).
 */
export function providerSupportsDepositAmount(providerCode, paymentTypeKey, amount, options = {}) {
  const code = String(providerCode || '').trim().toLowerCase();
  const type = String(paymentTypeKey || '').trim().toLowerCase();
  const n = round2(amount);
  if (!Number.isFinite(n) || n <= 0) return false;

  if (code === 'xxpay') {
    return isAllowedXxpayAmount(n, type);
  }
  if (code === 'dollarpay') {
    if (isAllowedDollarpayAmount(n, type)) return true;
    // Soft-snap only when explicitly allowed (legacy custom amounts) — packages/chips use exact.
    if (options.isPackage || options.exactOnly) return false;
    return toDollarpayPayinAmount(n, type, { allowWholeDollarSnap: true }) != null;
  }
  // orionstarspay, manual, scrypto, etc. — admin on is enough
  return true;
}

function filterProvidersForAmount(paymentTypes, amount, options = {}) {
  const list = Array.isArray(paymentTypes) ? paymentTypes : [];
  const n = round2(amount);
  if (!Number.isFinite(n) || n <= 0) return list;

  const exact = options.exactOnly !== false || options.isPackage === true;

  return list
    .map((pt) => {
      const providers = (pt.providers || []).filter((pr) =>
        providerSupportsDepositAmount(providerCodeOf(pr), pt.key, n, {
          isPackage: exact,
          exactOnly: exact
        })
      );
      return { ...pt, providers };
    })
    .filter((pt) => (pt.providers || []).length > 0);
}

function hasAutoProvider(paymentTypes) {
  return (paymentTypes || []).some((pt) =>
    (pt.providers || []).some((pr) => isAutoDepositProvider(providerCodeOf(pr), pt.key))
  );
}

function findAdminChime(paymentTypes) {
  return (paymentTypes || []).find((pt) => String(pt.key || '').toLowerCase() === 'chime') || null;
}

function chimeHasProvider(chimePt, code) {
  const want = String(code || '').toLowerCase();
  return (chimePt?.providers || []).some((pr) => providerCodeOf(pr) === want);
}

function chimeManualOnly(paymentTypes) {
  return (paymentTypes || [])
    .filter((pt) => String(pt.key || '').toLowerCase() === 'chime')
    .map((pt) => ({
      ...pt,
      providers: (pt.providers || []).filter((pr) => providerCodeOf(pr) === 'manual')
    }))
    .filter((pt) => (pt.providers || []).length > 0);
}

function manualChimeProviderMeta(adminChime) {
  const fromAdmin = (adminChime?.providers || []).find((pr) => providerCodeOf(pr) === 'manual');
  if (fromAdmin) return { ...fromAdmin, providerCode: 'manual' };
  return {
    providerCode: 'manual',
    providerName: 'Manual',
    badgeLabel: 'Manual'
  };
}

function xxpayChimeProviderMeta(adminChime) {
  const fromAdmin = (adminChime?.providers || []).find((pr) => providerCodeOf(pr) === 'xxpay');
  if (fromAdmin) return { ...fromAdmin, providerCode: 'xxpay' };
  return {
    providerCode: 'xxpay',
    providerName: 'XXPay',
    badgeLabel: 'XXPay'
  };
}

/**
 * Resolve which Chime provider to use for a locked amount.
 * - Admin Manual → always manual
 * - Admin XXPay + amount on XXPay Chime list → xxpay
 * - Admin XXPay + amount not supported → manual fallback
 * Returns 'xxpay' | 'manual' | null
 */
export function resolveChimeDepositProvider(paymentTypes = [], amount) {
  const adminChime = findAdminChime(paymentTypes);
  if (!adminChime) return null;

  const hasManual = chimeHasProvider(adminChime, 'manual');
  const hasXxpay = chimeHasProvider(adminChime, 'xxpay');

  // Admin Manual wins whenever enabled (exclusive product matrix usually has only one).
  if (hasManual) return 'manual';

  if (hasXxpay) {
    const n = round2(amount);
    if (Number.isFinite(n) && n > 0 && isAllowedXxpayAmount(n, 'chime')) return 'xxpay';
    return 'manual';
  }

  return null;
}

function buildResolvedChimeType(adminChime, resolvedCode) {
  const providers =
    resolvedCode === 'xxpay'
      ? [xxpayChimeProviderMeta(adminChime)]
      : [manualChimeProviderMeta(adminChime)];
  return {
    key: 'chime',
    label: adminChime?.label || 'Chime',
    providers
  };
}

/**
 * Keep admin Chime visible after amount filter, with XXPay or manual provider resolved.
 */
function ensureAdminChimeVisible(adminList, filtered, amount) {
  const adminChime = findAdminChime(adminList);
  if (!adminChime) return filtered;

  const resolved = resolveChimeDepositProvider(adminList, amount);
  if (!resolved) return filtered;

  const withoutChime = (filtered || []).filter(
    (pt) => String(pt.key || '').toLowerCase() !== 'chime'
  );
  return [...withoutChime, buildResolvedChimeType(adminChime, resolved)];
}

/**
 * Keep only admin-returned payment types/providers that support `amount`.
 * If amount is missing/invalid, return admin list unchanged (caller should use this
 * only after amount lock — pre-select UI uses raw admin paymentTypes).
 * Admin Chime always stays visible when enabled; XXPay unsupported amounts fall back to manual.
 * When chimeManualLastResort: if still empty, inject Chime manual so UX never dead-ends.
 */
export function filterPaymentTypesForAmount(paymentTypes = [], amount, options = {}) {
  const list = Array.isArray(paymentTypes) ? paymentTypes : [];
  const n = round2(amount);
  if (!Number.isFinite(n) || n <= 0) return list;

  const exact = options.isPackage === true || options.exactOnly !== false;
  let filtered = filterProvidersForAmount(list, n, {
    isPackage: exact,
    exactOnly: exact
  });

  // Always keep admin-enabled Chime (Manual or XXPay→manual fallback).
  filtered = ensureAdminChimeVisible(list, filtered, n);

  if (options.chimeManualLastResort === false) {
    return filtered;
  }

  if (filtered.length > 0) return filtered;

  // No admin methods at all for this amount — inject last-resort Chime.
  return [
    {
      key: 'chime',
      label: 'Chime',
      providers: [manualChimeProviderMeta(null)]
    }
  ];
}

/** Exact amount already works for ≥1 admin-enabled method (no DollarPay .99 snap). */
export function amountExactSupportedByAdmin(paymentTypes = [], amount) {
  return filterPaymentTypesForAmount(paymentTypes, amount, {
    isPackage: true,
    chimeManualLastResort: false
  }).length > 0;
}

/** True if Chime manual is admin-enabled for this store. */
export function storeHasChimeManual(paymentTypes = []) {
  return chimeManualOnly(paymentTypes).length > 0;
}

/** True if admin enabled Chime via XXPay (may still fall back to manual per amount). */
export function storeHasChimeXxpay(paymentTypes = []) {
  return paymentTypeHasProvider(paymentTypes, 'chime', 'xxpay');
}

/**
 * Package / chip is payable if an auto method accepts the exact price,
 * or Chime is enabled (Manual, or XXPay with manual fallback) within min/max.
 */
export function packagePriceIsPayable(price, paymentTypes, { min = 0, max = Infinity } = {}) {
  const n = round2(price);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (n < min || n > max) return false;

  const filtered = filterPaymentTypesForAmount(paymentTypes, n, {
    isPackage: true,
    chimeManualLastResort: false
  });
  if (hasAutoProvider(filtered)) return true;
  if (storeHasChimeManual(paymentTypes)) return true;
  // XXPay Chime admin → unsupported amounts still payable via manual fallback.
  if (storeHasChimeXxpay(paymentTypes)) return true;
  return false;
}

/** Drop packages nothing can collect; hide empty groups. */
export function filterPackageGroupsByPayableMethods(
  groups = [],
  paymentTypes = [],
  { min = 0, max = Infinity } = {}
) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((group) => ({
      ...group,
      packages: (group.packages || []).filter((pkg) =>
        packagePriceIsPayable(pkg.final_price ?? pkg.finalPrice, paymentTypes, { min, max })
      )
    }))
    .filter((group) => (group.packages || []).length > 0);
}

function paymentTypeHasProvider(paymentTypes, typeKey, providerCode) {
  const key = String(typeKey || '').toLowerCase();
  const code = String(providerCode || '').toLowerCase();
  return (paymentTypes || []).some(
    (pt) =>
      String(pt.key || '').toLowerCase() === key &&
      (pt.providers || []).some((pr) => providerCodeOf(pr) === code)
  );
}

function storeHasProvider(paymentTypes, providerCode) {
  const code = String(providerCode || '').toLowerCase();
  return (paymentTypes || []).some((pt) =>
    (pt.providers || []).some((pr) => providerCodeOf(pr) === code)
  );
}

function countSupportingMethods(paymentTypes, amount) {
  const filtered = filterPaymentTypesForAmount(paymentTypes, amount, {
    isPackage: true,
    chimeManualLastResort: false
  });
  let count = 0;
  for (const pt of filtered) {
    count += (pt.providers || []).filter((pr) =>
      isAutoDepositProvider(providerCodeOf(pr), pt.key)
    ).length;
  }
  return count;
}

/**
 * Preset chips from union of enabled providers' amount lists (+ Orion commons).
 * Prefer amounts that work on multiple methods; cap list size.
 */
export function buildDepositAmountPresets(
  paymentTypes = [],
  { min = 0, max = Infinity, maxChips = 15 } = {}
) {
  const adminTypes = Array.isArray(paymentTypes) ? paymentTypes : [];
  const candidate = new Set();

  const hasDollarpay = storeHasProvider(adminTypes, 'dollarpay');
  const hasXxpayCashapp = paymentTypeHasProvider(adminTypes, 'cashapp', 'xxpay');
  const hasXxpayChime = paymentTypeHasProvider(adminTypes, 'chime', 'xxpay');
  const hasOrion = storeHasProvider(adminTypes, 'orionstarspay');

  if (hasDollarpay) {
    for (const a of DOLLARPAY_WALLET_AMOUNTS) candidate.add(Number(a).toFixed(2));
    for (const a of DOLLARPAY_CARD_AMOUNTS) candidate.add(Number(a).toFixed(2));
  }
  if (hasXxpayCashapp) {
    for (const a of XXPAY_CASHAPP_AMOUNTS) candidate.add(Number(a).toFixed(2));
  }
  if (hasXxpayChime) {
    for (const a of XXPAY_CHIME_AMOUNTS) candidate.add(Number(a).toFixed(2));
  }
  if (hasOrion) {
    for (const a of ORION_COMMON_PRESET_AMOUNTS) candidate.add(Number(a).toFixed(2));
  }

  // If only Chime manual (no auto lists), still offer Orion-style commons so user can pick + manual.
  if (candidate.size === 0 && storeHasChimeManual(adminTypes)) {
    for (const a of ORION_COMMON_PRESET_AMOUNTS) candidate.add(Number(a).toFixed(2));
  }

  const scored = Array.from(candidate)
    .map((s) => Number(s))
    .filter((a) => a >= min && a <= max && a <= DEPOSIT_PRESET_MAX)
    .filter((a) => Number(a).toFixed(2) !== '9.99')
    .filter((a) => packagePriceIsPayable(a, adminTypes, { min, max }))
    .map((amount) => ({
      amount,
      methods: countSupportingMethods(adminTypes, amount)
    }))
    .sort((a, b) => {
      if (b.methods !== a.methods) return b.methods - a.methods;
      return a.amount - b.amount;
    });

  const capped = scored.slice(0, Math.max(1, maxChips));
  return capped.map((x) => x.amount).sort((a, b) => a - b);
}

/** @deprecated Prefer multi-method scoring in buildDepositAmountPresets */
export function getCommonCashappPresetAmounts() {
  const dpOk = new Set(
    XXPAY_CASHAPP_AMOUNTS.filter((a) => isAllowedDollarpayAmount(a, 'cashapp')).map((a) =>
      Number(a).toFixed(2)
    )
  );
  return XXPAY_CASHAPP_AMOUNTS.filter((a) => dpOk.has(Number(a).toFixed(2)));
}
