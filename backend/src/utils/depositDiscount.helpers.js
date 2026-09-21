'use strict';

const MAX_DEPOSIT_DISCOUNT_PERCENT = 100;
const DRAGONFURY_STORE_CODE = 'dragonfury';

function normalizeStoreCode(storeCode) {
  return String(storeCode || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isDragonFuryStoreCode(storeCode) {
  return normalizeStoreCode(storeCode) === DRAGONFURY_STORE_CODE;
}

function resolveDepositDiscountPercent(value, _storeCode) {
  return normalizeDepositDiscountPercent(value);
}

/** @deprecated Use resolveDepositDiscountPercent — kept so existing callers keep working. */
function resolveDragonFuryDepositDiscountPercent(value, storeCode) {
  return resolveDepositDiscountPercent(value, storeCode);
}

function normalizeDepositDiscountPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const rounded = Math.round(n * 100) / 100;
  if (rounded > MAX_DEPOSIT_DISCOUNT_PERCENT) return MAX_DEPOSIT_DISCOUNT_PERCENT;
  return rounded;
}

/**
 * Wallet still pays `walletAmount`. Game is credited walletAmount * (1 + percent/100),
 * rounded to a whole SC. 10% on 10 → 11.
 */
function computeGameDepositCredit(walletAmount, discountPercent) {
  const paid = Number(walletAmount);
  const percent = normalizeDepositDiscountPercent(discountPercent);
  if (!Number.isFinite(paid) || paid < 1) return paid;
  if (percent <= 0) return paid;
  return Math.max(paid, Math.round(paid * (1 + percent / 100)));
}

function parseDepositDiscountFromNotes(notes) {
  if (!notes) return null;
  try {
    const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
    const d = parsed?.discount;
    if (!d) return null;
    const percent = normalizeDepositDiscountPercent(d.percent);
    const walletAmount = Number(d.walletAmount);
    const gameCredit = Number(d.gameCredit);
    if (!Number.isFinite(walletAmount) || !Number.isFinite(gameCredit) || gameCredit < walletAmount) {
      return null;
    }
    return { percent, walletAmount, gameCredit };
  } catch {
    return null;
  }
}

function buildDepositRequestNotes(fundingNotesJson, discount) {
  let parsed = {};
  if (fundingNotesJson) {
    try {
      parsed = typeof fundingNotesJson === 'string' ? JSON.parse(fundingNotesJson) : { ...fundingNotesJson };
    } catch {
      parsed = {};
    }
  }
  if (discount && Number(discount.percent) > 0 && Number(discount.gameCredit) > Number(discount.walletAmount)) {
    parsed.discount = {
      percent: Number(discount.percent),
      walletAmount: Number(discount.walletAmount),
      gameCredit: Number(discount.gameCredit)
    };
  }
  return JSON.stringify(parsed);
}

function resolveManualDepositGameCredit(manualReq) {
  const walletAmount = Number(manualReq?.amount);
  const fromNotes = parseDepositDiscountFromNotes(manualReq?.notes);
  if (fromNotes && Number.isFinite(fromNotes.gameCredit)) return fromNotes.gameCredit;
  return Number.isFinite(walletAmount) ? walletAmount : 0;
}

function stripDepositDiscountUnlessDragonFury(gameJson, _storeCode) {
  return gameJson;
}

function buildGameDepositActivityMetadata({ walletAmount, gameCredit, discountPercent, gameName }) {
  const paid = Number(walletAmount);
  const credited = Number(gameCredit);
  const meta = {};
  if (Number.isFinite(paid)) meta.wallet_amount = paid;
  if (Number.isFinite(credited)) meta.game_credit = credited;
  const percent = Number(discountPercent) || 0;
  if (percent > 0 && Number.isFinite(paid) && Number.isFinite(credited) && credited > paid) {
    meta.deposit_discount_percent = percent;
  }
  const name = gameName != null ? String(gameName).trim() : '';
  if (name) meta.game_name = name;
  return Object.keys(meta).length ? meta : null;
}

function enrichManualRequestDiscount(row) {
  if (!row || row.requestType !== 'deposit') return row;
  const fromNotes = parseDepositDiscountFromNotes(row.notes);
  if (!fromNotes) return row;
  row.depositDiscountPercent = fromNotes.percent;
  row.gameCreditAmount = fromNotes.gameCredit;
  return row;
}

module.exports = {
  MAX_DEPOSIT_DISCOUNT_PERCENT,
  DRAGONFURY_STORE_CODE,
  isDragonFuryStoreCode,
  resolveDepositDiscountPercent,
  resolveDragonFuryDepositDiscountPercent,
  normalizeDepositDiscountPercent,
  computeGameDepositCredit,
  parseDepositDiscountFromNotes,
  buildDepositRequestNotes,
  resolveManualDepositGameCredit,
  enrichManualRequestDiscount,
  stripDepositDiscountUnlessDragonFury,
  buildGameDepositActivityMetadata
};
