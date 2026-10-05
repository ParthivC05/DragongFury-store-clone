'use strict';

const { getActiveDepositMethods } = require('./depositMethods.service');
const { createDepositSession } = require('./depositSession.service');
const { getPaymentTypeLabel } = require('../../constants/paymentTypes');
const { PAYMENT_PROVIDER_PLAYER_MESSAGE } = require('../../utils/playerFacingMessage');
const { recordUserError } = require('../userErrors/userErrorLog.service');
const { getDollarpayCredentialsFromRequest } = require('../paymentProviders/dollarpay/dollarpay.credentials');
const { getXxpayCredentialsFromRequest } = require('../paymentProviders/xxpay/xxpay.credentials');

const ALTERNATE = { xxpay: 'dollarpay', dollarpay: 'xxpay' };
const PROVIDER_LABEL = { xxpay: 'xpay', dollarpay: 'dpay' };
/** Player error logs for this switch. Lucky Winners store code is goodwork. */
const LOG_STORE_CODES = new Set([
  'playjuwa',
  'myvepower',
  'goodgdragon',
  'goodg',
  'goodwork',
  'luckywinner',
  'luckywinners'
]);

function collectErrorText(err) {
  const parts = [err?.rawMessage, err?.message];
  for (const value of [err?.raw, err?.response]) {
    if (value == null) continue;
    if (typeof value === 'string') parts.push(value);
    else {
      try {
        parts.push(JSON.stringify(value));
      } catch {
        /* ignore */
      }
    }
  }
  return parts.filter(Boolean).join(' ');
}

function isHighRiskClientError(err) {
  return /high\s*risk\s*client/i.test(collectErrorText(err));
}

function providerLabel(code) {
  return PROVIDER_LABEL[String(code || '').toLowerCase()] || String(code || 'provider');
}

function methodLabel(paymentType) {
  return getPaymentTypeLabel(paymentType) || 'this method';
}

function named(code, paymentType) {
  return `${providerLabel(code)} (${methodLabel(paymentType)})`;
}

function snippet(err) {
  return String(err?.rawMessage || err?.message || '').trim().slice(0, 500);
}

async function alternateIsEnabled(req, paymentType, alternateCode) {
  const storeContext = req.user?.distributorCode && req.user?.storeCode
    ? { distributorCode: req.user.distributorCode, storeCode: req.user.storeCode }
    : null;
  const { paymentTypes } = await getActiveDepositMethods(storeContext);
  const key = String(paymentType || '').trim().toLowerCase();
  const row = (paymentTypes || []).find((item) => item.key === key);
  return Boolean(row?.providers?.some((provider) => provider.providerCode === alternateCode));
}

function paramsForAlternate(req, params, alternateCode) {
  const next = { ...params, providerCode: alternateCode };
  delete next.dollarpayMerchantId;
  delete next.dollarpayApiKey;
  delete next.xxpayMchNo;
  delete next.xxpayApiKey;
  delete next.xxpayBaseUrl;

  const userId = req.user?.userId;
  if (!next.clientIp) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    next.clientIp = forwarded || req.ip || '127.0.0.1';
  }
  if (!next.deviceId) {
    next.deviceId = String(req.headers?.['x-device-id'] || '').trim() || `web-${userId || 'user'}`;
  }
  if (!next.userName) {
    next.userName = String(req.user?.username || req.user?.email || `user${userId || ''}`)
      .trim()
      .slice(0, 64) || `user${userId || 'user'}`;
  }

  if (alternateCode === 'dollarpay') {
    const creds = getDollarpayCredentialsFromRequest(req);
    if (!creds) return null;
    next.dollarpayMerchantId = creds.merchantId;
    next.dollarpayApiKey = creds.apiKey;
    return next;
  }

  const creds = getXxpayCredentialsFromRequest(req);
  if (!creds) return null;
  next.xxpayMchNo = creds.mchNo;
  next.xxpayApiKey = creds.apiKey;
  next.xxpayBaseUrl = creds.baseUrl;
  if (!next.clientId && userId) next.clientId = `user${userId}`;
  return next;
}

function shouldLogSwitch(req) {
  const storeCode = String(req?.user?.storeCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return LOG_STORE_CODES.has(storeCode);
}

function providerCategory(code) {
  const key = String(code || '').toLowerCase();
  if (key === 'xxpay') return 'provider_xxpay';
  if (key === 'dollarpay') return 'provider_dollarpay';
  return 'other';
}

function returnedText(snippet) {
  const text = String(snippet || '').trim();
  return text ? ` Provider returned: ${text}.` : '';
}

function saveProviderLog(req, info) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return recordUserError({
    category: providerCategory(info.provider),
    message: info.message,
    httpStatus: 400,
    errorCode: info.errorCode || 'HIGH_RISK_CLIENT',
    storeCode: req.user?.storeCode,
    userId: req.user?.userId,
    email: req.user?.email,
    username: req.user?.username,
    apiPath: req.originalUrl || req.path,
    httpMethod: req.method,
    ipAddress: forwarded || req.ip,
    userAgent: req.headers?.['user-agent'],
    details: {
      source: 'high-risk-switch',
      paymentMethod: info.paymentType || null,
      provider: info.provider,
      switchedTo: info.switchedTo || null,
      switchedForUserOnly: Boolean(info.switchedForUserOnly),
      continuedOnOtherProvider: Boolean(info.continued),
      shownToUser: info.shownToUser || null,
      providerResponse: info.providerResponse || null
    }
  });
}

