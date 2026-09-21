'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const link2playGames = require('../../services/link2play/link2playGames.service');

/** Public: list active Link2Play games (DragonFury only). */
async function list(req, res) {
  try {
    const storeCode = req.query.store_code || req.query.storeCode;
    const data = await link2playGames.listPublic(storeCode);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to get Link2Play games', err.statusCode || 500);
  }
}

module.exports = { list };
