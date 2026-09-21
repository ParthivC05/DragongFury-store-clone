const { randomInt } = require('crypto');
const db = require('../../db/models');

const KEY = 'chime_deposit_receive_usernames';
const MAX_URL_LENGTH = 2048;

function normalizeUrl(input) {
  const s = String(input ?? '').trim();
  if (!s) return '';
  if (s.length > MAX_URL_LENGTH) return '';
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    return u.toString();
  } catch (_) {
    return '';
  }
}

/**
 * Normalize a stored/incoming list into account objects `{ username, qrUrl, appLink }`.
 * Accepts legacy shapes: array of strings, or `{ usernames: string[] }`.
 * @param {unknown} input
 * @returns {{ username: string, qrUrl: string, appLink: string }[]}
 */
function normalizeAccounts(input) {
  const arr = Array.isArray(input) ? input : [];
  const seen = new Set();
  const out = [];
  for (const raw of arr) {
    const obj = typeof raw === 'string' ? { username: raw } : raw && typeof raw === 'object' ? raw : null;
    if (!obj) continue;
    const username = String(obj.username ?? '').trim();
    if (username.length < 2) continue;
    const key = username.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      username: username.slice(0, 255),
      qrUrl: normalizeUrl(obj.qrUrl ?? obj.qr_url),
      appLink: normalizeUrl(obj.appLink ?? obj.app_link)
    });
    if (out.length >= 50) break;
  }
  return out;
}

function parseRowValue(value) {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed?.accounts)) return normalizeAccounts(parsed.accounts);
    const legacy = Array.isArray(parsed?.usernames) ? parsed.usernames : Array.isArray(parsed) ? parsed : [];
    return normalizeAccounts(legacy);
  } catch (_) {
    return [];
  }
}

/**
 * @param {string|null} distributorCode
 * @param {string|null} storeCode
 * @returns {Promise<{ username: string, qrUrl: string, appLink: string }[]>}
 */
async function getReceiveAccounts(distributorCode, storeCode) {
  if (!storeCode || !distributorCode) return [];
  const row = await db.Setting.findOne({
    where: { key: KEY, distributorCode, storeCode }
  });
  if (!row?.value) return [];
  return parseRowValue(row.value);
}

/**
 * Backward-compatible helper: list of pay-to usernames (strings) for validation.
 * @returns {Promise<string[]>}
 */
async function getReceiveUsernames(distributorCode, storeCode) {
  const accounts = await getReceiveAccounts(distributorCode, storeCode);
  return accounts.map((a) => a.username);
}

/**
 * @param {string|null} distributorCode
 * @param {string|null} storeCode
 * @param {unknown[]} accounts objects `{ username, qrUrl?, appLink? }` (strings accepted for legacy).
 */
async function setReceiveAccounts(distributorCode, storeCode, accounts) {
  const list = normalizeAccounts(accounts);
  const dc = distributorCode ? String(distributorCode).trim().slice(0, 64) : null;
  const sc = storeCode ? String(storeCode).trim().slice(0, 64) : null;
  if (!dc || !sc) {
    const err = new Error('Store context is required.');
    err.statusCode = 400;
    throw err;
  }
  const value = JSON.stringify({ accounts: list });
  const [row] = await db.Setting.findOrCreate({
    where: { key: KEY, distributorCode: dc, storeCode: sc },
    defaults: { key: KEY, distributorCode: dc, storeCode: sc, value }
  });
  await row.update({ value });
  return list;
}

/**
 * Pick one account with **equal probability** for every entry (1/n each).
 * List order does not imply priority. Uses cryptographically strong uniform integer selection.
 */
function pickRandomAccount(accounts) {
  if (!accounts.length) return null;
  const i = randomInt(0, accounts.length);
  return accounts[i];
}

/**
 * @param {string} candidate
 * @param {string[]} configuredUsernames
 * @returns {string|null} canonical username from configured list, or null
 */
function resolveDestinationMatch(candidate, configuredUsernames) {
  const c = String(candidate ?? '').trim();
  if (!c) return null;
  const lower = c.toLowerCase();
  for (const u of configuredUsernames) {
    if (String(u).toLowerCase() === lower) return u;
  }
  return null;
}

module.exports = {
  KEY,
  getReceiveAccounts,
  getReceiveUsernames,
  setReceiveAccounts,
  pickRandomAccount,
  resolveDestinationMatch,
  normalizeAccounts
};