function logSwitch(req, info) {
  if (!shouldLogSwitch(req)) return null;
  const from = named(info.fromProvider, info.paymentType);
  const to = info.toProvider ? named(info.toProvider, info.paymentType) : '';
  const firstReturn = returnedText(info.firstSnippet);
  const secondReturn = returnedText(info.secondSnippet);
  const jobs = [];

  if (info.continued) {
    jobs.push(saveProviderLog(req, {
      provider: info.fromProvider,
      paymentType: info.paymentType,
      switchedTo: info.toProvider,
      switchedForUserOnly: true,
      continued: true,
      providerResponse: info.firstSnippet,
      message: `${from} got a High Risk Client error.${firstReturn} Switched to ${to} for this user only. The user continued on ${to}.`
    }));
  } else if (info.triedAlternate && info.alternateHighRisk) {
    jobs.push(saveProviderLog(req, {
      provider: info.fromProvider,
      paymentType: info.paymentType,
      switchedTo: info.toProvider,
      switchedForUserOnly: true,
      providerResponse: info.firstSnippet,
      message: `${from} got a High Risk Client error.${firstReturn} Switched to ${to} for this user only.`
    }));
    jobs.push(saveProviderLog(req, {
      provider: info.toProvider,
      paymentType: info.paymentType,
      switchedTo: info.toProvider,
      switchedForUserOnly: true,
      shownToUser: PAYMENT_PROVIDER_PLAYER_MESSAGE,
      providerResponse: info.secondSnippet,
      message: `${to} got a High Risk Client error.${secondReturn} Switched from ${from} for this user only. Shown to the user: ${PAYMENT_PROVIDER_PLAYER_MESSAGE}`
    }));
  } else if (!info.triedAlternate) {
    const why = info.skipReason === 'not-enabled'
      ? `${providerLabel(info.toProvider)} is not enabled for ${methodLabel(info.paymentType)}`
      : `${providerLabel(info.toProvider)} credentials are not set`;
    jobs.push(saveProviderLog(req, {
      provider: info.fromProvider,
      paymentType: info.paymentType,
      switchedTo: info.toProvider,
      shownToUser: PAYMENT_PROVIDER_PLAYER_MESSAGE,
      providerResponse: info.firstSnippet,
      message: `${from} got a High Risk Client error.${firstReturn} Did not switch (${why}). Shown to the user: ${PAYMENT_PROVIDER_PLAYER_MESSAGE}`
    }));
  } else {
    jobs.push(saveProviderLog(req, {
      provider: info.fromProvider,
      paymentType: info.paymentType,
      switchedTo: info.toProvider,
      switchedForUserOnly: true,
      providerResponse: info.firstSnippet,
      message: `${from} got a High Risk Client error.${firstReturn} Switched to ${to} for this user only.`
    }));
    jobs.push(saveProviderLog(req, {
      provider: info.toProvider,
      paymentType: info.paymentType,
      switchedTo: info.toProvider,
      switchedForUserOnly: true,
      errorCode: 'PAYMENT_PROVIDER_ERROR',
      providerResponse: info.secondSnippet,
      message: `${to} failed for a different reason.${secondReturn} Switched from ${from} for this user only.`
    }));
  }

  return Promise.all(jobs);
}

/**
 * If xpay or dpay rejects this deposit as a High Risk Client, try the other
 * provider for this user only when that provider is enabled for the same method.
 * The store's admin selection is left unchanged.
 */
async function createDepositSessionWithHighRiskSwitch(req, userId, params) {
  try {
    return await createDepositSession(userId, params);
  } catch (err) {
    const from = String(params?.providerCode || '').toLowerCase();
    const alternate = ALTERNATE[from];
    if (!alternate || !isHighRiskClientError(err)) throw err;

    const paymentType = params.paymentType;
    const enabled = await alternateIsEnabled(req, paymentType, alternate);
    if (!enabled) {
      await logSwitch(req, {
        paymentType,
        fromProvider: from,
        toProvider: alternate,
        triedAlternate: false,
        skipReason: 'not-enabled',
        firstSnippet: snippet(err)
      });
      err.highRiskLogged = true;
      throw err;
    }

    const altParams = paramsForAlternate(req, params, alternate);
    if (!altParams) {
      await logSwitch(req, {
        paymentType,
        fromProvider: from,
        toProvider: alternate,
        triedAlternate: false,
        skipReason: 'no-credentials',
        firstSnippet: snippet(err)
      });
      err.highRiskLogged = true;
      throw err;
    }

    try {
      const payload = await createDepositSession(userId, altParams);
      await logSwitch(req, {
        paymentType,
        fromProvider: from,
        toProvider: alternate,
        triedAlternate: true,
        continued: true,
        firstSnippet: snippet(err)
      });
      return payload;
    } catch (err2) {
      const alternateHighRisk = isHighRiskClientError(err2);
      await logSwitch(req, {
        paymentType,
        fromProvider: from,
        toProvider: alternate,
        triedAlternate: true,
        alternateHighRisk,
        continued: false,
        firstSnippet: snippet(err),
        secondSnippet: snippet(err2)
      });
      if (alternateHighRisk) {
        err2.highRiskLogged = true;
        if (!err2.code) err2.code = 'PAYMENT_PROVIDER_ERROR';
        throw err2;
      }
      throw err2;
    }
  }
}

module.exports = {
  createDepositSessionWithHighRiskSwitch,
  isHighRiskClientError
};
