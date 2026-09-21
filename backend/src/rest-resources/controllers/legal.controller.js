'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const legalPages = require('../../services/legal/legalPages.service');

async function getOne(req, res) {
  try {
    const storeCode = req.query.store_code || req.query.storeCode;
    const data = await legalPages.getPublic(storeCode, req.params.pageKey);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to get legal page', err.statusCode || 500);
  }
}

module.exports = { getOne };
