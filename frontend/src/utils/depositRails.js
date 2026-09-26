/**
 * Payment-first deposit rails for Lucky Winners.
 * Expands Chime into Auto (XXPay) + Manual when XXPay is admin-enabled.
 */

import {
  getDollarpayAmountsForPaymentType
} from './dollarpayAmounts';
import {
  getXxpayAmountsForPaymentType
} from './xxpayAmounts';
import {
  DEPOSIT_PRESET_MAX,
  ORION_COMMON_PRESET_AMOUNTS,
  providerSupportsDepositAmount
} from './depositAmountMethods';

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function providerCodeOf(pr) {
  return String(pr?.providerCode || '').trim().toLowerCase();
}

function firstProviderCode(pt) {
  return providerCodeOf((pt?.providers || [])[0]);
}

function cryptoProviders(pt) {
  const providers = Array.isArray(pt?.providers) ? pt.providers : [];
  const hasSpeed = providers.some((pr) => providerCodeOf(pr) === 'scrypto');
  const hasDirect = providers.some((pr) => providerCodeOf(pr) === 'selfcrypto');
  return { providers, hasSpeed, hasDirect };
}

function makeRail(pt, extra) {
  return {
    key: String(pt.key || '').trim().toLowerCase(),
    label: pt.label || pt.key,
    providers: pt.providers || [],
    bestDeal: Boolean(pt.bestDeal),
    ...extra
  };
}

/**
 * Expand admin paymentTypes into selectable rails.
 * - XXPay Chime enabled → Chime (automatic) + Chime Manual
 * - Chime Manual is always shown, even when automatic Chime is off
 */
export function expandDepositRails(paymentTypes = []) {
  const rails = [];
  for (const pt of Array.isArray(paymentTypes) ? paymentTypes : []) {
    const key = String(pt.key || '').trim().toLowerCase();
    if (key === 'chime') {
      const providers = Array.isArray(pt.providers) ? pt.providers : [];
      const hasXxpay = providers.some((pr) => providerCodeOf(pr) === 'xxpay');
      const hasManual = providers.some((pr) => providerCodeOf(pr) === 'manual');
      if (hasXxpay) {
        rails.push(makeRail(pt, {
          railKey: 'chime-auto',
          label: 'Chime',
          providerCode: 'xxpay',
          speed: 'Instant',
          dark: false,
          bestDeal: Boolean(pt.bestDeal)
        }));
        rails.push(makeRail(pt, {
          railKey: 'chime-manual',
          label: 'Chime Manual',
          providerCode: 'manual',
          speed: '2–5 min',
          dark: false,
          bestDeal: Boolean(pt.bestDealManual)
        }));
      } else if (hasManual || providers.length === 0) {
        rails.push(makeRail(pt, {
          railKey: 'chime-manual',
          label: 'Chime Manual',
          providerCode: 'manual',
          speed: '2–5 min',
          dark: false,
          bestDeal: Boolean(pt.bestDealManual)
        }));
      } else {
        rails.push(makeRail(pt, {
          railKey: 'chime-manual',
          label: pt.label || 'Chime',
          providerCode: firstProviderCode(pt) || 'manual',
          speed: '2–5 min',
          dark: false,
          bestDeal: Boolean(pt.bestDealManual)
        }));
      }
      continue;
    }

    if (key === 'crypto') {
      const { hasSpeed, hasDirect } = cryptoProviders(pt);
      if (hasSpeed && hasDirect) {
        rails.push(makeRail(pt, {
          railKey: 'crypto-speed',
          label: 'Crypto (Speed)',
          providerCode: 'scrypto',
          speed: 'Network',
          dark: false,
          bestDeal: Boolean(pt.bestDeal)
        }));
        rails.push(makeRail(pt, {
          railKey: 'crypto-direct',
          label: 'Crypto (Direct)',
          providerCode: 'selfcrypto',
          speed: 'Network',
          dark: false,
          bestDeal: Boolean(pt.bestDealDirect)
        }));
        continue;
      }
      rails.push(makeRail(pt, {
        railKey: hasDirect && !hasSpeed ? 'crypto-direct' : 'crypto',
        label: hasDirect && !hasSpeed ? 'Crypto (Direct)' : (pt.label || 'Crypto'),
        providerCode: hasDirect && !hasSpeed ? 'selfcrypto' : (hasSpeed ? 'scrypto' : firstProviderCode(pt)),
        speed: 'Network',
        dark: false,
        bestDeal: Boolean(hasDirect && !hasSpeed ? pt.bestDealDirect : pt.bestDeal)
      }));
      continue;
    }

    rails.push(makeRail(pt, {
      railKey: key,
      label: pt.label || key,
      providerCode: firstProviderCode(pt),
      speed: key === 'crypto' ? 'Network' : 'Instant',
      dark: key === 'apple_pay'
    }));
  }
  return rails;
}

