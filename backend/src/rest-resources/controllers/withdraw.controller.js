'use strict';

const { createSpeedWithdrawRequest } = require('../../services/speedWithdraw/createSpeedWithdrawRequest.service');
const { getSpeedWithdrawStatus } = require('../../services/speedWithdraw/getSpeedWithdrawStatus.service');
const { assertKycForWithdraw } = require('../../services/kyc/assertKycForWithdraw.service');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');

function safeMessage(err, defaultMsg) {
  if (!err) return defaultMsg;
  const status = err.statusCode ?? err.response?.status;
  if (status != null && status >= 500) return defaultMsg;
  const msg = (err.message || '').trim();
  return msg || defaultMsg;
}

/**
 * POST /api/withdraw/speed/request
 * Create Speed LNURL withdraw-request (in-app flow: QR + timer). ttl = 600.
 * Body: { amount: number, currency: string }
 */
async function createSpeedWithdrawRequestHandler(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    await assertKycForWithdraw(userId);

    const amount = req.body?.amount != null ? Number(req.body.amount) : NaN;
    const currency = (req.body?.currency && typeof req.body.currency === 'string')
      ? req.body.currency.trim().toUpperCase().slice(0, 16)
      : '';

    if (!Number.isFinite(amount) || amount <= 0) {
      return sendError(res, 'Amount is required and must be a positive number.', 400);
    }
    if (!currency) {
      return sendError(res, 'Currency is required.', 400);
    }

    const data = await createSpeedWithdrawRequest({ userId, amount, currency });

    return sendSuccess(res, {
      success: true,
      data: {
        withdrawId: data.withdrawId,
        provider: data.provider,
        providerReference: data.providerReference,
        status: data.status,
        type: data.type,
        amount: data.amount,
        currency: data.currency,
        targetCurrency: data.targetCurrency,
        exchangeRate: data.exchangeRate,
        withdrawRequest: data.withdrawRequest,
        expiresAt: data.expiresAt,
        ttl: data.ttl,
        createdAt: data.createdAt
      }
    }, 201);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to create withdrawal request. Please try again.');
    return sendError(res, message, status);
  }
}

/**
 * GET /api/withdraw/:withdrawId/status
 * Get status of a Speed withdraw-request (for polling). User must own the request.
 */
async function getSpeedWithdrawStatusHandler(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);

    const withdrawId = req.params?.withdrawId;
    const result = await getSpeedWithdrawStatus(withdrawId, userId);

    if (result == null) return sendError(res, 'Withdrawal request not found.', 404);

    return sendSuccess(res, {
      success: true,
      data: result
    });
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to get status.');
    return sendError(res, message, status);
  }
}

module.exports = {
  createSpeedWithdrawRequestHandler,
  getSpeedWithdrawStatusHandler
};
