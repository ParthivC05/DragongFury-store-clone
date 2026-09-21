'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { getPublicWinnerBoards } = require('../../services/landingWinners.service');

async function getPublic(req, res) {
  try {
    const storeCode = String(req.query.store_code || req.query.storeCode || '').trim();
    if (!storeCode) {
      return sendError(res, 'store_code is required', 400);
    }
    const period = String(req.query.period || 'today').toLowerCase() === 'weekly'
      ? 'weekly'
      : 'today';
    const boards = await getPublicWinnerBoards(storeCode, 5);
    return sendSuccess(res, {
      today: boards.today,
      weekly: boards.weekly,
      winners: period === 'weekly' ? boards.weekly : boards.today,
    });
  } catch (error) {
    return sendError(res, error.message || 'Failed to load winners', 500);
  }
}

module.exports = {
  getPublic,
};
