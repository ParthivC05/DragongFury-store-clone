'use strict';

const axios = require('axios');
const { QueryTypes } = require('sequelize');
const db = require('../../../db/models');
const {
  btcApiBase,
  ethRpcUrl,
  ethExplorerApi,
  tronApiBase,
  solRpcUrl
} = require('./selfcrypto.config');
const { chainKeyForMethod } = require('./selfcrypto.treasury');

const TIMEOUT = { timeout: 8000 };
const BTC_API_FALLBACKS = ['https://mempool.space/api', 'https://blockstream.info/api'];

function uniqueBases(preferred) {
  return [...new Set([preferred, ...BTC_API_FALLBACKS].filter(Boolean).map((u) => String(u).replace(/\/+$/, '')))];
}

function metaOf(pending) {
  return pending?.providerMetadata && typeof pending.providerMetadata === 'object'
    ? pending.providerMetadata
    : {};
}

function expectedUnits(pending) {
  const raw = metaOf(pending).expectedBaseUnits;
  if (raw == null || raw === '') return null;
  try {
    const units = BigInt(String(raw));
    return units > 0n ? units : null;
  } catch (_) {
    return null;
  }
}

function createdMs(pending) {
  const raw = pending?.createdAt || pending?.created_at;
  const ms = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function freshEnough(txMs, pending) {
  if (!txMs) return true;
  const start = createdMs(pending) - 2 * 60 * 1000;
  return txMs >= start;
}

async function txAlreadyUsed(txHash, currentId) {
  const hash = String(txHash || '').trim();
  if (!hash) return true;
  const rows = await db.sequelize.query(
    `SELECT id FROM payment_pending_deposits
     WHERE LOWER(COALESCE(provider, '')) = 'selfcrypto'
       AND id <> :id
       AND LOWER(COALESCE(provider_metadata->>'txHash', '')) = LOWER(:hash)
     LIMIT 1`,
    { replacements: { id: currentId || 0, hash }, type: QueryTypes.SELECT }
  );
  if (rows.length) return true;
  const credited = await db.sequelize.query(
    `SELECT id FROM deposit_requests
     WHERE LOWER(COALESCE(provider, '')) = 'selfcrypto'
       AND LOWER(COALESCE(tx_hash, '')) = LOWER(:hash)
     LIMIT 1`,
    { replacements: { hash }, type: QueryTypes.SELECT }
  );
  return credited.length > 0;
}

async function pickFresh(candidates, pending) {
  for (const item of candidates) {
    if (!item?.txHash) continue;
    if (!freshEnough(item.txMs, pending)) continue;
    if (await txAlreadyUsed(item.txHash, pending.id)) continue;
    return item;
  }
  return null;
}

async function scanBitcoin(address, expected, preferredHash) {
  let lastErr = null;
  for (const base of uniqueBases(btcApiBase())) {
    try {
      const url = preferredHash
        ? `${base}/tx/${encodeURIComponent(preferredHash)}`
        : `${base}/address/${encodeURIComponent(address)}/txs`;
      const { data } = await axios.get(url, TIMEOUT);
      const list = preferredHash ? [data] : (Array.isArray(data) ? data : []);
      const out = [];
      for (const tx of list) {
        if (!tx?.txid) continue;
        const received = (Array.isArray(tx.vout) ? tx.vout : [])
          .filter((o) => o?.scriptpubkey_address === address)
          .reduce((sum, o) => sum + Number(o?.value || 0), 0);
        if (BigInt(received) !== expected) continue;
        const confirmed = !!tx?.status?.confirmed;
        out.push({
          txHash: String(tx.txid),
          confirmed,
          confirmations: confirmed ? 1 : 0,
          txMs: tx?.status?.block_time ? Number(tx.status.block_time) * 1000 : 0,
          fromAddress: null
        });
      }
      return out;
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

async function scanEthereum(address, expected, minConfirmations, preferredHash) {
  const want = String(address).toLowerCase();
  const rpc = ethRpcUrl();
  if (preferredHash && rpc) {
    const [txRes, receiptRes, blockRes] = await Promise.all([
      axios.post(rpc, { jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [preferredHash] }, TIMEOUT),
      axios.post(rpc, { jsonrpc: '2.0', id: 2, method: 'eth_getTransactionReceipt', params: [preferredHash] }, TIMEOUT),
      axios.post(rpc, { jsonrpc: '2.0', id: 3, method: 'eth_blockNumber', params: [] }, TIMEOUT)
    ]);
    const tx = txRes.data?.result;
    const receipt = receiptRes.data?.result;
    if (!tx || String(tx.to || '').toLowerCase() !== want) return [];
    if (BigInt(tx.value || '0x0') !== expected) return [];
    const tip = BigInt(blockRes.data?.result || '0x0');
    const conf = receipt?.blockNumber ? Number(tip - BigInt(receipt.blockNumber) + 1n) : 0;
    const ok = receipt && receipt.status === '0x1';
    return [{
      txHash: String(tx.hash || preferredHash),
      confirmed: !!(ok && conf >= (minConfirmations || 1)),
      confirmations: conf,
      txMs: 0,
      fromAddress: tx.from || null
    }];
  }

  const { data } = await axios.get(`${ethExplorerApi()}/addresses/${address}/transactions`, {
    ...TIMEOUT,
    params: { filter: 'to' }
  });
  const items = Array.isArray(data?.items) ? data.items : [];
  const rows = items.flatMap((tx) => {
    const to = String(tx?.to?.hash || tx?.to || '').toLowerCase();
    if (to !== want) return [];
    let value = 0n;
    try { value = BigInt(tx?.value || '0'); } catch (_) { return []; }
    if (value !== expected) return [];
    const status = String(tx?.status || tx?.result || '').toLowerCase();
    if (status && status !== 'ok' && status !== 'success' && status !== '1') return [];
    const conf = Number(tx?.confirmations != null ? tx.confirmations : 0);
    const hash = tx?.hash || tx?.tx_hash;
    if (!hash) return [];
    return [{
      txHash: String(hash),
      confirmed: conf >= (minConfirmations || 1),
      confirmations: conf,
      txMs: tx?.timestamp ? new Date(tx.timestamp).getTime() : 0,
      fromAddress: tx?.from?.hash || tx?.from || null
    }];
  });
  if (!preferredHash) return rows;
  const wantedHash = String(preferredHash).toLowerCase();
  return rows.filter((row) => String(row.txHash).toLowerCase() === wantedHash);
}

function tronAmount(tx) {
  const contract = tx?.raw_data?.contract?.[0];
  if (!contract || contract.type !== 'TransferContract') return null;
  const value = contract.parameter?.value || {};
  const amount = Number(value.amount || 0);
  if (!Number.isFinite(amount)) return null;
  return { amount, from: value.owner_address || null };
}

async function fetchTronPage(address, onlyConfirmed) {
  const { data } = await axios.get(`${tronApiBase()}/v1/accounts/${encodeURIComponent(address)}/transactions`, {
    ...TIMEOUT,
    params: { only_to: true, limit: 40, only_confirmed: onlyConfirmed }
  });
  return Array.isArray(data?.data) ? data.data : [];
}

function mapTron(list, expected, confirmed) {
  return list.flatMap((tx) => {
    const parsed = tronAmount(tx);
    if (!parsed || BigInt(parsed.amount) !== expected) return [];
    const success = String(tx?.ret?.[0]?.contractRet || 'SUCCESS').toUpperCase() === 'SUCCESS';
    if (!success) return [];
    const hash = tx?.txID || tx?.txid;
    if (!hash) return [];
    return [{
      txHash: String(hash),
      confirmed,
      confirmations: confirmed ? 19 : 0,
      txMs: Number(tx?.block_timestamp || tx?.raw_data?.timestamp || 0),
      fromAddress: parsed.from
    }];
  });
}

async function scanTron(address, expected, preferredHash) {
  const confirmed = mapTron(await fetchTronPage(address, true), expected, true);
  const want = preferredHash ? String(preferredHash).toLowerCase() : null;
  const confirmedHits = want
    ? confirmed.filter((row) => row.txHash.toLowerCase() === want)
    : confirmed;
  if (confirmedHits.length || !want) return confirmedHits;
  const pending = mapTron(await fetchTronPage(address, false), expected, false);
  return pending.filter((row) => row.txHash.toLowerCase() === want);
}

async function scanSolana(address, expected, preferredHash) {
  const rpc = solRpcUrl();
  const signatures = preferredHash
    ? [{ signature: preferredHash, confirmationStatus: 'confirmed', blockTime: null }]
    : (await axios.post(rpc, {
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [address, { limit: 8 }]
    }, TIMEOUT)).data?.result || [];

  const out = [];
  for (const sig of signatures) {
    if (!sig?.signature) continue;
    const { data } = await axios.post(rpc, {
      jsonrpc: '2.0',
      id: 2,
      method: 'getTransaction',
      params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
    }, TIMEOUT);
    const tx = data?.result;
    if (!tx?.meta || tx.meta.err) continue;
    const keys = (tx.transaction?.message?.accountKeys || []).map((k) => (typeof k === 'string' ? k : k?.pubkey));
    const index = keys.findIndex((k) => k === address);
    if (index < 0) continue;
    const delta = BigInt(tx.meta.postBalances?.[index] || 0) - BigInt(tx.meta.preBalances?.[index] || 0);
    if (delta !== expected) continue;
    const status = String(sig.confirmationStatus || tx.meta?.status || 'confirmed');
    const confirmed = status === 'confirmed' || status === 'finalized';
    out.push({
      txHash: String(sig.signature),
      confirmed,
      confirmations: confirmed ? 1 : 0,
      txMs: sig.blockTime ? Number(sig.blockTime) * 1000 : (tx.blockTime ? Number(tx.blockTime) * 1000 : 0),
      fromAddress: keys.find((k) => k && k !== address) || null
    });
  }
  return out;
}

async function matchSharedDeposit(pending) {
  const method = String(pending.paymentMethod || '').toLowerCase();
  const chain = chainKeyForMethod(method);
  const address = pending.walletAddress;
  const expected = expectedUnits(pending);
  if (!chain || !address || !expected) {
    return { paid: false, confirming: false, txHash: null };
  }
  const preferred = metaOf(pending).txHash ? String(metaOf(pending).txHash) : null;
  let found = [];
  if (chain === 'btc') found = await scanBitcoin(address, expected, preferred);
  else if (chain === 'eth') found = await scanEthereum(address, expected, 3, preferred);
  else if (chain === 'trx') found = await scanTron(address, expected, preferred);
  else if (chain === 'sol') found = await scanSolana(address, expected, preferred);

  if (preferred && !found.length) {
    return { paid: false, confirming: true, txHash: preferred };
  }

  const hit = await pickFresh(found, pending);
  if (!hit) return { paid: false, confirming: false, txHash: preferred };
  if (hit.confirmed) {
    return { paid: true, confirming: false, txHash: hit.txHash, fromAddress: hit.fromAddress || null };
  }
  return { paid: false, confirming: true, txHash: hit.txHash, fromAddress: hit.fromAddress || null };
}

async function persistWatcherProgress(pending, result) {
  if (!pending || !result) return;
  const meta = metaOf(pending);
  const next = { ...meta };
  let changed = false;
  if (result.txHash && next.txHash !== result.txHash) {
    next.txHash = result.txHash;
    changed = true;
  }
  if (result.fromAddress && next.fromAddress !== result.fromAddress) {
    next.fromAddress = result.fromAddress;
    changed = true;
  }
  if (changed) await pending.update({ providerMetadata: next });
}

module.exports = {
  matchSharedDeposit,
  persistWatcherProgress
};
