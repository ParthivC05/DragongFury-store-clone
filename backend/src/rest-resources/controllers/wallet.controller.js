const db = require('../../db/models');
const payment = require('../../services/payment');
const { getPaymentPartnerCodeFromRequest } = require('../../services/payment/payment.config');
const walletService = require('../../services/wallet');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const { assertKycForWithdraw } = require('../../services/kyc/assertKycForWithdraw.service');
const { paymentLog, logger } = require('../../libs/logger');
const { sendPaymentAccountCreatedEmail } = require('../../utils/email');
const { sanitizePlayerFacingMessage } = require('../../utils/playerFacingMessage');

const DEPOSIT_DEFAULT_ERROR = 'Deposit could not be completed. Please try again later.';

function isDatabaseOrInternalError(err) {
  if (!err) return true;
  const status = err.statusCode ?? err.response?.status;
  if (status != null && status >= 500) return true;
  const msg = (err.message || '').toLowerCase();
  return /column|relation|does not exist|syntax|constraint|econnrefused|timeout/.test(msg);
}

function safeMessage(err, defaultMsg) {
  if (isDatabaseOrInternalError(err)) return defaultMsg;
  const msg = typeof err.message === 'string' ? sanitizePlayerFacingMessage(err.message.trim()) : '';
  return msg || defaultMsg;
}

async function getBalance(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await walletService.getBalance(userId);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to load balance. Please try again later.');
    sendError(res, message, status);
  }
}

