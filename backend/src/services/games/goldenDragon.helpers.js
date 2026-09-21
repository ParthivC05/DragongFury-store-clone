'use strict';

const axios = require('axios');
const crypto = require('crypto');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { captureBotApiResponse } = require('../../utils/botApiHelper');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;

/** Integration keys for Golden Dragon bot APIs (legacy, new bot, v2). */
const GOLDEN_DRAGON_GAME_KEYS = new Set([
  'goldendragon',
  'goldendragonnewbot',
  'goldendragon2'
]);

const GOLDEN_DRAGON_KIOSK_ID_HELP =
  'Golden Dragon kiosk_id must be the 7-digit number from your POS login URL (e.g. https://pos.goldendragoncity.com/pos/2787443 → 2787443).';

function compactProviderGameId(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function isGoldenDragonGame(name, gameKey) {
  const ids = [name, gameKey].map(compactProviderGameId).filter(Boolean);
  return ids.some((id) => GOLDEN_DRAGON_GAME_KEYS.has(id));
}

/** Golden Dragon 2 requires drivers_license on create-user; derive a stable unique value per user. */
function generateGoldenDragonDriversLicense(userId) {
  const hash = crypto
    .createHash('sha256')
    .update(`gd-dl-v2-${userId}`)
    .digest('hex')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return `D${hash.slice(0, 12)}`;
}

/** POS returns entries/winnings in cents (100 = $1 SC). */
function parseGoldenDragonEntriesWinnings(payload) {
  const rawEntries = Number(payload?.entries ?? 0);
  const rawWinnings = Number(payload?.winnings ?? 0);
  const entries = Number.isFinite(rawEntries) ? rawEntries / 100 : 0;
  const winnings = Number.isFinite(rawWinnings) ? rawWinnings / 100 : 0;
  return { entries, winnings };
}

function isGoldenDragonAutomationReady(game) {
  if (!game || !isGoldenDragonGame(game.name, game.gameKey)) return false;
  return Boolean(String(game.botApiUrl || '').trim() && String(game.botApiKey || '').trim());
}

/**
 * Golden Dragon: POST /create-user → pin_id, then search-user for mobile_id.
 */
async function callGoldenDragonCreateUser(baseUrl, apiKey, profile) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/create-user`;
  const body = {
    drivers_license: profile.drivers_license,
    first_name: profile.first_name,
    last_name: profile.last_name,
    birthday: profile.birthday,
    gender: profile.gender,
    phone: profile.phone,
    mail: profile.mail,
    pin_user_id: profile.pin_user_id
  };
  const res = await axios.post(url, body, {
    headers: { accept: 'application/json', 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });
  const data = res.data;
  const ok = res.status >= 200 && res.status < 300 && data && data.success === true;
  if (!ok) {
    const botMessage = (data?.message || data?.detail || '').toString();
    const userMessage = botMessage
      ? `Could not create your game account: ${botMessage}`
      : 'Could not create your game account at this time. Please try again later.';
    const err = new Error(userMessage);
    err.statusCode = (res.status >= 400 && res.status !== 401 && res.status !== 403) ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }
  const payload = (data && data.data) || {};
  const pinId = payload.pin_id != null ? payload.pin_id : payload.pinId;
  if (pinId === '' || pinId == null) {
    const err = new Error('Failed to create game account: provider did not return pin_id.');
    err.statusCode = 502;
    err.externalResponse = data;
    throw err;
  }
  return { pin_id: pinId };
}

function inferGoldenDragonSearchType(query) {
  const s = String(query || '').trim();
  if (!s) return 'name';
  const compactMobile = s.replace(/\s/g, '');
  if (/^M[-\d]+$/i.test(compactMobile)) return 'mobile_id';
  if (/^\d+$/.test(s)) return 'pin_id';
  if (/^D[A-Z0-9]+$/i.test(s)) return 'drivers_license';
  return 'mobile_id';
}

async function callGoldenDragonSearchUser(baseUrl, apiKey, query, searchType) {
  const username = String(query || '').trim();
  const resolvedType = searchType || inferGoldenDragonSearchType(username);
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/search-user`;
  const body = { username, search_type: resolvedType };
  const res = await axios.post(url, body, {
    headers: { accept: 'application/json', 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });
  const data = res.data;
  const ok = res.status >= 200 && res.status < 300 && data && data.success === true;
  if (!ok) {
    const botMessage = (data?.message || data?.detail || '').toString();
    const userMessage = botMessage
      ? `Could not look up your game account: ${botMessage}`
      : 'Could not complete game registration. Please contact support.';
    const err = new Error(userMessage);
    err.statusCode = (res.status >= 400 && res.status !== 401 && res.status !== 403) ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    err.isSearchUserNotFound = res.status === 404 || /not found/i.test(botMessage);
    if (err.isSearchUserNotFound) err.code = 'GAME_USER_NOT_FOUND';
    throw err;
  }
  const payload = (data && data.data) || {};
  const customerId = payload.customer_id != null ? payload.customer_id : payload.pin_id;
  const mobileId = payload.mobile_id != null ? payload.mobile_id : payload.mobileId;
  if (customerId === '' || customerId == null) {
    const err = new Error('Game provider did not return customer_id.');
    err.statusCode = 502;
    err.externalResponse = data;
    throw err;
  }
  return {
    customer_id: String(customerId).trim(),
    mobile_id: mobileId != null ? String(mobileId).trim() : null,
    raw: payload
  };
}

/**
 * Golden Dragon deposit/redeem/balance need customer_id (pin_id) in bot_password.
 * Register stores mobile_id → bot_username, pin_id → bot_password.
 * Linked/manual accounts may only have mobile_id — look it up once and save pin_id.
 */
async function resolveGoldenDragonCustomerId(userGameAccount, game) {
  const stored = String(userGameAccount?.botPassword || '').trim();
  if (stored) return stored;

  const query = String(userGameAccount?.botUsername || '').trim();
  if (!query || !game?.botApiUrl || !game?.botApiKey) return null;

  const searched = await callGoldenDragonSearchUser(game.botApiUrl, game.botApiKey, query);
  const pinId = searched.customer_id;
  if (pinId && typeof userGameAccount.update === 'function') {
    await userGameAccount.update({ botPassword: pinId.slice(0, 256) });
  }
  return pinId || null;
}

/**
 * Golden Dragon balance: POST /get-user-score with pin_id (customer_id).
 * @returns {Promise<{ entries: number, winnings: number }>}
 */
async function callGoldenDragonGetUserScore(baseUrl, apiKey, pinId) {
  const url = `${String(baseUrl || '').replace(/\/$/, '')}/get-user-score`;
  const body = { username: String(pinId), search_type: 'pin_id' };
  const res = await axios.post(url, body, {
    headers: {
      accept: 'application/json',
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });

  const data = res.data;
  if (res.status !== 200 || !data || data.success !== true) {
    const err = new Error('Game provider failed to fetch the balance.');
    err.statusCode = (res.status >= 400 && res.status !== 401 && res.status !== 403) ? res.status : 502;
    err.externalResponse = captureBotApiResponse(data, res.status);
    throw err;
  }

  return parseGoldenDragonEntriesWinnings((data && data.data) || {});
}

/** Body for POST /admin/generate-key on Golden Dragon 2. */
function buildGoldenDragonGenerateKeyBody(clientUsername, kioskId) {
  const body = { client_username: String(clientUsername || '').trim() };
  const kiosk = kioskId != null ? String(kioskId).trim() : '';
  if (kiosk) body.kiosk_id = kiosk;
  return body;
}

function resolveKioskIdForGoldenDragon(gameName, gameKey, explicitKioskId) {
  if (!isGoldenDragonGame(gameName, gameKey)) return null;
  let s = explicitKioskId != null ? String(explicitKioskId).trim() : '';
  if (!s) return null;
  const urlMatch = s.match(/\/pos\/(\d{7})\/?$/i) || s.match(/(\d{7})\/?$/);
  if (urlMatch) s = urlMatch[1];
  if (!/^\d{7}$/.test(s)) return null;
  return s;
}

module.exports = {
  GOLDEN_DRAGON_GAME_KEYS,
  GOLDEN_DRAGON_KIOSK_ID_HELP,
  compactProviderGameId,
  isGoldenDragonGame,
  isGoldenDragonAutomationReady,
  generateGoldenDragonDriversLicense,
  parseGoldenDragonEntriesWinnings,
  callGoldenDragonGetUserScore,
  callGoldenDragonCreateUser,
  callGoldenDragonSearchUser,
  inferGoldenDragonSearchType,
  resolveGoldenDragonCustomerId,
  buildGoldenDragonGenerateKeyBody,
  resolveKioskIdForGoldenDragon
};
