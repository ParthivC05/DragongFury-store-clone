const db = require('../../db/models');
const walletService = require('../../services/wallet');
const payment = require('../../services/payment');
const paymentProviders = require('../../services/paymentProviders');
const { getActiveDepositMethods, resolveProviderForPaymentType } = require('../../services/payments/depositMethods.service');
const { getActiveWithdrawMethods } = require('../../services/payments/withdrawMethods.service');
const { createSpeedWithdrawRequest: createSpeedWithdrawRequestService } = require('../../services/speedWithdraw/createSpeedWithdrawRequest.service');
const { createDepositSession } = require('../../services/payments/depositSession.service');
const { getDepositStatus } = require('../../services/payments/depositStatus.service');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { createChimeCashappWithdrawalRequest } = require('../../services/wallet/createChimeCashappWithdrawalRequest.service');
const { listChimeCashappWithdrawalRequestsForUser } = require('../../services/wallet/listChimeCashappWithdrawalRequests.service');
const { createChimeDepositRequest } = require('../../services/wallet/createChimeDepositRequest.service');
const { listChimeDepositRequestsForUser } = require('../../services/wallet/listChimeDepositRequests.service');
const { getChimeDepositReceivePreview } = require('../../services/wallet/getChimeDepositReceivePreview.service');
const { getPaymentPartnerCodeFromRequest } = require('../../services/payment/payment.config');
const { assertSpinWheelWithdrawalAllowed } = require('../../services/wallet/validateSpinWheelWithdrawal.service');
const { assertKycForWithdraw } = require('../../services/kyc/assertKycForWithdraw.service');
const { paymentLog } = require('../../libs/logger');
const {
  requireDollarpayCredentials,
  getDollarpayCredentialsFromRequest
} = require('../../services/paymentProviders/dollarpay/dollarpay.credentials');
const {
  requireXxpayCredentials,
  getXxpayCredentialsFromRequest
} = require('../../services/paymentProviders/xxpay/xxpay.credentials');
const { paymentTypeToOrionAcceptedOption } = require('../../constants/paymentTypes');
const { sanitizePlayerFacingMessage } = require('../../utils/playerFacingMessage');

function safeMessage(err, defaultMsg) {
  if (!err) return defaultMsg;
  const status = err.statusCode ?? err.response?.status;
  if (status != null && status >= 500) return defaultMsg;
  const msg = sanitizePlayerFacingMessage((err.message || '').trim());
  return msg || defaultMsg;
}

/** GET /api/payments/deposit-methods - Active deposit methods for user (method cards + network selection). Auth required. Store-scoped when user has distributorCode/storeCode. */
async function getDepositMethods(req, res) {
  try {
    if (!req.user?.userId) return sendError(res, 'Unauthorized', 401);
    const storeContext = (req.user.distributorCode && req.user.storeCode)
      ? { distributorCode: req.user.distributorCode, storeCode: req.user.storeCode }
      : null;
    const result = await getActiveDepositMethods(storeContext);
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to load deposit methods.');
    return sendError(res, message, status);
  }
}

/** Map payment_type to accepted_payment_options for Orionstars Pay (debit_card → card). */
function paymentTypeToAcceptedOptions(paymentType) {
  const option = paymentTypeToOrionAcceptedOption(paymentType);
  return option ? [option] : undefined;
}

/**
 * Attach OrionStars login token to deposit session params.
 * @param {'required'|'optional'} mode - required fails the request; optional leaves params unchanged on failure.
 * @returns {Promise<{ ok: true } | { ok: false, status: number, message: string, code?: string, data?: object }>}
 */
