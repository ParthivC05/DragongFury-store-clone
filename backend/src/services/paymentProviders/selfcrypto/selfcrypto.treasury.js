'use strict';

const { Op } = require('sequelize');
const db = require('../../../db/models');
const { env, hasMnemonic } = require('./selfcrypto.config');
const { deriveOnchainAddress } = require('./selfcrypto.addresses');
const { toBaseUnits } = require('./selfcrypto.prices');

const CHAINS = {
  btc: {
    asset: 'BTC',
    paymentMethod: 'onchain',
    nativeDecimals: 8,
    displayDecimals: 8,
    envName: 'METAMASK_BTC_ADDRESS',
    minNative: 546n
  },
  eth: {
    asset: 'ETH',
    paymentMethod: 'ethereum',
    nativeDecimals: 18,
    displayDecimals: 8,
    envName: 'METAMASK_ETH_ADDRESS',
    minNative: 1n
  },
  trx: {
    asset: 'TRX',
    paymentMethod: 'tron',
    nativeDecimals: 6,
    displayDecimals: 6,
    envName: 'METAMASK_TRX_ADDRESS',
    minNative: 1n
  },
  sol: {
    asset: 'SOL',
    paymentMethod: 'solana',
    nativeDecimals: 9,
    displayDecimals: 8,
    envName: 'METAMASK_SOL_ADDRESS',
    minNative: 1n
  }
};

function chainKeyForMethod(paymentMethod) {
  const pm = String(paymentMethod || '').toLowerCase();
  if (pm === 'onchain') return 'btc';
  if (pm === 'ethereum') return 'eth';
  if (pm === 'tron') return 'trx';
  if (pm === 'solana') return 'sol';
  return null;
}

function validAddress(chain, address) {
  const value = String(address || '').trim();
  if (!value) return null;
  if (chain === 'btc' && /^bc1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{20,}$/i.test(value)) return value;
  if (chain === 'eth' && /^0x[a-fA-F0-9]{40}$/.test(value)) return value;
  if (chain === 'trx' && /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return value;
  if (chain === 'sol' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return value;
  return null;
}

function sameAddress(chain, a, b) {
  if (!a || !b) return false;
  if (chain === 'eth') return String(a).toLowerCase() === String(b).toLowerCase();
  return String(a) === String(b);
}

/**
 * One receive address per coin. Env address wins. Otherwise derivation index 0
 * of the company seed — never a new account per deposit.
 */
function treasuryAddress(chain) {
  const spec = CHAINS[chain];
  if (!spec) return null;
  const fromEnv = validAddress(chain, env(spec.envName));
  if (fromEnv) return fromEnv;
  if (!hasMnemonic()) return null;
  try {
    return deriveOnchainAddress(chain, 0);
  } catch (_) {
    return null;
  }
}

function treasuryAddresses() {
  return {
    btc: treasuryAddress('btc'),
    eth: treasuryAddress('eth'),
    trx: treasuryAddress('trx'),
    sol: treasuryAddress('sol')
  };
}

function treasuryConfigured() {
  const all = treasuryAddresses();
  return !!(all.btc || all.eth || all.trx || all.sol);
}

function isSharedReceiveAddress(paymentMethod, address) {
  const chain = chainKeyForMethod(paymentMethod);
  if (!chain || !address) return false;
  return sameAddress(chain, address, treasuryAddress(chain));
}

function fromBaseUnits(units, decimals) {
  const value = BigInt(units);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const text = abs.toString().padStart(Number(decimals) + 1, '0');
  const whole = text.slice(0, -decimals);
  const frac = text.slice(-decimals).replace(/0+$/, '');
  const out = frac ? `${whole}.${frac}` : whole;
  return negative ? `-${out}` : out;
}

function displayToNative(amount, displayDecimals, nativeDecimals) {
  const displayUnits = toBaseUnits(amount, displayDecimals);
  const scale = Number(nativeDecimals) - Number(displayDecimals);
  if (scale >= 0) return displayUnits * (10n ** BigInt(scale));
  return displayUnits / (10n ** BigInt(-scale));
}

function nativeStep(spec) {
  const scale = spec.nativeDecimals - spec.displayDecimals;
  return scale > 0 ? 10n ** BigInt(scale) : 1n;
}

async function nextUniqueUnits(transaction, spec, baseAmount) {
  const rows = await db.PaymentPendingDeposit.findAll({
    where: {
      provider: 'selfcrypto',
      targetCurrency: spec.asset,
      paymentMethod: spec.paymentMethod,
      status: { [Op.in]: ['pending', 'confirming'] }
    },
    attributes: ['id', 'providerMetadata'],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const used = new Set();
  for (const row of rows) {
    const meta = row.providerMetadata && typeof row.providerMetadata === 'object' ? row.providerMetadata : {};
    if (meta.expectedBaseUnits != null) used.add(String(meta.expectedBaseUnits));
  }
  let units = displayToNative(baseAmount, spec.displayDecimals, spec.nativeDecimals);
  const step = nativeStep(spec);
  if (units < spec.minNative) units = spec.minNative;
  let guard = 0;
  while (used.has(units.toString()) && guard < 10000) {
    units += step;
    guard += 1;
  }
  if (used.has(units.toString())) {
    const err = new Error('Too many open payments for this coin. Try again in a few minutes.');
    err.statusCode = 409;
    throw err;
  }
  return {
    expectedBaseUnits: units.toString(),
    exactAmount: fromBaseUnits(units, spec.nativeDecimals)
  };
}

/**
 * Hold a DB lock, pick an unused exact amount, then insert the deposit in the same transaction.
 */
async function createSharedPending(specChain, baseAmount, buildRow) {
  const spec = CHAINS[specChain];
  if (!spec) {
    const err = new Error('Unsupported coin.');
    err.statusCode = 400;
    throw err;
  }
  return db.sequelize.transaction(async (transaction) => {
    await db.sequelize.query(
      'SELECT pg_advisory_xact_lock(hashtext(:lockKey))',
      { replacements: { lockKey: `metamask:${spec.asset}` }, transaction }
    );
    const exact = await nextUniqueUnits(transaction, spec, baseAmount);
    return buildRow(exact, transaction);
  });
}

module.exports = {
  CHAINS,
  chainKeyForMethod,
  treasuryAddress,
  treasuryAddresses,
  treasuryConfigured,
  isSharedReceiveAddress,
  sameAddress,
  fromBaseUnits,
  createSharedPending
};
