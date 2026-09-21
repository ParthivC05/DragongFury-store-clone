import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { withPaymentPartner } from '../config/paymentPartner';
import { getRequest, postRequest } from '../services/request';
import { setToken as setStorageToken, removeLoginToken, clearAllStorage } from '../services/storageUtils';
import { encodePasswordsInBody } from '../utils/passwordEncrypt';
import { attachFingerprintToBody } from '../lib/fingerprint/client';

const AUTH_BASE = `${API_BASE}/api/auth`;

function authBody(extra = {}) {
  const body = { ...extra };
  if (STORE_CODE) body.clientStoreCode = STORE_CODE;
  return body;
}

export async function register(data) {
  const body = encodePasswordsInBody(await attachFingerprintToBody({ ...data, ...authBody() }));
  return postRequest(`${AUTH_BASE}/register`, body, withPaymentPartner()).then((json) => {
    if (json.token) setStorageToken(json.token);
    return json;
  });
}

/** Direct signup: creates user + OrionStars (CentryOS) payment account at signup, no OTP. */
export async function signupDirect(data) {
  const body = encodePasswordsInBody(await attachFingerprintToBody({ ...data, ...authBody() }));
  return postRequest(`${AUTH_BASE}/signup/direct`, body, withPaymentPartner()).then((json) => {
    if (json.token) setStorageToken(json.token);
    return json;
  });
}

function attachGuestSpinFields(body, opts = {}) {
  if (opts.guestSpinWonAt != null) body.guestSpinWonAt = opts.guestSpinWonAt;
  if (opts.guestSpinAmountSc != null) body.guestSpinAmountSc = opts.guestSpinAmountSc;
  return body;
}

/** Resend verification email (no auth required). Body: { email }. */
export function refreshEmailToken(email) {
  return postRequest(`${AUTH_BASE}/refresh-email-token`, { email, ...authBody() });
}

export function login(data) {
  const body = encodePasswordsInBody({ ...data, ...authBody() });
  return postRequest(`${AUTH_BASE}/login`, body).then((json) => {
    if (json.token && json.status !== 'PHONE_VERIFICATION_REQUIRED') {
      setStorageToken(json.token);
    }
    return json;
  });
}

export function getMe() {
  return getRequest(`${AUTH_BASE}/me`);
}

export function sendVerificationEmail() {
  return postRequest(`${AUTH_BASE}/send-verification-email`, authBody());
}

/** Verify email with token from link. Supports both emailToken (JWT) and legacy token query param. */
export function verifyEmail(emailTokenOrToken) {
  return getRequest(`${AUTH_BASE}/verify-email`, { emailToken: emailTokenOrToken });
}

export function forgotPassword(email) {
  return postRequest(`${AUTH_BASE}/forgot-password`, { email, ...authBody() });
}

export function resetPassword(token, newPassword) {
  const body = encodePasswordsInBody({ token, newPassword });
  return postRequest(`${AUTH_BASE}/reset-password`, body);
}

export function completeOnboarding() {
  return postRequest(`${AUTH_BASE}/complete-onboarding`, {});
}

export function setToken(token) {
  setStorageToken(token);
}

export function clearToken() {
  removeLoginToken();
}

/**
 * Clears ALL storage data.
 */
export function clearStorage() {
  clearAllStorage();
}

/**
 * SSO: send Google id_token to backend; returns { user, token }. Stores token on success.
 * @param {string} idToken
 * @param {{ bonusCode?: string }} [opts] - Optional URL bonus code (?bonusCode= or ?bc=), same rules as email signup.
 */
export async function loginWithGoogle(idToken, opts = {}) {
  const body = await attachFingerprintToBody(attachGuestSpinFields({ idToken, ...authBody() }, opts));
  const bc = (opts.bonusCode || opts.bc || '').trim();
  if (bc) body.bonusCode = bc;
  const ref = (opts.ref || opts.affiliateCode || '').trim();
  if (ref) body.ref = ref;
  return postRequest(`${AUTH_BASE}/google`, body, withPaymentPartner()).then((json) => {
    if (json.token && json.status !== 'PHONE_VERIFICATION_REQUIRED') setStorageToken(json.token);
    return json;
  });
}

/**
 * SSO redirect flow: exchange Google auth code on backend; returns { user, token }.
 * @param {string} code
 * @param {string} redirectUri
 * @param {object} [opts]
 */
export async function loginWithGoogleCode(code, redirectUri, opts = {}) {
  let body = attachGuestSpinFields({ code, redirectUri, ...authBody() }, opts);
  if (opts.fingerprintRequestId) {
    body.fingerprintRequestId = opts.fingerprintRequestId;
  } else {
    body = await attachFingerprintToBody(body);
  }
  const bc = (opts.bonusCode || opts.bc || '').trim();
  if (bc) body.bonusCode = bc;
  const ref = (opts.ref || opts.affiliateCode || '').trim();
  if (ref) body.ref = ref;
  return postRequest(`${AUTH_BASE}/google/code`, body, withPaymentPartner()).then((json) => {
    if (json.token && json.status !== 'PHONE_VERIFICATION_REQUIRED') setStorageToken(json.token);
    return json;
  });
}

/**
 * SSO: send Facebook access_token to backend; returns { user, token }. Stores token on success.
 * @param {string} accessToken
 * @param {{ bonusCode?: string, ref?: string }} [opts]
 */
export async function loginWithFacebook(accessToken, opts = {}) {
  const body = await attachFingerprintToBody(attachGuestSpinFields({ accessToken, ...authBody() }, opts));
  const bc = (opts.bonusCode || opts.bc || '').trim();
  if (bc) body.bonusCode = bc;
  const ref = (opts.ref || opts.affiliateCode || '').trim();
  if (ref) body.ref = ref;
  return postRequest(`${AUTH_BASE}/facebook`, body).then((json) => {
    if (json.token && json.status !== 'PHONE_VERIFICATION_REQUIRED') setStorageToken(json.token);
    return json;
  });
}
