'use strict';

const { Op } = require('sequelize');
const crypto = require('crypto');
const db = require('../../db/models');
const { isUniqueConstraintError, isAbortedTransactionError } = require('../../utils/pgErrors');
const {
  WALLET_TYPES,
  DIRECTIONS,
  EVENT_TYPES,
  BONUS_TYPES,
  EXCESS_WIN_ACTIONS,
  CURRENCY_TO_WALLET
} = require('../../constants/walletScLedger');

function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

/** Ledger game_id is INTEGER (GitSlotPark). 1GameHub ids like kagaming2-bonus-mania must not be inserted. */
function coerceIntegerId(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

function walletTypeFromCurrency(currencyCode) {
  const code = String(currencyCode || '').toUpperCase();
  return CURRENCY_TO_WALLET[code] || null;
}

function makeIdempotencyKey(parts) {
  if (parts.idempotencyKey) return String(parts.idempotencyKey).slice(0, 255);
  const raw = [
    parts.userId != null ? String(parts.userId) : '',
    parts.eventType || 'NA',
    parts.sourceType || 'NA',
    parts.sourceId != null ? String(parts.sourceId) : '',
    parts.walletType || '',
    parts.direction || '',
    parts.suffix || '',
    parts.nonce || ''
  ].join(':');
  if (raw.length <= 255) return raw;
  const hash = crypto.createHash('sha256').update(raw + ':' + (parts.entropy || '')).digest('hex').slice(0, 24);
  return `${raw.slice(0, 200)}:${hash}`.slice(0, 255);
}

async function resolveStoreCode(userId, transaction, provided) {
  if (provided != null && String(provided).trim()) return String(provided).trim();
  const user = await db.User.findByPk(userId, {
    attributes: ['storeCode'],
    transaction
  });
  return user?.storeCode || null;
}

/**
 * FIFO consume bonus lots. Returns allocations [{ lotId, bonusType, amount }].
 */
async function consumeBonusLots(userId, amount, { transaction, ledgerId = null } = {}) {
  const need = roundMoney(amount);
  if (!(need > 0) || !db.BonusScLot) return [];

  const lots = await db.BonusScLot.findAll({
    where: {
      userId,
      remainingAmount: { [Op.gt]: 0 }
    },
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });

  const allocations = [];
  let left = need;
  for (const lot of lots) {
    if (left <= 0) break;
    const remaining = roundMoney(lot.remainingAmount);
    if (!(remaining > 0)) continue;
    const take = roundMoney(Math.min(remaining, left));
    const nextRemaining = roundMoney(remaining - take);
    const nextOutstanding = roundMoney((Number(lot.outstandingPlay) || 0) + take);
    await lot.update(
      {
        remainingAmount: nextRemaining,
        outstandingPlay: nextOutstanding
      },
      { transaction }
    );
    allocations.push({
      lotId: lot.id,
      bonusType: lot.bonusType,
      amount: take,
      remainingAfter: nextRemaining
    });
    left = roundMoney(left - take);
  }

  if (ledgerId && db.BonusScLotConsumption) {
    for (const row of allocations) {
      await db.BonusScLotConsumption.create(
        { lotId: row.lotId, ledgerId, amount: row.amount },
        { transaction }
      );
    }
  }

  return allocations;
}

async function createBonusLot(entry, extras, transaction) {
  if (!db.BonusScLot) return null;
  const lot = await db.BonusScLot.create(
    {
      userId: entry.userId,
      storeCode: entry.storeCode,
      bonusType: extras.bonusType || entry.bonusType || BONUS_TYPES.OTHER_BONUS,
      originalAmount: entry.amount,
      remainingAmount: entry.amount,
      maxCashout: extras.maxCashout != null ? roundMoney(extras.maxCashout) : null,
      requiresDeposit: extras.requiresDeposit === true,
      excessWinAction: extras.excessWinAction || EXCESS_WIN_ACTIONS.VOID,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      paymentId: entry.paymentId,
      packageId: entry.packageId,
      ledgerId: entry.id,
      expiresAt: extras.expiresAt || null
    },
    { transaction }
  );
  return lot;
}

/**
 * Apply cashout cap to an RSC credit that came from bonus-funded play.
 * Returns { eligible, voided, isBonusOrigin, lotUpdates }.
 */
async function applyCashoutCap(userId, grossAmount, { transaction, productId } = {}) {
  const gross = roundMoney(grossAmount);
  if (!(gross > 0) || !db.BonusScLot) {
    return { eligible: gross, voided: 0, isBonusOrigin: false };
  }

  const lots = await db.BonusScLot.findAll({
    where: {
      userId,
      outstandingPlay: { [Op.gt]: 0 }
    },
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined
  });

  if (!lots.length) {
    return { eligible: gross, voided: 0, isBonusOrigin: false };
  }

  let remainingGross = gross;
  let eligibleTotal = 0;
  let voidedTotal = 0;

  for (const lot of lots) {
    if (remainingGross <= 0) break;
    const outstanding = roundMoney(lot.outstandingPlay);
    if (!(outstanding > 0)) continue;

    const attributed = roundMoney(Math.min(outstanding, remainingGross));
    const alreadyEligible = roundMoney(lot.rscGeneratedEligible);
    const cap = lot.maxCashout != null ? roundMoney(lot.maxCashout) : null;
    const capLeft = cap == null ? attributed : roundMoney(Math.max(0, cap - alreadyEligible));
    const action = String(lot.excessWinAction || EXCESS_WIN_ACTIONS.VOID).toLowerCase();

    let eligible = attributed;
    let voided = 0;
    if (cap != null && attributed > capLeft) {
      eligible = capLeft;
      voided = roundMoney(attributed - capLeft);
      if (action === EXCESS_WIN_ACTIONS.KEEP) {
        eligible = attributed;
        voided = 0;
      }
    }

    await lot.update(
      {
        outstandingPlay: roundMoney(outstanding - attributed),
        rscGeneratedGross: roundMoney((Number(lot.rscGeneratedGross) || 0) + attributed),
        rscGeneratedEligible: roundMoney(alreadyEligible + eligible),
        rscVoidedCap: roundMoney((Number(lot.rscVoidedCap) || 0) + voided)
      },
      { transaction }
    );

    eligibleTotal = roundMoney(eligibleTotal + eligible);
    voidedTotal = roundMoney(voidedTotal + voided);
    remainingGross = roundMoney(remainingGross - attributed);
  }

  // Wins not covered by bonus-funded play stay fully eligible.
  eligibleTotal = roundMoney(eligibleTotal + remainingGross);

  return {
    eligible: eligibleTotal,
    voided: voidedTotal,
    isBonusOrigin: true,
    productId
  };
}

/**
 * Write one ledger row. Safe to retry: unique idempotency_key returns the existing row.
 */
async function writeLedgerEntry(input, transaction) {
  if (!db.WalletScLedger) return null;
  const amount = roundMoney(input.amount);
  if (!(amount > 0)) return null;

  const walletType = input.walletType;
  const direction = input.direction;
  if (!walletType || !direction) return null;

  const storeCode = await resolveStoreCode(input.userId, transaction, input.storeCode);
  const idempotencyKey = makeIdempotencyKey(input);
  const numericGameId = coerceIntegerId(input.gameId);
  const metadata = {
    ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {})
  };
  if (input.gameId != null && numericGameId == null) {
    metadata.providerGameId = String(input.gameId);
  }

  const payload = {
    userId: input.userId,
    storeCode,
    walletType,
    direction,
    amount,
    eventType: input.eventType || EVENT_TYPES.UNCLASSIFIED,
    sourceType: input.sourceType || null,
    sourceId: input.sourceId != null ? String(input.sourceId).slice(0, 128) : null,
    productId: input.productId || null,
    productType: input.productType || null,
    providerId: input.providerId || null,
    gameId: numericGameId,
    roundId: input.roundId != null ? String(input.roundId).slice(0, 128) : null,
    bonusType: input.bonusType || null,
    bonusLotId: input.bonusLotId || null,
    paymentId: input.paymentId != null ? String(input.paymentId).slice(0, 128) : null,
    processorId: input.processorId || null,
    packageId: input.packageId || null,
    parentTransactionId: input.parentTransactionId || null,
    idempotencyKey,
    createdBy: input.createdBy || null,
    remarks: input.remarks || null,
    metadata: Object.keys(metadata).length ? metadata : null,
    balanceBefore: input.balanceBefore != null ? roundMoney(input.balanceBefore) : null,
    balanceAfter: input.balanceAfter != null ? roundMoney(input.balanceAfter) : null,
    isBonusOrigin: input.isBonusOrigin === true,
    grossAmount: input.grossAmount != null ? roundMoney(input.grossAmount) : amount,
    eligibleAmount: input.eligibleAmount != null ? roundMoney(input.eligibleAmount) : amount,
    voidedAmount: input.voidedAmount != null ? roundMoney(input.voidedAmount) : 0
  };

  const createRow = () => db.WalletScLedger.create(payload, { transaction });

  if (!transaction) {
    try {
      return await createRow();
    } catch (err) {
      if (isAbortedTransactionError(err)) throw err;
      if (isUniqueConstraintError(err)) {
        return db.WalletScLedger.findOne({ where: { idempotencyKey } });
      }
      throw err;
    }
  }

  // Unique violations abort the Postgres transaction. Use a savepoint so we can
  // look up the existing row once — never re-run the INSERT in a loop.
  const savepoint = `sp_l_${crypto.randomBytes(4).toString('hex')}`;
  await db.sequelize.query(`SAVEPOINT ${savepoint}`, { transaction });
  try {
    const row = await createRow();
    await db.sequelize.query(`RELEASE SAVEPOINT ${savepoint}`, { transaction });
    return row;
  } catch (err) {
    if (isAbortedTransactionError(err) && !isUniqueConstraintError(err)) throw err;
    if (!isUniqueConstraintError(err)) throw err;
    await db.sequelize.query(`ROLLBACK TO SAVEPOINT ${savepoint}`, { transaction });
    return db.WalletScLedger.findOne({ where: { idempotencyKey }, transaction });
  }
}

