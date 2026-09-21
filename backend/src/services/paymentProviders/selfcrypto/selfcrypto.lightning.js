'use strict';

const axios = require('axios');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../../constants/httpTimeouts');
const {
  env,
  btcpayUrl,
  btcpayConfigured,
  lndConfigured
} = require('./selfcrypto.config');
const { usdToCrypto, toBaseUnits, getUsdRates } = require('./selfcrypto.prices');

function btcpayClient() {
  return axios.create({
    baseURL: `${btcpayUrl()}/api/v1`,
    timeout: THIRD_PARTY_HTTP_TIMEOUT_MS,
    headers: {
      Authorization: `token ${env('BTCPAY_API_KEY')}`,
      'Content-Type': 'application/json'
    }
  });
}

function lndClient() {
  const https = require('https');
  const rejectUnauthorized = env('LND_TLS_REJECT_UNAUTHORIZED', 'true') !== 'false';
  return axios.create({
    baseURL: env('LND_REST_URL').replace(/\/+$/, ''),
    timeout: THIRD_PARTY_HTTP_TIMEOUT_MS,
    httpsAgent: new https.Agent({ rejectUnauthorized }),
    headers: {
      'Grpc-Metadata-macaroon': env('LND_MACAROON_HEX'),
      'Content-Type': 'application/json'
    }
  });
}

async function createBtcpayLightningInvoice({ amountUsd, ttlSeconds, metadata }) {
  const storeId = env('BTCPAY_STORE_ID');
  const client = btcpayClient();
  const body = {
    amount: String(Number(amountUsd).toFixed(2)),
    currency: 'USD',
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
    checkout: {
      paymentMethods: ['BTC-LN', 'BTC-LightningNetwork'],
      expirationMinutes: Math.max(2, Math.round(ttlSeconds / 60)),
      lazyPaymentMethods: false
    }
  };
  let created;
  try {
    created = (await client.post(`/stores/${storeId}/invoices`, body)).data;
  } catch (err) {
    delete body.checkout.paymentMethods;
    created = (await client.post(`/stores/${storeId}/invoices`, {
      ...body,
      checkout: { ...body.checkout, paymentMethods: ['BTC-LN'] }
    })).data;
  }
  const invoiceId = created?.id;
  if (!invoiceId) {
    const e = new Error('BTCPay did not return an invoice id');
    e.statusCode = 502;
    throw e;
  }

  let bolt11 = null;
  let targetAmount = null;
  try {
    const pm = (await client.get(`/stores/${storeId}/invoices/${invoiceId}/payment-methods`)).data;
    const list = Array.isArray(pm) ? pm : [];
    const ln = list.find((row) => {
      const id = String(row?.paymentMethodId || row?.paymentMethod || '').toUpperCase();
      return id.includes('LN') || id.includes('LIGHTNING');
    }) || list[0];
    bolt11 = ln?.destination || ln?.paymentLink || ln?.address || null;
    const amt = ln?.due ?? ln?.amount ?? ln?.cryptoAmount;
    if (amt != null && Number.isFinite(Number(amt))) targetAmount = Number(amt);
  } catch (_) {
    bolt11 = created?.checkoutLink || null;
  }

  const expiresAt = created?.expirationTime
    ? new Date(created.expirationTime)
    : new Date(Date.now() + ttlSeconds * 1000);

  return {
    providerPaymentId: String(invoiceId),
    btcpayInvoiceId: String(invoiceId),
    paymentRequest: bolt11,
    address: null,
    targetAmount,
    expiresAt,
    rawResponse: created
  };
}

async function createLndInvoice({ amountUsd, ttlSeconds, memo }) {
  const { cryptoAmount } = await usdToCrypto(amountUsd, 'BTC', 8);
  const sats = Number(toBaseUnits(cryptoAmount, 8));
  if (!(sats > 0)) {
    const err = new Error('Lightning amount too small');
    err.statusCode = 400;
    throw err;
  }
  const client = lndClient();
  let data;
  try {
    data = (await client.post('/v1/invoices', {
      value: String(sats),
      expiry: String(ttlSeconds),
      memo: memo || 'Wallet deposit'
    })).data;
  } catch (err) {
    const detail = err.response?.data?.message
      || err.response?.data?.error
      || (typeof err.response?.data === 'string' ? err.response.data : null)
      || err.message;
    const locked = /wallet locked|encrypted|unlock/i.test(String(detail));
    const wrapped = new Error(
      locked
        ? 'Lightning wallet is locked. Run: docker compose exec lnd lncli unlock'
        : `Lightning node could not create an invoice: ${detail}`
    );
    wrapped.statusCode = locked ? 503 : 502;
    throw wrapped;
  }
  const paymentRequest = data?.payment_request || data?.paymentRequest || null;
  const rHash = data?.r_hash || data?.rHash || null;
  if (!paymentRequest) {
    const err = new Error('LND did not return a payment request');
    err.statusCode = 502;
    throw err;
  }
  return {
    providerPaymentId: rHash ? Buffer.from(rHash, 'base64').toString('hex') : paymentRequest.slice(0, 64),
    lndRHash: rHash,
    paymentRequest,
    address: null,
    targetAmount: cryptoAmount,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    rawResponse: data
  };
}

async function createLightningInvoice(params) {
  if (btcpayConfigured()) return createBtcpayLightningInvoice(params);
  if (lndConfigured()) return createLndInvoice(params);
  const err = new Error('Lightning is not configured. Set BTCPay or LND env vars.');
  err.statusCode = 503;
  throw err;
}

