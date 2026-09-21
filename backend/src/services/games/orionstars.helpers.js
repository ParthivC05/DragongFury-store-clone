'use strict';

const axios = require('axios');
const crypto = require('crypto');
const db = require('../../db/models');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { isOrionStarsTerminalGame, resolveGameIntegrationKey } = require('../../utils/gameIntegration.helpers');
const ORION_CONFIG = require('./orionstars.config');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;
const ORION_STARS_PASSWORD_MIN = ORION_CONFIG.PASSWORD_MIN_LENGTH;
const ORION_STARS_ACCOUNT_MIN = ORION_CONFIG.ACCOUNT_MIN_LENGTH;
const ORION_STARS_ACCOUNT_MAX = ORION_CONFIG.ACCOUNT_MAX_LENGTH;
/** Fresh agentLogin invalidates prior agentKeys — serialize per store/game agent. */
const ORION_STARS_SESSION_RETRY_ATTEMPTS = 4;
const ORION_STARS_SESSION_RETRY_DELAY_MS = 250;
/** In-process queue so concurrent topup/redeem/balance don't thrash agentLogin. */
const orionStarsAgentLocks = new Map();

function md5Hex(value) {
  return crypto.createHash('md5').update(String(value), 'utf8').digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOrionStarsAdvisoryLockIds(lockKey) {
  const hash = crypto.createHash('md5').update(`orion-agent:${lockKey}`, 'utf8').digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

async function withOrionStarsAgentProcessLock(lockKey, fn) {
  const key = String(lockKey || 'default').trim() || 'default';
  const prev = orionStarsAgentLocks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const next = prev.then(
    () => gate,
    () => gate
  );
  orionStarsAgentLocks.set(key, next);
  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    release();
    if (orionStarsAgentLocks.get(key) === next) {
      orionStarsAgentLocks.delete(key);
    }
  }
}

/**
 * Process-local queue only.
 * Do NOT hold pg_advisory_lock across provider HTTP — pooled connections can keep the lock
 * after release and block other backends on SELECT pg_advisory_lock(...) for a long time.
 * Cross-instance agentKey races are recovered via existing session/signature retries.
 */
async function withOrionStarsAgentLock(lockKey, fn) {
  return withOrionStarsAgentProcessLock(lockKey, fn);
}

function getOrionStarsAgentLockKey(game) {
  // Same agentName shares one provider session — lock by agent, not only game id.
  const agentName = String(game?.botUsername || '').trim().toLowerCase();
  if (agentName) return `agent:${agentName}`;
  if (game?.id != null) return `game:${game.id}`;
  return 'default';
}

function normalizeOrionStarsServiceUrl(baseUrl) {
  let url = String(baseUrl || '').trim().replace(/\/$/, '');
  if (!url) return '';
  if (url.endsWith('service.ashx')) return url;
  if (url.endsWith('/ws')) return `${url}/service.ashx`;
  return `${url}${ORION_CONFIG.DEFAULT_SERVICE_PATH}`;
}

function normalizeLegacyBotBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/$/, '');
}

function getOrionStarsLegacyBotBaseUrl() {
  return normalizeLegacyBotBaseUrl(process.env[ORION_CONFIG.LEGACY_BOT_ENV_KEY] || '');
}

function parseOrionStarsResponseBody(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      return JSON.parse(trimmed);
    } catch {
      return { _raw: trimmed };
    }
  }
  return {};
}

function readOrionStarsField(data, aliases) {
  if (!data || typeof data !== 'object') return '';
  for (const name of aliases) {
    if (data[name] != null && String(data[name]).trim() !== '') {
      return String(data[name]).trim();
    }
  }
  const lowerAliases = aliases.map((a) => String(a).toLowerCase());
  for (const [key, value] of Object.entries(data)) {
    if (value == null || String(value).trim() === '') continue;
    if (lowerAliases.includes(String(key).toLowerCase())) {
      return String(value).trim();
    }
  }
  return '';
}