async function deposit(req, res) {
  try {
    paymentLog('--- POST /api/wallet/deposit (request) ---');
    paymentLog('request body:', req.body);
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const provider = (req.body?.provider && typeof req.body.provider === 'string')
      ? req.body.provider.trim().toLowerCase()
      : 'orionstarspay';

    if (provider === 'scrypto') {
      const data = await walletService.requestDeposit(userId, {
        amount: req.body?.amount,
        currency: req.body?.currency,
        name: req.body?.name,
        provider: 'scrypto'
      });
      paymentLog('--- POST /api/wallet/deposit (response) ---');
      paymentLog('response to client:', data);
      return sendSuccess(res, data, 201);
    }

    const user = await db.User.findByPk(userId, { attributes: ['email', 'firstName', 'lastName', 'paymentApiPasswordEncrypted', 'paymentApiEmail'], raw: true });
    const paymentEmail = (user?.paymentApiEmail || user?.email || '').trim().toLowerCase();
    if (!paymentEmail) {
      return sendError(res, 'User email not found.', 400);
    }
    // Names optional for deposit; if missing, derived from email where needed downstream.
    const { decryptPaymentPassword, isPaymentPasswordEncryptionConfigured } = require('../../utils/paymentPasswordEncryption');
    if (!isPaymentPasswordEncryptionConfigured() || !user.paymentApiPasswordEncrypted) {
      return sendError(res, 'Payment account not set up. Please link or create your payment account first.', 400);
    }
    let paymentPassword;
    try {
      paymentPassword = decryptPaymentPassword(user.paymentApiPasswordEncrypted);
    } catch (decryptErr) {
      paymentLog('deposit: payment password decrypt failed, requiring re-link:', decryptErr.message);
      return sendError(
        res,
        'Your payment account needs to be reconnected. Verify your email with a code to continue.',
        409,
        'PAYMENT_ACCOUNT_RELINK_REQUIRED',
        { data: { emailExists: true, paymentEmail } }
      );
    }
    if (!paymentPassword) {
      return sendError(
        res,
        'Your payment account needs to be reconnected. Verify your email with a code to continue.',
        409,
        'PAYMENT_ACCOUNT_RELINK_REQUIRED',
        { data: { emailExists: true, paymentEmail } }
      );
    }
    paymentLog('deposit: logging in to Payment API for email:', paymentEmail);
    let paymentToken;
    try {
      const loginRes = await payment.loginUser(paymentEmail, paymentPassword, getPaymentPartnerCodeFromRequest(req));
      paymentToken = loginRes.token;
      paymentLog('deposit: Payment API login success, token received');
    } catch (loginErr) {
      const rawStatus = loginErr.statusCode || 401;
      // Invalid/expired stored payment credentials must NOT log the user out of the platform.
      // Instead, check whether the payment email still exists and route the client into the
      // re-link (OTP) flow so the user can reconnect their payment account and continue.
      if (rawStatus === 401 || rawStatus === 403) {
        let emailExists = false;
        try {
          const check = await payment.checkPaymentUserDirect({
            email: paymentEmail,
            partnerCode: getPaymentPartnerCodeFromRequest(req),
          });
          emailExists = check?.exists === true;
        } catch (checkErr) {
          paymentLog('deposit: payment user existence check failed:', checkErr.message);
        }
        return sendError(
          res,
          emailExists
            ? 'Your payment account needs to be reconnected. Verify your email with a code to continue.'
            : 'We could not verify your payment account. Please link your payment account again.',
          409,
          'PAYMENT_ACCOUNT_RELINK_REQUIRED',
          { data: { emailExists, paymentEmail } }
        );
      }
      const message = loginErr.response?.message || loginErr.message || 'Payment login failed. Please contact support.';
      return sendError(res, message, rawStatus);
    }
    const depositOptions = {
      amount: req.body?.amount,
      currency: req.body?.currency,
      name: req.body?.name,
      paymentType: req.body?.payment_type ?? req.body?.paymentType,
      paymentMethod: req.body?.payment_method ?? req.body?.paymentMethod,
      acceptedPaymentOptions: req.body?.accepted_payment_options ?? req.body?.acceptedPaymentOptions,
      packageId: req.body?.package_id ?? req.body?.packageId
    };
    paymentLog('deposit: calling requestDeposit with options:', { ...depositOptions, paymentToken: '(set)' });
    const data = await walletService.requestDeposit(userId, {
      amount: req.body?.amount,
      paymentToken,
      paymentEmail,
      paymentPassword,
      paymentPartnerCode: getPaymentPartnerCodeFromRequest(req),
      currency: req.body?.currency,
      name: req.body?.name,
      paymentType: req.body?.payment_type ?? req.body?.paymentType,
      paymentMethod: req.body?.payment_method ?? req.body?.paymentMethod,
      acceptedPaymentOptions: req.body?.accepted_payment_options ?? req.body?.acceptedPaymentOptions,
      packageId: req.body?.package_id ?? req.body?.packageId,
      voucherId: req.body?.voucher_id ?? req.body?.voucherId,
      provider: 'orionstarspay'
    });
    paymentLog('--- POST /api/wallet/deposit (response) ---');
    paymentLog('response to client:', data);
    sendSuccess(res, data, 201);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, DEPOSIT_DEFAULT_ERROR);
    sendError(res, message, status);
  }
}

async function completeDeposit(req, res) {
  try {
    paymentLog('--- POST /api/wallet/deposit/complete (request) ---');
    paymentLog('request body:', req.body);
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const transactionId = req.body?.transactionId ?? req.body?.transaction_id;
    const data = await walletService.completeDepositFromPayment(userId, transactionId);
    paymentLog('--- POST /api/wallet/deposit/complete (response) ---');
    paymentLog('response to client:', data);
    if (data.alreadyProcessed) {
      sendSuccess(res, data, 200);
    } else {
      sendSuccess(res, data, 201);
    }
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Deposit could not be completed. Please try again.');
    sendError(res, message, status);
  }
}

