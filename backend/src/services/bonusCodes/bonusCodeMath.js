'use strict';

/**
 * @param {{ valueType: string, value: unknown, maxBonusCap?: unknown }} bonusCode
 * @param {number} triggerAmount
 */
function computeBonusAmountFromCode(bonusCode, triggerAmount) {
  const bonusType = (bonusCode.valueType || '').toLowerCase();
  const value = Number(bonusCode.value) || 0;
  const cap = bonusCode.maxBonusCap != null ? Number(bonusCode.maxBonusCap) : null;

  if (bonusType === 'percentage') {
    let amount = Math.round((triggerAmount * value) / 100 * 100) / 100;
    if (cap != null && cap > 0 && amount > cap) amount = Number(cap);
    return amount;
  }
  if (bonusType === 'fixed') {
    return Math.min(Number(value) || 0, 999999999);
  }
  return 0;
}

module.exports = { computeBonusAmountFromCode };