async function attachOrionDepositCredentials(req, userId, params, mode = 'required') {
  const user = await db.User.findByPk(userId, {
    attributes: ['email', 'firstName', 'lastName', 'paymentApiPasswordEncrypted', 'paymentApiEmail'],
    raw: true
  });
  const paymentEmail = (user?.paymentApiEmail || user?.email || '').trim().toLowerCase();
  if (!paymentEmail) {
    if (mode === 'optional') return { ok: false, status: 400, message: 'User email not found.' };
    return { ok: false, status: 400, message: 'User email not found.' };
  }
  const { decryptPaymentPassword, isPaymentPasswordEncryptionConfigured } = require('../../utils/paymentPasswordEncryption');
  if (!isPaymentPasswordEncryptionConfigured() || !user.paymentApiPasswordEncrypted) {
    return {
      ok: false,
      status: 400,
      message: 'Payment account not set up. Please link or create your payment account first.'
    };
  }
  let paymentPassword;
  try {
    paymentPassword = decryptPaymentPassword(user.paymentApiPasswordEncrypted);
  } catch (decryptErr) {
    paymentLog('createDepositSession: payment password decrypt failed, requiring re-link:', decryptErr.message);
    return {
      ok: false,
      status: 409,
      message: 'Your payment account needs to be reconnected. Verify your email with a code to continue.',
      code: 'PAYMENT_ACCOUNT_RELINK_REQUIRED',
      data: { emailExists: true, paymentEmail }
    };
  }
  if (!paymentPassword) {
    return {
      ok: false,
      status: 409,
      message: 'Your payment account needs to be reconnected. Verify your email with a code to continue.',
      code: 'PAYMENT_ACCOUNT_RELINK_REQUIRED',
      data: { emailExists: true, paymentEmail }
    };
  }
  let paymentToken;
  try {
    const loginRes = await payment.loginUser(paymentEmail, paymentPassword, getPaymentPartnerCodeFromRequest(req));
    paymentToken = loginRes?.token;
  } catch (loginErr) {
    const rawStatus = loginErr.statusCode || 401;
    if (rawStatus === 401 || rawStatus === 403) {
      let emailExists = false;
      try {
        const check = await payment.checkPaymentUserDirect({
          email: paymentEmail,
          partnerCode: getPaymentPartnerCodeFromRequest(req),
        });
        emailExists = check?.exists === true;
      } catch (checkErr) {
        paymentLog('createDepositSession: payment user existence check failed:', checkErr.message);
      }
      return {
        ok: false,
        status: 409,
        message: emailExists
          ? 'Your payment account needs to be reconnected. Verify your email with a code to continue.'
          : 'We could not verify your payment account. Please link your payment account again.',
        code: 'PAYMENT_ACCOUNT_RELINK_REQUIRED',
        data: { emailExists, paymentEmail }
      };
    }
    const message = loginErr.response?.message || loginErr.message || 'Payment login failed. Please contact support.';
    return { ok: false, status: rawStatus, message };
  }
  if (!paymentToken) {
    return { ok: false, status: 502, message: 'Payment login did not return a token.' };
  }
  params.paymentToken = paymentToken;
  params.paymentLogin = {
    email: paymentEmail,
    password: paymentPassword,
    partnerCode: getPaymentPartnerCodeFromRequest(req)
  };
  return { ok: true };
}

