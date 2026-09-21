'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const footer = require('../../services/footer/footer.service');

/** Public: footer menus + page links for a store. */
async function list(req, res) {
  try {
    const storeCode = req.query.store_code || req.query.storeCode;
    const data = await footer.listPublic(storeCode);
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to get footer', err.statusCode || 500);
  }
}

/** Public: one footer page by slug (or id). */
async function getOne(req, res) {
  try {
    const storeCode = req.query.store_code || req.query.storeCode;
    const slug = req.params.slug;
    const id = req.query.id;
    const data = await footer.getPagePublic(storeCode, { slug, id });
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Failed to get footer page', err.statusCode || 500);
  }
}

module.exports = {
  list,
  getOne
};
