'use strict';

const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { recordClick } = require('../../services/pushCampaigns/sendPushCampaign.service');

function readClickToken(req) {
  return (
    req.body?.clickToken ||
    req.body?.pj_click ||
    req.query?.clickToken ||
    req.query?.pj_click ||
    ''
  );
}

async function click(req, res) {
  try {
    const data = await recordClick(readClickToken(req));
    return sendSuccess(res, data);
  } catch (err) {
    return sendError(res, err.message || 'Unable to record click.', err.statusCode || 500);
  }
}

module.exports = { click };
