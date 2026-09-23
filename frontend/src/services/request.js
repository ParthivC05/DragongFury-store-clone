import { getAccessToken, removeLoginToken } from './storageUtils';
import { reportBackendReachable, reportBackendUnreachable } from '../utils/backendHealth';
import { STORE_CODE } from '../config/site';

const METHODS = {
  get: 'GET',
  post: 'POST',
  patch: 'PATCH',
  put: 'PUT',
  delete: 'DELETE',
};

/** User-friendly fallbacks so we never expose technical errors to the UI. */
const DEFAULT_MESSAGES = {
  400: 'Please check your details and try again.',
  401: 'Please sign in again.',
  403: 'You don’t have permission to do that.',
  404: 'We couldn’t find that. Please try again.',
  409: 'This game username is already linked to another account. Please register a new game account or connect with a different username.',
  500: 'Something went wrong. Please try again later.',
  503: "We're facing some issue. Please try again later.",
};

const GAME_PASSWORD_RESET_FALLBACKS = {
  400: 'We could not reset your game password. Please try again or contact support.',
  404: "We couldn't find this game account. Please refresh and try again.",
  500: 'We could not reset your game password. Please try again or contact support.',
  503: 'We could not reset your game password. Please try again or contact support.',
};

function getMessageFromBody(body, status, requestUrl = '') {
  const isGamePasswordReset = /\/api\/games\/forgot-password/.test(requestUrl);

  if (body && typeof body === 'object') {
    const pick = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const fromMsg =
      pick(body.message) ||
      pick(body.error) ||
      pick(body.detail) ||
      pick(body.msg) ||
      pick(body.description);
    if (fromMsg) return fromMsg;

    if (body.data && typeof body.data === 'object') {
      const fromData =
        pick(body.data.message) || pick(body.data.detail) || pick(body.data.error);
      if (fromData) return fromData;
    }

    if (Array.isArray(body.errors)) {
      const joined = body.errors
        .map((entry) =>
          typeof entry === 'string'
            ? entry
            : entry && typeof entry === 'object'
              ? entry.message || entry.msg || ''
              : ''
        )
        .filter(Boolean)
        .join(' ')
        .trim();
      if (joined) return joined;
    }
  }

  if (isGamePasswordReset) {
    return GAME_PASSWORD_RESET_FALLBACKS[status] || GAME_PASSWORD_RESET_FALLBACKS[500];
  }

  return DEFAULT_MESSAGES[status] || DEFAULT_MESSAGES[500];
}

async function handleResponse(response, requestUrl = '') {
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const body = isJson ? await response.json().catch(() => ({})) : {};

  if (!response.ok) {
    const status = response.status;
    const isEmailServiceError = body && body.code === 'EMAIL_SERVICE_UNAVAILABLE';
    const isDepositRequired = body && body.code === 'DEPOSIT_REQUIRED';
    const isPhoneVerifyRequired = body && body.code === 'PHONE_VERIFY_REQUIRED';
    const isEmailVerificationPending = body && body.code === 'EMAIL_VERIFICATION_PENDING';
    // Invalid payment-provider credentials are a payment-account problem, not an expired
    // platform session – never log the user out for it.
    const isPaymentRelinkRequired = body && body.code === 'PAYMENT_ACCOUNT_RELINK_REQUIRED';
    const isForgotOrResetPassword = /\/forgot-password|\/reset-password/.test(requestUrl);
    if (
      (status === 401 || status === 403) &&
      !isEmailServiceError &&
      !isDepositRequired &&
      !isPhoneVerifyRequired &&
      !isEmailVerificationPending &&
      !isPaymentRelinkRequired &&
      !isForgotOrResetPassword
    ) {
      if (getAccessToken()) {
        removeLoginToken();
        try {
          window.dispatchEvent(new CustomEvent('auth:unauthorized'));
        } catch {
          void 0;
        }
      }
    }
    const message = getMessageFromBody(body, status, requestUrl);
    const err = new Error(message);
    err.status = status;
    err.body = body;
    if (body && typeof body.code === 'string') err.code = body.code;
    if (body && typeof body.registeredEmail === 'string') {
      err.registeredEmail = body.registeredEmail.trim();
    }
    throw err;
  }

  return body;
}

function makeRequest(url, method, data = {}, config = {}, params = {}) {
  const cfg = config || {};
  const { headers: extraHeaders, ...restConfig } = cfg;
  const token = getAccessToken();
  const mergedExtra =
    extraHeaders && typeof extraHeaders === 'object' && !Array.isArray(extraHeaders) ? extraHeaders : {};
  const headers = {
    ...mergedExtra,
  };
  if (STORE_CODE) {
    headers['X-Store-Code'] = STORE_CODE;
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (data instanceof FormData) {
    /* browser sets multipart boundary */
  } else if (method !== METHODS.get) {
    headers['Content-Type'] = 'application/json';
  }

  const queryString = Object.keys(params).length
    ? `?${new URLSearchParams(params).toString()}`
    : '';

  const options = {
    method,
    headers,
    credentials: 'include',
    cache: method === METHODS.get ? 'no-store' : undefined,
    body: method !== METHODS.get
      ? (data instanceof FormData ? data : JSON.stringify(data))
      : undefined,
    ...restConfig,
  };

  const fullUrl = url + queryString;
  return fetch(fullUrl, options)
    .then((res) => {
      // Any successful TCP response means the API process is up.
      reportBackendReachable();
      return handleResponse(res, fullUrl);
    })
    .catch((err) => {
      // Refresh/navigation aborts must NOT trip the maintenance screen.
      if (err?.name === 'AbortError') throw err;
      // Real network / CORS failures — backend likely unreachable.
      const msg = String(err?.message || err || '').toLowerCase();
      if (
        err?.name === 'TypeError' ||
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('load failed')
      ) {
        reportBackendUnreachable();
      }
      throw err;
    });
}

export function getRequest(url, params = {}, config = {}) {
  return makeRequest(url, METHODS.get, {}, config, params);
}

export function postRequest(url, data = {}, config = {}) {
  return makeRequest(url, METHODS.post, data, config);
}

export function patchRequest(url, data = {}, config = {}) {
  return makeRequest(url, METHODS.patch, data, config);
}

export function putRequest(url, data = {}, config = {}) {
  return makeRequest(url, METHODS.put, data, config);
}

export function deleteRequest(url, data = {}, config = {}) {
  return makeRequest(url, METHODS.delete, data, config);
}