/** POST /api/payments/deposits/session - Create deposit session for in-app payment modal. Auth required. Body: { provider_code?, payment_type?, amount, currency?, target_currency?, payment_method?, asset_code?, network?, accepted_payment_options? } */
async function createDepositSessionHandler(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    let providerCode = (req.body?.provider_code && typeof req.body.provider_code === 'string') ? req.body.provider_code.trim().toLowerCase() : '';
    const paymentType = (req.body?.payment_type && typeof req.body.payment_type === 'string') ? req.body.payment_type.trim().toLowerCase() : '';
    const amount = req.body?.amount != null ? Number(req.body.amount) : NaN;
    const packageId = req.body?.package_id ?? req.body?.packageId ?? null;
    const voucherId = req.body?.voucher_id ?? req.body?.voucherId ?? null;
    const currency = req.body?.currency;
    const assetCode = req.body?.asset_code ?? req.body?.assetCode;
    const network = req.body?.network;
    const targetCurrency = req.body?.target_currency ?? req.body?.targetCurrency;
    const paymentMethod = req.body?.payment_method ?? req.body?.paymentMethod;
    let acceptedPaymentOptions = req.body?.accepted_payment_options;
    let acceptedPaymentOptionsArr = Array.isArray(acceptedPaymentOptions)
      ? acceptedPaymentOptions.filter((v) => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim().toLowerCase())
      : (typeof acceptedPaymentOptions === 'string' && acceptedPaymentOptions.trim())
          ? [acceptedPaymentOptions.trim().toLowerCase()]
          : undefined;

    if (!providerCode && paymentType) {
      const storeContext = req.user?.distributorCode && req.user?.storeCode
        ? { distributorCode: req.user.distributorCode, storeCode: req.user.storeCode }
        : null;
      const resolved = await resolveProviderForPaymentType(storeContext, paymentType);
      if (resolved?.providerCode) providerCode = resolved.providerCode;
    }
    // Manual Chime modal only — XXPay Chime uses /api/pay/create cashierUrl like Cash App.
    if (paymentType === 'chime' && providerCode !== 'xxpay') {
      return sendError(res, 'Chime uses the manual deposit request. Select Chime on the deposit page and confirm your username in the modal.', 400);
    }
    // Orion accepted options for primary Orion and DollarPay→Orion amount fallback.
    if (
      (providerCode === 'orionstarspay' || providerCode === 'dollarpay') &&
      !acceptedPaymentOptionsArr?.length
    ) {
      acceptedPaymentOptionsArr = paymentTypeToAcceptedOptions(paymentType);
    }
    if (Array.isArray(acceptedPaymentOptionsArr) && acceptedPaymentOptionsArr.includes('chime')) {
      return sendError(res, 'Chime uses the manual deposit request. Select Chime on the deposit page and confirm your username in the modal.', 400);
    }
    if (!providerCode) {
      return sendError(res, 'Provider code or payment type is required.', 400);
    }

    const paymentTypeForSession = paymentType || (providerCode === 'scrypto' || providerCode === 'selfcrypto' ? 'crypto' : 'card');
    const params = {
      providerCode,
      amount,
      currency,
      assetCode,
      network,
      targetCurrency,
      paymentMethod,
      acceptedPaymentOptions: acceptedPaymentOptionsArr,
      paymentType: paymentTypeForSession,
      packageId,
      voucherId
    };

    if (providerCode === 'dollarpay') {
      const creds = requireDollarpayCredentials(req);
      params.dollarpayMerchantId = creds.merchantId;
      params.dollarpayApiKey = creds.apiKey;
      const forwarded = String(req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim();
      params.clientIp = forwarded || req.ip || '127.0.0.1';
      params.deviceId =
        String(req.headers['x-device-id'] || req.body?.device_id || req.body?.deviceId || '').trim() ||
        `web-${userId}`;
      const userRow = await db.User.findByPk(userId, { attributes: ['username', 'email'], raw: true });
      params.userName =
        String(userRow?.username || userRow?.email || `user${userId}`)
          .trim()
          .slice(0, 64) || `user${userId}`;

      // Only attach Orion when DollarPay cannot take this amount (exact / whole-dollar snap).
      const { resolveDollarpayPayinAmount } = require('../../services/paymentProviders/dollarpay/dollarpay.amounts');
      const dollarpayType = ['card', 'credit_card', 'cashapp', 'apple_pay', 'google_pay'].includes(paymentTypeForSession)
        ? (paymentTypeForSession === 'credit_card' ? 'card' : paymentTypeForSession)
        : 'cashapp';
      const canUseDollarpay = resolveDollarpayPayinAmount(amount, dollarpayType, {
        allowWholeDollarSnap: packageId == null
      });
      if (!canUseDollarpay) {
        const orionAttach = await attachOrionDepositCredentials(req, userId, params, 'required');
        if (!orionAttach.ok) {
          return sendError(
            res,
            orionAttach.message,
            orionAttach.status,
            orionAttach.code,
            orionAttach.data ? { data: orionAttach.data } : undefined
          );
        }
      }
    }

    if (providerCode === 'xxpay') {
      const creds = requireXxpayCredentials(req);
      params.xxpayMchNo = creds.mchNo;
      params.xxpayApiKey = creds.apiKey;
      params.xxpayBaseUrl = creds.baseUrl;
      const forwarded = String(req.headers['x-forwarded-for'] || '')
        .split(',')[0]
        .trim();
      params.clientIp = forwarded || req.ip || '127.0.0.1';
      params.deviceId =
        String(req.headers['x-device-id'] || req.body?.device_id || req.body?.deviceId || '').trim() ||
        `web-${userId}`;
      params.clientId = `user${userId}`;
      params.returnUrl = String(req.body?.return_url || req.body?.returnUrl || '').trim() || undefined;
    }

    if (providerCode === 'orionstarspay') {
      const orionAttach = await attachOrionDepositCredentials(req, userId, params, 'required');
      if (!orionAttach.ok) {
        return sendError(
          res,
          orionAttach.message,
          orionAttach.status,
          orionAttach.code,
          orionAttach.data ? { data: orionAttach.data } : undefined
        );
      }
    }

    const payload = await createDepositSession(userId, params);
    return sendSuccess(res, payload, 201);
  } catch (err) {
    const status = err.statusCode || 500;
    // For 503 (e.g. provider not available), expose the specific message so user sees "Crypto payment is not available" etc.
    const message = status === 503 && (err.message || '').trim()
      ? sanitizePlayerFacingMessage(String(err.message).trim())
      : safeMessage(err, 'Could not create deposit session.');
    // Surface Orion account requirement when DollarPay fell back without credentials.
    if (err.code === 'ORION_PAYMENT_ACCOUNT_REQUIRED') {
      return sendError(
        res,
        sanitizePlayerFacingMessage(err.message || 'Payment credentials are required for this method.'),
        status || 400
      );
    }
    return sendError(res, message, status);
  }
}

