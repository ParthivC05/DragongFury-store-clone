const db = require('../../db/models');
const { getWalletLimitsForUser } = require('./getWalletLimits.service');
const { getCurrencySetting, REDEEMABLE_CURRENCY_CODE } = require('./getCurrencySetting.service');
const { getVipWithdrawalLimits } = require('../vip/getVipWithdrawalLimits.service');
const { assertSpinWheelWithdrawalAllowed } = require('./validateSpinWheelWithdrawal.service');
const { assertDailyWithdrawalLimit } = require('./assertDailyWithdrawalLimit.service');
const {
  encryptPaymentPassword,
  isPaymentPasswordEncryptionConfigured
} = require('../../utils/paymentPasswordEncryption');
const { notifyChimeRequestAdmins } = require('./notifyChimeRequestAdmins.service');
const { assertKycForWithdraw } = require('../kyc/assertKycForWithdraw.service');
const { rscAvailableToWithdraw } = require('./walletBuckets.service');

const MIN_AMOUNT = 10;
const ALLOWED_PAYOUT_TYPES = new Set([
  'chime',
  'cashapp',
  'paypal',
  'venmo',
  'zelle',
  'card',
  'bank_transfer'
]);

/**
 * Create a pending Chime/Cash App/PayPal (etc.) withdrawal: freezes RSC until admin approves or rejects.
 * @param {number} userId
 * @param {{ payoutType: string, amount: number, currency?: string, destinationUsername: string, destinationMeta?: object }} body
 * @param {{ merchantId?: string, apiKey?: string }|null} [dollarpayCreds]
 * @param {{ mchNo?: string, apiKey?: string, baseUrl?: string }|null} [xxpayCreds]
 */
