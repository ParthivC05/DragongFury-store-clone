'use strict';

const crypto = require('crypto');
const axios = require('axios');
const { THIRD_PARTY_HTTP_TIMEOUT_MS } = require('../../constants/httpTimeouts');

const MAX_RESPONSE_CHARS = 12000;

function md5Hex(value) {
  return crypto.createHash('md5').update(String(value), 'utf8').digest('hex');
}

/**
 * Fast API sign: sorted key=value joined by & , then the secret appended with no extra &.
 * Agent login has no appsecret yet, so the agent password is used in that slot.
 */
function signFastApi(data, secret) {
  const query = Object.keys(data)
    .filter((key) => key !== 'sign')
    .sort()
    .map((key) => `${key}=${data[key]}`)
    .join('&');
  return md5Hex(query + String(secret || ''));
}

function decryptAppSecret(appsecretEncrypted, password) {
  const raw = Buffer.from(String(appsecretEncrypted || ''), 'base64');
  if (raw.length <= 16) {
    throw new Error('Encrypted secret is too short to decrypt.');
  }
  const keyHex = md5Hex(md5Hex(String(password || '').toLowerCase()));
  const key = Buffer.from(keyHex, 'utf8');
  const iv = raw.subarray(0, 16);
  const encrypted = raw.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  const secret = decrypted.toString('utf8').replace(/\0+$/g, '').trim();
  if (!secret) throw new Error('Decrypted secret was empty.');
  return secret;
}

function clipResponseBody(data) {
  if (data == null) return null;
  if (typeof data === 'string') {
    return data.length > MAX_RESPONSE_CHARS ? `${data.slice(0, MAX_RESPONSE_CHARS)}…` : data;
  }
  try {
    const text = JSON.stringify(data);
    if (text.length <= MAX_RESPONSE_CHARS) return data;
    return `${text.slice(0, MAX_RESPONSE_CHARS)}…`;
  } catch (_) {
    return String(data).slice(0, MAX_RESPONSE_CHARS);
  }
}

/**
 * POST {apiBaseUrl}/fast/agent/login and, when the provider returns one, decrypt appsecret_encrypted.
 * Always returns the outbound body and the provider response so the admin can see failures.
 */
async function loginFastApiAgent({ apiBaseUrl, account, passwd }) {
  const base = String(apiBaseUrl || '').trim().replace(/\/$/, '');
  const agentAccount = String(account || '').trim();
  const password = String(passwd || '');
  if (!base) {
    const err = new Error('API domain is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!agentAccount) {
    const err = new Error('Agent account is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!password) {
    const err = new Error('Agent password is required.');
    err.statusCode = 400;
    throw err;
  }

  let url;
  try {
    const parsed = new URL(base.includes('://') ? base : `https://${base}`);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('bad protocol');
    }
    url = `${parsed.origin}${parsed.pathname.replace(/\/$/, '')}/fast/agent/login`;
  } catch (_) {
    const err = new Error('API domain must be a valid http or https URL.');
    err.statusCode = 400;
    throw err;
  }

  const bodyFields = {
    requestid: crypto.randomBytes(32).toString('hex'),
    timestamp: Date.now().toString(),
    account: agentAccount,
    passwd: password
  };
  bodyFields.sign = signFastApi(bodyFields, password);
  const formBody = new URLSearchParams(bodyFields).toString();

  const request = {
    method: 'POST',
    url,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: bodyFields
  };

  let httpStatus = 0;
  let responseBody = null;
  try {
    const res = await axios.post(url, formBody, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: THIRD_PARTY_HTTP_TIMEOUT_MS,
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: [(data) => data]
    });
    httpStatus = res.status;
    const text = typeof res.data === 'string' ? res.data : String(res.data ?? '');
    try {
      responseBody = JSON.parse(text);
    } catch (_) {
      responseBody = text;
    }
  } catch (err) {
    responseBody = err.message || 'The Fast API request failed.';
    httpStatus = 0;
  }

  const payload = responseBody && typeof responseBody === 'object' ? responseBody : null;
  const data = payload && (payload.data || payload.Data);
  const providerCode = payload ? (payload.code ?? payload.Code ?? null) : null;
  const appId = data && (data.appid || data.appId) ? String(data.appid || data.appId) : null;
  const encrypted = data && (data.appsecret_encrypted || data.appsecretEncrypted)
    ? String(data.appsecret_encrypted || data.appsecretEncrypted)
    : '';

  let appSecret = null;
  let decryptError = null;
  if (encrypted) {
    try {
      appSecret = decryptAppSecret(encrypted, password);
    } catch (err) {
      decryptError = err.message || 'Could not decrypt the app secret.';
    }
  }

  return {
    request,
    response: {
      httpStatus,
      body: clipResponseBody(responseBody)
    },
    providerCode,
    appId,
    appSecret,
    decryptError,
    balance: data && data.balance != null ? data.balance : null
  };
}

module.exports = { loginFastApiAgent };
