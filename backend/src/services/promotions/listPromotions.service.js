const db = require('../../db/models');
const {
  getAffiliateSettings,
  getEffectiveSettingsForStoreCode
} = require('../affiliate/getAffiliateSettings.service');
const { buildAffiliateRewardDescription } = require('../affiliate/buildAffiliateUserCopy.service');

const INVITE_EARN_SLUG = 'invite-earn';

const PUBLIC_ATTRS = [
  'id', 'title', 'slug', 'description', 'image', 'ctaText', 'ctaUrl', 'backgroundColor', 'displayOrder',
  'bonusTriggerType', 'bonusType', 'bonusValue', 'minTriggerAmount', 'maxBonusCap'
];

/**
 * Build the Refer & Earn promotion description from affiliate settings only.
 * Used so the card message always reflects current admin-configured referral reward.
 * When storeCode is provided, uses that store's Give/Get SC (store-admin override).
 */
async function getInviteEarnDescriptionFromSettings(storeCode = null) {
  const code = storeCode != null && String(storeCode).trim() ? String(storeCode).trim() : null;
  const settings = code
    ? await getEffectiveSettingsForStoreCode(code).catch(() => null)
    : await getAffiliateSettings(null).catch(() => null);
  if (!settings) return null;
  const currency = settings.currency || 'SC';
  const text = buildAffiliateRewardDescription(settings, currency, settings.storeCode);
  if (!text) return null;
  return `${text} UNLIMITED REFERRALS. UNLIMITED EARNINGS.`.toUpperCase();
}

function toPublicItem(row, descriptionOverride = null) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: descriptionOverride != null ? descriptionOverride : row.description,
    image: row.image,
    cta_text: row.ctaText,
    cta_url: row.ctaUrl,
    background_color: row.backgroundColor,
    display_order: row.displayOrder,
    bonus_trigger_type: row.bonusTriggerType,
    bonus_type: row.bonusType,
    bonus_value: row.bonusValue != null ? Number(row.bonusValue) : null,
    min_trigger_amount: row.minTriggerAmount != null ? Number(row.minTriggerAmount) : null,
    max_bonus_cap: row.maxBonusCap != null ? Number(row.maxBonusCap) : null
  };
}

/**
 * List active promotions ordered by display_order, then by id.
 * Includes bonus fields for display (e.g. "5% on first deposit").
 * Refer & Earn (invite-earn) description is built from affiliate settings, not stored text.
 * @param {string|null} [storeCode] - optional store code so invite-earn uses that store's SC amounts
 */
async function listPromotions(storeCode = null) {
  const [rows, inviteEarnDescription] = await Promise.all([
    db.Promotion.findAll({
      where: { isActive: true },
      order: [
        ['displayOrder', 'ASC'],
        ['id', 'ASC']
      ],
      attributes: PUBLIC_ATTRS,
      raw: true
    }),
    getInviteEarnDescriptionFromSettings(storeCode)
  ]);

  return rows.map((row) => {
    const descriptionOverride = row.slug === INVITE_EARN_SLUG && inviteEarnDescription
      ? inviteEarnDescription
      : null;
    return toPublicItem(row, descriptionOverride);
  });
}

/**
 * List all promotions for admin (including inactive).
 * Refer & Earn (invite-earn) description is built from affiliate settings when displayed.
 * @param {string|null} [storeCode] - optional store code so invite-earn uses that store's SC amounts
 */
async function listAllPromotions(storeCode = null) {
  const [rows, inviteEarnDescription] = await Promise.all([
    db.Promotion.findAll({
      order: [
        ['displayOrder', 'ASC'],
        ['id', 'ASC']
      ],
      attributes: [...PUBLIC_ATTRS, 'isActive'],
      raw: true
    }),
    getInviteEarnDescriptionFromSettings(storeCode)
  ]);

  return rows.map((row) => {
    const descriptionOverride = row.slug === INVITE_EARN_SLUG && inviteEarnDescription
      ? inviteEarnDescription
      : null;
    return {
      ...toPublicItem(row, descriptionOverride),
      is_active: row.isActive
    };
  });
}

/**
 * Update promotion by id. Only provided fields are updated.
 */
async function updatePromotion(id, data) {
  const allowed = [
    'title', 'slug', 'description', 'image', 'ctaText', 'ctaUrl', 'backgroundColor',
    'displayOrder', 'isActive',
    'bonusTriggerType', 'bonusType', 'bonusValue', 'minTriggerAmount', 'maxBonusCap'
  ];
  const payload = {};
  for (const key of allowed) {
    if (data[key] !== undefined) payload[key] = data[key];
  }
  if (Object.keys(payload).length === 0) {
    return db.Promotion.findByPk(id);
  }
  const promo = await db.Promotion.findByPk(id);
  if (!promo) return null;
  await promo.update(payload);
  return promo;
}

module.exports = { listPromotions, listAllPromotions, updatePromotion };