async function syncDeposits(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);

    const { getDollarpayCredentialsFromRequest } = require('../../services/paymentProviders/dollarpay/dollarpay.credentials');
    const { syncDollarpayDeposits } = require('../../services/wallet/syncDollarpayDeposits.service');

    let processed = 0;
    let errors = [];
    let depositRefresh = [];

    // DollarPay: query open EXPIRED/PENDING orders (page refresh, Refresh status, iframe close).
    const dollarpayCreds = getDollarpayCredentialsFromRequest(req);
    if (dollarpayCreds) {
      try {
        const dp = await syncDollarpayDeposits(userId, dollarpayCreds);
        processed += dp.processed || 0;
        errors = errors.concat(Array.isArray(dp.errors) ? dp.errors : []);
        depositRefresh = depositRefresh.concat(Array.isArray(dp.depositRefresh) ? dp.depositRefresh : []);
      } catch (dpErr) {
        paymentLog('syncDeposits: DollarPay sync failed', dpErr.message);
        errors.push({ transactionId: 'dollarpay', message: dpErr.message || 'DollarPay sync failed.' });
      }
    }

    const user = await db.User.findByPk(userId, {
      attributes: ['paymentApiEmail', 'paymentApiPasswordEncrypted', 'email'],
      raw: true
    });
    const paymentEmail = (user?.paymentApiEmail || user?.email || '').trim().toLowerCase();
    const { decryptPaymentPassword, isPaymentPasswordEncryptionConfigured } = require('../../utils/paymentPasswordEncryption');

    const finishLocal = async () => {
      const deposits = await walletService.getDeposits(userId, { limit: 50, offset: 0 });
      return sendSuccess(res, { processed, errors, deposits, depositRefresh });
    };

    if (!paymentEmail || !user?.paymentApiPasswordEncrypted || !isPaymentPasswordEncryptionConfigured()) {
      return finishLocal();
    }

    let paymentPassword;
    try {
      paymentPassword = decryptPaymentPassword(user.paymentApiPasswordEncrypted);
    } catch (decryptErr) {
      paymentLog('syncDeposits: payment password decrypt failed, returning local deposits:', decryptErr.message);
      return finishLocal();
    }
    if (!paymentPassword) return finishLocal();

    let paymentToken;
    let centryosUserId;
    try {
      const loginRes = await payment.loginUser(paymentEmail, paymentPassword, getPaymentPartnerCodeFromRequest(req));
      paymentToken = loginRes?.token;
      centryosUserId = loginRes?.user?.id ?? payment.getCentryosUserIdFromToken(paymentToken);
    } catch (loginErr) {
      const status = loginErr.statusCode || 401;
      if (status === 401 || status === 403) {
        paymentLog('syncDeposits: payment login failed (invalid credentials), returning local + DollarPay deposits');
        return finishLocal();
      }
      const message = loginErr.response?.message || loginErr.message || 'Payment login failed.';
      return sendError(res, message, status);
    }
    if (!paymentToken) return finishLocal();

    const partnerCode = getPaymentPartnerCodeFromRequest(req);
    const result = await walletService.syncDepositsFromPaymentApi(userId, paymentToken, {
      centryosUserId,
      paymentEmail,
      paymentPassword,
      partnerCode
    });

    sendSuccess(res, {
      processed: processed + (result.processed || 0),
      errors: errors.concat(Array.isArray(result.errors) ? result.errors : []),
      deposits: result.deposits,
      depositRefresh: depositRefresh.concat(Array.isArray(result.depositRefresh) ? result.depositRefresh : [])
    });
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to sync deposit status. Please try again.');
    sendError(res, message, status);
  }
}

async function getDeposits(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await walletService.getDeposits(userId, req.query);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to load deposits. Please try again later.');
    sendError(res, message, status);
  }
}

async function withdraw(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    await assertKycForWithdraw(userId);
    const user = await db.User.findByPk(userId, { attributes: ['firstName', 'lastName'], raw: true });
    const first = (user?.firstName || '').trim();
    const last = (user?.lastName || '').trim();
    if (!first || !last) {
      return sendError(res, 'Profile details need to be updated. Please update your profile before using this feature.', 400);
    }
    const data = await walletService.withdraw(userId, req.body);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Withdrawal could not be completed. Please try again later.');
    sendError(res, message, status, err.code || null, err.kycStatus ? { data: { kycStatus: err.kycStatus } } : null);
  }
}

