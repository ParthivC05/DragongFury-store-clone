'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const gameSeoPages = require('../../services/seo/gameSeoPages.service');

async function list(req, res) {
  try {
    const data = await gameSeoPages.listPublic(req.query.store_code || req.query.storeCode);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load game pages.', err.statusCode || 500);
  }
}

async function getOne(req, res) {
  try {
    const data = await gameSeoPages.getPublic(
      req.query.store_code || req.query.storeCode,
      req.params.slug
    );
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to load game page.', err.statusCode || 500);
  }
}

module.exports = { list, getOne };