function readOrionStarsCode(data) {
  const codeRaw = readOrionStarsField(data, ORION_CONFIG.FIELDS.CODE);
  if (codeRaw === '') return null;
  const asNum = Number(codeRaw);
  return Number.isFinite(asNum) ? asNum : codeRaw;
}

function isOrionStarsSuccessCode(code) {
  return ORION_CONFIG.SUCCESS_CODES.has(code);
}

function parseOrionStarsCode(data) {
  const code = readOrionStarsCode(data);
  if (isOrionStarsSuccessCode(code)) return { ok: true, data, code };
  const msg = readOrionStarsField(data, ORION_CONFIG.FIELDS.MSG) || 'Provider error';
  return { ok: false, msg, data, code };
}

function extractOrionStarsAgentKey(data) {
  const direct = readOrionStarsField(data, ORION_CONFIG.FIELDS.AGENT_KEY);
  if (direct) return direct;
  for (const nestedKey of ['data', 'result', 'response', 'Data', 'Result']) {
    const nested = data?.[nestedKey];
    if (nested && typeof nested === 'object') {
      const fromNested = readOrionStarsField(nested, ORION_CONFIG.FIELDS.AGENT_KEY);
      if (fromNested) return fromNested;
    }
  }
  return '';
}

/** Build sign input variants per official docs and common provider quirks. */
function buildOrionStarsSignVariants(agentName, time, agentKey) {
  const t = String(time);
  const n = String(agentName || '');
  const k = String(agentKey || '');
  return [
    { id: 'doc', raw: n.toLowerCase() + t + k.toLowerCase() },
    { id: 'key-as-is', raw: n.toLowerCase() + t + k },
    { id: 'all-lower', raw: (n + t + k).toLowerCase() }
  ];
}

function buildOrionStarsSign(agentName, time, agentKey) {
  return md5Hex(buildOrionStarsSignVariants(agentName, time, agentKey)[0].raw);
}

/**
 * Build query string in the same parameter order as the official API examples.
 */
function buildOrionStarsQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join('&');
}

async function resolveOrionStarsBotBaseUrl(game) {
  let fromTemplate = '';

  if (game?.gameTemplateId) {
    const linkedTemplate = await db.GameTemplate.findByPk(game.gameTemplateId, {
      attributes: ['botBaseUrl', 'gameKey']
    });
    fromTemplate = normalizeOrionStarsServiceUrl(linkedTemplate?.botBaseUrl);
  }

  if (!fromTemplate) {
    const gameKey = resolveGameIntegrationKey(game);
    const templates = await db.GameTemplate.findAll({
      where: { isActive: true },
      attributes: ['name', 'gameKey', 'botBaseUrl'],
      order: [['updated_at', 'DESC']]
    });
    const template = templates.find(
      (t) => isOrionStarsTerminalGame(t) && resolveGameIntegrationKey(t) === gameKey
    );
    fromTemplate = normalizeOrionStarsServiceUrl(template?.botBaseUrl);
  }

  const fromGame = normalizeOrionStarsServiceUrl(game?.botApiUrl);
  const resolved = fromTemplate || fromGame;

  if (fromTemplate && game?.id && fromTemplate !== fromGame) {
    await db.Game.update(
      { botApiUrl: fromTemplate.slice(0, 512) },
      { where: { id: game.id } }
    );
    game.botApiUrl = fromTemplate;
  }

  return resolved;
}

async function postOrionStarsAction(baseUrl, params) {
  const serviceUrl = normalizeOrionStarsServiceUrl(baseUrl);
  if (!serviceUrl) {
    const err = new Error('Orion Stars API URL is not configured.');
    err.statusCode = 400;
    throw err;
  }
  const query = buildOrionStarsQueryString(params);
  const url = `${serviceUrl}?${query}`;
  const res = await axios.post(url, null, {
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });
  const data = parseOrionStarsResponseBody(res.data);
  console.log('[OrionStars] agent API response', {
    action: params.action || 'unknown',
    httpStatus: res.status,
    response: data
  });
  return { data, status: res.status, url };
}

