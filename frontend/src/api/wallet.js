import { API_BASE } from '../config/api';
import { withPaymentPartner } from '../config/paymentPartner';
import { withDollarpay } from '../config/dollarpay';
import { withXxpay } from '../config/xxpay';
import { getRequest, postRequest } from '../services/request';

const WALLET_BASE = `${API_BASE}/api/wallet`;
const PAYMENTS_BASE = `${API_BASE}/api/payments`;
const WITHDRAW_BASE = `${API_BASE}/api/withdraw`;

function withPartnerAndPaymentCreds(config = {}) {
  return withXxpay(withDollarpay(withPaymentPartner(config)));
}

/**
 * Get wallet limits (min/max deposit & withdraw).
 * When authenticated, also returns store-scoped dailyWithdrawMax / remaining for today.
 * @returns {Promise<object>}
 */
export function getWalletLimits() {
  return getRequest(`${WALLET_BASE}/limits`, {}, withPaymentPartner());
}

/**
 * Get current user's balances. Requires auth.
 * Primary wallet (Standard SC): balance_sc, usable_balance_sc, play_balance_sc, frozen_balance_sc.
 * Redeemable wallet (RSC): balance_rsc, usable_balance_rsc, frozen_balance_rsc — game wins / redemptions; withdrawals use this only.
 * available_to_withdraw_sc = RSC amount available for withdrawal (balance minus frozen pending cashouts).
 * @returns {Promise<object>}
 */
export function getBalance() {
  return getRequest(`${WALLET_BASE}/balance`, {}, withPaymentPartner());
}

/** List deposit history. Returns { deposits, pendingDeposits, total }. */
export function getDeposits(params) {
  return getRequest(`${WALLET_BASE}/deposits`, params || {}, withPaymentPartner());
}

// --- Deposit workflow (in-app modal: methods, session, status) ---

/**
 * Get active deposit methods for the deposit page (method cards + network selection).
 * Requires auth. Returns { methods }.
 */
export function getDepositMethods() {
  return getRequest(`${PAYMENTS_BASE}/deposit-methods`, {}, withPaymentPartner());
}

/**
 * Get active withdraw methods (Speed, CentryOS, etc.) for the withdraw page.
 * Requires auth. Returns { methods: [{ code, name, displayOrder }] }.
 */
export function getWithdrawMethods() {
  return getRequest(`${PAYMENTS_BASE}/withdraw-methods`, {}, withPaymentPartner());
}

/**
 * Create a deposit session. Routes by provider_code:
 * - scrypto → session API
 * - dollarpay / xxpay → session API + payment-provider headers
 * - orionstarspay (default) → wallet deposit V2
 */
export function createDepositSession(body) {
  const payload = body || {};
  const providerCode = (payload.provider_code || payload.providerCode || '').toString().trim().toLowerCase();
  const paymentType = (payload.payment_type || payload.paymentType || '').toString().trim().toLowerCase();

  if (providerCode === 'scrypto' || providerCode === 'selfcrypto' || paymentType === 'crypto') {
    return postRequest(`${PAYMENTS_BASE}/deposits/session`, payload, withPaymentPartner());
  }

  if (providerCode === 'dollarpay' || providerCode === 'xxpay') {
    return postRequest(`${PAYMENTS_BASE}/deposits/session`, payload, withPartnerAndPaymentCreds()).then((res) => ({
      providerCode: res?.providerCode || providerCode,
      sessionType: res?.sessionType || 'embed',
      status: res?.status || 'pending',
      paymentUrl: res?.paymentUrl || res?.embeddedFormConfig?.url || null,
      embeddedFormConfig: res?.embeddedFormConfig || (res?.paymentUrl ? { url: res.paymentUrl } : null),
      amount: res?.amount,
      currency: res?.currency,
      depositOrderId: res?.depositOrderId || res?.depositId || null,
      depositId: res?.depositId || res?.depositOrderId || null
    }));
  }

  const acceptedOptionFromPaymentType = {
    card: 'card',
    debit_card: 'card',
    credit_card: 'card',
    cashapp: 'cashapp',
    apple_pay: 'apple_pay',
    google_pay: 'google_pay'
  };
  const acceptedFromType = acceptedOptionFromPaymentType[paymentType] || null;
  const acceptedFromPayload = Array.isArray(payload.accepted_payment_options)
    ? payload.accepted_payment_options
    : Array.isArray(payload.acceptedPaymentOptions)
      ? payload.acceptedPaymentOptions
      : null;

  const requestBody = {
    provider: 'orionstarspay',
    amount: payload.amount,
    currency: payload.currency,
    ...(payload.package_id != null || payload.packageId != null
      ? { package_id: payload.package_id ?? payload.packageId }
      : {}),
    ...(payload.voucher_id != null || payload.voucherId != null
      ? { voucher_id: payload.voucher_id ?? payload.voucherId }
      : {}),
    ...(acceptedFromPayload && acceptedFromPayload.length > 0
      ? { acceptedPaymentOptions: acceptedFromPayload }
      : acceptedFromType
        ? { acceptedPaymentOptions: [acceptedFromType] }
        : {})
  };

  return postRequest(`${WALLET_BASE}/deposit`, requestBody, withPaymentPartner()).then((res) => ({
    providerCode: 'orionstarspay',
    sessionType: 'embed',
    status: 'pending',
    paymentUrl: res?.paymentLink || null,
    embeddedFormConfig: res?.paymentLink ? { url: res.paymentLink } : null,
    amount: res?.amount,
    currency: res?.currency,
    depositOrderId: res?.depositOrderId || res?.pendingId || null,
    depositId: res?.depositOrderId || res?.pendingId || null
  }));
}