async function getWithdrawals(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const data = await walletService.getWithdrawals(userId, req.query);
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to load withdrawals. Please try again later.');
    sendError(res, message, status);
  }
}

async function getWalletLimits(req, res) {
  try {
    const userId = req.user?.userId;
    let data;
    if (userId) {
      const [limits, usage] = await Promise.all([
        walletService.getWalletLimitsForUser(userId),
        walletService.getDailyWithdrawalUsage(userId)
      ]);
      data = {
        ...limits,
        dailyWithdrawMax: usage.dailyWithdrawMax,
        dailyWithdrawnToday: usage.dailyWithdrawnToday,
        dailyWithdrawRemaining: usage.dailyWithdrawRemaining
      };
    } else {
      data = await walletService.getWalletLimits();
    }
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to load wallet limits. Please try again later.');
    sendError(res, message, status);
  }
}

async function linkPaymentAccount(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const email = (req.body?.email || '').trim();
    const password = req.body?.password;
    if (!email || typeof password !== 'string' || !password.trim()) {
      return sendError(res, 'Email and password are required.', 400);
    }
    const emailNorm = email.toLowerCase();
    let token;
    try {
      const loginRes = await payment.loginUser(emailNorm, password.trim(), getPaymentPartnerCodeFromRequest(req));
      token = loginRes.token;
    } catch (loginErr) {
      const message = loginErr.response?.message || loginErr.message || 'Invalid Orionstar payment account credentials.';
      return sendError(res, message, 400);
    }
    const { encryptPaymentPassword, isPaymentPasswordEncryptionConfigured } = require('../../utils/paymentPasswordEncryption');
    if (!isPaymentPasswordEncryptionConfigured()) {
      return sendError(res, 'Payment encryption not configured. Please contact support.', 503);
    }
    const encrypted = encryptPaymentPassword(password.trim());
    if (!encrypted) {
      return sendError(res, 'Could not save credentials. Please contact support.', 500);
    }
    const [affectedCount] = await db.User.update(
      {
        paymentApiEmail: emailNorm,
        paymentApiPasswordEncrypted: encrypted,
        paymentAccountCreatedByPlatform: false
      },
      { where: { userId } }
    );
    if (affectedCount === 0) {
      return sendError(res, 'User not found.', 404);
    }
    try {
      const u = await db.User.findByPk(userId, { attributes: ['email', 'storeCode'], raw: true });
      if (u?.email) {
        await sendPaymentAccountCreatedEmail(u.email, { storeCode: u.storeCode, isLinked: true });
      }
    } catch (emailErr) {
      logger.warn({ err: emailErr, userId }, 'Payment account linked email send failed');
    }
    sendSuccess(res, { message: 'Orionstar payment account linked successfully.' });
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Could not link payment account. Please try again.');
    sendError(res, message, status);
  }
}

async function sendPaymentOTP(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const email = (req.body?.email || '').toString().trim().toLowerCase();
    if (!email) return sendError(res, 'Email is required.', 400);
    const data = await payment.sendPaymentOTP({ email });
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Could not send OTP. Please try again.');
    sendError(res, message, status);
  }
}

async function getPaymentLinkedAccounts(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const currency = (req.query?.currency || 'USD').toString().trim().slice(0, 8) || 'USD';
    const data = await payment.getPaymentLinkedAccounts(userId, {
      currency,
      partnerCode: getPaymentPartnerCodeFromRequest(req)
    });
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Unable to load linked payment methods.');
    sendError(res, message, status);
  }
}

async function verifyPaymentOTP(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const email = (req.body?.email || '').toString().trim().toLowerCase();
    const otp = (req.body?.otp ?? '').toString().trim();
    if (!email) return sendError(res, 'Email is required.', 400);
    if (!otp) return sendError(res, 'OTP is required.', 400);
    const data = await payment.verifyPaymentOTP({ email, otp });
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Invalid or expired OTP. Please try again.');
    sendError(res, message, status);
  }
}

