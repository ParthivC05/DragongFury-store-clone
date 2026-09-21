'use strict';

const axios = require('axios');
const {
  btcApiBase,
  ethRpcUrl,
  ethExplorerApi,
  tronApiBase,
  solRpcUrl
} = require('./selfcrypto.config');
const { toBaseUnits } = require('./selfcrypto.prices');
const { getBtcpayInvoice, getLndInvoice, mapLightningStatus } = require('./selfcrypto.lightning');

const WATCH_TIMEOUT_MS = 8000;
const BTC_API_FALLBACKS = ['https://mempool.space/api', 'https://blockstream.info/api'];

function http(timeoutMs = WATCH_TIMEOUT_MS) {
  return { timeout: timeoutMs };
}

function uniqueBases(preferred) {
  const list = [preferred, ...BTC_API_FALLBACKS].filter(Boolean);
  return [...new Set(list.map((u) => String(u).replace(/\/+$/, '')))];
}

async function checkBitcoin({ address, expectedAmount }) {
  const expectedSats = Number(toBaseUnits(expectedAmount, 8));
  let lastErr = null;
  for (const base of uniqueBases(btcApiBase())) {
    try {
      const { data } = await axios.get(`${base}/address/${address}`, http());
      const confirmed = Number(data?.chain_stats?.funded_txo_sum || 0);
      const mempool = Number(data?.mempool_stats?.funded_txo_sum || 0);
      if (confirmed >= expectedSats && expectedSats > 0) {
        let txHash = null;
        try {
          const txs = (await axios.get(`${base}/address/${address}/txs`, http())).data;
          txHash = Array.isArray(txs) && txs[0]?.txid ? String(txs[0].txid) : null;
        } catch (_) {}
        return { paid: true, confirming: false, txHash, received: confirmed / 1e8 };
      }
      if (mempool >= expectedSats && expectedSats > 0) {
        return { paid: false, confirming: true, txHash: null, received: mempool / 1e8 };
      }
      return { paid: false, confirming: false, txHash: null, received: (confirmed + mempool) / 1e8 };
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr;
  return { paid: false, confirming: false, txHash: null, received: 0 };
}

async function checkEthereum({ address, expectedAmount, minConfirmations }) {
  const expectedWei = toBaseUnits(expectedAmount, 18);
  const explorer = `${ethExplorerApi()}/addresses/${address}/transactions`;
  try {
    const { data } = await axios.get(explorer, { ...http(), params: { filter: 'to' } });
    const items = Array.isArray(data?.items) ? data.items : [];
    const match = items.find((tx) => {
      const status = String(tx?.status || tx?.result || '').toLowerCase();
      if (status && status !== 'ok' && status !== 'success' && status !== '1') return false;
      const value = BigInt(tx?.value || '0');
      const conf = Number(tx?.confirmations != null ? tx.confirmations : 999);
      return value >= expectedWei && conf >= (minConfirmations || 3);
    });
    if (match) {
      return {
        paid: true,
        confirming: false,
        txHash: match.hash || match.tx_hash || null,
        received: Number(expectedAmount)
      };
    }
    const incoming = items.find((tx) => BigInt(tx?.value || '0') >= expectedWei);
    if (incoming) return { paid: false, confirming: true, txHash: incoming.hash || null, received: 0 };
  } catch (_) {
    // Fall through to RPC balance check
  }

  const rpc = ethRpcUrl();
  if (!rpc) return { paid: false, confirming: false, txHash: null, received: 0 };
  const { data } = await axios.post(rpc, {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBalance',
    params: [address, 'latest']
  }, http());
  const bal = BigInt(data?.result || '0x0');
  if (bal >= expectedWei && expectedWei > 0n) {
    return { paid: true, confirming: false, txHash: null, received: Number(expectedAmount) };
  }
  return { paid: false, confirming: false, txHash: null, received: 0 };
}

async function checkTron({ address, expectedAmount, minConfirmations }) {
  const expectedSun = Number(toBaseUnits(expectedAmount, 6));
  try {
    const { data } = await axios.get(`${tronApiBase()}/v1/accounts/${address}`, http());
    const account = Array.isArray(data?.data) ? data.data[0] : data?.data || data;
    const balance = Number(account?.balance || 0);
    if (balance >= expectedSun && expectedSun > 0) {
      let txHash = null;
      try {
        const txs = await axios.get(`${tronApiBase()}/v1/accounts/${address}/transactions`, {
          ...http(),
          params: { only_to: true, only_confirmed: true, limit: 5 }
        });
        const list = Array.isArray(txs.data?.data) ? txs.data.data : [];
        txHash = list[0]?.txID || list[0]?.txid || null;
        const confirmed = list.some((tx) => tx?.confirmed === true || Number(tx?.confirmations || 0) >= (minConfirmations || 1));
        if (list.length && !confirmed) {
          return { paid: false, confirming: true, txHash, received: balance / 1e6 };
        }
      } catch (_) {}
      return { paid: true, confirming: false, txHash, received: balance / 1e6 };
    }
  } catch (_) {}
  return { paid: false, confirming: false, txHash: null, received: 0 };
}

async function checkSolana({ address, expectedAmount }) {
  const expectedLamports = Number(toBaseUnits(expectedAmount, 9));
  const { data } = await axios.post(solRpcUrl(), {
    jsonrpc: '2.0',
    id: 1,
    method: 'getBalance',
    params: [address, { commitment: 'finalized' }]
  }, http());
  const lamports = Number(data?.result?.value ?? 0);
  if (lamports >= expectedLamports && expectedLamports > 0) {
    let txHash = null;
    try {
      const sigs = await axios.post(solRpcUrl(), {
        jsonrpc: '2.0',
        id: 2,
        method: 'getSignaturesForAddress',
        params: [address, { limit: 1, commitment: 'finalized' }]
      }, http());
      txHash = sigs.data?.result?.[0]?.signature || null;
    } catch (_) {}
    return { paid: true, confirming: false, txHash, received: lamports / 1e9 };
  }
  return { paid: false, confirming: false, txHash: null, received: lamports / 1e9 };
}

async function checkLightning(pending) {
  const meta = pending?.providerMetadata && typeof pending.providerMetadata === 'object'
    ? pending.providerMetadata
    : {};
  if (meta.btcpayInvoiceId) {
    const inv = await getBtcpayInvoice(meta.btcpayInvoiceId);
    const mapped = mapLightningStatus(inv);
    return {
      paid: mapped === 'paid',
      confirming: mapped === 'confirming',
      expired: mapped === 'expired' || String(inv?.status || '').toLowerCase() === 'expired',
      txHash: inv?.id || null,
      raw: inv
    };
  }
  if (meta.lndRHashHex || pending?.providerSessionId) {
    const hash = meta.lndRHashHex || pending.providerSessionId;
    const inv = await getLndInvoice(hash);
    const mapped = mapLightningStatus(inv);
    return {
      paid: mapped === 'paid',
      confirming: mapped === 'confirming',
      expired: mapped === 'expired',
      txHash: hash,
      raw: inv
    };
  }
  return { paid: false, confirming: false, expired: false, txHash: null };
}

async function checkPending(pending) {
  const method = String(pending.paymentMethod || '').toLowerCase();
  const address = pending.walletAddress;
  const expected = Number(pending.targetAmount);
  if (method === 'lightning') return checkLightning(pending);
  if (!address || !(expected > 0)) return { paid: false, confirming: false, txHash: null };

  if (method === 'onchain') return checkBitcoin({ address, expectedAmount: expected });
  if (method === 'ethereum') {
    return checkEthereum({ address, expectedAmount: expected, minConfirmations: 3 });
  }
  if (method === 'tron') {
    return checkTron({ address, expectedAmount: expected, minConfirmations: 19 });
  }
  if (method === 'solana') return checkSolana({ address, expectedAmount: expected });
  return { paid: false, confirming: false, txHash: null };
}

module.exports = {
  checkPending,
  checkBitcoin,
  checkEthereum,
  checkTron,
  checkSolana,
  checkLightning
};