function mapOrionStarsError(msg) {
  const text = String(msg || '');
  const lower = text.toLowerCase();
  const isUserNotFound =
    /does\s*not\s*exist/i.test(text)
    || /account\s*not\s*exist/i.test(text)
    || /user\s*not\s*found/i.test(text)
    || /player\s*not\s*found/i.test(text)
    || /no\s*such\s*(user|account|player)/i.test(text)
    || (/not\s*found/i.test(text) && !/session/i.test(text));
  return {
    isSignatureError: /signature/i.test(text),
    // Prefer explicit session timeout; avoid treating generic HTTP "timeout" as session.
    isSessionTimeout:
      /session\s*timeout/i.test(text)
      || /session\s*(expired|invalid|not\s*found)/i.test(text)
      || (lower.includes('session') && lower.includes('expired')),
    isUserNotFound,
    isInvalidPassword:
      !isUserNotFound
      && (
        /pass\s*word/i.test(text)
        || /passwd/i.test(text)
        || /incorrect\s*pass/i.test(text)
        || /invalid\s*pass/i.test(text)
        || /wrong\s*pass/i.test(text)
      ),
    // Avoid matching "does not exist" — that is not-found, not duplicate.
    isUserAlreadyExists:
      !isUserNotFound
      && (
        /already\s*exist/i.test(text)
        || /duplicate/i.test(text)
        || (/exist/i.test(text) && !/not\s*exist/i.test(text) && !/does\s*not/i.test(text))
      )
  };
}

function isOrionStarsRecoverableSessionError(err) {
  return !!(err && (err.isSessionTimeout || err.isSignatureError));
}

function throwOrionStarsError(msg, data, statusCode = 502) {
  const err = new Error(msg || 'Orion Stars request failed.');
  err.statusCode = statusCode;
  err.externalResponse = data;
  Object.assign(err, mapOrionStarsError(msg));
  throw err;
}

/** Fresh time per call — avoid reusing the same second across rapid API requests. */
let lastOrionStarsTimeSec = 0;

function nextOrionStarsTime(unit = 'sec') {
  const now = Date.now();
  if (unit === 'ms') return now;
  let sec = Math.floor(now / 1000);
  if (sec <= lastOrionStarsTimeSec) sec = lastOrionStarsTimeSec + 1;
  lastOrionStarsTimeSec = sec;
  return sec;
}

/** Agent login — validates store credentials and returns agentKey (JSON field: agentkey). */
async function callOrionStarsAgentLogin(baseUrl, agentName, agentPassword) {
  const time = nextOrionStarsTime('sec');
  const { data } = await postOrionStarsAction(baseUrl, {
    action: ORION_CONFIG.ACTIONS.AGENT_LOGIN,
    agentName,
    agentPasswd: md5Hex(agentPassword),
    time
  });
  const parsed = parseOrionStarsCode(data);
  if (!parsed.ok) {
    throwOrionStarsError(parsed.msg || 'Orion Stars agent login failed.', data);
  }
  const agentKey = extractOrionStarsAgentKey(data);
  if (!agentKey) {
    const keys = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'none';
    throwOrionStarsError(`Orion Stars login succeeded but no agentKey was returned. Response keys: ${keys}`, data);
  }
  const balanceRaw = readOrionStarsField(data, ORION_CONFIG.FIELDS.BALANCE);
  return { agentKey, balance: balanceRaw, raw: data };
}

async function persistOrionStarsAgentKey(game, agentKey) {
  const trimmed = String(agentKey || '').trim().slice(0, 256);
  if (game?.id && trimmed) {
    await db.Game.update({ agentId: trimmed }, { where: { id: game.id } });
  }
  if (game) game.agentId = trimmed;
  return trimmed;
}