/**
 * After a wallet row changed, record the ledger (and bonus lots / FIFO).
 * `ledger` is optional metadata from the caller.
 */
async function recordWalletChange({
  userId,
  currencyCode,
  direction,
  amount,
  wallet,
  ledger: meta = {},
  transaction
}) {
  const walletType = walletTypeFromCurrency(currencyCode) || meta.walletType;
  if (!walletType || !userId) return null;
  const amt = roundMoney(amount);
  if (!(amt > 0)) return null;

  const balanceAfter = wallet ? roundMoney(wallet.balance) : null;
  const signed = direction === DIRECTIONS.DEBIT ? -amt : amt;
  const balanceBefore = balanceAfter != null ? roundMoney(balanceAfter - signed) : null;

  const entry = await writeLedgerEntry(
    {
      ...meta,
      userId,
      walletType,
      direction,
      amount: amt,
      balanceBefore,
      balanceAfter,
      eventType: meta.eventType || EVENT_TYPES.UNCLASSIFIED,
      bonusType: meta.bonusType || (walletType === WALLET_TYPES.BONUS ? BONUS_TYPES.OTHER_BONUS : null)
    },
    transaction
  );

  if (!entry) return null;

  if (walletType === WALLET_TYPES.BONUS && direction === DIRECTIONS.CREDIT && !meta.skipLot) {
    const lot = await createBonusLot(entry, meta, transaction);
    if (lot && entry.bonusLotId !== lot.id) {
      await entry.update({ bonusLotId: lot.id, bonusType: lot.bonusType }, { transaction });
    }
  }

  if (walletType === WALLET_TYPES.BONUS && direction === DIRECTIONS.DEBIT && !meta.skipLotConsume) {
    const allocations = await consumeBonusLots(userId, amt, { transaction, ledgerId: entry.id });
    if (allocations.length) {
      const first = allocations[0];
      const remarksBits = allocations.map((a) => `${a.bonusType}=${a.amount}`).join(', ');
      await entry.update(
        {
          bonusLotId: first.lotId,
          bonusType: first.bonusType,
          remarks: entry.remarks
            ? `${entry.remarks} | lots: ${remarksBits}`
            : `lots: ${remarksBits}`,
          metadata: {
            ...(entry.metadata || {}),
            lotAllocations: allocations
          }
        },
        { transaction }
      );
    }
  }

  return entry;
}