async function checkPaymentAccountDirect(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const email = (req.body?.email || '').toString().trim().toLowerCase();
    if (!email) return sendError(res, 'Email is required', 400);
    const data = await payment.checkPaymentUserDirect({
      email,
      partnerCode: getPaymentPartnerCodeFromRequest(req)
    });
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Could not check payment account.');
    sendError(res, message, status);
  }
}

async function requestPaymentPasswordResetOtp(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const email = (req.body?.email || '').toString().trim().toLowerCase();
    if (!email) return sendError(res, 'Email is required', 400);
    const data = await payment.requestPaymentPasswordResetOtp({
      email,
      partnerCode: getPaymentPartnerCodeFromRequest(req)
    });
    if (data?.success === false) {
      return sendError(res, data.message || 'Failed to send verification code', 400);
    }
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Failed to send verification code');
    sendError(res, message, status);
  }
}

async function verifyPaymentPasswordResetOtp(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const email = (req.body?.email || '').toString().trim().toLowerCase();
    const otp = (req.body?.otp ?? '').toString().trim();
    if (!email || !otp) return sendError(res, 'Email and OTP are required', 400);
    const data = await payment.verifyPaymentPasswordResetOtp({ email, otp });
    sendSuccess(res, data);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Failed to verify OTP');
    sendError(res, message, status);
  }
}

async function confirmPaymentPasswordReset(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const email = (req.body?.email || '').toString().trim().toLowerCase();
    if (!email) return sendError(res, 'Email is required', 400);
    const {
      generatePaymentPassword,
      encryptPaymentPassword,
      isPaymentPasswordEncryptionConfigured
    } = require('../../utils/paymentPasswordEncryption');
    if (!isPaymentPasswordEncryptionConfigured()) {
      return sendError(res, 'Payment encryption not configured. Please contact support.', 503);
    }
    const newPassword = generatePaymentPassword();
    const data = await payment.confirmPaymentPasswordReset({
      email,
      partnerCode: getPaymentPartnerCodeFromRequest(req),
      newPassword
    });
    if (data?.success === false) {
      return sendError(res, data.message || 'Failed to reset password', 400);
    }
    const encrypted = encryptPaymentPassword(newPassword);
    if (!encrypted) {
      return sendError(res, 'Could not save credentials. Please contact support.', 500);
    }
    const [affectedCount] = await db.User.update(
      {
        paymentApiEmail: email,
        paymentApiPasswordEncrypted: encrypted,
        paymentAccountCreatedByPlatform: true
      },
      { where: { userId } }
    );
    if (affectedCount === 0) {
      return sendError(res, 'User not found.', 404);
    }
    sendSuccess(res, {
      success: true,
      message: data?.message || 'Password reset successful. You can deposit now.'
    });
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Failed to reset password');
    sendError(res, message, status);
  }
}