/**
 * Prefer cached games.agent_id; only agentLogin when missing or forceRefresh (session timeout).
 * Avoids login-on-every-call which invalidates concurrent in-flight requests.
 * Must run under withOrionStarsAgentLock so another worker cannot agentLogin mid-action.
 */
async function ensureOrionStarsAgentSession(game, { forceRefresh = false, reloadFromDb = false } = {}) {
  const baseUrl = await resolveOrionStarsBotBaseUrl(game);
  const agentName = String(game.botUsername || '').trim();
  const agentPassword = game.botPassword != null ? String(game.botPassword) : '';
  if (!baseUrl || !agentName || !agentPassword) {
    const err = new Error('Orion Stars store credentials are not configured.');
    err.statusCode = 400;
    throw err;
  }

  async function readCachedAgentKey() {
    let agentKey = '';
    if (game?.id) {
      const fresh = await db.Game.findByPk(game.id, { attributes: ['agentId'] });
      agentKey = String(fresh?.agentId || '').trim();
    }
    if (!agentKey) {
      agentKey = String(game.agentId || '').trim();
    }
    return agentKey;
  }

  if (!forceRefresh) {
    const agentKey = await readCachedAgentKey();
    if (agentKey) {
      game.agentId = agentKey;
      return { baseUrl, agentName, agentPassword, agentKey };
    }
  } else if (reloadFromDb) {
    // Another worker may have refreshed the key while we waited for the advisory lock.
    const agentKey = await readCachedAgentKey();
    if (agentKey) {
      game.agentId = agentKey;
      return { baseUrl, agentName, agentPassword, agentKey };
    }
  }

  const login = await callOrionStarsAgentLogin(baseUrl, agentName, agentPassword);
  await persistOrionStarsAgentKey(game, login.agentKey);
  return { baseUrl, agentName, agentPassword, agentKey: login.agentKey };
}

/**
 * Setup legacy streamlit bot API key (POST /create-user) when legacy URL + admin token exist.
 */
async function setupOrionStarsLegacyBotCredentials({
  legacyBotBaseUrl,
  streamlitToken,
  gameUsername,
  gamePassword,
  gameName
}) {
  const legacyUrl = normalizeLegacyBotBaseUrl(legacyBotBaseUrl);
  const token = String(streamlitToken || '').trim();
  if (!legacyUrl || !token || !gameUsername || !gamePassword) return null;

  const {
    getAdminClients,
    addClient,
    generateKey
  } = require('./addGame.service');

  const clientsResult = await getAdminClients(legacyUrl, token, gameName);
  if (!clientsResult.success) {
    const err = new Error('Orion Stars legacy bot clients check failed.');
    err.statusCode = 502;
    throw err;
  }
  const usernameExists = (clientsResult.clients || []).some((c) => String(c).trim() === gameUsername);
  if (!usernameExists) {
    await addClient(legacyUrl, token, gameUsername, gamePassword, gameName, null, null);
  }
  const keyResult = await generateKey(legacyUrl, token, gameUsername, gameName);
  if (!keyResult.success || !keyResult.api_key) {
    const err = new Error('Orion Stars legacy bot did not return an API key.');
    err.statusCode = 502;
    throw err;
  }
  return {
    botApiKey: keyResult.api_key.slice(0, 512),
    streamlitToken: token.slice(0, 512),
    legacyBotApiUrl: legacyUrl.slice(0, 512)
  };
}

/**
 * Signed agent action (registerUser, recharge, redeem, etc.) with doc sign variants.
 * Fresh unique time per attempt — do not reuse time across sign variants / rapid calls.
 */
