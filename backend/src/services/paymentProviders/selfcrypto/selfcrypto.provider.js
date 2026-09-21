'use strict';

const crypto = require('crypto');
const {
  PROVIDER_CODE,
  isConfigured,
  hasMnemonic,
  lightningConfigured,
  invoiceTtlSeconds,
  resolveRail
} = require('./selfcrypto.config');
const { usdToCrypto } = require('./selfcrypto.prices');
const { nextAddress } = require('./selfcrypto.addresses');
const { createLightningInvoice } = require('./selfcrypto.lightning');
const { checkPending } = require('./selfcrypto.watchers');

function formatUriAmount(amount, decimals) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  const places = Number.isFinite(decimals) ? Math.max(0, Math.min(18, decimals)) : 8;
  return n.toFixed(places).replace(/\.?0+$/, '');
}

function paymentUri({ scheme, address, amount, decimals }) {
  if (!address) return null;
  const formatted = formatUriAmount(amount, decimals);
  if (scheme === 'bitcoin' && formatted) return `bitcoin:${address}?amount=${formatted}`;
  return address;
}

function create() {
  const impl = {
    name: PROVIDER_CODE,

    async createPayment(params) {
      if (!isConfigured()) {
        const err = new Error('Direct crypto is not configured on this server.');
        err.statusCode = 503;
        throw err;
      }

      const amount = Number(params?.amount);
      const currency = (params?.currency && typeof params.currency === 'string')
        ? params.currency.trim().slice(0, 16)
        : 'USD';
      const rail = resolveRail(params?.targetCurrency, params?.paymentMethod);
      if (!rail) {
        const err = new Error('Unsupported crypto network. Choose Bitcoin, Lightning, Ethereum, Tron, or Solana.');
        err.statusCode = 400;
        throw err;
      }

      const ttl = invoiceTtlSeconds();
      const expiresAt = new Date(Date.now() + ttl * 1000);
      const invoiceId = `scd_${crypto.randomUUID().replace(/-/g, '')}`;
      const metadata = params?.metadata && typeof params.metadata === 'object' ? params.metadata : {};

      if (rail.paymentMethod === 'lightning') {
        if (!lightningConfigured()) {
          const err = new Error('Lightning is not configured. Set BTCPay or LND credentials.');
          err.statusCode = 503;
          throw err;
        }
        const ln = await createLightningInvoice({
          amountUsd: amount,
          ttlSeconds: ttl,
          metadata: { ...metadata, invoiceId },
          memo: `Deposit ${invoiceId}`
        });
        const paymentRequest = ln.paymentRequest || null;
        return {
          providerPaymentId: invoiceId,
          status: 'pending',
          amount,
          currency,
          targetCurrency: 'BTC',
          targetAmount: ln.targetAmount ?? null,
          paymentMethod: 'lightning',
          address: null,
          paymentRequest,
          expiresAt: ln.expiresAt || expiresAt,
          ttl,
          qrPayload: paymentRequest,
          rawResponse: ln.rawResponse || ln,
          extraMetadata: {
            btcpayInvoiceId: ln.btcpayInvoiceId || null,
            lndRHash: ln.lndRHash || null,
            lndRHashHex: ln.providerPaymentId && String(ln.providerPaymentId).length === 64
              ? ln.providerPaymentId
              : null,
            lightningProviderId: ln.providerPaymentId || null
          }
        };
      }

      if (!hasMnemonic()) {
        const err = new Error('Direct crypto wallets are not configured (missing SELFCRYPTO_MNEMONIC).');
        err.statusCode = 503;
        throw err;
      }

      const decimals = rail.displayDecimals != null ? rail.displayDecimals : Math.min(rail.decimals, 8);
      const quoted = await usdToCrypto(amount, rail.code, decimals);
      const { address, derivationIndex } = await nextAddress(rail.hdChain);
      const uri = paymentUri({
        scheme: rail.uriScheme,
        address,
        amount: quoted.cryptoAmount,
        decimals
      });

      return {
        providerPaymentId: invoiceId,
        status: 'pending',
        amount,
        currency,
        targetCurrency: rail.code,
        targetAmount: quoted.cryptoAmount,
        paymentMethod: rail.paymentMethod,
        address,
        paymentRequest: null,
        expiresAt,
        ttl,
        qrPayload: uri || address,
        rawResponse: {
          usdRate: quoted.usdRate,
          derivationIndex,
          chain: rail.hdChain
        },
        extraMetadata: {
          derivationIndex,
          chain: rail.hdChain,
          usdRate: quoted.usdRate
        }
      };
    },

    async getPaymentStatus({ transactionId, pending }) {
      const row = pending;
      if (!row) return { status: 'pending' };
      const result = await checkPending(row);
      if (result.paid) return { status: 'paid', txHash: result.txHash };
      if (result.expired) return { status: 'expired' };
      if (result.confirming) return { status: 'confirming', txHash: result.txHash };
      return { status: 'pending' };
    },

    async createDepositLink(params) {
      const result = await impl.createPayment(params);
      return {
        paymentUrl: result.qrPayload || result.address || result.paymentRequest || null,
        providerSessionId: result.providerPaymentId,
        ...result
      };
    }
  };
  return impl;
}

module.exports = { create, PROVIDER_CODE };
