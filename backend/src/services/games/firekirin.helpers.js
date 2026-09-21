'use strict';

/**
 * Firekirin Agent API helpers (MW Terminal API v1.22).
 * Mirrors OrionStars Terminal agent flow; kept separate so the existing Firekirin bot path stays untouched.
 */
const axios = require('axios');
const crypto = require('crypto');
const db = require('../../db/models');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');
const { isFirekirinTerminalGame, resolveGameIntegrationKey } = require('../../utils/gameIntegration.helpers');
const FIREKIRIN_CONFIG = require('./firekirin.config');

const HTTP_TIMEOUT_MS = THIRD_PARTY_HTTP_TIMEOUT_MS;
const FIREKIRIN_PASSWORD_MIN = FIREKIRIN_CONFIG.PASSWORD_MIN_LENGTH;
const FIREKIRIN_ACCOUNT_MIN = FIREKIRIN_CONFIG.ACCOUNT_MIN_LENGTH;
const FIREKIRIN_ACCOUNT_MAX = FIREKIRIN_CONFIG.ACCOUNT_MAX_LENGTH;
/** Fresh agentLogin invalidates prior agentKeys — serialize per store/game agent. */
const FIREKIRIN_SESSION_RETRY_ATTEMPTS = 2;
const FIREKIRIN_SESSION_RETRY_DELAY_MS = 150;
/** In-process queue so concurrent topup/redeem/balance don't thrash agentLogin. */
const firekirinAgentLocks = new Map();
/**
 * Cache last-working { timeUnit, signVariant } per agent so topup/redeem hit 1 HTTP call
 * instead of probing sec/ms × sign variants on every request.
 */
const firekirinSignPrefs = new Map();