async function callOrionStarsSignedAction(baseUrl, agentName, agentKey, action, signedParams = {}) {
  const timeUnits = Array.isArray(ORION_CONFIG.TIME_UNITS) && ORION_CONFIG.TIME_UNITS.length
    ? ORION_CONFIG.TIME_UNITS
    : ['sec', 'ms'];
  let lastError;

  for (const timeUnit of timeUnits) {
    const time = nextOrionStarsTime(timeUnit);
    const variants = buildOrionStarsSignVariants(agentName, time, agentKey);

    for (const variant of variants) {
      const sign = md5Hex(variant.raw);
      const { data } = await postOrionStarsAction(baseUrl, {
        action,
        agentName,
        time,
        sign,
        ...signedParams
      });
      const parsed = parseOrionStarsCode(data);
      if (parsed.ok) {
        return { raw: data, signVariant: variant.id, timeUnit };
      }
      const err = new Error(parsed.msg || `Orion Stars ${action} failed.`);
      const mapped = mapOrionStarsError(parsed.msg);
      err.statusCode = mapped.isUserAlreadyExists ? 409 : 502;
      err.externalResponse = data;
      Object.assign(err, mapped);
      err.signVariant = variant.id;
      err.timeUnit = timeUnit;
      lastError = err;
      // Account exists: stop — caller may invent a new username.
      if (err.isUserAlreadyExists) throw err;
      // Session timeout: try next time unit before outer agentKey refresh.
      if (err.isSessionTimeout) break;
      // Only keep trying sign variants for signature quirks.
      if (!err.isSignatureError) throw err;
    }
  }

  throw lastError || new Error(`Orion Stars ${action} failed.`);
}

async function callOrionStarsSignedActionWithAgentLogin(game, action, signedParams = {}, options = {}) {
  const preferFreshSession = options.preferFreshSession === true;
  return withOrionStarsAgentLock(getOrionStarsAgentLockKey(game), async () => {
    let lastErr = null;
    for (let attempt = 1; attempt <= ORION_STARS_SESSION_RETRY_ATTEMPTS; attempt++) {
      const forceRefresh = preferFreshSession || attempt > 1;
      try {
        const session = await ensureOrionStarsAgentSession(game, { forceRefresh });
        return await callOrionStarsSignedAction(
          session.baseUrl,
          session.agentName,
          session.agentKey,
          action,
          signedParams
        );
      } catch (err) {
        lastErr = err;
        if (!isOrionStarsRecoverableSessionError(err) || attempt === ORION_STARS_SESSION_RETRY_ATTEMPTS) {
          throw err;
        }
        console.info('[OrionStars] session/signature error — refreshing agentKey and retrying', {
          action,
          attempt,
          message: err.message
        });
        await sleep(ORION_STARS_SESSION_RETRY_DELAY_MS * attempt);
      }
    }
    throw lastErr || new Error(`Orion Stars ${action} failed.`);
  });
}

/**
 * Register via terminal API using cached/fresh agentKey and unique time + sign.
 */
async function callOrionStarsRegisterUser(baseUrl, agentName, agentKey, account, plainPassword) {
  const result = await callOrionStarsSignedAction(
    baseUrl,
    agentName,
    agentKey,
    ORION_CONFIG.ACTIONS.REGISTER_USER,
    { account, passwd: md5Hex(plainPassword) }
  );
  return { account_name: account, password: plainPassword, raw: result.raw, signVariant: result.signVariant };
}

/**
 * Recharge player account via terminal agent API (action=recharge).
 */
async function callOrionStarsRechargeWithAgentLogin(game, account, amount) {
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) {
    const err = new Error('Invalid recharge amount.');
    err.statusCode = 400;
    throw err;
  }
  const playerAccount = String(account || '').trim();
  if (!playerAccount) {
    const err = new Error('Player account is required for recharge.');
    err.statusCode = 400;
    throw err;
  }
  return callOrionStarsSignedActionWithAgentLogin(game, ORION_CONFIG.ACTIONS.RECHARGE, {
    account: playerAccount,
    amount: amt
  });
}

