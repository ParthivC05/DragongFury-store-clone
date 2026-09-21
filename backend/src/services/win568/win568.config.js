'use strict';

const config = require('../../configs/app.config');

function sanitizeCompanyKey(raw) {
  return String(raw || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
}

/** Match BO EnableCurrency. WM Casino labels CNY as RMB — never send RMB. */
function normalizeWin568Currency(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code || code === 'RMB') return 'USD';
  return code;
}

function resolveWin568Config() {
  const companyKey = sanitizeCompanyKey(config.get('win568.companyKey'));
  const storeCode = String(config.get('win568.storeCode') || '').trim();
  const responseCase = String(config.get('win568.responseCase') || 'camel').trim().toLowerCase();
  const apiBaseUrl = String(config.get('win568.apiBaseUrl') || '').trim().replace(/\/+$/, '');
  const serverId = String(config.get('win568.serverId') || 'dragonfury').trim().slice(0, 15);
  const agentUsername = String(config.get('win568.agentUsername') || '').trim();
  const currency = normalizeWin568Currency(config.get('win568.currency') || 'USD');
  const lang = String(config.get('win568.lang') || 'en').trim() || 'en';
  const gameProviderUrl = String(config.get('win568.gameProviderUrl') || '').trim().replace(/\/+$/, '');
  return {
    companyKey,
    storeCode,
    usePascal: responseCase === 'pascal',
    apiBaseUrl,
    serverId,
    agentUsername,
    currency,
    lang,
    gameProviderUrl
  };
}

function isWin568Configured() {
  return Boolean(resolveWin568Config().companyKey);
}

function isWin568OperatorConfigured() {
  const cfg = resolveWin568Config();
  return Boolean(cfg.companyKey && cfg.apiBaseUrl);
}

function isWin568LaunchConfigured() {
  const cfg = resolveWin568Config();
  return Boolean(cfg.companyKey && cfg.apiBaseUrl && cfg.agentUsername);
}

function isCompanyKeyValid(incoming) {
  const expected = resolveWin568Config().companyKey;
  if (!expected) return false;
  return sanitizeCompanyKey(incoming) === expected;
}

module.exports = {
  resolveWin568Config,
  normalizeWin568Currency,
  isWin568Configured,
  isWin568OperatorConfigured,
  isWin568LaunchConfigured,
  isCompanyKeyValid
};