/** GET /api/payments/deposits/:depositId/status - Get deposit session status for modal polling. Auth required; deposit must belong to user. */
async function getDepositStatusHandler(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const depositId = req.params?.depositId;
    const { getDollarpayCredentialsFromRequest } = require('../../services/paymentProviders/dollarpay/dollarpay.credentials');
    const { getXxpayCredentialsFromRequest } = require('../../services/paymentProviders/xxpay/xxpay.credentials');
    const result = await getDepositStatus(depositId, userId, {
      dollarpayCreds: getDollarpayCredentialsFromRequest(req),
      xxpayCreds: getXxpayCredentialsFromRequest(req)
    });
    if (result == null) return sendError(res, 'Deposit session not found.', 404);
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to get deposit status.');
    return sendError(res, message, status);
  }
}

/** GET /api/payments/withdraw-methods - Active withdraw methods (SCrypto, Orionstar Pay, etc.). Auth required. Store-scoped when user has distributorCode/storeCode. */
async function getWithdrawMethods(req, res) {
  try {
    if (!req.user?.userId) return sendError(res, 'Unauthorized', 401);
    const storeContext = (req.user.distributorCode && req.user.storeCode)
      ? { distributorCode: req.user.distributorCode, storeCode: req.user.storeCode }
      : null;
    const result = await getActiveWithdrawMethods(storeContext);
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to load withdraw methods.');
    return sendError(res, message, status);
  }
}

/** POST /api/payments/scrypto/withdraw-request - Create crypto withdraw request (LNURL etc.). Auth required. Body: { amount, currency, ttl? } */
async function createSpeedWithdrawRequest(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    await assertKycForWithdraw(userId);
    const storeContext = (req.user.distributorCode && req.user.storeCode)
      ? { distributorCode: req.user.distributorCode, storeCode: req.user.storeCode }
      : null;
    const { methods } = await getActiveWithdrawMethods(storeContext);
    if (!methods.some((m) => (m.code || '').toLowerCase() === 'scrypto')) {
      return sendError(res, 'Crypto withdraw is not available for your store.', 400);
    }
    const amount = req.body?.amount != null ? Number(req.body.amount) : NaN;
    const currency = (req.body?.currency && typeof req.body.currency === 'string')
      ? req.body.currency.trim().toUpperCase().slice(0, 8)
      : '';

    const payload = await createSpeedWithdrawRequestService({ userId, amount, currency });
    return sendSuccess(res, payload, 201);
  } catch (err) {
    const status = err.statusCode || 502;
    const message = safeMessage(err, 'Could not create crypto withdraw request.');
    return sendError(res, message, status);
  }
}

