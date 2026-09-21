const transactionsService = require('../../services/transactions');
const { getGameTransactions: getGameTransactionsService } = require('../../services/games/getGameTransactions.service');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');

async function getTransactions(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await transactionsService.getTransactions(userId, req.query);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

async function getGameTransactions(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await getGameTransactionsService(userId, req.body);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message =
      typeof err.message === 'string' && err.message.trim()
        ? err.message.trim()
        : 'Something went wrong. Please try again later.';
    sendError(res, message, status);
  }
}

module.exports = {
  getTransactions,
  getGameTransactions
};