async function createPaymentAccount(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const user = await db.User.findByPk(userId, {
      attributes: ['email', 'firstName', 'lastName', 'storeCode', 'paymentApiPasswordEncrypted'],
      raw: true
    });
    if (!user?.email) {
      return sendError(res, 'User email not found. Please complete your profile.', 400);
    }
    const { resolveUserNames } = require('../../utils/userNames');
    const { firstName: first, lastName: last } = resolveUserNames(user);
    const emailNorm = user.email.toLowerCase();
    const partnerCode = getPaymentPartnerCodeFromRequest(req);

    // If local credentials exist but CentryOS has no account for this email, clear stale
    // local password and recreate. If CentryOS already has the account, do not overwrite —
    // caller should use forgot-password OTP to reconnect.
    if (user.paymentApiPasswordEncrypted) {
      let remoteExists = false;
      try {
        const check = await payment.checkPaymentUserDirect({
          email: emailNorm,
          partnerCode
        });
        remoteExists = check?.exists === true;
      } catch (checkErr) {
        paymentLog('createPaymentAccount: remote check failed:', checkErr.message);
      }
      if (remoteExists) {
        return sendError(res, 'You already have a payment account linked. Use deposit to add funds.', 400);
      }
      await db.User.update(
        {
          paymentApiPasswordEncrypted: null,
          paymentAccountCreatedByPlatform: false,
          paymentApiEmail: null
        },
        { where: { userId } }
      );
      paymentLog('createPaymentAccount: cleared stale local payment credentials (remote account missing)');
    }

    const { generatePaymentPassword, encryptPaymentPassword, isPaymentPasswordEncryptionConfigured } = require('../../utils/paymentPasswordEncryption');
    if (!isPaymentPasswordEncryptionConfigured()) {
      return sendError(res, 'Payment encryption not configured. Please contact support.', 503);
    }
    const paymentPassword = generatePaymentPassword();
    try {
      await payment.signupUserDirect({
        firstName: first,
        lastName: last,
        email: emailNorm,
        password: paymentPassword,
        partnerCode
      });
    } catch (signupErr) {
      const rawMsg = signupErr.response?.message || signupErr.response?.error || signupErr.message || '';
      const msg = String(rawMsg).toLowerCase();
      const remoteAlreadyExists =
        msg.includes('already exists')
        || msg.includes('email already')
        || msg.includes('account already')
        || msg.includes('already registered');
      if (remoteAlreadyExists) {
        return sendSuccess(res, {
          created: false,
          remoteAccountAlreadyExists: true,
          message:
            'An Orionstar payment account already exists for this email on the payment partner. Link it in settings with your Orionstars password.'
        }, 200);
      }
      throw signupErr;
    }
    const encrypted = encryptPaymentPassword(paymentPassword);
    if (!encrypted) {
      return sendError(res, 'Could not save credentials. Please contact support.', 500);
    }
    await db.User.update(
      {
        paymentApiEmail: emailNorm,
        paymentApiPasswordEncrypted: encrypted,
        paymentAccountCreatedByPlatform: true
      },
      { where: { userId } }
    );
    try {
      await sendPaymentAccountCreatedEmail(user.email, { storeCode: user.storeCode });
    } catch (emailErr) {
      logger.warn({ err: emailErr, userId }, 'Payment account created email send failed');
    }
    sendSuccess(res, {
      created: true,
      message: 'Orionstar payment account created. You can view your password anytime in Profile.',
      password: paymentPassword
    }, 201);
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Could not create payment account. Please try again.');
    sendError(res, message, status);
  }
}

async function revealPaymentPassword(req, res) {
  try {
    const userId = req.user?.userId;
    if (!userId) return sendError(res, 'Unauthorized', 401);
    const user = await db.User.findByPk(userId, {
      attributes: ['paymentAccountCreatedByPlatform', 'paymentApiPasswordEncrypted'],
      raw: true
    });
    if (!user?.paymentAccountCreatedByPlatform) {
      return sendError(res, 'Password is only available for accounts created by this platform. You linked an existing account.', 403);
    }
    if (!user.paymentApiPasswordEncrypted) {
      return sendError(res, 'No payment account found.', 404);
    }
    const { decryptPaymentPassword } = require('../../utils/paymentPasswordEncryption');
    const password = decryptPaymentPassword(user.paymentApiPasswordEncrypted);
    if (!password) {
      return sendError(res, 'Could not retrieve password. Please contact support.', 500);
    }
    sendSuccess(res, { password });
  } catch (err) {
    const status = err.statusCode || 500;
    const message = safeMessage(err, 'Could not reveal password. Please try again.');
    sendError(res, message, status);
  }
}

module.exports = {
  getBalance,
  deposit,
  completeDeposit,
  syncDeposits,
  getDeposits,
  withdraw,
  getWithdrawals,
  getWalletLimits,
  linkPaymentAccount,
  sendPaymentOTP,
  verifyPaymentOTP,
  checkPaymentAccountDirect,
  requestPaymentPasswordResetOtp,
  verifyPaymentPasswordResetOtp,
  confirmPaymentPasswordReset,
  getPaymentLinkedAccounts,
  createPaymentAccount,
  revealPaymentPassword
};