/**
 * Get deposit session status for modal polling.
 * Returns { depositId, status, message?, completedAt? }. Requires auth.
 */
export function getDepositStatus(depositId) {
  return getRequest(
    `${PAYMENTS_BASE}/deposits/${encodeURIComponent(depositId)}/status`,
    {},
    withPartnerAndPaymentCreds()
  );
}

/**
 * Sync deposit status from Payment API (polls CentryOS for completed transactions).
 * Use after user pays in the iframe or to refresh pending deposits. Returns { processed, errors, deposits, depositRefresh? }.
 */
export function syncDeposits() {
  return postRequest(`${WALLET_BASE}/deposits/sync`, {}, withPartnerAndPaymentCreds());
}

/**
 * Refresh deposit status via CentryOS list transactions (GET /payments/transactions on server)
 * and DollarPay payin query for open DollarPay orders.
 * Same behavior as syncDeposits; intended for the deposit page “Refresh status” button.
 * Returns { processed, errors, deposits, depositRefresh? }.
 */
export function refreshDepositTransactionsStatus() {
  return getRequest(`${WALLET_BASE}/deposits/refresh-status`, {}, withPartnerAndPaymentCreds());
}

/** Link existing Orionstar payment account. Body: { email, password } */
export function linkPaymentAccount(email, password) {
  return postRequest(`${WALLET_BASE}/payment-account/link`, { email: (email || '').trim(), password }, withPaymentPartner());
}

export function checkPaymentAccountDirect(email) {
  return postRequest(
    `${WALLET_BASE}/payment-account/check-direct`,
    { email: (email || '').trim() },
    withPaymentPartner()
  );
}

export function requestPaymentAccountPasswordResetOtp(email) {
  return postRequest(
    `${WALLET_BASE}/payment-account/password-reset/request-otp`,
    { email: (email || '').trim() },
    withPaymentPartner()
  );
}

export function verifyPaymentAccountPasswordResetOtp(email, otp) {
  return postRequest(
    `${WALLET_BASE}/payment-account/password-reset/verify-otp`,
    { email: (email || '').trim(), otp: (otp || '').trim() },
    withPaymentPartner()
  );
}

export function confirmPaymentAccountPasswordReset(email) {
  return postRequest(
    `${WALLET_BASE}/payment-account/password-reset/confirm`,
    { email: (email || '').trim() },
    withPaymentPartner()
  );
}

/**
 * Get linked payment methods (payout methods) from Orionstarsweeps Pay.
 * Returns { data: [], count: number, hasPaymentAccount: boolean, addPaymentMethodUrl?: string }.
 */
export function getPaymentLinkedAccounts(params) {
  return getRequest(`${WALLET_BASE}/payment-account/linked-accounts`, params || {}, withPaymentPartner());
}

