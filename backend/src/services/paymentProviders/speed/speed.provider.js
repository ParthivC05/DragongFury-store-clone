'use strict';

const axios = require('axios');
const { paymentLog, paymentErrorLog } = require('../../../libs/logger');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../../constants/httpTimeouts');

const SPEED_API_BASE = (process.env.SPEED_API_BASE_URL || 'https://api.tryspeed.com').replace(/\/+$/, '');
const SPEED_VERSION = process.env.SPEED_API_VERSION || '2022-10-15';

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  'speed-version': '2022-10-15'
};

/**
 * Speed payment provider (crypto). Uses POST /payments for in-app deposit flow; optional legacy checkout-sessions.
 * No Tron — USDT supports lightning, ethereum, solana only.
 */
function create(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Speed provider requires SPEED_API_KEY');
  }

  const authHeader = Buffer.from(`${apiKey.trim()}:`).toString('base64');
  const headers = {
    Authorization: `Basic ${authHeader}`,
    ...DEFAULT_HEADERS,
    'speed-version': process.env.SPEED_API_VERSION || SPEED_VERSION
  };

  return {
    name: 'speed',

    /**
     * Create a payment via Speed POST /payments. For in-app deposit UI (no redirect).
     * @param {object} params - { currency, amount, targetCurrency (SATS|USDT|USDC), paymentMethod (onchain|lightning|ethereum|solana), metadata? }
     * @returns {Promise<{ providerPaymentId, status, amount, currency, targetCurrency, targetAmount, paymentMethod, address?, paymentRequest?, expiresAt, ttl, rawResponse }>}
     */
    async createPayment(params) {
      const currency = (params?.currency && typeof params.currency === 'string')
        ? params.currency.trim().slice(0, 16)
        : 'USD';
      const amount = params?.amount != null ? Number(params.amount) : NaN;
      const targetCurrency = (params?.targetCurrency && typeof params.targetCurrency === 'string')
        ? params.targetCurrency.trim().toUpperCase().slice(0, 8)
        : '';
      const paymentMethod = (params?.paymentMethod && typeof params.paymentMethod === 'string')
        ? params.paymentMethod.trim().toLowerCase().slice(0, 32)
        : '';
      const metadata = params?.metadata && typeof params.metadata === 'object' ? params.metadata : {};

      if (!Number.isFinite(amount) || amount <= 0) {
        const err = new Error('Speed createPayment: valid amount is required');
        err.statusCode = 400;
        throw err;
      }
      if (!['SATS', 'USDT', 'USDC'].includes(targetCurrency)) {
        const err = new Error('Speed createPayment: targetCurrency must be SATS, USDT, or USDC');
        err.statusCode = 400;
        throw err;
      }
      const allowedMethods = {
        SATS: ['onchain', 'lightning'],
        USDT: ['lightning', 'ethereum', 'solana'],
        USDC: ['lightning', 'ethereum', 'solana']
      };
      if (!allowedMethods[targetCurrency]?.includes(paymentMethod)) {
        const err = new Error(`Speed createPayment: invalid paymentMethod for ${targetCurrency}`);
        err.statusCode = 400;
        throw err;
      }

      const body = {
        currency,
        amount: Number(amount),
        target_currency: targetCurrency,
        payment_methods: [paymentMethod],
        metadata: { ...metadata }
      };

      paymentLog('Speed createPayment request', { amount: body.amount, currency: body.currency, target_currency: targetCurrency, payment_methods: body.payment_methods });

      let res;
      try {
        res = await axios.post(`${SPEED_API_BASE}/payments`, body, {
          headers,
          timeout: THIRD_PARTY_HTTP_TIMEOUT_MS
        });
      } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Speed API request failed';
        paymentErrorLog('Speed createPayment failed', msg, err.response?.status);
        const e = new Error(msg);
        e.statusCode = err.response?.status || 502;
        throw e;
      }

      const data = res.data || {};
      const providerPaymentId = data.id || data.payment_id || null;
      const status = (data.status || '').toLowerCase();
      const targetAmount = data.target_amount != null ? Number(data.target_amount) : null;
      const ttl = data.ttl != null ? parseInt(data.ttl, 10) : null;
      let expiresAt = data.expires_at != null ? data.expires_at : (data.expiresAt != null ? data.expiresAt : null);
      if (ttl != null && !expiresAt && data.created) {
        const created = new Date(data.created).getTime();
        expiresAt = new Date(created + ttl * 1000).toISOString();
      }

      const options = data.payment_method_options || {};
      let address = null;
      let paymentRequest = null;
      if (paymentMethod === 'lightning') {
        paymentRequest = (options.lightning && options.lightning.payment_request) || options.lightning?.payment_request || null;
        if (paymentRequest && typeof paymentRequest !== 'string') paymentRequest = null;
      } else if (paymentMethod === 'onchain' && (options.onchain || options.on_chain)) {
        const onchainOpts = options.onchain || options.on_chain;
        address = onchainOpts.address || onchainOpts?.address || null;
        if (address && typeof address !== 'string') address = null;
      } else if (paymentMethod === 'ethereum' && options.ethereum) {
        address = options.ethereum.address || options.ethereum?.address || null;
        if (address && typeof address !== 'string') address = null;
      } else if (paymentMethod === 'solana' && options.solana) {
        address = options.solana.address || options.solana?.address || null;
        if (address && typeof address !== 'string') address = null;
      }
      if (address) address = String(address).trim();
      if (paymentRequest) paymentRequest = String(paymentRequest).trim();

      if (!providerPaymentId) {
        paymentErrorLog('Speed createPayment: no payment id in response', data);
        const err = new Error('Speed did not return a payment id');
        err.statusCode = 502;
        throw err;
      }

      paymentLog('Speed createPayment success', { providerPaymentId, targetCurrency, paymentMethod, hasAddress: !!address, hasPaymentRequest: !!paymentRequest });

      return {
        providerPaymentId: String(providerPaymentId),
        status: status || 'pending',
        amount: Number(data.amount) || amount,
        currency: data.currency || currency,
        targetCurrency: data.target_currency || targetCurrency,
        targetAmount,
        paymentMethod,
        address: address || undefined,
        paymentRequest: paymentRequest || undefined,
        expiresAt: expiresAt || undefined,
        ttl: Number.isInteger(ttl) ? ttl : undefined,
        rawResponse: data
      };
    },

    /**
     * Get payment status via Speed GET /payments/:id (not checkout-sessions).
     * @param {object} params - { transactionId | paymentId } = Speed payment id
     * @returns {Promise<{ status: 'success'|'pending'|'expired'|'failed', amount?: number }>}
     */
    async getPaymentStatus(params) {
      const id = params?.transactionId || params?.paymentId || params?.sessionId;
      if (!id) {
        const err = new Error('transactionId or paymentId required');
        err.statusCode = 400;
        throw err;
      }
      try {
        const res = await axios.get(`${SPEED_API_BASE}/payments/${encodeURIComponent(id)}`, {
          headers,
          timeout: THIRD_PARTY_HTTP_TIMEOUT_MS
        });
        const d = res.data || {};
        const s = (d.status || d.payment_status || '').toLowerCase();
        const amount = d.amount != null ? Number(d.amount) : NaN;
        let status = 'pending';
        if (s === 'paid' || s === 'completed' || s === 'success') status = 'success';
        else if (s === 'expired') status = 'expired';
        else if (s === 'failed' || s === 'cancelled') status = 'failed';
        return {
          status,
          amount: Number.isFinite(amount) ? amount : 0
        };
      } catch (err) {
        paymentErrorLog('Speed getPaymentStatus failed', id, err.message);
        const e = new Error(err.response?.data?.message || err.message || 'Speed status check failed');
        e.statusCode = err.response?.status || 502;
        throw e;
      }
    },

    /**
     * Create a deposit (checkout) session. Legacy; use createPayment() for in-app flow.
     * @param {object} params - { userId, amount, currency, metadata? }
     * @returns {Promise<{ paymentUrl: string, providerSessionId: string }>}
     */
    async createDepositLink(params) {
      const userId = params?.userId;
      const amount = params?.amount != null ? Number(params.amount) : NaN;
      const currency = (params?.currency && typeof params.currency === 'string')
        ? params.currency.trim().slice(0, 16)
        : 'USD';

      if (!Number.isFinite(amount) || amount <= 0) {
        const err = new Error('Speed createDepositLink: valid amount is required');
        err.statusCode = 400;
        throw err;
      }

      const body = {
        currency,
        amount: Number(amount),
        title: params?.title || 'Wallet Deposit',
        metadata: {
          userId: userId != null ? String(userId) : undefined,
          ...(params?.metadata || {})
        }
      };

      paymentLog('Speed createDepositLink request', { amount: body.amount, currency: body.currency, userId });

      let res;
      try {
        res = await axios.post(`${SPEED_API_BASE}/checkout-sessions`, body, {
          headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/json',
            'speed-version': SPEED_VERSION
          },
          timeout: THIRD_PARTY_HTTP_TIMEOUT_MS
        });
      } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Speed API request failed';
        paymentErrorLog('Speed createDepositLink failed', msg, err.response?.status);
        const e = new Error(msg);
        e.statusCode = err.response?.status || 502;
        throw e;
      }

      const data = res.data || {};
      const paymentUrl = data.url || data.payment_url || data.checkout_url;
      const providerSessionId = data.id || data.session_id || data.checkout_session_id;
      const qrCodeUrl = data.qr_code_url || data.qr_code || data.qrCodeUrl || null;
      const walletAddress = data.wallet_address || data.walletAddress || data.address || null;
      const paymentUri = data.payment_uri || data.paymentUri || data.uri || null;
      const expiresAt = data.expires_at != null ? data.expires_at : (data.expiresAt != null ? data.expiresAt : null);
      const metadata = data.metadata ? { ...data.metadata } : undefined;

      if (!paymentUrl || typeof paymentUrl !== 'string') {
        paymentErrorLog('Speed createDepositLink: no payment URL in response', data);
        const err = new Error('Speed did not return a payment URL');
        err.statusCode = 502;
        throw err;
      }

      paymentLog('Speed createDepositLink success', { providerSessionId, hasUrl: true, hasQr: !!qrCodeUrl });

      return {
        paymentUrl,
        providerSessionId: providerSessionId != null ? String(providerSessionId) : paymentUrl,
        ...(qrCodeUrl && typeof qrCodeUrl === 'string' && { qrCodeUrl: qrCodeUrl.trim() }),
        ...(walletAddress && typeof walletAddress === 'string' && { walletAddress: walletAddress.trim() }),
        ...(paymentUri && typeof paymentUri === 'string' && { paymentUri: paymentUri.trim() }),
        ...(expiresAt != null && { expiresAt }),
        ...(metadata && { metadata })
      };
    },

    /**
     * Get deposit status by Speed payment id. Uses GET /payments/:id (not checkout-sessions).
     * For polling when using createPayment() flow. Maps to success | pending | expired | failed.
     */
    async getDepositStatus(params) {
      return this.getPaymentStatus(params);
    },

    /**
     * Create a withdraw request via Speed POST /withdraw-requests.
     * Used for one-time withdrawal flow (e.g. LNURL); user amount is sent as both min_amount and max_amount.
     * @param {object} params - { amount, currency, ttl? } (amount used for both min and max)
     * @returns {Promise<{ id, status, type, currency, minAmount, maxAmount, targetCurrency, exchangeRate, ttl, expiresAt, targetMinAmount, targetMaxAmount, withdrawRequest, qrValue, rawResponse }>}
     */
    async createWithdrawRequest(params) {
      const amount = params?.amount != null ? Number(params.amount) : NaN;
      const currency = (params?.currency && typeof params.currency === 'string')
        ? params.currency.trim().toUpperCase().slice(0, 8)
        : '';
      const ttl = params?.ttl != null ? parseInt(params.ttl, 10) : null;

      if (!Number.isFinite(amount) || amount <= 0) {
        const err = new Error('Speed createWithdrawRequest: amount is required and must be a positive number');
        err.statusCode = 400;
        throw err;
      }
      if (!currency) {
        const err = new Error('Speed createWithdrawRequest: currency is required (e.g. USD, SATS, BTC)');
        err.statusCode = 400;
        throw err;
      }
      const TTL_MIN = 300;
      const TTL_MAX = 31536000;
      if (ttl != null && (Number.isNaN(ttl) || ttl < TTL_MIN || ttl > TTL_MAX)) {
        const err = new Error(`Speed createWithdrawRequest: ttl must be between ${TTL_MIN} and ${TTL_MAX} seconds`);
        err.statusCode = 400;
        throw err;
      }

      const body = {
        min_amount: amount,
        max_amount: amount,
        currency
      };
      if (ttl != null) body.ttl = ttl;

      paymentLog('Speed createWithdrawRequest', { amount, currency, ttl: body.ttl });

      let res;
      try {
        res = await axios.post(`${SPEED_API_BASE}/withdraw-requests`, body, {
          headers,
          timeout: THIRD_PARTY_HTTP_TIMEOUT_MS
        });
      } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Speed withdraw-request API failed';
        paymentErrorLog('Speed createWithdrawRequest failed', msg, err.response?.status);
        const e = new Error(msg);
        e.statusCode = err.response?.status || 502;
        throw e;
      }

      const data = res.data || {};
      const id = data.id || null;
      const status = (data.status || '').toLowerCase();
      const type = data.type || null;
      const targetCurrency = data.target_currency || data.targetCurrency || null;
      const exchangeRate = data.exchange_rate != null ? Number(data.exchange_rate) : data.exchangeRate != null ? Number(data.exchangeRate) : null;
      const ttlResp = data.ttl != null ? parseInt(data.ttl, 10) : null;
      let expiresAt = data.expires_at != null ? data.expires_at : (data.expiresAt != null ? data.expiresAt : null);
      if (expiresAt != null && typeof expiresAt === 'number' && expiresAt > 1e12) {
        expiresAt = new Date(expiresAt).toISOString();
      }
      const withdrawRequestValue = data.withdraw_request ?? null;

      if (!id) {
        paymentErrorLog('Speed createWithdrawRequest: no id in response', Object.keys(data));
        const err = new Error('Speed did not return a withdraw request id');
        err.statusCode = 502;
        throw err;
      }

      paymentLog('Speed createWithdrawRequest success', { id, status, currency });

      return {
        id: String(id),
        status,
        type,
        currency: data.currency || currency,
        minAmount: data.min_amount != null ? Number(data.min_amount) : amount,
        maxAmount: data.max_amount != null ? Number(data.max_amount) : amount,
        targetCurrency,
        exchangeRate,
        ttl: ttlResp,
        expiresAt,
        targetMinAmount: data.target_min_amount != null ? Number(data.target_min_amount) : null,
        targetMaxAmount: data.target_max_amount != null ? Number(data.target_max_amount) : null,
        withdrawRequest: withdrawRequestValue,
        qrValue: withdrawRequestValue,
        rawResponse: data
      };
    },

    /**
     * Optional: create withdrawal (payout). Use when approving a withdrawal request with method 'scrypto'.
     */
    async createWithdrawal(params) {
      const amount = params?.amount != null ? Number(params.amount) : NaN;
      const currency = (params?.currency || 'USD').toString().trim().slice(0, 16);
      const address = params?.address || params?.cryptoAddress;
      if (!Number.isFinite(amount) || amount <= 0 || !address) {
        const err = new Error('Speed createWithdrawal: amount and address are required');
        err.statusCode = 400;
        throw err;
      }
      try {
        const res = await axios.post(
          `${SPEED_API_BASE}/payouts`,
          { amount: Number(amount), currency, address },
          {
            headers: {
              Authorization: `Basic ${authHeader}`,
              'Content-Type': 'application/json',
              'speed-version': SPEED_VERSION
            },
            timeout: THIRD_PARTY_HTTP_TIMEOUT_MS
          }
        );
        return res.data;
      } catch (err) {
        paymentErrorLog('Speed createWithdrawal failed', err.message);
        const e = new Error(err.response?.data?.message || err.message || 'Speed payout failed');
        e.statusCode = err.response?.status || 502;
        throw e;
      }
    }
  };
}

module.exports = { create };