async function createChimeCashappWithdrawalRequest(userId, body, dollarpayCreds = null, xxpayCreds = null) {
  await assertKycForWithdraw(userId);

  const payoutType = String(body?.payoutType ?? body?.payout_type ?? '').trim().toLowerCase();
  if (!ALLOWED_PAYOUT_TYPES.has(payoutType)) {
    const err = new Error(
      'Payout type must be chime, cashapp, paypal, venmo, zelle, card, or bank_transfer.'
    );
    err.statusCode = 400;
    throw err;
  }

  const destinationUsername = String(body?.destinationUsername ?? body?.destination_username ?? '').trim();
  const destinationMeta =
    body?.destinationMeta && typeof body.destinationMeta === 'object'
      ? body.destinationMeta
      : body?.destination_meta && typeof body.destination_meta === 'object'
        ? body.destination_meta
        : null;

  if (!destinationUsername && payoutType !== 'card' && payoutType !== 'bank_transfer') {
    const err = new Error('Destination account is required.');
    err.statusCode = 400;
    throw err;
  }
  if (payoutType === 'card') {
    const cardNumber = String(destinationMeta?.cardNumber || destinationUsername || '').trim();
    const cardValid = String(destinationMeta?.cardValid || '').trim();
    if (!cardNumber || !cardValid) {
      const err = new Error('Card number and expiry (MM/YYYY) are required.');
      err.statusCode = 400;
      throw err;
    }
  }
  if (payoutType === 'bank_transfer') {
    const accountNumber = String(destinationMeta?.accountNumber || destinationUsername || '').trim();
    const routingNumber = String(destinationMeta?.routingNumber || '').trim();
    if (!accountNumber || !routingNumber) {
      const err = new Error('Account number and routing number are required for ACH.');
      err.statusCode = 400;
      throw err;
    }
  }
  if (destinationUsername.length > 255) {
    const err = new Error('Username is too long.');
    err.statusCode = 400;
    throw err;
  }

  const amount = body?.amount != null ? Number(body.amount) : NaN;
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT) {
    const err = new Error(`Amount must be at least ${MIN_AMOUNT}.`);
    err.statusCode = 400;
    throw err;
  }

  const [limits, displayCurrencyCode, vipLimits, requester] = await Promise.all([
    getWalletLimitsForUser(userId),
    getCurrencySetting(),
    getVipWithdrawalLimits(userId).catch(() => ({ withdrawalLimit: null, platformWithdrawalLimit: null })),
    db.User.findByPk(userId, {
      attributes: ['userId', 'username', 'email', 'distributorCode', 'storeCode']
    })
  ]);

  if (!requester) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  const storeContext =
    requester.distributorCode && requester.storeCode
      ? { distributorCode: requester.distributorCode, storeCode: requester.storeCode }
      : null;
  const { getActiveWithdrawMethods } = require('../payments/withdrawMethods.service');
  const { paymentTypes } = await getActiveWithdrawMethods(storeContext);
  const pt = (paymentTypes || []).find((p) => p.key === payoutType);
  const activeProvider = String(pt?.providers?.[0]?.providerCode || '').toLowerCase();
  const usesXxpay = activeProvider === 'xxpay';
  const usesDollarpay = activeProvider === 'dollarpay';

  if (usesXxpay) {
    const { assertXxpayPayoutDestination } = require('../paymentProviders/xxpay/xxpay.wayCodes');
    assertXxpayPayoutDestination(payoutType, destinationUsername);
  }

  /** Attach provider creds when this store routes the payout type to that provider. */
  let paymentProvider = null;
  let dollarpayMerchantId = null;
  let dollarpayKeyEncrypted = null;
  let xxpayBaseUrl = null;
  let destMetaToStore = destinationMeta;

  if (usesXxpay && xxpayCreds?.mchNo && xxpayCreds?.apiKey) {
    if (!isPaymentPasswordEncryptionConfigured()) {
      const err = new Error('Payment encryption is not configured. Cannot store XXPay credentials.');
      err.statusCode = 503;
      throw err;
    }
    const encrypted = encryptPaymentPassword(String(xxpayCreds.apiKey));
    if (!encrypted) {
      const err = new Error('Could not encrypt XXPay credentials.');
      err.statusCode = 500;
      throw err;
    }
    paymentProvider = 'xxpay';
    dollarpayMerchantId = String(xxpayCreds.mchNo).trim().slice(0, 128);
    dollarpayKeyEncrypted = encrypted;
    xxpayBaseUrl = xxpayCreds.baseUrl ? String(xxpayCreds.baseUrl).trim().slice(0, 255) : null;
  } else if (usesXxpay) {
    const err = new Error(
      'XXPay credentials missing. Set VITE_XXPAY_MCH_NO and VITE_XXPAY_API_KEY on the store frontend.'
    );
    err.statusCode = 400;
    throw err;
  } else if (usesDollarpay && dollarpayCreds?.merchantId && dollarpayCreds?.apiKey) {
    if (!isPaymentPasswordEncryptionConfigured()) {
      const err = new Error('Payment encryption is not configured. Cannot store DollarPay credentials.');
      err.statusCode = 503;
      throw err;
    }
    const encrypted = encryptPaymentPassword(String(dollarpayCreds.apiKey));
    if (!encrypted) {
      const err = new Error('Could not encrypt DollarPay credentials.');
      err.statusCode = 500;
      throw err;
    }
    paymentProvider = 'dollarpay';
    dollarpayMerchantId = String(dollarpayCreds.merchantId).trim().slice(0, 128);
    dollarpayKeyEncrypted = encrypted;
  }

  // Normalize display destination for card/ACH
  let destDisplay = destinationUsername.slice(0, 255);
  if (payoutType === 'card' && destinationMeta?.cardNumber) {
    destDisplay = String(destinationMeta.cardNumber).slice(-4).padStart(4, '*').slice(0, 255);
    destMetaToStore = destinationMeta;
  }
  if (payoutType === 'bank_transfer' && destinationMeta?.accountNumber) {
    destDisplay = String(destinationMeta.accountNumber).slice(-4).padStart(4, '*').slice(0, 255);
    destMetaToStore = destinationMeta;
  }

  const { withdrawMin, withdrawMax } = limits;
  const { XXPAY_WITHDRAW_MIN } = require('../paymentProviders/xxpay/xxpay.amounts');
  const effectiveWithdrawMin = usesXxpay
    ? Math.max(Number(withdrawMin) || 0, XXPAY_WITHDRAW_MIN)
    : withdrawMin;
  const effectiveWindowMax = (vipLimits.platformWithdrawalLimit != null && vipLimits.platformWithdrawalLimit > 0)
    ? Math.min(withdrawMax, vipLimits.platformWithdrawalLimit)
    : withdrawMax;
  const effectivePerRequestMax = (vipLimits.withdrawalLimit != null && vipLimits.withdrawalLimit > 0)
    ? Math.min(effectiveWindowMax, vipLimits.withdrawalLimit)
    : effectiveWindowMax;

  if (amount < effectiveWithdrawMin) {
    const err = new Error(`Minimum withdrawal is ${displayCurrencyCode} ${effectiveWithdrawMin}.00`);
    err.statusCode = 400;
    throw err;
  }
  if (amount > effectivePerRequestMax) {
    if (limits.neverDeposited) {
      const { neverDepositedWithdrawMaxError } = require('./neverDepositedWithdraw.service');
      throw neverDepositedWithdrawMaxError();
    }
    const err = new Error(
      `Maximum withdrawal per request is ${displayCurrencyCode} ${effectivePerRequestMax}.00`
    );
    err.statusCode = 400;
    throw err;
  }

  const currencyCode = REDEEMABLE_CURRENCY_CODE;
  const currency = ((body?.currency ?? currencyCode) || 'USD').toString().trim().slice(0, 8) || 'USD';
  const distributorCode = requester.distributorCode ? String(requester.distributorCode).trim().slice(0, 64) : null;
  const storeCode = requester.storeCode ? String(requester.storeCode).trim().slice(0, 64) : null;

  const row = await db.sequelize.transaction(async (t) => {
    let wallet = await db.Wallet.findOne({
      where: { userId, currencyCode },
      transaction: t,
      lock: t.LOCK.UPDATE
    });
    if (!wallet) {
      wallet = await db.Wallet.create(
        { userId, currencyCode, balance: 0, playBalance: 0, frozenBalance: 0 },
        { transaction: t }
      );
      wallet = await db.Wallet.findOne({
        where: { userId, currencyCode },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
    }

    const availableToWithdraw = rscAvailableToWithdraw(wallet);
    if (amount > availableToWithdraw) {
      const err = new Error(
        'Insufficient redeemable balance (RSC). Withdrawals use funds from game wins and redemptions only.'
      );
      err.statusCode = 400;
      throw err;
    }

    await assertSpinWheelWithdrawalAllowed(userId, amount, availableToWithdraw);
    await assertDailyWithdrawalLimit(userId, amount, {
      displayCurrency: displayCurrencyCode,
      transaction: t
    });

    const reqRow = await db.ChimeCashappWithdrawalRequest.create(
      {
        userId,
        distributorCode,
        storeCode,
        payoutType,
        amount: Number(amount),
        currency,
        destinationUsername: destDisplay || destinationUsername.slice(0, 255) || 'n/a',
        destinationMeta: destMetaToStore || null,
        status: 'pending',
        paymentProvider,
        dollarpayMerchantId,
        dollarpayKeyEncrypted,
        xxpayBaseUrl
      },
      { transaction: t }
    );
    await wallet.increment('frozenBalance', { by: Number(amount), transaction: t });
    return reqRow;
  });

  // Notify store admins + master admins (super admin and technical staff) — Manual requests tab
  if (db.Notification) {
    const label =
      payoutType === 'chime'
        ? 'Chime'
        : payoutType === 'paypal'
          ? 'PayPal'
          : payoutType === 'venmo'
            ? 'Venmo'
            : payoutType === 'zelle'
              ? 'Zelle'
              : payoutType === 'card'
                ? 'Card'
                : payoutType === 'bank_transfer'
                  ? 'ACH'
                  : 'Cash App';
    const amountStr = Number(amount).toFixed(2);
    const userLabel = requester.username || requester.email || `User #${userId}`;
    const storeLabel = storeCode ? ` (store ${storeCode})` : '';
    await notifyChimeRequestAdmins({
      storeCode,
      type: 'chime_withdrawal_queued',
      title: `New ${label} withdrawal request`,
      message: `${userLabel} needs a ${label} withdrawal. Amount: ${amountStr} ${displayCurrencyCode}.`,
      actionUrl: '/admin/chime-cashapp-withdrawals',
      titleForMaster: `Manual request: withdrawal – ${label}${storeLabel}`,
      messageForMaster: `${userLabel} submitted a pending ${label} withdrawal. Amount: ${amountStr} ${displayCurrencyCode}. Review in Chime withdrawals.`
    });
  }

  return {
    success: true,
    message: 'Withdrawal request submitted. It will be reviewed by your store admin.',
    data: {
      id: row.id,
      status: row.status,
      amount: Number(row.amount),
      currency: row.currency,
      payoutType: row.payoutType,
      paymentProvider: row.paymentProvider || null,
      createdAt: row.createdAt || row.created_at
    }
  };
}

module.exports = { createChimeCashappWithdrawalRequest };
