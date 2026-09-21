'use strict';

const bonaCallbacks = require('../../services/bona/bonaCallbacks.service');
const { createLogger } = require('../../libs/logger');

const log = createLogger('bonaCallback');

function sendSeamless(res, payload) {
  res.status(200).json(payload);
}

function summarizeBody(body) {
  if (!body || typeof body !== 'object') return {};
  return {
    userId: body.userId ?? null,
    username: body.username ?? null,
    transactionId: body.transactionId ?? null,
    gameId: body.gameId ?? null,
    gameRoundId: body.gameRoundId ?? null,
    type: body.type ?? null,
    completed: body.completed ?? null,
    currency: body.currency ?? null,
    balance: body.balance ?? null,
    bet: body.bet ?? null,
    totalPayout: body.totalPayout ?? null
  };
}

async function handleCallback(req, res, name, handler) {
  const started = Date.now();
  const summary = summarizeBody(req.body);
  const hasXSign = Boolean(req.get?.('x-sign') || req.headers?.['x-sign']);

  log.info('Bona callback received', {
    name,
    path: req.path,
    hasXSign,
    hasRawBody: Boolean(req.rawBody),
    ...summary
  });

  try {
    const payload = await handler(req);
    log.info('Bona callback response', {
      name,
      path: req.path,
      code: payload?.code,
      balance: payload?.balance,
      currency: payload?.currency,
      durationMs: Date.now() - started,
      username: summary.username,
      transactionId: summary.transactionId
    });
    sendSeamless(res, payload);
  } catch (err) {
    log.error('Bona callback failed', {
      name,
      path: req.path,
      message: err.message,
      stack: err.stack,
      durationMs: Date.now() - started,
      ...summary
    });
    sendSeamless(res, { code: 2, balance: '0' });
  }
}

async function query(req, res) {
  await handleCallback(req, res, 'query', (r) => bonaCallbacks.queryCallback(r));
}

async function bet(req, res) {
  await handleCallback(req, res, 'bet', (r) => bonaCallbacks.betCallback(r));
}

async function settlement(req, res) {
  await handleCallback(req, res, 'settlement', (r) =>
    bonaCallbacks.settlementCallback(r, {})
  );
}

async function activitySettlement(req, res) {
  await handleCallback(req, res, 'activity-settlement', (r) =>
    bonaCallbacks.settlementCallback(r, { activity: true })
  );
}

async function fishingSettlement(req, res) {
  await handleCallback(req, res, 'fishing-settlement', (r) =>
    bonaCallbacks.settlementCallback(r, { fishing: true })
  );
}

module.exports = {
  query,
  bet,
  settlement,
  activitySettlement,
  fishingSettlement
};
