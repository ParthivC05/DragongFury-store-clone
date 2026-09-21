'use strict';

const db = require('../../db/models');
const { PAYMENT_TYPE_KEYS } = require('../../constants/paymentTypes');

const KEY = 'deposit_best_deal_methods';
const EXTRA_KEYS = ['crypto_direct', 'chime_manual'];
const ALLOWED = new Set([...PAYMENT_TYPE_KEYS, ...EXTRA_KEYS]);

/** Keep Cash App labeled until an admin saves a store override. */
const DEFAULT_METHODS = ['cashapp'];

function normalizeMethods(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') {
    if (Array.isArray(raw.methods)) list = raw.methods;
    else {
      list = Object.entries(raw)
        .filter(([, on]) => on === true)
        .map(([k]) => k);
    }
  }
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const key = String(item || '').trim().toLowerCase();
    if (!ALLOWED.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function parseRow(row) {
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

async function getDepositBestDealMethods(distributorCode, storeCode) {
  if (!distributorCode || !storeCode) return [...DEFAULT_METHODS];
  const row = await db.Setting.findOne({
    where: { key: KEY, distributorCode, storeCode }
  });
  const parsed = parseRow(row);
  if (parsed == null) return [...DEFAULT_METHODS];
  return normalizeMethods(parsed);
}

async function setDepositBestDealMethod(distributorCode, storeCode, methodKey, enabled) {
  const key = String(methodKey || '').trim().toLowerCase();
  if (!ALLOWED.has(key)) {
    const err = new Error('Unknown payment method.');
    err.statusCode = 400;
    throw err;
  }
  const current = await getDepositBestDealMethods(distributorCode, storeCode);
  const next = new Set(current);
  if (enabled) next.add(key);
  else next.delete(key);
  const methods = [...next];
  const [row] = await db.Setting.findOrCreate({
    where: { key: KEY, distributorCode, storeCode },
    defaults: { key: KEY, distributorCode, storeCode, value: JSON.stringify({ methods }) }
  });
  await row.update({ value: JSON.stringify({ methods }) });
  return methods;
}

function methodHasBestDeal(methods, methodKey) {
  const want = String(methodKey || '').trim().toLowerCase();
  if (!want) return false;
  return (Array.isArray(methods) ? methods : []).some(
    (item) => String(item || '').trim().toLowerCase() === want
  );
}

module.exports = {
  KEY,
  DEFAULT_METHODS,
  getDepositBestDealMethods,
  setDepositBestDealMethod,
  methodHasBestDeal
};