/** POST /api/payments/linked-accounts/withdraw - Create pending withdrawal. Crypto: method=scrypto + cryptoAddress. Orionstar Pay: linkedAccountId. */
async function createWithdrawal(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    await assertKycForWithdraw(userId);
    const method = (req.body?.method ?? req.body?.provider_code ?? '').toString().trim().toLowerCase();
    const storeContext = (req.user.distributorCode && req.user.storeCode)
      ? { distributorCode: req.user.distributorCode, storeCode: req.user.storeCode }
      : null;
    const { methods: allowedMethods } = await getActiveWithdrawMethods(storeContext);
    const allowedCodes = new Set((allowedMethods || []).map((m) => (m.code || '').toLowerCase()));
    if (method && !allowedCodes.has(method)) {
      return sendError(res, 'This withdraw method is not available for your store.', 400);
    }
    const linkedAccountId = (req.body?.linkedAccountId ?? req.body?.linked_account_id ?? '').toString().trim();
    const cryptoAddress = (req.body?.cryptoAddress ?? req.body?.crypto_address ?? '').toString().trim();
    const amount = req.body?.amount != null ? Number(req.body.amount) : NaN;
    const [balanceData, limits] = await Promise.all([
      walletService.getBalance(userId),
      walletService.getWalletLimitsForUser(userId)
    ]);
    const available = balanceData?.available_to_withdraw_sc != null ? Number(balanceData.available_to_withdraw_sc) : 0;
    const withdrawMin = limits?.withdrawMin ?? 10;
    const withdrawMax = limits?.withdrawMax ?? 50;
    if (!Number.isFinite(amount) || amount < withdrawMin) {
      return sendError(res, `Amount must be a valid number and at least ${withdrawMin}.`, 400);
    }
    if (amount > withdrawMax) {
      if (limits?.neverDeposited) {
        const { neverDepositedWithdrawMaxError } = require('../../services/wallet/neverDepositedWithdraw.service');
        const capErr = neverDepositedWithdrawMaxError();
        return sendError(res, capErr.message, 400);
      }
      return sendError(res, `Maximum withdrawal per request is ${limits?.currency || 'SC'} ${withdrawMax}.`, 400);
    }
    if (amount > available) {
      return sendError(res, 'Insufficient redeemable balance (RSC). Cash out game wins and redemptions first, or wait for pending withdrawals to complete.', 400);
    }

    try {
      await assertSpinWheelWithdrawalAllowed(userId, amount, available);
    } catch (spinErr) {
      return sendError(res, spinErr.message, spinErr.statusCode || 400);
    }

    try {
      // Serialize concurrent withdraws before calling any external provider
      await walletService.assertDailyWithdrawalLimitUnderWalletLock(userId, amount, {
        displayCurrency: limits?.currency || 'SC'
      });
    } catch (dailyErr) {
      return sendError(res, dailyErr.message, dailyErr.statusCode || 400);
    }

    if (method === 'scrypto') {
      const address = cryptoAddress || linkedAccountId;
      if (!address) return sendError(res, 'Crypto wallet address is required for crypto withdrawals.', 400);
      const result = await walletService.createWithdrawalRequest(userId, {
        method: 'scrypto',
        cryptoAddress: address,
        linkedAccountId: address,
        amount,
        currency: req.body?.currency || limits?.currency || 'USD'
      });
      const balanceAfter = await walletService.getBalance(userId);
      return sendSuccess(res, {
        success: true,
        message: 'Withdrawal request submitted. It will be reviewed; when approved, funds will be sent via crypto.',
        data: {
          status: 'pending',
          id: result?.data?.id,
          amount: Number(amount),
          currency: result?.data?.currency || 'USD',
          balance_sc: balanceAfter?.usable_balance_sc ?? balanceAfter?.balance_sc,
          available_to_withdraw_sc: balanceAfter?.available_to_withdraw_sc
        }
      }, 201);
    }

    if (!linkedAccountId) return sendError(res, 'Select a payout method (Orionstar Pay) or use crypto with a wallet address.', 400);
    const result = await payment.createPaymentWithdrawalRequest(userId, req.body, getPaymentPartnerCodeFromRequest(req));
    try {
      await walletService.recordPaymentWithdrawalLocally(userId, req.body, result);
    } catch (recordErr) {
      console.error('recordPaymentWithdrawalLocally:', recordErr.message, {
        code: recordErr.code,
        userId,
        paymentApiRequestId: result?.data?.id
      });
      // Daily cap race after provider create — surface clearly; ops must reconcile provider side
      if (recordErr.code === 'DAILY_WITHDRAWAL_LIMIT') {
        return sendError(
          res,
          `${recordErr.message} If funds were sent to the payment provider, contact support with your account details.`,
          409
        );
      }
      return sendError(res, 'Withdrawal was created on payment provider but could not be recorded locally. Please contact support.', 500);
    }
    const balanceAfter = await walletService.getBalance(userId);
    return sendSuccess(res, {
      success: true,
      message: 'Withdrawal request submitted. It will be processed; funds are reserved until then.',
      data: {
        status: 'pending',
        id: result?.data?.id,
        amount: Number(amount),
        currency: result?.data?.currency || 'USD',
        balance_sc: balanceAfter?.usable_balance_sc ?? balanceAfter?.balance_sc,
        available_to_withdraw_sc: balanceAfter?.available_to_withdraw_sc
      }
    }, 201);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Withdrawal request could not be created.');
    return sendError(res, message, status);
  }
}

/** GET /api/payments/withdrawal-requests - List (role-based: user = own, admin = all) */
async function listWithdrawalRequests(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const user = await db.User.findByPk(userId, { attributes: ['isAdmin'], raw: true });
    const isAdmin = Boolean(user?.isAdmin);
    const result = await walletService.listWithdrawalRequests(userId, isAdmin, req.query);
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to load withdrawal requests.');
    return sendError(res, message, status);
  }
}