/**
 * Top-up: try terminal recharge first; fallback to legacy bot /deposit when sign fails.
 */
async function rechargeOrionStarsUser(game, account, amount, { callBotDeposit }) {
  try {
    return await callOrionStarsRechargeWithAgentLogin(game, account, amount);
  } catch (agentErr) {
    if (!canUseOrionStarsLegacyRegister(game) || typeof callBotDeposit !== 'function') {
      throw agentErr;
    }
    const legacyUrl = getOrionStarsLegacyBotBaseUrl();
    await callBotDeposit(legacyUrl, game.botApiKey, account, amount);
    return { legacy: true };
  }
}

/**
 * Redeem from player account via terminal agent API (action=redeem).
 * Uses a fresh agentKey under the cross-instance lock — redeem is rare vs balance polls,
 * and stale keys were the main "Session timeout" failure mode.
 */
async function callOrionStarsRedeemWithAgentLogin(game, account, amount) {
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) {
    const err = new Error('Invalid redeem amount.');
    err.statusCode = 400;
    throw err;
  }
  const playerAccount = String(account || '').trim();
  if (!playerAccount) {
    const err = new Error('Player account is required for redeem.');
    err.statusCode = 400;
    throw err;
  }
  return callOrionStarsSignedActionWithAgentLogin(
    game,
    ORION_CONFIG.ACTIONS.REDEEM,
    {
      account: playerAccount,
      amount: amt
    },
    { preferFreshSession: true }
  );
}

/**
 * Redeem: try terminal redeem first; fallback to legacy bot /redeem when sign fails.
 */
async function redeemOrionStarsUser(game, account, amount, { callBotRedeem }) {
  try {
    return await callOrionStarsRedeemWithAgentLogin(game, account, amount);
  } catch (agentErr) {
    if (!canUseOrionStarsLegacyRegister(game) || typeof callBotRedeem !== 'function') {
      throw agentErr;
    }
    const legacyUrl = getOrionStarsLegacyBotBaseUrl();
    await callBotRedeem(legacyUrl, game.botApiKey, account, amount);
    return { legacy: true };
  }
}

/**
 * Change a player's password via terminal agent API (action=changePasswd).
 * Docs: account (player), passwd = MD5(current), passwdnew = MD5(new), signed with agent.
 */
async function changeOrionStarsUserPasswordWithAgentLogin(game, account, oldPlainPassword, newPlainPassword) {
  const playerAccount = String(account || '').trim();
  const oldPass = oldPlainPassword != null ? String(oldPlainPassword) : '';
  const newPass = newPlainPassword != null ? String(newPlainPassword) : '';
  if (!playerAccount) {
    const err = new Error('Player account is required to change the password.');
    err.statusCode = 400;
    throw err;
  }
  if (!oldPass) {
    const err = new Error('Current player password is required to change the password.');
    err.statusCode = 400;
    throw err;
  }
  if (newPass.length < ORION_STARS_PASSWORD_MIN) {
    const err = new Error(`New password must be at least ${ORION_STARS_PASSWORD_MIN} characters.`);
    err.statusCode = 400;
    throw err;
  }
  return callOrionStarsSignedActionWithAgentLogin(game, ORION_CONFIG.ACTIONS.CHANGE_PASSWORD, {
    account: playerAccount,
    passwd: md5Hex(oldPass),
    passwdnew: md5Hex(newPass)
  });
}

