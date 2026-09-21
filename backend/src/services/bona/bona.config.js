'use strict';

const config = require('../../configs/app.config');

const DEFAULT_BASE_URL = 'https://sg.bona.games';
const DEFAULT_CURRENCY = 'SC';

function resolveBonaConfig() {
  const baseUrl = String(config.get('bona.baseUrl') || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const appId = String(config.get('bona.appId') || '').trim();
  const appSecret = String(config.get('bona.appSecret') || '').trim();
  const currency = String(config.get('bona.currency') || DEFAULT_CURRENCY).trim().toUpperCase() || DEFAULT_CURRENCY;
  const homeUrl = String(config.get('bona.homeUrl') || '').trim();
  const lang = String(config.get('bona.lang') || 'en').trim() || 'en';

  return { baseUrl, appId, appSecret, currency, homeUrl, lang };
}

function isBonaConfigured() {
  const { baseUrl, appId, appSecret } = resolveBonaConfig();
  return Boolean(baseUrl && appId && appSecret);
}

function isBonaLaunchConfigured() {
  return isBonaConfigured();
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_CURRENCY,
  resolveBonaConfig,
  isBonaConfigured,
  isBonaLaunchConfigured
};
