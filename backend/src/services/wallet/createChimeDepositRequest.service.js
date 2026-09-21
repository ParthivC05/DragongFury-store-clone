const { Op } = require('sequelize');
const db = require('../../db/models');
const { getWalletLimitsForUser } = require('./getWalletLimits.service');
const { getCurrencySetting } = require('./getCurrencySetting.service');
const {
  getReceiveUsernames,
  resolveDestinationMatch
} = require('./storeChimeDepositReceiveAccounts.service');
const { resolveDepositPackageForUser } = require('../depositPackages/resolveDepositPackage.service');
const {
  applyActivePayDiscountForUser,
  payDiscountMetadata
} = require('../payDiscount/applyActivePayDiscount.service');
const { EMAIL_CAMPAIGN_STORE_CODE, normalizeStoreCode } = require('../emailCampaigns/constants');
const { notifyChimeRequestAdmins } = require('./notifyChimeRequestAdmins.service');

const MIN_AMOUNT = 10;

/**
 * Create a pending Chime manual deposit request (no wallet change until admin approves).
 * Daily-bonus vouchers are consumed when the request is submitted — not when it is approved.
 * @param {number} userId
 * @param {{ depositType: 'chime', amount: number, currency?: string, sourceUsername: string }} body
 */
async function createChimeDepositRequest(userId, body) {
  const depositType = String(body?.depositType ?? body?.deposit_type ?? '').trim().toLowerCase();
  if (depositType !== 'chime') {
    const err = new Error('Only Chime manual deposits are supported.');
    err.statusCode = 400;
    throw err;
  }

  const sourceUsername = String(body?.sourceUsername ?? body?.source_username ?? '').trim();
  if (!sourceUsername) {
    const err = new Error('Chime username is required.');
    err.statusCode = 400;
    throw err;
  }
  if (sourceUsername.length > 255) {
    const err = new Error('Username is too long.');
    err.statusCode = 400;
    throw err;
  }

  const destinationUsernameRaw = String(
    body?.destinationUsername ?? body?.destination_username ?? ''
  ).trim();
  if (!destinationUsernameRaw) {
    const err = new Error('Pay-to Chime account is required.');
    err.statusCode = 400;
    throw err;
  }

  const amount = body?.amount != null ? Number(body.amount) : NaN;
  const packageId = body?.package_id ?? body?.packageId ?? null;
  const voucherId = body?.voucher_id ?? body?.voucherId ?? null;
  let payAmount = amount;
  let creditSc = null;
  let resolvedPackageId = null;
  let packageVoucherMeta = null;

  const openRequest = await db.ChimeDepositRequest.findOne({
    where: {
      userId,
      depositType: 'chime',
      status: { [Op.in]: ['pending', 'processing'] }
    }
  });
  if (openRequest) {
    const err = new Error(
      'You already have a Chime deposit waiting for approval. Wait until it is approved before submitting another request.'
    );
    err.statusCode = 409;
    throw err;
  }

  // Price/voucher/campaign check only — consume voucher after all request validation passes.
  if (packageId != null && packageId !== '') {
    const pkg = await resolveDepositPackageForUser(userId, packageId, {
      voucherId,
      consumeVoucher: false
    });
    payAmount = pkg.payAmount;
    creditSc = pkg.creditAmount;
    resolvedPackageId = pkg.packageId;
    packageVoucherMeta = pkg.metadata || null;
    if (Number.isFinite(amount) && Math.abs(amount - payAmount) > 0.01) {
      const err = new Error('Package price does not match the selected amount.');
      err.statusCode = 400;
      throw err;
    }
  } else {
    const userPeek = await db.User.findByPk(userId, { attributes: ['storeCode'], raw: true });
    const isPlayjuwa = normalizeStoreCode(userPeek?.storeCode) === EMAIL_CAMPAIGN_STORE_CODE;
    const listAmountRaw = body?.list_amount ?? body?.listAmount;
    const hasExplicitList = listAmountRaw != null && listAmountRaw !== '';
    const listAmount = hasExplicitList ? Number(listAmountRaw) : NaN;

    if (Number.isFinite(listAmount) && listAmount > 0) {
      const discountApplied = await applyActivePayDiscountForUser(userId, listAmount);
      if (discountApplied.applied) {
        payAmount = discountApplied.payAmount;
        creditSc = listAmount;
        packageVoucherMeta = payDiscountMetadata(discountApplied);
        if (Number.isFinite(amount) && Math.abs(amount - payAmount) > 0.01) {
          const err = new Error('Discounted amount does not match. Refresh and try again.');
          err.statusCode = 400;
          throw err;
        }
      } else if (isPlayjuwa) {
        payAmount = Number.isFinite(amount) ? amount : listAmount;
        creditSc = listAmount;
      }
    }
  }

  if (packageId == null) {
    if (!Number.isFinite(payAmount) || payAmount < MIN_AMOUNT) {
      const err = new Error(`Amount must be at least ${MIN_AMOUNT}.`);
      err.statusCode = 400;
      throw err;
    }
  } else if (!Number.isFinite(payAmount) || payAmount <= 0) {
    const err = new Error('Package price is invalid.');
    err.statusCode = 400;
    throw err;
  }

  const [limits, displayCurrencyCode, requester] = await Promise.all([
    getWalletLimitsForUser(userId),
    getCurrencySetting(),
    db.User.findByPk(userId, {
      attributes: ['userId', 'username', 'email', 'distributorCode', 'storeCode']
    })
  ]);

  if (!requester) {
    const err = new Error('User not found.');
    err.statusCode = 404;
    throw err;
  }

  const depositMin = Number(limits?.depositMin) >= 0 ? Number(limits.depositMin) : 10;
  const depositMax = Number(limits?.depositMax) > 0 ? Number(limits.depositMax) : 5000;

  // Package catalog prices are trusted; wallet min/max apply only to custom amounts.
  if (packageId == null && payAmount < depositMin) {
    const err = new Error(`Minimum deposit is ${displayCurrencyCode} ${depositMin}`);
    err.statusCode = 400;
    throw err;
  }
  if (packageId == null && payAmount > depositMax) {
    const err = new Error(`Maximum deposit is ${displayCurrencyCode} ${depositMax}.00`);
    err.statusCode = 400;
    throw err;
  }

  const currency = ((body?.currency ?? displayCurrencyCode) || 'USD').toString().trim().slice(0, 8) || 'USD';
  const distributorCode = requester.distributorCode ? String(requester.distributorCode).trim().slice(0, 64) : null;
  const storeCode = requester.storeCode ? String(requester.storeCode).trim().slice(0, 64) : null;

  if (!storeCode || !distributorCode) {
    const err = new Error('Chime deposits are only available when your account is linked to a store.');
    err.statusCode = 400;
    throw err;
  }

  const configured = await getReceiveUsernames(distributorCode, storeCode);
  if (!configured.length) {
    const err = new Error(
      'Chime pay-to accounts are not configured for your store yet. Please try again later or contact support.'
    );
    err.statusCode = 400;
    throw err;
  }
  const destinationUsername = resolveDestinationMatch(destinationUsernameRaw, configured);
  if (!destinationUsername) {
    const err = new Error(
      'That pay-to account is not valid. Refresh the deposit screen and use the account shown there.'
    );
    err.statusCode = 400;
    throw err;
  }

  // Consume voucher + create request together so settlement is not required.
  const row = await db.sequelize.transaction(async (t) => {
    if (packageId != null && voucherId != null && voucherId !== '') {
      const pkg = await resolveDepositPackageForUser(userId, packageId, {
        voucherId,
        consumeVoucher: true,
        transaction: t
      });
      payAmount = pkg.payAmount;
      creditSc = pkg.creditAmount;
      resolvedPackageId = pkg.packageId;
      packageVoucherMeta = pkg.metadata || null;
    }

    const created = await db.ChimeDepositRequest.create(
      {
        userId,
        distributorCode,
        storeCode,
        depositType,
        amount: Number(payAmount),
        currency,
        sourceUsername: sourceUsername.slice(0, 255),
        destinationUsername,
        status: 'pending',
        packageId: resolvedPackageId,
        creditSc: creditSc != null ? Number(creditSc) : null,
        metadata: packageVoucherMeta || null
      },
      { transaction: t }
    );

    const voucherIdUsed =
      packageVoucherMeta?.dailyBonusVoucherId != null
        ? parseInt(packageVoucherMeta.dailyBonusVoucherId, 10)
        : NaN;
    if (Number.isInteger(voucherIdUsed) && voucherIdUsed > 0) {
      await db.UserDailyBonusVoucher.update(
        {
          depositRequestId: created.id,
          status: 'used',
          usedAt: new Date(),
          usedOnPackageId: resolvedPackageId,
          updatedAt: new Date()
        },
        { where: { id: voucherIdUsed, userId }, transaction: t }
      );
    }

    return created;
  });

  if (db.Notification) {
    const amountStr = Number(payAmount).toFixed(2);
    const payTo = destinationUsername ? ` Pay-to: ${destinationSenderLabel(destinationUsername)}.` : '';
    const userLabel = requester.username || requester.email || `User #${userId}`;
    const storeLabel = storeCode ? ` (store ${storeCode})` : '';
    await notifyChimeRequestAdmins({
      storeCode,
      type: 'chime_deposit_queued',
      title: 'New Chime deposit request',
      message: `${userLabel} needs a Chime deposit. Amount: ${amountStr} ${displayCurrencyCode}.${payTo}`,
      actionUrl: '/admin/chime-deposits',
      titleForMaster: `Manual request: deposit – Chime${storeLabel}`,
      messageForMaster: `${userLabel} submitted a pending Chime deposit.${payTo ? payTo : ''} Amount: ${amountStr} ${displayCurrencyCode}. Review in Chime deposits.`
    });
  }

  return {
    success: true,
    message: 'Deposit request submitted. It will be reviewed by your store admin after you send the payment.',
    data: {
      id: row.id,
      status: row.status,
      amount: Number(row.amount),
      currency: row.currency,
      depositType: row.depositType,
      destinationUsername: row.destinationUsername || null,
      createdAt: row.createdAt || row.created_at
    }
  };
}

function destinationSenderLabel(name) {
  const s = String(name || '').trim();
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

module.exports = { createChimeDepositRequest };