export function findDepositRail(rails, railKey) {
  if (!railKey) return null;
  return (rails || []).find((r) => r.railKey === railKey) || null;
}

export function isChimeManualRail(rail) {
  return rail?.railKey === 'chime-manual' || (
    String(rail?.key || '').toLowerCase() === 'chime' &&
    String(rail?.providerCode || '').toLowerCase() !== 'xxpay'
  );
}

export function isCryptoDirectRail(rail) {
  return String(rail?.providerCode || '').toLowerCase() === 'selfcrypto' ||
    String(rail?.railKey || '').toLowerCase() === 'crypto-direct';
}

export function isCryptoQrProvider(code) {
  const c = String(code || '').toLowerCase();
  return c === 'scrypto' || c === 'selfcrypto';
}

export function isCryptoDepositRail(rail) {
  if (!rail) return false;
  const key = String(rail.key || '').toLowerCase();
  const railKey = String(rail.railKey || '').toLowerCase();
  return key === 'crypto' || railKey.startsWith('crypto') || isCryptoQrProvider(rail.providerCode);
}

export function cryptoNetworkLabel(paymentMethod) {
  const pm = String(paymentMethod || '').toLowerCase();
  if (pm === 'onchain') return 'Bitcoin (on-chain)';
  if (pm === 'lightning') return 'Lightning';
  if (pm === 'ethereum') return 'Ethereum';
  if (pm === 'tron') return 'Tron';
  if (pm === 'solana') return 'Solana';
  return pm ? pm.charAt(0).toUpperCase() + pm.slice(1) : '';
}

export function cryptoUsualWait({ currency, paymentMethod } = {}) {
  const pm = String(paymentMethod || '').toLowerCase();
  const c = String(currency || '').trim().toUpperCase();
  if (pm === 'lightning') {
    return { short: 'Immediate', long: 'Usually immediate — a few seconds after you pay.' };
  }
  if (pm === 'onchain') {
    return { short: '~10 min', long: 'Usually about 10 minutes after you send. Low fees can take longer.' };
  }
  if (pm === 'ethereum' || c === 'ETH') {
    return { short: '~1 min', long: 'Usually about 1 minute after you send.' };
  }
  if (pm === 'tron' || c === 'TRX') {
    return { short: '~1 min', long: 'Usually about 1 minute after you send.' };
  }
  if (pm === 'solana' || c === 'SOL') {
    return { short: '~30 sec', long: 'Usually about 30 seconds after you send.' };
  }
  if (c === 'BTC' || c === 'SATS') {
    return { short: '~10 min', long: 'On-chain Bitcoin is usually about 10 minutes. Lightning is immediate.' };
  }
  if (c === 'USDT' || c === 'USDC') {
    return { short: 'A few min', long: 'Usually 1–10 minutes, depending on the network.' };
  }
  return { short: 'A few min', long: 'Usually a few minutes after you send.' };
}