/**
 * Record an RSC win. When `creditWallet` is true, eligible SC is added to the RSC jar.
 * Excess above a bonus cashout cap is recorded as voided (not added to the wallet).
 */
async function recordRscWin({
  userId,
  grossAmount,
  wallet,
  creditWallet = false,
  ledger: meta = {},
  transaction
}) {
  const gross = roundMoney(grossAmount);
  if (!(gross > 0)) return { eligible: 0, voided: 0, isBonusOrigin: false };

  const cap = await applyCashoutCap(userId, gross, {
    transaction,
    productId: meta.productId
  });

  let creditedWallet = wallet;
  if (creditWallet) {
    const { creditRedeemableSc } = require('./walletBuckets.service');
    creditedWallet = await creditRedeemableSc(userId, cap.eligible, {
      transaction,
      skipLedger: true,
      withPlayBalance: false
    });
  }

  const nonce = meta.nonce || crypto.randomBytes(8).toString('hex');
  const creditEntry = await recordWalletChange({
    userId,
    currencyCode: 'RSC',
    direction: DIRECTIONS.CREDIT,
    amount: cap.eligible,
    wallet: creditedWallet,
    ledger: {
      ...meta,
      eventType: meta.eventType || EVENT_TYPES.WIN_OTHER,
      isBonusOrigin: cap.isBonusOrigin,
      grossAmount: gross,
      eligibleAmount: cap.eligible,
      voidedAmount: cap.voided,
      nonce
    },
    transaction
  });

  let voidEntry = null;
  if (cap.voided > 0) {
    voidEntry = await writeLedgerEntry(
      {
        ...meta,
        userId,
        walletType: WALLET_TYPES.RSC,
        direction: DIRECTIONS.DEBIT,
        amount: cap.voided,
        eventType: EVENT_TYPES.CASHOUT_CAP_VOID,
        parentTransactionId: creditEntry?.id || null,
        isBonusOrigin: true,
        grossAmount: gross,
        eligibleAmount: cap.eligible,
        voidedAmount: cap.voided,
        remarks: meta.remarks
          ? `${meta.remarks} | cashout-cap void`
          : 'Bonus cashout cap: extra win was voided',
        idempotencyKey: makeIdempotencyKey({
          userId,
          eventType: EVENT_TYPES.CASHOUT_CAP_VOID,
          sourceType: meta.sourceType,
          sourceId: meta.sourceId,
          walletType: WALLET_TYPES.RSC,
          direction: DIRECTIONS.DEBIT,
          nonce
        })
      },
      transaction
    );
  }

  return { ...cap, creditEntry, voidEntry };
}

/**
 * Split a paid package into purchased PSC vs promotional bonus.
 * PSC = money paid. Bonus = extra SC above that.
 */
function splitPurchaseAndPackageBonus(payAmount, creditAmount) {
  const pay = roundMoney(payAmount);
  const credit = roundMoney(creditAmount);
  if (!(credit > 0)) return { purchased: 0, bonus: 0 };
  if (!(pay > 0)) return { purchased: 0, bonus: credit };
  const purchased = roundMoney(Math.min(pay, credit));
  const bonus = roundMoney(Math.max(0, credit - purchased));
  return { purchased, bonus };
}

module.exports = {
  roundMoney,
  walletTypeFromCurrency,
  makeIdempotencyKey,
  writeLedgerEntry,
  recordWalletChange,
  recordRscWin,
  consumeBonusLots,
  applyCashoutCap,
  splitPurchaseAndPackageBonus,
  DIRECTIONS,
  WALLET_TYPES,
  EVENT_TYPES,
  BONUS_TYPES
};
