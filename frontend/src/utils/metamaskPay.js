/**
 * Send a deposit from the player's MetaMask.
 * ETH and SOL are broadcast from the site. BTC and TRX are sent inside MetaMask
 * to the one receive address, for the exact amount, and the chain watcher credits SC.
 */

function noWallet() {
  const err = new Error('Install MetaMask, then try again.');
  err.code = 'NO_WALLET';
  throw err;
}

function manual(message) {
  const err = new Error(message);
  err.code = 'MANUAL';
  return err;
}

async function payEth(ethereum, to, units) {
  const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
  const from = accounts?.[0];
  if (!from) throw new Error('MetaMask did not return an Ethereum account.');
  const txHash = await ethereum.request({
    method: 'eth_sendTransaction',
    params: [{
      from,
      to,
      value: `0x${BigInt(units).toString(16)}`
    }]
  });
  if (!txHash) throw new Error('MetaMask did not return a transaction hash.');
  return { txHash: String(txHash), fromAddress: from };
}

async function paySol(ethereum, to, units) {
  const scope = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
  let session;
  try {
    session = await ethereum.request({
      method: 'wallet_createSession',
      params: [{
        optionalScopes: {
          [scope]: {
            methods: ['signAndSendTransaction'],
            notifications: []
          }
        }
      }]
    });
  } catch (_) {
    throw manual('MetaMask did not open a Solana account. Send the exact SOL amount from MetaMask to the address below.');
  }

  const accounts = session?.sessionScopes?.[scope]?.accounts || [];
  const from = String(accounts[0] || '').split(':').pop();
  if (!from) {
    throw manual('Connect Solana in MetaMask, then send the exact amount to the address below.');
  }

  const { Connection, PublicKey, SystemProgram, Transaction } = await import('@solana/web3.js');
  const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  const tx = new Transaction({ recentBlockhash: blockhash, feePayer: new PublicKey(from) });
  tx.add(SystemProgram.transfer({
    fromPubkey: new PublicKey(from),
    toPubkey: new PublicKey(to),
    lamports: Number(units)
  }));
  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  let binary = '';
  serialized.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const result = await ethereum.request({
    method: 'wallet_invokeMethod',
    params: {
      scope,
      request: {
        method: 'signAndSendTransaction',
        params: {
          account: { address: from },
          transaction: btoa(binary)
        }
      }
    }
  });
  const txHash = result?.signature || result?.txid || (typeof result === 'string' ? result : null);
  if (!txHash) throw new Error('MetaMask did not return a Solana signature.');
  return { txHash: String(txHash), fromAddress: from };
}

export async function payWithMetaMask({ chain, to, expectedBaseUnits }) {
  const key = String(chain || '').toLowerCase();
  if (key === 'btc') {
    throw manual('In MetaMask, open Bitcoin and send the exact amount to the address below.');
  }
  if (key === 'trx') {
    throw manual('In MetaMask, open Tron and send the exact TRX amount to the address below.');
  }
  const ethereum = typeof window !== 'undefined' ? window.ethereum : null;
  if (!ethereum?.request) noWallet();
  if (!to || expectedBaseUnits == null) throw new Error('This payment is missing an amount.');
  if (key === 'eth') return payEth(ethereum, to, expectedBaseUnits);
  if (key === 'sol') return paySol(ethereum, to, expectedBaseUnits);
  throw manual('Send the exact amount from MetaMask to the address below.');
}