export function cryptoCoinMeta(code) {
  const c = String(code || '').trim().toUpperCase();
  const map = {
    BTC: { code: 'BTC', name: 'Bitcoin', accent: '#f7931a' },
    SATS: { code: 'SATS', name: 'Bitcoin', accent: '#f7931a', hint: 'Sats' },
    ETH: { code: 'ETH', name: 'Ethereum', accent: '#627eea' },
    TRX: { code: 'TRX', name: 'Tron', accent: '#ff3b3b' },
    SOL: { code: 'SOL', name: 'Solana', accent: '#14f195' },
    USDT: { code: 'USDT', name: 'Tether', accent: '#26a17b' },
    USDC: { code: 'USDC', name: 'USD Coin', accent: '#2775ca' }
  };
  return map[c] || { code: c || 'COIN', name: c || 'Crypto', accent: '#ffc94a' };
}

export function railSupportsAmount(rail, amount, { min = 0, max = Infinity } = {}) {
  const n = round2(amount);
  if (!Number.isFinite(n) || n <= 0) return false;
  if (n < min || n > max) return false;
  if (!rail) return false;
  if (isChimeManualRail(rail) || isCryptoDirectRail(rail) || String(rail.providerCode || '').toLowerCase() === 'manual') {
    return true;
  }
  const code = String(rail.providerCode || '').toLowerCase();
  if (!code) return true;
  return providerSupportsDepositAmount(code, rail.key, n, { isPackage: true, exactOnly: true });
}

export function flattenCatalogPackages(groups = []) {
  const out = [];
  for (const group of Array.isArray(groups) ? groups : []) {
    for (const pkg of group.packages || []) {
      if (!pkg?.id) continue;
      out.push({
        ...pkg,
        group_key: group.group_key,
        group_title: group.title
      });
    }
  }
  return out;
}

export function packagePayableOnRail(pkg, rail, bounds) {
  const price = Number(pkg?.final_price ?? pkg?.finalPrice);
  return railSupportsAmount(rail, price, bounds);
}

export function customAmountsForRail(rail, { min = 0, max = Infinity, maxChips = 14 } = {}) {
  const code = String(rail?.providerCode || '').toLowerCase();
  const type = String(rail?.key || '').toLowerCase();
  let list = [];
  if (!rail) return [];
  if (isChimeManualRail(rail) || code === 'manual') {
    list = ORION_COMMON_PRESET_AMOUNTS.filter((a) => Number(a) <= 100);
  } else if (code === 'xxpay') {
    list = getXxpayAmountsForPaymentType(type);
  } else if (code === 'dollarpay') {
    list = getDollarpayAmountsForPaymentType(type);
  } else {
    list = ORION_COMMON_PRESET_AMOUNTS;
  }
  return list
    .map((a) => round2(a))
    .filter((a) => a >= min && a <= max && a <= DEPOSIT_PRESET_MAX)
    .slice(0, Math.max(1, maxChips));
}

/** Union of preset amounts across all rails (shown before a method is selected). */
export function customAmountsForAllRails(rails = [], { min = 0, max = Infinity, maxChips = 16 } = {}) {
  const seen = new Set();
  const out = [];
  for (const rail of Array.isArray(rails) ? rails : []) {
    for (const amt of customAmountsForRail(rail, { min, max, maxChips: 40 })) {
      const key = amt.toFixed(2);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(amt);
    }
  }
  if (!out.length) {
    for (const amt of ORION_COMMON_PRESET_AMOUNTS) {
      const n = round2(amt);
      if (n < min || n > max) continue;
      out.push(n);
    }
  }
  return out.sort((a, b) => a - b).slice(0, Math.max(1, maxChips));
}

