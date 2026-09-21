'use strict';

/** Self-hosted Direct Crypto. Hidden on deposit until SELFCRYPTO_MNEMONIC (or BTCPay/LND) is set. */

const PROVIDER_CODE = 'selfcrypto';

const CHAINS = {
  BTC: {
    code: 'BTC',
    paymentMethod: 'onchain',
    hdChain: 'btc',
    decimals: 8,
    minConfirmations: 1,
    uriScheme: 'bitcoin',
    networkLabel: 'Bitcoin (on-chain)'
  },
  ETH: {
    code: 'ETH',
    paymentMethod: 'ethereum',
    hdChain: 'eth',
    decimals: 18,
    displayDecimals: 8,
    minConfirmations: 3,
    uriScheme: 'ethereum',
    networkLabel: 'Ethereum'
  },
  TRX: {
    code: 'TRX',
    paymentMethod: 'tron',
    hdChain: 'trx',
    decimals: 6,
    minConfirmations: 19,
    uriScheme: 'tron',
    networkLabel: 'Tron'
  },
  SOL: {
    code: 'SOL',
    paymentMethod: 'solana',
    hdChain: 'sol',
    decimals: 9,
    minConfirmations: 1,
    uriScheme: 'solana',
    networkLabel: 'Solana'
  }
};

const LIGHTNING = {
  code: 'BTC',
  paymentMethod: 'lightning',
  networkLabel: 'Lightning'
};

function env(name, fallback = '') {
  const v = process.env[name];
  return v == null ? fallback : String(v).trim();
}

function mnemonic() {
  return env('SELFCRYPTO_MNEMONIC');
}

function hasMnemonic() {
  return mnemonic().split(/\s+/).filter(Boolean).length >= 12;
}

function btcpayUrl() {
  return env('BTCPAY_URL').replace(/\/+$/, '');
}

function btcpayConfigured() {
  return !!(btcpayUrl() && env('BTCPAY_API_KEY') && env('BTCPAY_STORE_ID'));
}

function lndConfigured() {
  return !!(env('LND_REST_URL') && env('LND_MACAROON_HEX'));
}

function lightningConfigured() {
  return btcpayConfigured() || lndConfigured();
}

function isConfigured() {
  return hasMnemonic() || lightningConfigured();
}

function paymentMethodsByTargetCurrency() {
  const map = {};
  if (hasMnemonic()) {
    map.BTC = lightningConfigured() ? ['onchain', 'lightning'] : ['onchain'];
    map.ETH = ['ethereum'];
    map.TRX = ['tron'];
    map.SOL = ['solana'];
  } else if (lightningConfigured()) {
    map.BTC = ['lightning'];
  }
  return map;
}

function targetCurrencies() {
  return Object.keys(paymentMethodsByTargetCurrency());
}

function invoiceTtlSeconds() {
  const n = parseInt(env('SELFCRYPTO_INVOICE_TTL_SECONDS', '1200'), 10);
  return Number.isFinite(n) && n >= 120 ? n : 1200;
}

function btcApiBase() {
  return env('SELFCRYPTO_BTC_API_URL', 'https://mempool.space/api').replace(/\/+$/, '');
}

function ethRpcUrl() {
  return env('SELFCRYPTO_ETH_RPC_URL');
}

function ethExplorerApi() {
  return env('SELFCRYPTO_ETH_EXPLORER_URL', 'https://eth.blockscout.com/api/v2').replace(/\/+$/, '');
}

function tronApiBase() {
  return env('SELFCRYPTO_TRON_API_URL', 'https://api.trongrid.io').replace(/\/+$/, '');
}

function solRpcUrl() {
  return env('SELFCRYPTO_SOL_RPC_URL', 'https://api.mainnet-beta.solana.com').replace(/\/+$/, '');
}

function resolveRail(targetCurrency, paymentMethod) {
  const tc = String(targetCurrency || '').trim().toUpperCase();
  const pm = String(paymentMethod || '').trim().toLowerCase();
  const allowed = paymentMethodsByTargetCurrency();
  if (!allowed[tc] || !allowed[tc].includes(pm)) return null;
  if (pm === 'lightning') return { ...LIGHTNING, targetCurrency: 'BTC', paymentMethod: 'lightning' };
  const chain = CHAINS[tc];
  if (!chain) return null;
  return { ...chain, targetCurrency: tc, paymentMethod: pm };
}

function networkLabelFor(paymentMethod, targetCurrency) {
  const rail = resolveRail(targetCurrency, paymentMethod);
  if (rail?.networkLabel) return rail.networkLabel;
  const pm = String(paymentMethod || '').toLowerCase();
  if (pm === 'onchain') return 'Bitcoin (on-chain)';
  if (pm === 'lightning') return 'Lightning';
  if (pm === 'ethereum') return 'Ethereum';
  if (pm === 'tron') return 'Tron';
  if (pm === 'solana') return 'Solana';
  return pm || 'Crypto';
}

module.exports = {
  PROVIDER_CODE,
  CHAINS,
  LIGHTNING,
  env,
  mnemonic,
  hasMnemonic,
  btcpayUrl,
  btcpayConfigured,
  lndConfigured,
  lightningConfigured,
  isConfigured,
  paymentMethodsByTargetCurrency,
  targetCurrencies,
  invoiceTtlSeconds,
  btcApiBase,
  ethRpcUrl,
  ethExplorerApi,
  tronApiBase,
  solRpcUrl,
  resolveRail,
  networkLabelFor
};
