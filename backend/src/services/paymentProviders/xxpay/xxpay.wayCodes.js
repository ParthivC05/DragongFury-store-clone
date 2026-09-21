'use strict';

/** Map platform payment type → XXPay wayCode (pay-in). */
const DEPOSIT_WAY_CODE = {
  card: 'card',
  credit_card: 'card',
  debit_card: 'card',
  // Vendor: use ecashapp (Cash App Personal) for pay-in when cashapp channel is unavailable
  cashapp: 'ecashapp',
  chime: 'chime',
  apple_pay: 'applepay',
  google_pay: 'googlepay',
  paypal: 'paypal',
  zelle: 'zelle'
};

/** Map platform payout type → XXPay wayCode (transfer). */
const PAYOUT_WAY_CODE = {
  cashapp: 'ecashapp',
  chime: 'chime',
  paypal: 'paypal',
  venmo: 'venmo',
  zelle: 'zelle',
  card: 'card',
  bank_transfer: 'ach'
};

function dollarsToCents(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/**
 * Build wayParam for pay-in (JSON object, not string).
 */
function buildDepositWayParam(paymentType, { clientId, deviceId } = {}) {
  const wayCode = DEPOSIT_WAY_CODE[(paymentType || '').toLowerCase()];
  if (!wayCode) return null;
  const needsClient =
    wayCode === 'cashapp' ||
    wayCode === 'ecashapp' || // Cash App Personal pay-in also requires clientId
    wayCode === 'zelle' ||
    wayCode === 'paypal' ||
    wayCode === 'applepay' ||
    wayCode === 'googlepay' ||
    wayCode === 'chime' ||
    wayCode === 'card';
  if (!needsClient) return {};
  const param = { clientId: String(clientId || 'web').slice(0, 64) };
  if (deviceId) param.deviceId = String(deviceId).slice(0, 200);
  return param;
}

/**
 * Build wayParam for payout from destination fields.
 * @param {string} payoutType
 * @param {string} destinationUsername
 * @param {object} [meta]
 */
function normalizeCashtag(destinationUsername) {
  const raw = String(destinationUsername || '').trim();
  const withoutDollar = raw.replace(/^\$+/, '').trim();
  return withoutDollar ? `$${withoutDollar}` : '';
}

/**
 * XXPay Cash Tag UI: must start with `$` (e.g. $abc123). No documented length/charset.
 * We normalize to `$` + body; further rejection is left to XXPay.
 * Chime: `$` + 4–50 chars.
 */
function assertXxpayPayoutDestination(payoutType, destinationUsername) {
  const type = String(payoutType || '').toLowerCase();
  const dest = String(destinationUsername || '').trim();
  if (!dest) {
    const err = new Error('Destination is required.');
    err.statusCode = 400;
    throw err;
  }

  if (type === 'cashapp') {
    const body = dest.replace(/^\$+/, '').trim();
    if (!body) {
      const err = new Error(
        'Cash App cashtag required, starting with $. Example: $abc123'
      );
      err.statusCode = 400;
      throw err;
    }
  }

  if (type === 'chime') {
    const body = dest.replace(/^\$+/, '').trim();
    if (body.length < 4 || body.length > 50) {
      const err = new Error(
        'Chime sign must be 4–50 characters after $ (XXPay limit). Example: $YourChime'
      );
      err.statusCode = 400;
      throw err;
    }
  }
}

function buildPayoutWayParam(payoutType, destinationUsername, meta = {}) {
  const type = String(payoutType || '').toLowerCase();
  const dest = String(destinationUsername || '').trim();
  const m = meta && typeof meta === 'object' ? meta : {};

  if (type === 'cashapp') {
    assertXxpayPayoutDestination(type, dest);
    return { cashtag: normalizeCashtag(dest) };
  }
  if (type === 'chime') {
    assertXxpayPayoutDestination(type, dest);
    return { chimeSign: normalizeCashtag(dest) };
  }
  if (type === 'paypal' || type === 'venmo') {
    return { email: dest };
  }
  if (type === 'zelle') {
    return { zelleSign: dest };
  }
  if (type === 'card') {
    return {
      cardNumber: String(m.cardNumber || dest).trim(),
      cardValid: String(m.cardValid || '').trim()
    };
  }
  if (type === 'bank_transfer') {
    return {
      accountNumber: String(m.accountNumber || dest).trim(),
      routingNumber: String(m.routingNumber || '').trim()
    };
  }
  return null;
}

module.exports = {
  DEPOSIT_WAY_CODE,
  PAYOUT_WAY_CODE,
  dollarsToCents,
  buildDepositWayParam,
  buildPayoutWayParam,
  assertXxpayPayoutDestination,
  normalizeCashtag
};