function md5Hex(value) {
  return crypto.createHash('md5').update(String(value), 'utf8').digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFirekirinAdvisoryLockIds(lockKey) {
  const hash = crypto.createHash('md5').update(`firekirin-agent:${lockKey}`, 'utf8').digest();
  return [hash.readInt32BE(0), hash.readInt32BE(4)];
}

async function withFirekirinAgentProcessLock(lockKey, fn) {
  const key = String(lockKey || 'default').trim() || 'default';
  const prev = firekirinAgentLocks.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const next = prev.then(
    () => gate,
    () => gate
  );
  firekirinAgentLocks.set(key, next);
  try {
    await prev.catch(() => {});
    return await fn();
  } finally {
    release();
    if (firekirinAgentLocks.get(key) === next) {
      firekirinAgentLocks.delete(key);
    }
  }
}

/**
 * Serialize Firekirin agent calls in-process only.
 * Do NOT hold pg_advisory_lock across provider HTTP — that pins pool connections and can
 * leave waiters on SELECT pg_advisory_lock(...) for tens of minutes (backend pool exhaustion).
 * Cross-instance agentKey races are recovered via existing session/signature retries.
 */
async function withFirekirinAgentLock(lockKey, fn) {
  return withFirekirinAgentProcessLock(lockKey, fn);
}

function getFirekirinAgentLockKey(game) {
  const agentName = String(game?.botUsername || '').trim().toLowerCase();
  if (agentName) return `agent:${agentName}`;
  if (game?.id != null) return `game:${game.id}`;
  return 'default';
}

function normalizeFirekirinServiceUrl(baseUrl) {
  let url = String(baseUrl || '').trim().replace(/\/$/, '');
  if (!url) return '';
  if (url.endsWith('service.ashx')) return url;
  if (url.endsWith('/ws')) return `${url}/service.ashx`;
  return `${url}${FIREKIRIN_CONFIG.DEFAULT_SERVICE_PATH}`;
}

function parseFirekirinResponseBody(raw) {
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

function readFirekirinField(data, aliases) {
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

function readFirekirinCode(data) {
  const codeRaw = readFirekirinField(data, FIREKIRIN_CONFIG.FIELDS.CODE);
  if (codeRaw === '') return null;
  const asNum = Number(codeRaw);
  return Number.isFinite(asNum) ? asNum : codeRaw;
}

function isFirekirinSuccessCode(code) {
  return FIREKIRIN_CONFIG.SUCCESS_CODES.has(code);
}

function parseFirekirinCode(data) {
  const code = readFirekirinCode(data);
  if (isFirekirinSuccessCode(code)) return { ok: true, data, code };
  const msg = readFirekirinField(data, FIREKIRIN_CONFIG.FIELDS.MSG) || 'Provider error';
  return { ok: false, msg, data, code };
}

function extractFirekirinAgentKey(data) {
  const direct = readFirekirinField(data, FIREKIRIN_CONFIG.FIELDS.AGENT_KEY);
  if (direct) return direct;
  for (const nestedKey of ['data', 'result', 'response', 'Data', 'Result']) {
    const nested = data?.[nestedKey];
    if (nested && typeof nested === 'object') {
      const fromNested = readFirekirinField(nested, FIREKIRIN_CONFIG.FIELDS.AGENT_KEY);
      if (fromNested) return fromNested;
    }
  }
  return '';
}

function buildFirekirinSignVariants(agentName, time, agentKey) {
  const t = String(time);
  const n = String(agentName || '');
  const k = String(agentKey || '');
  return [
    { id: 'doc', raw: n.toLowerCase() + t + k.toLowerCase() },
    { id: 'key-as-is', raw: n.toLowerCase() + t + k },
    { id: 'all-lower', raw: (n + t + k).toLowerCase() }
  ];
}

function getFirekirinSignPrefKey(agentName) {
  return String(agentName || '').trim().toLowerCase() || 'default';
}

function getFirekirinSignPref(agentName) {
  return firekirinSignPrefs.get(getFirekirinSignPrefKey(agentName)) || null;
}

function rememberFirekirinSignPref(agentName, timeUnit, signVariant) {
  if (!timeUnit || !signVariant) return;
  firekirinSignPrefs.set(getFirekirinSignPrefKey(agentName), {
    timeUnit: String(timeUnit),
    signVariant: String(signVariant)
  });
}

/** Prefer cached working combo first; fall back to configured order. */
function orderedFirekirinTimeUnits(preferredUnit) {
  const configured = Array.isArray(FIREKIRIN_CONFIG.TIME_UNITS) && FIREKIRIN_CONFIG.TIME_UNITS.length
    ? FIREKIRIN_CONFIG.TIME_UNITS
    : ['sec', 'ms'];
  if (!preferredUnit) return configured;
  return [preferredUnit, ...configured.filter((u) => u !== preferredUnit)];
}

function orderedFirekirinSignVariants(agentName, time, agentKey, preferredVariantId) {
  const variants = buildFirekirinSignVariants(agentName, time, agentKey);
  if (!preferredVariantId) return variants;
  const preferred = variants.filter((v) => v.id === preferredVariantId);
  const rest = variants.filter((v) => v.id !== preferredVariantId);
  return preferred.length ? [...preferred, ...rest] : variants;
}

function buildFirekirinSign(agentName, time, agentKey) {
  return md5Hex(buildFirekirinSignVariants(agentName, time, agentKey)[0].raw);
}

function buildFirekirinQueryString(params) {
  const parts = [];
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.join('&');
}

async function resolveFirekirinBotBaseUrl(game) {
  let fromTemplate = '';

  if (game?.gameTemplateId) {
    const linkedTemplate = await db.GameTemplate.findByPk(game.gameTemplateId, {
      attributes: ['botBaseUrl', 'gameKey']
    });
    fromTemplate = normalizeFirekirinServiceUrl(linkedTemplate?.botBaseUrl);
  }

  if (!fromTemplate) {
    const gameKey = resolveGameIntegrationKey(game);
    const templates = await db.GameTemplate.findAll({
      where: { isActive: true },
      attributes: ['name', 'gameKey', 'botBaseUrl'],
      order: [['updated_at', 'DESC']]
    });
    const template = templates.find(
      (t) => isFirekirinTerminalGame(t) && resolveGameIntegrationKey(t) === gameKey
    );
    fromTemplate = normalizeFirekirinServiceUrl(template?.botBaseUrl);
  }

  const fromGame = normalizeFirekirinServiceUrl(game?.botApiUrl);
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

async function postFirekirinAction(baseUrl, params) {
  const serviceUrl = normalizeFirekirinServiceUrl(baseUrl);
  if (!serviceUrl) {
    const err = new Error('Firekirin API URL is not configured.');
    err.statusCode = 400;
    throw err;
  }
  const query = buildFirekirinQueryString(params);
  const url = `${serviceUrl}?${query}`;
  const res = await axios.post(url, null, {
    timeout: HTTP_TIMEOUT_MS,
    validateStatus: () => true
  });
  const data = parseFirekirinResponseBody(res.data);
  console.log('[Firekirin] agent API response', {
    action: params.action || 'unknown',
    httpStatus: res.status,
    response: data
  });
  return { data, status: res.status, url };
}

function mapFirekirinError(msg) {
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
    isSessionTimeout:
      /session\s*timeout/i.test(text)
      || /session\s*(expired|invalid|not\s*found)/i.test(text)
      || (lower.includes('session') && lower.includes('expired')),
    isRateLimited:
      /rate\s*limit/i.test(text)
      || /too\s*many\s*request/i.test(text)
      || /请求过快/i.test(text)
      || /频率/i.test(text),
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
      /already\s*exist/i.test(text)
      || /duplicate/i.test(text)
      || /account\s*number\s*already/i.test(text),
  };
}

/** True when queryInfo/register failed because stored player credentials no longer match Firekirin. */
function isFirekirinInvalidPlayerPasswordError(err) {
  if (!err) return false;
  if (err.isInvalidPassword) return true;

  const candidates = [
    err.message,
    err.originalMessage,
    err.externalResponse && typeof err.externalResponse === 'object'
      ? (err.externalResponse.msg || err.externalResponse.message)
      : null
  ].filter(Boolean);

  return candidates.some((raw) => {
    const text = String(raw);
    const lower = text.toLowerCase();
    if (/does\s*not\s*exist/i.test(text) || /account\s*not\s*exist/i.test(text)) return false;
    return (
      /account\s*or\s*password/i.test(lower)
      || (/pass\s*word/i.test(lower) && /incorrect|invalid|wrong|filled in is incorrect/i.test(lower))
    );
  });
}

function isFirekirinRecoverableSessionError(err) {
  return !!(err && (err.isSessionTimeout || err.isSignatureError));
}

function throwFirekirinError(msg, data, statusCode = 502) {
  const err = new Error(msg || 'Firekirin request failed.');
  err.statusCode = statusCode;
  err.externalResponse = data;
  Object.assign(err, mapFirekirinError(msg));
  throw err;
}

/** Docs: time is one-time after success — never reuse the same value. */
let lastFirekirinTimeSec = 0;

function nextFirekirinTime(unit = 'sec') {
  const now = Date.now();
  if (unit === 'ms') return now;
  // Seconds must stay unique even when calls land in the same wall-clock second.
  let sec = Math.floor(now / 1000);
  if (sec <= lastFirekirinTimeSec) sec = lastFirekirinTimeSec + 1;
  lastFirekirinTimeSec = sec;
  return sec;
}

/** Agent login — validates store credentials and returns agentKey. */
async function callFirekirinAgentLogin(baseUrl, agentName, agentPassword) {
  const time = nextFirekirinTime('sec');
  const { data } = await postFirekirinAction(baseUrl, {
    action: FIREKIRIN_CONFIG.ACTIONS.AGENT_LOGIN,
    agentName,
    agentPasswd: md5Hex(agentPassword),
    time
  });
  const parsed = parseFirekirinCode(data);
  if (!parsed.ok) {
    throwFirekirinError(parsed.msg || 'Firekirin agent login failed.', data);
  }
  const agentKey = extractFirekirinAgentKey(data);
  if (!agentKey) {
    const keys = data && typeof data === 'object' ? Object.keys(data).join(', ') : 'none';
    throwFirekirinError(`Firekirin login succeeded but no agentKey was returned. Response keys: ${keys}`, data);
  }
  const balanceRaw = readFirekirinField(data, FIREKIRIN_CONFIG.FIELDS.BALANCE);
  return { agentKey, balance: balanceRaw, raw: data };
}

async function persistFirekirinAgentKey(game, agentKey) {
  const trimmed = String(agentKey || '').trim().slice(0, 256);
  if (game?.id && trimmed) {
    await db.Game.update({ agentId: trimmed }, { where: { id: game.id } });
  }
  if (game) game.agentId = trimmed;
  return trimmed;
}

/**
 * Prefer cached games.agent_id; only agentLogin when missing or forceRefresh (session timeout).
 * Must run under withFirekirinAgentLock so another worker cannot agentLogin mid-action.
 */
async function ensureFirekirinAgentSession(game, { forceRefresh = false, reloadFromDb = false } = {}) {
  const baseUrl = await resolveFirekirinBotBaseUrl(game);
  const agentName = String(game.botUsername || '').trim();
  const agentPassword = game.botPassword != null ? String(game.botPassword) : '';
  if (!baseUrl || !agentName || !agentPassword) {
    const err = new Error('Firekirin store credentials are not configured.');
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
    const agentKey = await readCachedAgentKey();
    if (agentKey) {
      game.agentId = agentKey;
      return { baseUrl, agentName, agentPassword, agentKey };
    }
  }

  const login = await callFirekirinAgentLogin(baseUrl, agentName, agentPassword);
  await persistFirekirinAgentKey(game, login.agentKey);
  return { baseUrl, agentName, agentPassword, agentKey: login.agentKey };
}

async function callFirekirinSignedAction(baseUrl, agentName, agentKey, action, signedParams = {}) {
  const pref = getFirekirinSignPref(agentName);
  const timeUnits = orderedFirekirinTimeUnits(pref?.timeUnit);
  let lastError;

  // Fresh time per attempt — docs: time expires after one successful use.
  // First try uses cached timeUnit+signVariant (typically 1 HTTP call after warm-up).
  for (const timeUnit of timeUnits) {
    const time = nextFirekirinTime(timeUnit);
    const variants = orderedFirekirinSignVariants(agentName, time, agentKey, pref?.signVariant);

    for (const variant of variants) {
      const sign = md5Hex(variant.raw);
      const { data } = await postFirekirinAction(baseUrl, {
        action,
        agentName,
        time,
        sign,
        ...signedParams
      });
      const parsed = parseFirekirinCode(data);
      if (parsed.ok) {
        rememberFirekirinSignPref(agentName, timeUnit, variant.id);
        return { raw: data, signVariant: variant.id, timeUnit };
      }
      const err = new Error(parsed.msg || `Firekirin ${action} failed.`);
      const mapped = mapFirekirinError(parsed.msg);
      err.statusCode = mapped.isUserAlreadyExists
        ? 409
        : mapped.isUserNotFound
          ? 404
          : mapped.isRateLimited
            ? 429
            : 502;
      err.externalResponse = data;
      Object.assign(err, mapped);
      err.signVariant = variant.id;
      err.timeUnit = timeUnit;
      lastError = err;
      // Account exists: stop — caller will invent a new username and retry.
      if (err.isUserAlreadyExists) throw err;
      // Rate limit: stop probing variants; outer layer hides message from users.
      if (err.isRateLimited) throw err;
      // Session timeout: try next time unit before outer agentKey refresh.
      if (err.isSessionTimeout) break;
      // Only keep trying sign variants for signature quirks.
      if (!err.isSignatureError) throw err;
    }
  }

  throw lastError || new Error(`Firekirin ${action} failed.`);
}

async function callFirekirinSignedActionWithAgentLogin(game, action, signedParams = {}) {
  return withFirekirinAgentLock(getFirekirinAgentLockKey(game), async () => {
    let lastErr = null;
    for (let attempt = 1; attempt <= FIREKIRIN_SESSION_RETRY_ATTEMPTS; attempt++) {
      const forceRefresh = attempt > 1;
      try {
        const session = await ensureFirekirinAgentSession(game, { forceRefresh });
        return await callFirekirinSignedAction(
          session.baseUrl,
          session.agentName,
          session.agentKey,
          action,
          signedParams
        );
      } catch (err) {
        lastErr = err;
        if (!isFirekirinRecoverableSessionError(err) || attempt === FIREKIRIN_SESSION_RETRY_ATTEMPTS) {
          throw err;
        }
        console.info('[Firekirin] session/signature error — refreshing agentKey and retrying', {
          action,
          attempt,
          message: err.message
        });
        await sleep(FIREKIRIN_SESSION_RETRY_DELAY_MS * attempt);
      }
    }
    throw lastErr || new Error(`Firekirin ${action} failed.`);
  });
}

async function callFirekirinRegisterUser(baseUrl, agentName, agentKey, account, plainPassword) {
  const result = await callFirekirinSignedAction(
    baseUrl,
    agentName,
    agentKey,
    FIREKIRIN_CONFIG.ACTIONS.REGISTER_USER,
    { account, passwd: md5Hex(plainPassword) }
  );
  return { account_name: account, password: plainPassword, raw: result.raw, signVariant: result.signVariant };
}

async function callFirekirinRegisterUserWithAgentLogin(game, account, plainPassword) {
  return withFirekirinAgentLock(getFirekirinAgentLockKey(game), async () => {
    let lastErr = null;
    for (let attempt = 1; attempt <= FIREKIRIN_SESSION_RETRY_ATTEMPTS; attempt++) {
      const forceRefresh = attempt > 1;
      try {
        const session = await ensureFirekirinAgentSession(game, { forceRefresh });
        return await callFirekirinRegisterUser(
          session.baseUrl,
          session.agentName,
          session.agentKey,
          account,
          plainPassword
        );
      } catch (err) {
        lastErr = err;
        if (!isFirekirinRecoverableSessionError(err) || attempt === FIREKIRIN_SESSION_RETRY_ATTEMPTS) {
          throw err;
        }
        console.info('[Firekirin] register session/signature error — refreshing agentKey and retrying', {
          attempt,
          message: err.message
        });
        await sleep(FIREKIRIN_SESSION_RETRY_DELAY_MS * attempt);
      }
    }
    throw lastErr || new Error('Firekirin registerUser failed.');
  });
}

async function registerFirekirinUser(game, account, plainPassword) {
  return callFirekirinRegisterUserWithAgentLogin(game, account, plainPassword);
}

async function callFirekirinRechargeWithAgentLogin(game, account, amount) {
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
  return callFirekirinSignedActionWithAgentLogin(game, FIREKIRIN_CONFIG.ACTIONS.RECHARGE, {
    account: playerAccount,
    amount: amt
  });
}

async function rechargeFirekirinUser(game, account, amount) {
  return callFirekirinRechargeWithAgentLogin(game, account, amount);
}

async function callFirekirinRedeemWithAgentLogin(game, account, amount) {
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
  return callFirekirinSignedActionWithAgentLogin(
    game,
    FIREKIRIN_CONFIG.ACTIONS.REDEEM,
    {
      account: playerAccount,
      amount: amt
    }
  );
}

async function redeemFirekirinUser(game, account, amount) {
  return callFirekirinRedeemWithAgentLogin(game, account, amount);
}

async function changeFirekirinUserPasswordWithAgentLogin(game, account, oldPlainPassword, newPlainPassword) {
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
  if (newPass.length < FIREKIRIN_PASSWORD_MIN) {
    const err = new Error(`New password must be at least ${FIREKIRIN_PASSWORD_MIN} characters.`);
    err.statusCode = 400;
    throw err;
  }
  return callFirekirinSignedActionWithAgentLogin(game, FIREKIRIN_CONFIG.ACTIONS.CHANGE_PASSWORD, {
    account: playerAccount,
    passwd: md5Hex(oldPass),
    passwdnew: md5Hex(newPass)
  });
}

function extractFirekirinUserBalance(data) {
  const raw = readFirekirinField(data, FIREKIRIN_CONFIG.FIELDS.USER_BALANCE);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function queryFirekirinUserBalanceWithAgentLogin(game, account, plainPassword) {
  const playerAccount = String(account || '').trim();
  const password = plainPassword != null ? String(plainPassword) : '';
  if (!playerAccount || !password) {
    const err = new Error('Player account credentials are required for balance query.');
    err.statusCode = 400;
    throw err;
  }
  const result = await callFirekirinSignedActionWithAgentLogin(game, FIREKIRIN_CONFIG.ACTIONS.QUERY_INFO, {
    account: playerAccount,
    passwd: md5Hex(password)
  });
  return {
    balance: extractFirekirinUserBalance(result.raw),
    raw: result.raw
  };
}

async function queryFirekirinUserBalance(game, account, plainPassword) {
  const result = await queryFirekirinUserBalanceWithAgentLogin(game, account, plainPassword);
  return result.balance;
}

/**
 * Docs: queryInfo requires account + MD5(passwd).
 * Link/login UI only collects username, so probe with a dummy password:
 * - code 200 → account exists
 * - "account does not exist" / not-found → throw provider message (404)
 * - wrong-password style errors → account exists (safe to link)
 */
async function verifyFirekirinUserExistsForLink(game, account) {
  const playerAccount = String(account || '').trim();
  if (!playerAccount) {
    const err = new Error('Player account is required.');
    err.statusCode = 400;
    throw err;
  }
  if (playerAccount.length < FIREKIRIN_ACCOUNT_MIN || playerAccount.length > FIREKIRIN_ACCOUNT_MAX) {
    const err = new Error(
      `Game username must be between ${FIREKIRIN_ACCOUNT_MIN} and ${FIREKIRIN_ACCOUNT_MAX} characters.`
    );
    err.statusCode = 400;
    throw err;
  }

  const probePasswd = md5Hex(`fk_link_probe_${playerAccount}`);
  try {
    const result = await callFirekirinSignedActionWithAgentLogin(
      game,
      FIREKIRIN_CONFIG.ACTIONS.QUERY_INFO,
      {
        account: playerAccount,
        passwd: probePasswd
      }
    );
    return {
      exists: true,
      balance: extractFirekirinUserBalance(result.raw),
      raw: result.raw
    };
  } catch (err) {
    const mapped = mapFirekirinError(err && err.message);
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

    // Wrong password / frozen / other account-level rejects still mean username exists.
    // Only bubble transport/session/sign/rate-limit failures for retry/manual handling.
    if (
      err
      && (err.isInvalidPassword
        || mapped.isInvalidPassword
        || (
          !err.isSessionTimeout
          && !err.isSignatureError
          && !err.isRateLimited
          && !isFirekirinRecoverableSessionError(err)
          && Number(err.statusCode) !== 429
        ))
    ) {
      return { exists: true, raw: err.externalResponse || null };
    }

    throw err;
  }
}

function generateFirekirinPassword() {
  const letters = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const len = FIREKIRIN_PASSWORD_MIN + Math.floor(Math.random() * 5);
  let pass = '';
  pass += letters[Math.floor(Math.random() * letters.length)];
  pass += numbers[Math.floor(Math.random() * numbers.length)];
  for (let i = pass.length; i < len; i++) {
    const set = i % 2 === 0 ? letters : numbers;
    pass += set[Math.floor(Math.random() * set.length)];
  }
  return pass.split('').sort(() => Math.random() - 0.5).join('');
}

/** In-memory agentKey for Game API (8034) — must not overwrite games.agent_id used by 8033. */
const firekirinGameApiSessions = new Map();

function toFirekirinGameApiUrl(agentServiceUrl) {
  const fallback = normalizeFirekirinServiceUrl(FIREKIRIN_CONFIG.DEFAULT_GAME_API_BASE_URL);
  let url = String(agentServiceUrl || '').trim();
  if (!url) return fallback;
  if (/:8034\b/.test(url)) return normalizeFirekirinServiceUrl(url);
  if (/:8033\b/.test(url)) return normalizeFirekirinServiceUrl(url.replace(/:8033\b/, ':8034'));
  return fallback;
}

async function resolveFirekirinGameApiBaseUrl(game) {
  const agentUrl = await resolveFirekirinBotBaseUrl(game);
  return toFirekirinGameApiUrl(agentUrl);
}

function getFirekirinGameApiSessionKey(agentName) {
  return String(agentName || '').trim().toLowerCase() || 'default';
}

async function ensureFirekirinGameApiSession(game, { forceRefresh = false } = {}) {
  const baseUrl = await resolveFirekirinGameApiBaseUrl(game);
  const agentName = String(game.botUsername || '').trim();
  const agentPassword = game.botPassword != null ? String(game.botPassword) : '';
  if (!baseUrl || !agentName || !agentPassword) {
    const err = new Error('Firekirin store credentials are not configured.');
    err.statusCode = 400;
    throw err;
  }

  const cacheKey = getFirekirinGameApiSessionKey(agentName);
  if (!forceRefresh) {
    const cached = firekirinGameApiSessions.get(cacheKey);
    if (cached?.agentKey) {
      return { baseUrl, agentName, agentPassword, agentKey: cached.agentKey };
    }
  }

  const login = await callFirekirinAgentLogin(baseUrl, agentName, agentPassword);
  firekirinGameApiSessions.set(cacheKey, { agentKey: login.agentKey, at: Date.now() });
  return { baseUrl, agentName, agentPassword, agentKey: login.agentKey };
}

async function callFirekirinGameApiSignedAction(game, action, signedParams = {}) {
  return withFirekirinAgentLock(`gameapi:${getFirekirinAgentLockKey(game)}`, async () => {
    let lastErr = null;
    for (let attempt = 1; attempt <= FIREKIRIN_SESSION_RETRY_ATTEMPTS; attempt++) {
      const forceRefresh = attempt > 1;
      try {
        const session = await ensureFirekirinGameApiSession(game, { forceRefresh });
        return await callFirekirinSignedAction(
          session.baseUrl,
          session.agentName,
          session.agentKey,
          action,
          signedParams
        );
      } catch (err) {
        lastErr = err;
        if (!isFirekirinRecoverableSessionError(err) || attempt === FIREKIRIN_SESSION_RETRY_ATTEMPTS) {
          throw err;
        }
        console.info('[Firekirin] Game API session/signature error — refreshing agentKey and retrying', {
          action,
          attempt,
          message: err.message
        });
        await sleep(FIREKIRIN_SESSION_RETRY_DELAY_MS * attempt);
      }
    }
    throw lastErr || new Error(`Firekirin ${action} failed.`);
  });
}

function encodeFirekirinLogoUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  try {
    const encoded = encodeURI(s);
    return encoded.replace(/^http:\/\//i, 'https://');
  } catch {
    return s;
  }
}

function extractFirekirinGameListPayload(data) {
  if (!data || typeof data !== 'object') return [];
  const aliases = FIREKIRIN_CONFIG.FIELDS.DATA || ['data'];
  let payload = null;
  for (const name of aliases) {
    if (data[name] != null) {
      payload = data[name];
      break;
    }
  }
  if (payload == null && Array.isArray(data)) payload = data;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      return [];
    }
  }
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object' && (payload.kindId != null || payload.KindId != null || payload.gameName)) {
    return [payload];
  }
  return [];
}

function mapFirekirinExclusiveGame(item) {
  if (!item || typeof item !== 'object') return null;
  const kindId = item.kindId ?? item.KindId ?? item.kind_id ?? item.kindid;
  if (kindId == null || String(kindId).trim() === '') return null;
  const name = String(item.gameName ?? item.GameName ?? item.name ?? item.Name ?? '').trim();
  const gameType = String(item.gameType ?? item.GameType ?? item.type ?? '').trim();
  const logo = encodeFirekirinLogoUrl(item.gameLogo ?? item.GameLogo ?? item.logo ?? item.image ?? '');
  return {
    kindId: String(kindId).trim(),
    name: name || `Firekirin ${kindId}`,
    gameType,
    logo
  };
}

async function getFirekirinGameList(game) {
  // Use the working agent host (8033). Port 8034 from the Game API doc times out from our servers.
  const result = await callFirekirinSignedActionWithAgentLogin(
    game,
    FIREKIRIN_CONFIG.ACTIONS.GET_GAME_LIST,
    {}
  );
  const mapped = extractFirekirinGameListPayload(result.raw)
    .map(mapFirekirinExclusiveGame)
    .filter(Boolean);
  const seen = new Set();
  return mapped.filter((g) => {
    if (seen.has(g.kindId)) return false;
    seen.add(g.kindId);
    return true;
  });
}

function extractFirekirinWebLoginUrl(data) {
  if (!data || typeof data !== 'object') return '';
  const direct = readFirekirinField(data, FIREKIRIN_CONFIG.FIELDS.WEB_LOGIN_URL);
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  for (const nestedKey of ['data', 'result', 'response', 'Data', 'Result']) {
    const nested = data[nestedKey];
    if (nested && typeof nested === 'object') {
      const fromNested = readFirekirinField(nested, FIREKIRIN_CONFIG.FIELDS.WEB_LOGIN_URL);
      if (fromNested && /^https?:\/\//i.test(fromNested)) return fromNested;
    }
  }
  return direct || '';
}

async function enterFirekirinGame(game, account, plainPassword, kindId, redirectUrl) {
  const playerAccount = String(account || '').trim();
  const password = plainPassword != null ? String(plainPassword) : '';
  const kind = String(kindId || '').trim();
  if (!playerAccount || !password) {
    const err = new Error('Player account credentials are required to enter this game.');
    err.statusCode = 400;
    throw err;
  }
  if (!kind) {
    const err = new Error('Game id is required.');
    err.statusCode = 400;
    throw err;
  }
  const signedParams = {
    account: playerAccount,
    passwd: md5Hex(password),
    kindId: kind
  };
  const callback = String(redirectUrl || '').trim();
  if (callback) signedParams.redirectUrl = callback;

  const result = await callFirekirinSignedActionWithAgentLogin(
    game,
    FIREKIRIN_CONFIG.ACTIONS.ENTER_GAME,
    signedParams
  );
  const url = extractFirekirinWebLoginUrl(result.raw);
  if (!url) {
    const err = new Error('Firekirin did not return a play URL.');
    err.statusCode = 502;
    err.externalResponse = result.raw;
    throw err;
  }
  return { url, raw: result.raw };
}

module.exports = {
  FIREKIRIN_CONFIG,
  FIREKIRIN_PASSWORD_MIN,
  FIREKIRIN_ACCOUNT_MIN,
  FIREKIRIN_ACCOUNT_MAX,
  md5Hex,
  normalizeFirekirinServiceUrl,
  buildFirekirinSign,
  buildFirekirinSignVariants,
  resolveFirekirinBotBaseUrl,
  callFirekirinAgentLogin,
  callFirekirinRegisterUser,
  callFirekirinRegisterUserWithAgentLogin,
  registerFirekirinUser,
  callFirekirinRechargeWithAgentLogin,
  rechargeFirekirinUser,
  callFirekirinRedeemWithAgentLogin,
  redeemFirekirinUser,
  changeFirekirinUserPasswordWithAgentLogin,
  queryFirekirinUserBalance,
  queryFirekirinUserBalanceWithAgentLogin,
  verifyFirekirinUserExistsForLink,
  generateFirekirinPassword,
  isFirekirinTerminalGame,
  isFirekirinInvalidPlayerPasswordError,
  readFirekirinField,
  extractFirekirinAgentKey,
  parseFirekirinCode,
  resolveFirekirinGameApiBaseUrl,
  getFirekirinGameList,
  enterFirekirinGame,
  extractFirekirinWebLoginUrl
};