async function getBtcpayInvoice(invoiceId) {
  const storeId = env('BTCPAY_STORE_ID');
  const { data } = await btcpayClient().get(`/stores/${storeId}/invoices/${invoiceId}`);
  return data;
}

async function getLndInvoice(rHashHex) {
  const { data } = await lndClient().get(`/v1/invoice/${rHashHex}`);
  return data;
}

function toSats(value) {
  if (value == null) return 0;
  if (typeof value === 'object') {
    if (value.sat != null) return toSats(value.sat);
    if (value.msat != null) {
      const msat = Number(value.msat);
      return Number.isFinite(msat) ? Math.max(0, Math.floor(msat / 1000)) : 0;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function satsBundle(sats, usdPerBtc) {
  const s = Math.max(0, Math.round(Number(sats) || 0));
  const btc = s / 1e8;
  const usd = Number.isFinite(usdPerBtc) && usdPerBtc > 0
    ? Math.round(btc * usdPerBtc * 100) / 100
    : null;
  return { sats: s, btc, usd };
}

function lndErrorDetail(err) {
  return err.response?.data?.message
    || err.response?.data?.error
    || (typeof err.response?.data === 'string' ? err.response.data : null)
    || err.message
    || 'Lightning node request failed';
}

/**
 * Company LND balances for admin. On-chain + Lightning local (ours) + remote (inbound room).
 */
async function getLndWalletSnapshot() {
  if (!lndConfigured()) {
    return {
      configured: false,
      unlocked: false,
      state: null,
      syncedToChain: null,
      message: 'Lightning is not configured. Set LND_REST_URL and LND_MACAROON_HEX on the API server.'
    };
  }

  const client = lndClient();
  let state = null;
  try {
    state = String((await client.get('/v1/state')).data?.state || '') || null;
  } catch (_) {
    state = null;
  }

  const locked = /LOCKED|NON_EXISTING/i.test(state || '');
  if (locked) {
    return {
      configured: true,
      unlocked: false,
      state,
      syncedToChain: null,
      message: 'Lightning wallet is locked. On the server run: docker compose exec lnd lncli unlock'
    };
  }

  let usdPerBtc = null;
  try {
    const rates = await getUsdRates();
    usdPerBtc = Number(rates?.BTC) || null;
  } catch (_) {
    usdPerBtc = null;
  }

  let info = {};
  let onchain = {};
  let channels = {};
  try {
    const [infoRes, chainRes, chanRes] = await Promise.all([
      client.get('/v1/getinfo'),
      client.get('/v1/balance/blockchain'),
      client.get('/v1/balance/channels')
    ]);
    info = infoRes.data || {};
    onchain = chainRes.data || {};
    channels = chanRes.data || {};
  } catch (err) {
    const detail = lndErrorDetail(err);
    if (/wallet locked|encrypted|unlock/i.test(String(detail))) {
      return {
        configured: true,
        unlocked: false,
        state: state || 'LOCKED',
        syncedToChain: null,
        message: 'Lightning wallet is locked. On the server run: docker compose exec lnd lncli unlock'
      };
    }
    const wrapped = new Error(
      /permission denied/i.test(String(detail))
        ? 'Lightning node refused balance read. Replace LND_MACAROON_HEX with admin.macaroon from lightning/scripts/print-lnd-env.sh, then restart the API.'
        : `Lightning node could not return balances: ${detail}`
    );
    wrapped.statusCode = 502;
    throw wrapped;
  }

  const lightningLocal = toSats(channels.local_balance) || toSats(channels.balance);
  const lightningRemote = toSats(channels.remote_balance);
  const lightningPending = toSats(channels.pending_open_local_balance) || toSats(channels.pending_open_balance);
  const onchainConfirmed = toSats(onchain.confirmed_balance);
  const onchainUnconfirmed = toSats(onchain.unconfirmed_balance);
  const onchainTotal = toSats(onchain.total_balance) || (onchainConfirmed + onchainUnconfirmed);
  const totalSats = lightningLocal + onchainTotal;

  return {
    configured: true,
    unlocked: true,
    state,
    syncedToChain: info.synced_to_chain === true,
    blockHeight: info.block_height != null ? Number(info.block_height) : null,
    numPeers: info.num_peers != null ? Number(info.num_peers) : null,
    alias: info.alias || null,
    usdPerBtc,
    lightning: {
      local: satsBundle(lightningLocal, usdPerBtc),
      inbound: satsBundle(lightningRemote, usdPerBtc),
      pendingOpen: satsBundle(lightningPending, usdPerBtc)
    },
    onchain: {
      confirmed: satsBundle(onchainConfirmed, usdPerBtc),
      unconfirmed: satsBundle(onchainUnconfirmed, usdPerBtc),
      total: satsBundle(onchainTotal, usdPerBtc)
    },
    total: satsBundle(totalSats, usdPerBtc)
  };
}

function mapLightningStatus(raw) {
  const status = String(raw?.status || raw?.state || '').toLowerCase();
  if (status === 'settled' || status === 'paid' || status === 'complete' || status === 'completed' || raw?.settled === true) {
    return 'paid';
  }
  if (status === 'expired' || status === 'invalid') return 'expired';
  if (status === 'processing' || status === 'accepted') return 'confirming';
  return 'pending';
}

module.exports = {
  createLightningInvoice,
  getBtcpayInvoice,
  getLndInvoice,
  getLndWalletSnapshot,
  mapLightningStatus,
  btcpayClient
};
