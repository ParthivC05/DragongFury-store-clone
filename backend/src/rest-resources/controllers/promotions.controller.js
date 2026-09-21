const promotionsService = require('../../services/promotions');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');

/** HTTP status codes that should never show technical details to the user. */
const INTERNAL_STATUS_CODES = [500, 502, 503, 504];

/** Message substrings that indicate a technical error. */
const TECHNICAL_PATTERNS = [
  'econnrefused', 'econnreset', 'etimedout', 'enotfound', 'network', 'timeout',
  'relation', 'does not exist', 'connection', 'bad gateway', 'gateway timeout'
];

function isTechnicalOrInternalError(err) {
  if (!err) return true;
  const status = err.statusCode ?? err.response?.status;
  if (status != null && INTERNAL_STATUS_CODES.includes(Number(status))) return true;
  const msg = (err.message || '').toLowerCase();
  return TECHNICAL_PATTERNS.some((p) => msg.includes(p));
}

function safeMessage(err, defaultMsg) {
  return isTechnicalOrInternalError(err) ? defaultMsg : (err.message || defaultMsg);
}

function resolveStoreCodeFromRequest(req) {
  const fromQuery = req.query?.store_code ?? req.query?.storeCode;
  if (fromQuery != null && String(fromQuery).trim()) return String(fromQuery).trim();
  if (req.storeCode != null && String(req.storeCode).trim()) return String(req.storeCode).trim();
  if (req.user?.storeCode != null && String(req.user.storeCode).trim()) {
    return String(req.user.storeCode).trim();
  }
  return null;
}

async function listPromotions(req, res) {
  try {
    const promotions = await promotionsService.listPromotions(resolveStoreCodeFromRequest(req));
    sendSuccess(res, { promotions });
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, safeMessage(err, 'Unable to load promotions. Please try again later.'), status);
  }
}

async function listAllPromotions(req, res) {
  try {
    const promotions = await promotionsService.listAllPromotions(resolveStoreCodeFromRequest(req));
    sendSuccess(res, { promotions });
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, safeMessage(err, 'Unable to load promotions.'), status);
  }
}

async function updatePromotion(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return sendError(res, 'Invalid promotion ID.', 400);
    }
    const updated = await promotionsService.updatePromotion(id, req.body);
    if (!updated) {
      return sendError(res, 'Promotion not found.', 404);
    }
    sendSuccess(res, {
      promotion: {
        id: updated.id,
        title: updated.title,
        slug: updated.slug,
        description: updated.description,
        image: updated.image,
        cta_text: updated.ctaText,
        cta_url: updated.ctaUrl,
        background_color: updated.backgroundColor,
        display_order: updated.displayOrder,
        is_active: updated.isActive,
        bonus_trigger_type: updated.bonusTriggerType,
        bonus_type: updated.bonusType,
        bonus_value: updated.bonusValue != null ? Number(updated.bonusValue) : null,
        min_trigger_amount: updated.minTriggerAmount != null ? Number(updated.minTriggerAmount) : null,
        max_bonus_cap: updated.maxBonusCap != null ? Number(updated.maxBonusCap) : null
      }
    });
  } catch (err) {
    const status = err.statusCode || 500;
    sendError(res, safeMessage(err, 'Unable to update promotion.'), status);
  }
}

module.exports = {
  listPromotions,
  listAllPromotions,
  updatePromotion
};