function extractOrionStarsUserBalance(data) {
  const raw = readOrionStarsField(data, ['userbalance', 'userBalance', 'UserBalance']);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Query player balance via terminal agent API (action=queryInfo).
 */
async function queryOrionStarsUserBalanceWithAgentLogin(game, account, plainPassword) {
  const playerAccount = String(account || '').trim();
  const password = plainPassword != null ? String(plainPassword) : '';
  if (!playerAccount || !password) {
    const err = new Error('Player account credentials are required for balance query.');
    err.statusCode = 400;
    throw err;
  }
  const result = await callOrionStarsSignedActionWithAgentLogin(game, ORION_CONFIG.ACTIONS.QUERY_INFO, {
    account: playerAccount,
    passwd: md5Hex(password)
  });
  return {
    balance: extractOrionStarsUserBalance(result.raw),
    raw: result.raw
  };
}

/**
 * Docs: queryInfo requires account + MD5(passwd).
 * Link UI only collects username, so probe with a dummy password:
 * - code 200 → account exists
 * - "account does not exist" / not-found → throw provider message (404)
 * - wrong-password style errors → account exists (safe to link)
 */
async function verifyOrionStarsUserExistsForLink(game, account) {
  const playerAccount = String(account || '').trim();
  if (!playerAccount) {
    const err = new Error('Player account is required.');
    err.statusCode = 400;
    throw err;
  }
  if (playerAccount.length < ORION_STARS_ACCOUNT_MIN || playerAccount.length > ORION_STARS_ACCOUNT_MAX) {
    const err = new Error(
      `Game username must be between ${ORION_STARS_ACCOUNT_MIN} and ${ORION_STARS_ACCOUNT_MAX} characters.`
    );
    err.statusCode = 400;
    throw err;
  }

  const probePasswd = md5Hex(`os_link_probe_${playerAccount}`);
  try {
    const result = await callOrionStarsSignedActionWithAgentLogin(
      game,
      ORION_CONFIG.ACTIONS.QUERY_INFO,
      {
        account: playerAccount,
        passwd: probePasswd
      }
    );
    return {
      exists: true,
      balance: extractOrionStarsUserBalance(result.raw),
      raw: result.raw
    };
  } catch (err) {
    const mapped = mapOrionStarsError(err && err.message);
    const isNotFound = !!(err && (err.isUserNotFound || mapped.isUserNotFound));
    if (isNotFound) {
      const providerMsg = String(err.message || '').trim()
        || 'The account does not exist. Please check and try again.';
      const notFoundErr = new Error(providerMsg);
      notFoundErr.statusCode = 404;
      notFoundErr.isSearchUserNotFound = true;
      notFoundErr.isUserNotFound = true;
      notFoundErr.code = 'GAME_USER_NOT_FOUND';
      notFoundErr.externalResponse = err.externalResponse;
      throw notFoundErr;
    }

    // Wrong password / other account-level rejects still mean username exists.
    // Only bubble transport/session/sign failures for retry/manual handling.
    if (
      err
      && (err.isInvalidPassword
        || mapped.isInvalidPassword
        || (
          !err.isSessionTimeout
          && !err.isSignatureError
          && !isOrionStarsRecoverableSessionError(err)
        ))
    ) {
      return { exists: true, raw: err.externalResponse || null };
    }

    throw err;
  }
}

/**
 * Refresh balance: try terminal queryInfo first; fallback to legacy bot /get-user-score when sign fails.
 */
async function queryOrionStarsUserBalance(game, account, plainPassword, { callBotBalance }) {
  try {
    const result = await queryOrionStarsUserBalanceWithAgentLogin(game, account, plainPassword);
    return result.balance;
  } catch (agentErr) {
    if (!canUseOrionStarsLegacyRegister(game) || typeof callBotBalance !== 'function') {
      throw agentErr;
    }
    const legacyUrl = getOrionStarsLegacyBotBaseUrl();
    return callBotBalance(legacyUrl, game.botApiKey, account);
  }
}

/**
 * Reuse cached agentKey when possible; refresh only on session/signature failures.
 */
async function callOrionStarsRegisterUserWithAgentLogin(game, account, plainPassword) {
  return withOrionStarsAgentLock(getOrionStarsAgentLockKey(game), async () => {
    let lastErr = null;
    for (let attempt = 1; attempt <= ORION_STARS_SESSION_RETRY_ATTEMPTS; attempt++) {
      const forceRefresh = attempt > 1;
      try {
        const session = await ensureOrionStarsAgentSession(game, { forceRefresh });
        return await callOrionStarsRegisterUser(
          session.baseUrl,
          session.agentName,
          session.agentKey,
          account,
          plainPassword
        );
      } catch (err) {
        lastErr = err;
        if (!isOrionStarsRecoverableSessionError(err) || attempt === ORION_STARS_SESSION_RETRY_ATTEMPTS) {
          throw err;
        }
        console.info('[OrionStars] register session/signature error — refreshing agentKey and retrying', {
          attempt,
          message: err.message
        });
        await sleep(ORION_STARS_SESSION_RETRY_DELAY_MS * attempt);
      }
    }
    throw lastErr || new Error('Orion Stars registerUser failed.');
  });
}

function canUseOrionStarsLegacyRegister(game) {
  const legacyUrl = getOrionStarsLegacyBotBaseUrl();
  const apiKey = game?.botApiKey != null ? String(game.botApiKey).trim() : '';
  return Boolean(legacyUrl && apiKey);
}

/**
 * User registration: try terminal registerUser first; fallback to legacy /create-user bot API.
 */
async function registerOrionStarsUser(game, account, plainPassword, { callBotCreateUser, gameName }) {
  try {
    return await callOrionStarsRegisterUserWithAgentLogin(game, account, plainPassword);
  } catch (agentErr) {
    if (!canUseOrionStarsLegacyRegister(game) || typeof callBotCreateUser !== 'function') {
      throw agentErr;
    }
    const legacyUrl = getOrionStarsLegacyBotBaseUrl();
    return callBotCreateUser(legacyUrl, game.botApiKey, account, gameName);
  }
}

function isOrionStarsSignatureError(msg) {
  return mapOrionStarsError(msg).isSignatureError;
}

function isOrionStarsUserExists(msg) {
  return mapOrionStarsError(msg).isUserAlreadyExists;
}

function generateOrionStarsPassword() {
  const letters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const len = ORION_STARS_PASSWORD_MIN + Math.floor(Math.random() * 5);
  let pass = '';
  pass += letters[Math.floor(Math.random() * letters.length)];
  pass += numbers[Math.floor(Math.random() * numbers.length)];
  for (let i = pass.length; i < len; i++) {
    const set = i % 2 === 0 ? letters : numbers;
    pass += set[Math.floor(Math.random() * set.length)];
  }
  return pass.split('').sort(() => Math.random() - 0.5).join('');
}

module.exports = {
  ORION_CONFIG,
  ORION_STARS_PASSWORD_MIN,
  ORION_STARS_ACCOUNT_MIN,
  ORION_STARS_ACCOUNT_MAX,
  md5Hex,
  normalizeOrionStarsServiceUrl,
  getOrionStarsLegacyBotBaseUrl,
  buildOrionStarsSign,
  buildOrionStarsSignVariants,
  resolveOrionStarsBotBaseUrl,
  callOrionStarsAgentLogin,
  setupOrionStarsLegacyBotCredentials,
  callOrionStarsRegisterUser,
  callOrionStarsRegisterUserWithAgentLogin,
  callOrionStarsRechargeWithAgentLogin,
  rechargeOrionStarsUser,
  callOrionStarsRedeemWithAgentLogin,
  redeemOrionStarsUser,
  changeOrionStarsUserPasswordWithAgentLogin,
  queryOrionStarsUserBalance,
  queryOrionStarsUserBalanceWithAgentLogin,
  registerOrionStarsUser,
  verifyOrionStarsUserExistsForLink,
  generateOrionStarsPassword,
  isOrionStarsTerminalGame,
  isOrionStarsSignatureError,
  isOrionStarsUserExists,
  readOrionStarsField,
  extractOrionStarsAgentKey,
  parseOrionStarsCode
};
