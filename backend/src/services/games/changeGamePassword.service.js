'use strict';

const axios = require('axios');
const db = require('../../db/models');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const {
  isSimpleGame,
  isGoldenDragonGame,
  usesGameProviderAdminToken,
  resolveKioskIdForGoldenDragon,
  generateKey,
  cashierLogin,
  GOLDEN_DRAGON_KIOSK_ID_HELP
} = require('./addGame.service');
const {
  isVegasXCashierGame,
  isOrionStarsTerminalGame,
  isOrionStarsBotAutomationGame,
  isFirekirinTerminalGame,
  isFirekirinBotAutomationGame,
  isMilkywayTerminalGame,
  isMilkywayBotAutomationGame,
  isGameroomAgentGame,
  isGameroomBotAutomationGame,
  isCashmachineAgentGame,
  isCashmachineBotAutomationGame,
  isMafiaAgentGame,
  isAgentCredentialGame,
  resolveGameIntegrationKey
} = require('../../utils/gameIntegration.helpers');
const { resolveVegasXBotBaseUrl } = require('./vegasx.helpers');

const PROVIDER_HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;
const PROVIDER_TIMEOUT_RETRIES = 2;

/** GameVault / Juwa 2.0 Agent API — store password is saved locally only (no provider call). */
function isLocalOnlyAgentPasswordGame(game) {
  if (!isAgentCredentialGame(game)) return false;
  const key = resolveGameIntegrationKey(game);
  return key.includes('gamevault') || key.includes('juwa');
}

function isProviderRequestTimeout(err) {
  if (!err) return false;
  if (axios.isAxiosError && axios.isAxiosError(err)) {
    if (err.code === 'ECONNABORTED') return true;
  }
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('timeout');
}

async function withProviderTimeoutRetry(requestFn) {
  const maxAttempts = 1 + PROVIDER_TIMEOUT_RETRIES;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await requestFn();
    } catch (e) {
      if (isProviderRequestTimeout(e) && attempt < maxAttempts) continue;
      if (isProviderRequestTimeout(e)) {
        const err = new Error('The game provider is taking too long to respond. Please try again in a moment.');
        err.statusCode = 504;
        throw err;
      }
      throw e;
    }
  }
}

/** Some games use X-Admin-Token instead of X-Streamlit-Token on provider admin routes. */
function getProviderErrorMessage(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  if (data.message && typeof data.message === 'string') return data.message;
  if (data.detail) {
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
      const parts = data.detail.map((d) => {
        const msg = d.msg || d.message || (typeof d === 'string' ? d : '');
        const loc = Array.isArray(d.loc) ? d.loc.filter((x) => x !== 'body').join(' → ') : '';
        return loc ? `${loc}: ${msg}` : msg;
      }).filter(Boolean);
      return parts.length ? parts.join('; ') : fallback;
    }
  }
  if (data.error && typeof data.error === 'string') return data.error;
  return fallback;
}

/**
 * Third-party game provider API: POST {botApiUrl}/admin/update-password
 * @param {{ botApiUrl: string, streamlitToken: string, gameName: string, gameKey?: string, username: string, newPassword: string, kioskId?: string }} params
 */
async function callThirdPartyUpdatePassword({ botApiUrl, streamlitToken, gameName, gameKey, username, newPassword, kioskId }) {
  const baseUrl = String(botApiUrl || '').trim().replace(/\/$/, '');
  const token = String(streamlitToken || '').trim();
  const headerName = usesGameProviderAdminToken(gameName, gameKey) ? 'X-Admin-Token' : 'X-Streamlit-Token';
  const url = `${baseUrl}/admin/update-password`;

  const requestBody = isGoldenDragonGame(gameName, gameKey)
    ? {
        username: String(username || '').trim(),
        kiosk_id: String(kioskId || '').trim(),
        new_password: String(newPassword)
      }
    : {
        username: String(username || '').trim(),
        new_password: String(newPassword)
      };

  const res = await withProviderTimeoutRetry(() => axios.post(
    url,
    requestBody,
    {
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        [headerName]: token
      },
      timeout: PROVIDER_HTTP_TIMEOUT_MS,
      validateStatus: () => true
    }
  ));

  console.log('res', res);
  const data = res.data && typeof res.data === 'object' ? res.data : {};
  const bodyStatus = typeof data.status === 'number' ? data.status : null;
  const payloadIndicatesSuccess = data.success === true && (
    (bodyStatus != null && bodyStatus >= 200 && bodyStatus < 300) ||
    (res.status >= 200 && res.status < 300)
  );
  const hasExplicitSuccessFlag = Object.prototype.hasOwnProperty.call(data, 'success');
  const httpIndicatesSuccess = (res.status >= 200 && res.status < 300)
    && (!hasExplicitSuccessFlag || data.success === true);

  if (!(payloadIndicatesSuccess || httpIndicatesSuccess)) {
    let httpStatus = bodyStatus;
    if (httpStatus == null || httpStatus < 400 || httpStatus >= 600) {
      httpStatus = res.status;
    }
    if (httpStatus < 400 || httpStatus >= 600) {
      httpStatus = 502;
    }
    const err = new Error(getProviderErrorMessage(data, 'Failed to update game password'));
    err.statusCode = httpStatus;
    err.providerPassthrough = true;
    err.providerBody = data;
    throw err;
  }
}