/** Reveal payment account password (only for accounts created by platform). */
export function revealPaymentPassword() {
  return getRequest(`${WALLET_BASE}/payment-account/reveal-password`, {}, withPaymentPartner());
}

/**
 * Try to create an Orionstar payment account via Payment API signup/direct (partner/store code on server).
 * 201: { created, message, password }; 200: { remoteAccountAlreadyExists, message } when the email already exists for the partner.
 */
export function createPaymentAccount() {
  return postRequest(`${WALLET_BASE}/payment-account/create`, {}, withPaymentPartner());
}

// --- Withdrawal request flow (pending → approve/reject) ---

/**
 * Create a pending withdrawal request. Requires admin/partner approval.
 * Body: { linkedAccountId, amount, currency?, reason?, routingType?, gameName?, gameUsername? }
 */
export function createWithdrawalRequest(body) {
  return postRequest(`${PAYMENTS_BASE}/linked-accounts/withdraw`, body, withPaymentPartner());
}

/**
 * Create crypto LNURL withdraw-request (in-app QR + timer flow). No wallet address.
 * Body: { amount: number, currency: string }
 * Returns { success, data: { withdrawId, withdrawRequest, expiresAt, ttl, status, amount, currency, ... } }
 */
export function createSpeedWithdrawRequest(body) {
  return postRequest(`${PAYMENTS_BASE}/scrypto/withdraw-request`, body || {}, withPaymentPartner());
}

/**
 * Get crypto withdraw-request status for polling.
 * Returns { success, data: { withdrawId, status, expiresAt, isExpired, completedAt, claimedAt } }
 */
export function getSpeedWithdrawStatus(withdrawId) {
  return getRequest(`${WITHDRAW_BASE}/${encodeURIComponent(withdrawId)}/status`, {}, withPaymentPartner());
}

/**
 * List withdrawal requests. Role-based: user sees own, admin sees all.
 * Params: { limit?, offset?, currency?, status? }
 */
export function getWithdrawalRequests(params) {
  return getRequest(`${PAYMENTS_BASE}/withdrawal-requests`, params || {}, withPaymentPartner());
}

/** Approve a pending withdrawal request (admin/partner only). */
export function approveWithdrawalRequest(requestId) {
  return postRequest(`${PAYMENTS_BASE}/withdrawal-requests/${requestId}/approve`, {}, withPaymentPartner());
}

/** Reject a pending withdrawal request (admin/partner only). Body: { rejectionReason? } */
export function rejectWithdrawalRequest(requestId, rejectionReason) {
  return postRequest(`${PAYMENTS_BASE}/withdrawal-requests/${requestId}/reject`, {
    rejectionReason: rejectionReason || ''
  }, withPaymentPartner());
}

/**
 * Chime / Cash App manual withdrawal (funds frozen until store admin approves).
 * Body: { payoutType: 'chime' | 'cashapp', amount: number, destinationUsername: string, currency?: string }
 */
export function createChimeCashappWithdrawal(body) {
  return postRequest(
    `${PAYMENTS_BASE}/chime-cashapp/withdraw`,
    body || {},
    withPartnerAndPaymentCreds()
  );
}

/** Current user's Chime/Cash App withdrawal rows. Params: limit?, offset?, status? */
export function getChimeCashappWithdrawalRequests(params) {
  return getRequest(`${PAYMENTS_BASE}/chime-cashapp/withdrawals`, params || {}, withPaymentPartner());
}

/**
 * One random pay-to Chime name for the user's store (uniform among store-configured accounts).
 * Returns { success, data: { destinationUsername } }.
 */
export function getChimeReceivePreview() {
  return getRequest(`${PAYMENTS_BASE}/chime/receive-preview`, {}, withPaymentPartner());
}

/**
 * Manual Chime deposit request (credited after store admin approves).
 * Body: { depositType: 'chime', amount: number, sourceUsername: string, destinationUsername: string, currency?: string }
 */
export function createChimeDeposit(body) {
  return postRequest(`${PAYMENTS_BASE}/chime/deposit`, body || {}, withPaymentPartner());
}

/** Current user's Chime deposit requests. Params: limit?, offset?, status? */
export function getChimeDepositRequests(params) {
  return getRequest(`${PAYMENTS_BASE}/chime/deposits`, params || {}, withPaymentPartner());
}
