'use strict';

const axios = require('axios');
const config = require('../../configs/app.config');
const { resolveBonaConfig } = require('./bona.config');
const { withSign } = require('./bonaSign.helpers');

function httpTimeout() {
  const ms = Number(config.get('http.thirdPartyTimeoutMs'));
  return Number.isFinite(ms) && ms > 0 ? ms : 120000;
}

function assertOk(payload, fallbackMessage) {
  const code = payload && payload.code;
  if (code === 200 || code === 0) return payload;
  const err = new Error((payload && payload.msg) || fallbackMessage || 'Bona API error');
  err.statusCode = 502;
  err.response = payload;
  err.code = code;
  throw err;
}

async function postBona(path, params) {
  const { baseUrl, appId, appSecret } = resolveBonaConfig();
  const body = withSign(
    {
      ...(params || {}),
      appId,
      timestamp: Date.now()
    },
    appSecret
  );

  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await axios.post(url, body, {
    headers: { 'Content-Type': 'application/json' },
    timeout: httpTimeout(),
    validateStatus: () => true
  });

  const payload = res.data && typeof res.data === 'object' ? res.data : { code: res.status, msg: 'Invalid response', data: null };
  return payload;
}

async function getBonaRedirect(path, queryParams) {
  const { baseUrl, appId, appSecret } = resolveBonaConfig();
  const params = withSign(
    {
      ...(queryParams || {}),
      appId,
      timestamp: String(Date.now())
    },
    appSecret
  );

  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await axios.get(url, {
    params,
    timeout: httpTimeout(),
    maxRedirects: 0,
    validateStatus: (status) => (status >= 200 && status < 400) || status === 307
  });

  if (res.status === 307 || res.status === 302 || res.status === 301) {
    const location = res.headers && (res.headers.location || res.headers.Location);
    if (!location) {
      const err = new Error('Bona openGame did not return a Location header');
      err.statusCode = 502;
      throw err;
    }
    return { url: String(location).trim(), status: res.status };
  }

  if (res.data && typeof res.data === 'object' && res.data.code != null && res.data.code !== 200) {
    assertOk(res.data, 'Failed to open Bona game');
  }

  const err = new Error('Unexpected Bona openGame response');
  err.statusCode = 502;
  err.response = res.data;
  throw err;
}

async function createAccount(username) {
  const payload = await postBona('/api/v2/ext/createAccount', { username });
  // 12 = already exists — treat as success for idempotent register
  if (payload.code === 12) {
    return { code: 200, msg: payload.msg || 'User already exists', data: { username }, alreadyExists: true };
  }
  return assertOk(payload, 'Failed to create Bona player');
}

async function playerLogin(username, currency) {
  const { currency: defaultCurrency } = resolveBonaConfig();
  const payload = await postBona('/api/v2/ext/player/login', {
    username,
    currency: currency || defaultCurrency
  });
  return assertOk(payload, 'Failed to login Bona player');
}

async function gameList(options = {}) {
  const { currency: defaultCurrency, lang } = resolveBonaConfig();
  const payload = await postBona('/api/v2/ext/gameList', {
    lang: options.lang || lang || 'en',
    currency: options.currency || defaultCurrency
  });
  return assertOk(payload, 'Failed to fetch Bona game list');
}

async function walletInit({ username, balance, requestId, walletMode = 1 }) {
  const payload = await postBona('/api/v2/ext/wallet/init', {
    username,
    balance: String(balance),
    requestId: String(requestId).slice(0, 32),
    walletMode
  });
  // Already initialized or soft failures — callers may continue
  return payload;
}

async function queryBalance(username, currency) {
  const { currency: defaultCurrency } = resolveBonaConfig();
  const payload = await postBona('/api/v2/ext/wallet/queryBalance', {
    username,
    currency: currency || defaultCurrency
  });
  return assertOk(payload, 'Failed to query Bona wallet balance');
}

async function walletDeposit({ username, balance, requestId, currency }) {
  const { currency: defaultCurrency } = resolveBonaConfig();
  const payload = await postBona('/api/v2/ext/wallet/deposit', {
    username,
    balance: String(balance),
    requestId: String(requestId).slice(0, 32),
    currency: currency || defaultCurrency
  });
  return assertOk(payload, 'Failed to deposit to Bona wallet');
}

async function walletWithdraw({ username, balance, requestId, currency }) {
  const { currency: defaultCurrency } = resolveBonaConfig();
  const payload = await postBona('/api/v2/ext/wallet/withdraw', {
    username,
    balance: String(balance),
    requestId: String(requestId).slice(0, 32),
    currency: currency || defaultCurrency
  });
  return assertOk(payload, 'Failed to withdraw from Bona wallet');
}

async function openGame({ token, gameId, back, lang, closeBack = '0', currency, layout }) {
  const { currency: defaultCurrency, lang: defaultLang } = resolveBonaConfig();
  return getBonaRedirect('/api/v2/ext/player/openGame', {
    token,
    id: String(gameId),
    back,
    lang: lang || defaultLang || 'en',
    closeBack: String(closeBack),
    currency: currency || defaultCurrency,
    ...(layout ? { layout } : {})
  });
}

async function extendGameBet(params = {}) {
  const { currency: defaultCurrency } = resolveBonaConfig();
  const payload = await postBona('/api/v2/ext/report/extendGameBet', {
    currency: params.currency || defaultCurrency,
    ...params
  });
  return assertOk(payload, 'Failed to fetch Bona game records');
}

module.exports = {
  postBona,
  createAccount,
  playerLogin,
  gameList,
  walletInit,
  queryBalance,
  walletDeposit,
  walletWithdraw,
  openGame,
  extendGameBet
};
