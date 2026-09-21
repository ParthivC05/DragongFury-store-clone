'use strict';

const { ethers } = require('ethers');
const { bech32 } = require('bech32');
const bs58 = require('bs58');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');
const nacl = require('tweetnacl');
const db = require('../../../db/models');
const { mnemonic, hasMnemonic } = require('./selfcrypto.config');

const PATHS = {
  btc: (i) => `m/84'/0'/0'/0/${i}`,
  eth: (i) => `m/44'/60'/0'/0/${i}`,
  trx: (i) => `m/44'/195'/0'/0/${i}`,
  sol: (i) => `m/44'/501'/${i}'/0'`
};

function requireMnemonic() {
  if (!hasMnemonic()) {
    const err = new Error('Direct crypto wallets are not configured.');
    err.statusCode = 503;
    throw err;
  }
  return mnemonic();
}

function rootNode() {
  return ethers.utils.HDNode.fromMnemonic(requireMnemonic());
}

function p2wpkhAddress(compressedPubHex) {
  const pub = compressedPubHex.startsWith('0x') ? compressedPubHex : `0x${compressedPubHex}`;
  const hash = ethers.utils.ripemd160(ethers.utils.sha256(pub));
  const prog = Buffer.from(hash.slice(2), 'hex');
  const words = bech32.toWords(prog);
  words.unshift(0);
  return bech32.encode('bc', words);
}

function tronAddressFromUncompressed(publicKeyHex) {
  const hex = publicKeyHex.startsWith('0x') ? publicKeyHex.slice(2) : publicKeyHex;
  const body = hex.startsWith('04') ? hex.slice(2) : hex;
  const keccak = ethers.utils.keccak256(`0x${body}`);
  const payload = Buffer.from(`41${keccak.slice(-40)}`, 'hex');
  const checksum = ethers.utils.sha256(ethers.utils.sha256(payload)).slice(2, 10);
  return bs58.encode(Buffer.concat([payload, Buffer.from(checksum, 'hex')]));
}

function deriveOnchainAddress(chain, index) {
  if (chain === 'sol') {
    const seed = bip39.mnemonicToSeedSync(requireMnemonic());
    const { key } = derivePath(PATHS.sol(index), seed.toString('hex'));
    const keyBytes = key instanceof Uint8Array ? key : Buffer.from(key);
    const pair = nacl.sign.keyPair.fromSeed(keyBytes.slice(0, 32));
    return bs58.encode(Buffer.from(pair.publicKey));
  }

  const node = rootNode().derivePath(PATHS[chain](index));
  if (chain === 'btc') {
    const compressed = ethers.utils.computePublicKey(node.privateKey, true);
    return p2wpkhAddress(compressed);
  }
  if (chain === 'eth') {
    return ethers.utils.getAddress(node.address);
  }
  if (chain === 'trx') {
    return tronAddressFromUncompressed(node.publicKey);
  }
  throw new Error(`Unsupported HD chain ${chain}`);
}

/**
 * Allocate the next unused receive address for a chain (locked).
 * @param {'btc'|'eth'|'trx'|'sol'} chain
 * @returns {Promise<{ address: string, derivationIndex: number }>}
 */
async function nextAddress(chain) {
  const key = String(chain || '').toLowerCase();
  if (!PATHS[key]) {
    const err = new Error(`Unsupported chain ${chain}`);
    err.statusCode = 400;
    throw err;
  }

  return db.sequelize.transaction(async (t) => {
    let row = await db.SelfcryptoHdCounter.findByPk(key, {
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!row) {
      row = await db.SelfcryptoHdCounter.create(
        { chain: key, nextIndex: 0 },
        { transaction: t }
      );
    }
    const index = Number(row.nextIndex) || 0;
    const address = deriveOnchainAddress(key, index);
    await row.update({ nextIndex: index + 1 }, { transaction: t });
    return { address, derivationIndex: index };
  });
}

module.exports = {
  nextAddress,
  deriveOnchainAddress
};
