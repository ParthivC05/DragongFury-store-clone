'use strict';

const db = require('../../db/models');

function normalizeStoreCode(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeBonusCodeInput(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 64);
}

/**
 * @param {string|null|undefined} rawBonusCode
 * @param {string|null|undefined} storeCode
 * @returns {Promise<number|null>} bonus_codes.id or null if no code provided
 */
async function resolveSignupBonusCodeForRegister(rawBonusCode, storeCode) {
  const trimmed = rawBonusCode != null && typeof rawBonusCode === 'string' ? rawBonusCode.trim() : '';
  if (!trimmed) return null;

  const storeNorm = normalizeStoreCode(storeCode);
  const codeNorm = normalizeBonusCodeInput(trimmed);
  if (!storeNorm || !codeNorm) {
    const err = new Error('Invalid bonus code.');
    err.statusCode = 400;
    err.code = 'INVALID_BONUS_CODE';
    throw err;
  }

  const row = await db.BonusCode.findOne({
    where: {
      storeCode: storeNorm,
      code: codeNorm,
      isActive: true,
      bonusType: 'deposit'
    },
    attributes: ['id']
  });

  if (!row) {
    const err = new Error('This bonus code is not valid for this store or is inactive.');
    err.statusCode = 400;
    err.code = 'INVALID_BONUS_CODE';
    throw err;
  }

  // Email-campaign codes require claim-from-email + Apply Code modal (not signup/login entry).
  if (db.EmailCampaign) {
    const campaignLinked = await db.EmailCampaign.findOne({
      where: { bonusCodeId: row.id },
      attributes: ['id']
    });
    if (campaignLinked) {
      const err = new Error(
        'Claim this offer from your email first, then apply the code on Deposit.'
      );
      err.statusCode = 400;
      err.code = 'CAMPAIGN_CLAIM_REQUIRED';
      throw err;
    }
  }

  return row.id;
}

module.exports = {
  resolveSignupBonusCodeForRegister,
  normalizeStoreCode,
  normalizeBonusCodeInput
};