export function railNote(rail) {
  if (!rail) {
    return 'Packs and amounts are ready to pick. Choose a payment method when you are ready — we will filter to what that method can collect.';
  }
  const code = String(rail.providerCode || '').toLowerCase();
  const key = String(rail.key || '').toLowerCase();
  if (rail.railKey === 'chime-auto' || (key === 'chime' && code === 'xxpay')) {
    return 'Chime Auto uses fixed whole-dollar amounts. Only packs this method can actually collect are shown.';
  }
  if (isChimeManualRail(rail)) {
    return 'Chime Manual is confirmed by staff. You can pick a pack, a preset, or type any amount within the store limits.';
  }
  if (code === 'dollarpay' && (key === 'card' || key === 'credit_card' || key === 'debit_card')) {
    return 'Card prices often end in .99 — that is the processor, not us. Every pack below is card-ready.';
  }
  if (code === 'dollarpay' || code === 'xxpay') {
    return `${rail.label} uses fixed price points. We only show packs this method can actually buy.`;
  }
  if (code === 'selfcrypto' || rail.railKey === 'crypto-direct') {
    return 'Direct crypto is self-hosted: Bitcoin, Lightning, Ethereum, Tron, and Solana go straight to our wallets. No Speed fee.';
  }
  if (code === 'scrypto' || rail.railKey === 'crypto-speed' || key === 'crypto') {
    return 'Pick a network after the pack or amount. Speed and Direct Crypto are separate rails.';
  }
  return `We only show packs ${rail.label} can actually buy. Nothing fails at checkout.`;
}

export function railCustomCopy(rail) {
  if (!rail) {
    return {
      title: 'Or pick an amount',
      hint: 'Tap a preset anytime. After you choose a payment method, we keep only amounts that method can collect.'
    };
  }
  if (isChimeManualRail(rail)) {
    return {
      title: 'Or type your own amount',
      hint: 'Chime Manual accepts any amount in range. Pick a preset or enter your own.'
    };
  }
  if (isCryptoDirectRail(rail)) {
    return {
      title: 'Or type your own amount',
      hint: 'Direct Crypto accepts any amount in range. Pick a preset, a pack, or enter your own.'
    };
  }
  return {
    title: `${rail.label} amounts`,
    hint: 'These are the price points this method can collect.'
  };
}

function savingsPercent(actual, final) {
  const a = Number(actual);
  const f = Number(final);
  if (!Number.isFinite(a) || !Number.isFinite(f) || a <= f || a <= 0) return 0;
  return Math.round((1 - f / a) * 100);
}

export function packSavePercent(pkg) {
  return savingsPercent(pkg?.actual_price ?? pkg?.actualPrice, pkg?.final_price ?? pkg?.finalPrice);
}

export function packBadgeClass(pkg) {
  const label = String(pkg?.discount_label || pkg?.badge || '').toLowerCase();
  if (label.includes('popular')) return 'pop';
  if (label.includes('best') || label.includes('value')) return 'best';
  if (pkg?.group_key === 'flash_sale' || pkg?.group_key === 'limited_time') return 'boosted';
  if (pkg?.discount_label) return 'pop';
  return '';
}

import recentBuyers from '../data/recentBuyers.json';

const RECENT_AGOS = ['just now', '1 min ago', '2 min ago', '4 min ago', '7 min ago', '11 min ago', '18 min ago', '26 min ago', '39 min ago', '51 min ago'];

function formatScLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} SC`;
}

function pickOne(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickUnique(arr, n) {
  const copy = Array.isArray(arr) ? arr.slice() : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

/**
 * Social-proof rows from real Lucky Winners names.
 * SC amounts and timestamps are random. Rotates with `tick`.
 */
export function buildDummyRecentPurchases(packages = [], tick = 0) {
  void tick;
  const scLabels = (packages || [])
    .map((p) => formatScLabel(p.final_sc ?? p.finalSc))
    .filter(Boolean);
  const fallback = ['10 SC', '20 SC', '25 SC', '50 SC', '100 SC'];
  const pool = scLabels.length ? scLabels : fallback;
  const people = pickUnique(recentBuyers, 4);
  return people.map((person) => ({
    initials: person.initials,
    name: person.name,
    pack: pickOne(pool),
    ago: pickOne(RECENT_AGOS)
  }));
}

export function formatHistoryStamp(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function shortCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(Math.round(v));
}
