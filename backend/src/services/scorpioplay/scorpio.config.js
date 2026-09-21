'use strict';

const config = require('../../configs/app.config');

function resolveScorpioConfig() {
  const apiToken = String(config.get('scorpio.apiToken') || '').trim();
  const apiBaseUrl = String(config.get('scorpio.apiBaseUrl') || '').trim().replace(/\/+$/, '');
  const currency = String(config.get('scorpio.currency') || 'USD').trim().toUpperCase() || 'USD';
  const lang = String(config.get('scorpio.lang') || 'en').trim() || 'en';
  const rtpRaw = Number(config.get('scorpio.rtp'));
  const rtp = Number.isFinite(rtpRaw) ? rtpRaw : 0;
  return { apiToken, apiBaseUrl, currency, lang, rtp };
}

function isScorpioConfigured() {
  const cfg = resolveScorpioConfig();
  return Boolean(cfg.apiToken && cfg.apiBaseUrl);
}

function buildPlayerExternalId(userId) {
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return '';
  return String(id);
}

module.exports = {
  resolveScorpioConfig,
  isScorpioConfigured,
  buildPlayerExternalId
};