/**
 * Change a store game's password: third-party provider + local DB.
 * For provider-backed games, also regenerates botApiKey via /admin/generate-key.
 *
 * @param {number} gameId
 * @param {string} newPassword - plain text (already decoded if client sent base64)
 * @returns {Promise<{ id: number, name: string }>}
 */
async function changeGamePassword(gameId, newPassword) {
  const game = await db.Game.findByPk(gameId);
  if (!game) {
    const err = new Error('Game not found');
    err.statusCode = 404;
    throw err;
  }

  const password = String(newPassword || '').trim();
  if (!password) {
    const err = new Error('New password is required.');
    err.statusCode = 400;
    throw err;
  }

  const updates = { botPassword: password.slice(0, 256) };

  // GameVault / Juwa 2.0 Agent API: no store-password provider call — save locally and succeed.
  if (isLocalOnlyAgentPasswordGame(game)) {
    await game.update(updates);
    return { id: game.id, name: game.name };
  }

  const username = String(game.botUsername || '').trim();
  if (!username) {
    const err = new Error('Game username is required before changing the password.');
    err.statusCode = 400;
    throw err;
  }

  const botApiUrl = String(game.botApiUrl || '').trim();
  const streamlitToken = String(game.streamlitToken || '').trim();

  if (isVegasXCashierGame(game)) {
    // VegasX Agent API: validate the new store password via POST /cashier/login.
    // On success save password + session token; on failure always show "Invalid password"
    // (including provider `{ success: false, message: "Wrong username or password." }`).
    const vegasxApiUrl = await resolveVegasXBotBaseUrl(game);
    if (!vegasxApiUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    let loginResult;
    try {
      loginResult = await cashierLogin(vegasxApiUrl, username, password);
    } catch {
      const err = new Error('Invalid password');
      err.statusCode = 400;
      throw err;
    }
    updates.streamlitToken = loginResult.token.slice(0, 512);
    updates.botApiUrl = vegasxApiUrl.slice(0, 512);
  } else if (isOrionStarsTerminalGame(game) && !isOrionStarsBotAutomationGame(game)) {
    // OrionStars Agent API has no update-password endpoint. Validate the new store
    // agent password with agentLogin; on success store it (and fresh agentKey).
    // Never expose provider messages like "Session timeout" on the admin UI.
    const { resolveOrionStarsBotBaseUrl, callOrionStarsAgentLogin } = require('./orionstars.helpers');
    const resolvedBaseUrl = await resolveOrionStarsBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    let loginResult;
    try {
      loginResult = await callOrionStarsAgentLogin(resolvedBaseUrl, username, password);
    } catch {
      const err = new Error('Invalid password');
      err.statusCode = 400;
      throw err;
    }
    updates.agentId = loginResult.agentKey.slice(0, 256);
    updates.botApiUrl = resolvedBaseUrl.slice(0, 512);
  } else if (isFirekirinTerminalGame(game) && !isFirekirinBotAutomationGame(game)) {
    // Firekirin Agent API has no update-password endpoint. Validate with agentLogin.
    const { resolveFirekirinBotBaseUrl, callFirekirinAgentLogin } = require('./firekirin.helpers');
    const resolvedBaseUrl = await resolveFirekirinBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    let loginResult;
    try {
      loginResult = await callFirekirinAgentLogin(resolvedBaseUrl, username, password);
    } catch {
      const err = new Error('Invalid password');
      err.statusCode = 400;
      throw err;
    }
    updates.agentId = loginResult.agentKey.slice(0, 256);
    updates.botApiUrl = resolvedBaseUrl.slice(0, 512);
  } else if (isMilkywayTerminalGame(game) && !isMilkywayBotAutomationGame(game)) {
    const { resolveMilkywayBotBaseUrl, callMilkywayAgentLogin } = require('./milkyway.helpers');
    const resolvedBaseUrl = await resolveMilkywayBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    let loginResult;
    try {
      loginResult = await callMilkywayAgentLogin(resolvedBaseUrl, username, password);
    } catch {
      const err = new Error('Invalid password');
      err.statusCode = 400;
      throw err;
    }
    updates.agentId = loginResult.agentKey.slice(0, 256);
    updates.botApiUrl = resolvedBaseUrl.slice(0, 512);
  } else if (isGameroomAgentGame(game) && !isGameroomBotAutomationGame(game)) {
    const { resolveGameroomBotBaseUrl, callGameroomAgentLogin } = require('./gameroom.helpers');
    const resolvedBaseUrl = await resolveGameroomBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    let loginResult;
    try {
      loginResult = await callGameroomAgentLogin(resolvedBaseUrl, username, password);
    } catch {
      const err = new Error('Invalid password');
      err.statusCode = 400;
      throw err;
    }
    updates.streamlitToken = loginResult.token.slice(0, 512);
    updates.botApiUrl = resolvedBaseUrl.slice(0, 512);
  } else if (isCashmachineAgentGame(game) && !isCashmachineBotAutomationGame(game)) {
    const { resolveCashmachineBotBaseUrl, callCashmachineAgentLogin } = require('./cashmachine.helpers');
    const resolvedBaseUrl = await resolveCashmachineBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    let loginResult;
    try {
      loginResult = await callCashmachineAgentLogin(resolvedBaseUrl, username, password);
    } catch {
      const err = new Error('Invalid password');
      err.statusCode = 400;
      throw err;
    }
    updates.streamlitToken = loginResult.token.slice(0, 512);
    updates.botApiUrl = resolvedBaseUrl.slice(0, 512);
  } else if (isMafiaAgentGame(game)) {
    const { resolveMafiaBotBaseUrl, callMafiaAgentLogin } = require('./mafia.helpers');
    const resolvedBaseUrl = await resolveMafiaBotBaseUrl(game);
    if (!resolvedBaseUrl) {
      const err = new Error('Game is missing provider configuration (API URL).');
      err.statusCode = 400;
      throw err;
    }
    let loginResult;
    try {
      loginResult = await callMafiaAgentLogin(resolvedBaseUrl, username, password);
    } catch {
      const err = new Error('Invalid password');
      err.statusCode = 400;
      throw err;
    }
    updates.streamlitToken = loginResult.token.slice(0, 512);
    updates.botApiUrl = resolvedBaseUrl.slice(0, 512);
  } else if (botApiUrl && streamlitToken) {
    let kioskIdForProvider = null;
    if (isGoldenDragonGame(game.name, game.gameKey)) {
      kioskIdForProvider = resolveKioskIdForGoldenDragon(game.name, game.kioskId, game.gameKey);
      if (!kioskIdForProvider) {
        const err = new Error(
          `Golden Dragon requires a kiosk ID on this game before changing the password. ${GOLDEN_DRAGON_KIOSK_ID_HELP}`
        );
        err.statusCode = 400;
        throw err;
      }
    }
    await callThirdPartyUpdatePassword({
      botApiUrl,
      streamlitToken,
      gameName: game.name,
      gameKey: game.gameKey,
      username,
      newPassword: password,
      kioskId: kioskIdForProvider
    });

    const keyResult = await generateKey(
      botApiUrl,
      streamlitToken,
      username,
      game.name,
      game.gameKey,
      kioskIdForProvider
    );
    if (!keyResult.success || !keyResult.api_key) {
      const err = new Error('Game provider did not return an API key.');
      err.statusCode = 502;
      throw err;
    }
    updates.botApiKey = keyResult.api_key.slice(0, 512);
  } else if (!isSimpleGame(game.name)) {
    const err = new Error('Game is missing provider configuration (API URL or token).');
    err.statusCode = 400;
    throw err;
  }

  await game.update(updates);

  return { id: game.id, name: game.name };
}

module.exports = { changeGamePassword, callThirdPartyUpdatePassword };