/** POST /api/payments/withdrawal-requests/:requestId/approve - Admin/partner only */
async function approveWithdrawalRequest(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const requestId = parseInt(req.params.requestId, 10);
    if (!Number.isFinite(requestId)) return sendError(res, 'Invalid request ID.', 400);
    const user = await db.User.findByPk(userId, { attributes: ['isAdmin'], raw: true });
    const isAdmin = Boolean(user?.isAdmin);
    const result = await walletService.approveWithdrawalRequest(requestId, userId, isAdmin);
    return sendSuccess(res, result, 200);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Could not approve withdrawal request.');
    return sendError(res, message, status);
  }
}

/** POST /api/payments/withdrawal-requests/:requestId/reject - Admin/partner only */
async function rejectWithdrawalRequest(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const requestId = parseInt(req.params.requestId, 10);
    if (!Number.isFinite(requestId)) return sendError(res, 'Invalid request ID.', 400);
    const user = await db.User.findByPk(userId, { attributes: ['isAdmin'], raw: true });
    const isAdmin = Boolean(user?.isAdmin);
    const rejectionReason = req.body?.rejectionReason ?? req.body?.rejection_reason ?? '';
    const result = await walletService.rejectWithdrawalRequest(requestId, userId, isAdmin, rejectionReason);
    return sendSuccess(res, result, 200);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Could not reject withdrawal request.');
    return sendError(res, message, status);
  }
}

/** POST /api/payments/chime-cashapp/withdraw — Chime/Cash App manual payout request (funds frozen until admin approves). */
async function createChimeCashappWithdrawal(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    await assertKycForWithdraw(userId);
    const result = await createChimeCashappWithdrawalRequest(
      userId,
      req.body || {},
      getDollarpayCredentialsFromRequest(req),
      getXxpayCredentialsFromRequest(req)
    );
    const balanceAfter = await walletService.getBalance(userId);
    return sendSuccess(
      res,
      {
        success: true,
        message: result.message,
        data: result.data,
        balance_sc: balanceAfter?.usable_balance_sc ?? balanceAfter?.balance_sc,
        available_to_withdraw_sc: balanceAfter?.available_to_withdraw_sc
      },
      201
    );
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Withdrawal request could not be created.');
    return sendError(res, message, status);
  }
}

/** GET /api/payments/chime-cashapp/withdrawals — current user's Chime/Cash App withdrawal history. */
async function listChimeCashappWithdrawalsForUser(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const result = await listChimeCashappWithdrawalRequestsForUser(userId, req.query);
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load requests.', status);
  }
}

/** GET /api/payments/chime/receive-preview — one random store pay-to Chime name (uniform among configured). */
async function getChimeReceivePreview(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await getChimeDepositReceivePreview(userId);
    return sendSuccess(res, { success: true, data });
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to load pay-to account.');
    return sendError(res, message, status);
  }
}

/** POST /api/payments/chime/deposit — manual Chime deposit request (credited after admin approves). */
async function createChimeDeposit(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const result = await createChimeDepositRequest(userId, req.body || {});
    const balanceAfter = await walletService.getBalance(userId);
    return sendSuccess(
      res,
      {
        success: true,
        message: result.message,
        data: result.data,
        balance_sc: balanceAfter?.usable_balance_sc ?? balanceAfter?.balance_sc
      },
      201
    );
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Deposit request could not be created.');
    return sendError(res, message, status);
  }
}

/** GET /api/payments/chime/deposits — current user's Chime deposit requests. */
async function listChimeDepositsForUser(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const result = await listChimeDepositRequestsForUser(userId, req.query);
    return sendSuccess(res, result);
  } catch (err) {
    const status = err.statusCode || 500;
    return sendError(res, err.message || 'Unable to load requests.', status);
  }
}

module.exports = {
  getDepositMethods,
  getWithdrawMethods,
  createDepositSessionHandler,
  getDepositStatusHandler,
  createSpeedWithdrawRequest,
  createWithdrawal,
  listWithdrawalRequests,
  approveWithdrawalRequest,
  rejectWithdrawalRequest,
  createChimeCashappWithdrawal,
  listChimeCashappWithdrawalsForUser,
  getChimeReceivePreview,
  createChimeDeposit,
  listChimeDepositsForUser
};
