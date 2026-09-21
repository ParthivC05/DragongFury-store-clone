const db = require('../../db/models');
const { getWalletLimitsForUser } = require('./getWalletLimits.service');
const { getCurrencySetting, PURCHASED_CURRENCY_CODE } = require('./getCurrencySetting.service');
const { creditPurchasedSc, creditBonusSc } = require('./walletBuckets.service');
const { splitPurchaseAndPackageBonus } = require('./scLedger.service');
const { applyReferralDepositReward } = require('../affiliate/applyReferralDepositReward.service');
const { applySignupBonusCodeOnDeposit } = require('../bonusCodes/applySignupBonusCodeOnDeposit.service');
const { redeemActivePayDiscount } = require('../payDiscount/applyActivePayDiscount.service');
const { addVipXp } = require('../vip/addVipXp.service');
const { getBalance } = require('./getBalance.service');
const {
  normalizePackageMeta,
  formatPackageDepositDescription,
  packageMetaToTransactionMetadata
} = require('../depositPackages/depositPackageMeta.service');
const { assertPackagePurchaseLimitForCompletion } = require('../depositPackages/packageEligibility.service');

async function deposit(userId, body) {
  const [limits, displayCurrency] = await Promise.all([getWalletLimitsForUser(userId), getCurrencySetting()]);
  const currencyCode = PURCHASED_CURRENCY_CODE;
  const minDeposit = limits.depositMin;

  const amount = body?.amount != null ? Number(body.amount) : NaN;
  const creditAmountRaw = body?.creditAmount ?? body?.credit_amount;
  const creditAmount = creditAmountRaw != null ? Number(creditAmountRaw) : NaN;
  const walletCredit = Number.isFinite(creditAmount) && creditAmount > 0 ? creditAmount : amount;
  const method = (body?.method && typeof body.method === 'string') ? body.method.trim().slice(0, 64) : null;
  const provider = (body?.provider && typeof body.provider === 'string') ? body.provider.trim().slice(0, 64) : null;
  const providerTransactionId = (body?.providerTransactionId && typeof body.providerTransactionId === 'string') ? body.providerTransactionId.trim().slice(0, 128) : null;
  const rawCryptoCurrency = body?.cryptoCurrency ?? body?.crypto_currency;
  const rawTxHash = body?.txHash ?? body?.tx_hash;
  const cryptoCurrency = typeof rawCryptoCurrency === 'string' ? rawCryptoCurrency.trim().slice(0, 32) || null : null;
  const txHash = typeof rawTxHash === 'string' ? rawTxHash.trim().slice(0, 255) || null : null;
  const rawPackageMeta = body?.packageMetadata ?? body?.package_metadata ?? null;
  const packageMeta = normalizePackageMeta(rawPackageMeta);
  // Already-paid provider completions must not be blocked by wallet min deposit.
  const isPaymentApiCompletion =
    method === 'orionstarspay' ||
    method === 'scrypto' ||
    provider === 'orionstarspay' ||
    provider === 'scrypto' ||
    provider === 'selfcrypto' ||
    provider === 'dollarpay' ||
    provider === 'xxpay';
  const isPackageDeposit = packageMeta?.packageId != null;
  if (!Number.isFinite(amount) || amount <= 0) {
    const err = new Error(`Invalid deposit amount`);
    err.statusCode = 400;
    throw err;
  }
  if (packageMeta?.packageId) {
    await assertPackagePurchaseLimitForCompletion(userId, packageMeta.packageId, {
      excludeChimeRequestId: body?.excludeChimeRequestId ?? null
    });
  }
  if (!isPaymentApiCompletion && !isPackageDeposit && amount < minDeposit) {
    const err = new Error(`Minimum deposit is ${displayCurrency} ${minDeposit}.00`);
    err.statusCode = 400;
    throw err;
  }

  const depositExtras = await db.sequelize.transaction(async (t) => {
    const depositReqPayload = {
      userId,
      amount,
      method: method || 'test',
      status: 'completed',
      provider: provider || null,
      providerTransactionId: providerTransactionId || null
    };
    if (cryptoCurrency) depositReqPayload.cryptoCurrency = cryptoCurrency;
    if (txHash) depositReqPayload.txHash = txHash;
    const depositReq = await db.DepositRequest.create(depositReqPayload, { transaction: t });
    const payAmount = packageMeta?.payAmount != null && Number.isFinite(Number(packageMeta.payAmount))
      ? Number(packageMeta.payAmount)
      : amount;
    const { purchased, bonus } = splitPurchaseAndPackageBonus(payAmount, walletCredit);
    const ledgerBase = {
      sourceType: 'DEPOSIT',
      sourceId: depositReq.id,
      paymentId: depositReq.id,
      processorId: provider || method || null,
      packageId: packageMeta?.packageId || null,
      remarks: packageMeta?.packageTitle || `Deposit ${method || 'test'}`
    };
    if (purchased > 0) {
      await creditPurchasedSc(userId, purchased, {
        transaction: t,
        ledger: {
          ...ledgerBase,
          eventType: 'PURCHASE',
          suffix: 'psc'
        }
      });
    }
    if (bonus > 0) {
      await creditBonusSc(userId, bonus, {
        transaction: t,
        ledger: {
          ...ledgerBase,
          eventType: 'PACKAGE_BONUS',
          bonusType: 'PACKAGE_BONUS',
          suffix: 'bonus'
        }
      });
    }
    if (db.UserTransaction) {
      const depositDescription = packageMeta
        ? formatPackageDepositDescription(packageMeta, displayCurrency)
        : `Deposit ${method || 'test'}`;
      const fromMeta = packageMeta ? packageMetaToTransactionMetadata(packageMeta) : {};
      const depositMetadata = {
        ...fromMeta,
        ...(providerTransactionId ? { provider_transaction_id: providerTransactionId } : {})
      };
      const hasMetaKeys = Object.keys(depositMetadata).some(
        (k) => depositMetadata[k] != null && depositMetadata[k] !== ''
      );
      await db.UserTransaction.create(
        {
          userId,
          type: 'deposit',
          amount: walletCredit,
          currencyCode,
          description: depositDescription,
          ...(hasMetaKeys ? { metadata: depositMetadata } : {})
        },
        { transaction: t }
      );
    }

    await applyReferralDepositReward(userId, depositReq, t);

    let bonusCodeApplied = [];
    if (db.BonusCode && db.UserBonusCodeGrant) {
      bonusCodeApplied = await applySignupBonusCodeOnDeposit(
        userId,
        depositReq.id,
        amount,
        currencyCode,
        t
      );
    }

    await redeemActivePayDiscount(userId, packageMeta || rawPackageMeta || {}, {
      depositRequestId: depositReq.id,
      transaction: t,
      currencyCode: 'USD'
    });

    // Legacy 1st/2nd/3rd deposit bonuses removed — welcome deposit packages replace them.
    const applied = [];
    if (db.VipLedger) {
      await addVipXp(userId, amount, 'deposit', depositReq.id, t);
    }
    return { applied, bonusCodeApplied };
  });

  const promoPayload = Array.isArray(depositExtras?.applied) ? depositExtras.applied : [];
  const bonusCodePayload = Array.isArray(depositExtras?.bonusCodeApplied) ? depositExtras.bonusCodeApplied : [];

  const balancePayload = await getBalance(userId);
  const result = {
    message: 'Deposit completed.',
    ...balancePayload
  };
  if (bonusCodePayload.length > 0) result.bonus_code_bonuses_applied = bonusCodePayload;
  if (promoPayload.length > 0) result.promotion_bonuses_applied = promoPayload;
  return result;
}

module.exports = { deposit };
