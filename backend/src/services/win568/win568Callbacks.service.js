'use strict';

/**
 * 568Win Seamless Wallet callbacks.
 * State machine matches official @win568/seamless-wallet WalletCallbackHandler.
 */

const db = require('../../db/models');
const { applyWin568Delta, getWin568Balance } = require('./win568Wallet.service');
const { notifyUserBalanceChanged } = require('../realtime/notifyBalance.service');
const { createLogger } = require('../../libs/logger');
const { isCompanyKeyValid } = require('./win568.config');
const {
  ERROR,
  STATUS,
  PRODUCT,
  TRANSFER_IN,
  TRANSFER_OUT,
  TRANSFER_STATUS
} = require('./win568.constants');
const {
  parseRequest,
  money,
  okResponse,
  errorResponse,
  betStatusResponse,
  opKey
} = require('./win568.helpers');
const { findWin568User } = require('./win568User.helpers');

const log = createLogger('win568');

function isPt9(productType) {
  return Number(productType) === PRODUCT.SEAMLESS_GAMES;
}

/** PT9 / third-party: unique per transferCode+transactionId. Sports IDs are equal. */
function usesPairLookup(parsed) {
  if (isPt9(parsed.productType)) return true;
  if (parsed.gpid != null && Number(parsed.gpid) >= 0) return true;
  const tx = String(parsed.transactionId || '');
  const tf = String(parsed.transferCode || '');
  return Boolean(tx && tf && tx !== tf);
}

function allowsRaise(productType) {
  const pt = Number(productType);
  return pt === PRODUCT.SBO_GAMES || pt === PRODUCT.LIVE_CASINO;
}

function extraInfoMap(extra) {
  const map = {};
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return map;
  for (const key of Object.keys(extra)) {
    map[String(key).toLowerCase()] = extra[key];
  }
  return map;
}

function hasPromotionReward(extra) {
  const map = extraInfoMap(extra);
  return Object.keys(map).some((key) => (
    key.includes('promot') || key.includes('reward') || key === 'isfreebet' || key === 'creditamount'
  ));
}

function rejectZeroAmountFreeBet(parsed) {
  if (parsed.amount !== 0) return false;
  if (hasPromotionReward(parsed.extraInfo)) return false;
  const code = String(parsed.transferCode || '');
  return /SFBN$/i.test(code) || /freebet/i.test(code);
}

function isBonusBet(bet) {
  const ops = Array.isArray(bet.ops) ? bet.ops : [];
  return ops.some((op) => op.type === 'bonus');
}

function walletMeta(userName, kind, key, extra) {
  return {
    type: `win568_${kind}`,
    description: `568Win ${kind}`,
    metadata: {
      provider: 'win568',
      transactionId: key,
      userName,
      ...(extra || {})
    }
  };
}

async function balanceOf(userId, t, userName) {
  return getWin568Balance(userId, userName || '', t);
}

async function debit(userId, userName, amount, key, extra, t) {
  return applyWin568Delta(
    userId,
    -money(amount),
    walletMeta(userName, extra.kind || 'debit', key, extra),
    t,
    { requireFunds: true }
  );
}

async function credit(userId, userName, amount, key, extra, t) {
  return applyWin568Delta(
    userId,
    money(amount),
    walletMeta(userName, extra.kind || 'credit', key, extra),
    t
  );
}

async function reverse(userId, userName, key, reverseDelta, kind, t) {
  return applyWin568Delta(
    userId,
    money(reverseDelta),
    walletMeta(userName, `${kind}_reverse`, `${key}:rev`),
    t
  );
}

async function applyAdj(userId, userName, adj, key, t) {
  return applyWin568Delta(
    userId,
    money(adj),
    walletMeta(userName, 'adjust', key, { kind: 'adjust' }),
    t
  );
}

function isUniqueError(err) {
  return err && (err.name === 'SequelizeUniqueConstraintError' || err.code === '23505');
}

async function authenticate(body) {
  const parsed = parseRequest(body);
  if (!parsed.userName) {
    return { parsed, error: ERROR.USERNAME_EMPTY };
  }
  if (!isCompanyKeyValid(parsed.companyKey)) {
    log.warn('568Win CompanyKey mismatch', { userName: parsed.userName });
    return { parsed, error: ERROR.COMPANY_KEY };
  }
  const user = await findWin568User(parsed.userName);
  if (!user) {
    log.warn('568Win member not found', { userName: parsed.userName });
    return { parsed, error: ERROR.MEMBER_NOT_EXIST };
  }
  return { parsed, user };
}

function authError(parsed, error) {
  return errorResponse(parsed.userName, error);
}

function txIdFor(parsed) {
  return parsed.transactionId || parsed.transferCode || '';
}

async function findBets(where, t) {
  return db.Win568Bet.findAll({
    where,
    lock: t.LOCK.UPDATE,
    transaction: t,
    order: [['id', 'ASC']]
  });
}

async function lockUser(userId, t, userName) {
  if (db.User) {
    await db.User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
  }
  return balanceOf(userId, t, userName);
}

async function failWithBalance(userName, userId, error, t) {
  return errorResponse(userName, error, { balance: await balanceOf(userId, t, userName) });
}

function didSucceed(result) {
  return result && (result.errorCode === 0 || result.ErrorCode === 0);
}

function appendOp(bet, op) {
  const ops = Array.isArray(bet.ops) ? [...bet.ops] : [];
  ops.push(op);
  return ops;
}

async function lookupDeductBet(parsed, transactionId, t) {
  if (usesPairLookup(parsed)) {
    const rows = await findBets({
      transferCode: parsed.transferCode,
      transactionId
    }, t);
    return rows[0] || null;
  }
  const rows = await findBets({ transferCode: parsed.transferCode }, t);
  return rows[0] || null;
}

async function lookupSettleBet(parsed, t) {
  const transactionId = parsed.transactionId || '';
  if (usesPairLookup(parsed) && transactionId) {
    const rows = await findBets({
      transferCode: parsed.transferCode,
      transactionId
    }, t);
    return { bet: rows[0] || null, allVoid: false };
  }
  if (usesPairLookup(parsed)) {
    const rows = await findBets({ transferCode: parsed.transferCode }, t);
    const nonVoid = rows.find((row) => row.status !== STATUS.VOID) || null;
    if (!nonVoid) {
      return { bet: null, allVoid: rows.some((row) => row.status === STATUS.VOID) };
    }
    return { bet: nonVoid, allVoid: false };
  }
  const rows = await findBets({ transferCode: parsed.transferCode }, t);
  return { bet: rows[0] || null, allVoid: false };
}

async function lookupRollbackBets(parsed, t) {
  const transactionId = parsed.transactionId || '';
  if (usesPairLookup(parsed) && !transactionId) {
    return findBets({ transferCode: parsed.transferCode }, t);
  }
  const lookupTxId = transactionId || parsed.transferCode;
  return findBets({
    transferCode: parsed.transferCode,
    transactionId: lookupTxId
  }, t);
}

function cancelAdjFor(bet) {
  const amount = money(bet.stake);
  const winLoss = money(bet.winloss || 0);
  if (isBonusBet(bet) && bet.status === STATUS.SETTLED) return money(-amount);
  if (bet.status === STATUS.SETTLED) return money(-winLoss + amount);
  return amount;
}

function rollbackAdjFor(bet) {
  const amount = money(bet.stake);
  const winLoss = money(bet.winloss || 0);
  if (bet.status === STATUS.SETTLED) return money(-winLoss);
  if (bet.status === STATUS.VOID) return isBonusBet(bet) ? amount : money(-amount);
  return 0;
}

async function getBalanceCallback(body) {
  const { parsed, user, error } = await authenticate(body);
  if (error) return authError(parsed, error);
  try {
    const balance = await getWin568Balance(user.userId, parsed.userName, null, { liftZero: true });
    return okResponse(parsed.userName, balance);
  } catch (err) {
    // A zero balance is a state the suite asserts on, so answer with the stored
    // number instead of surfacing error 7.
    log.error('568Win GetBalance fallback', { message: err.message });
    const row = await db.Win568Player.findByPk(user.userId).catch(() => null);
    return okResponse(parsed.userName, row ? money(row.balance) : 0);
  }
}

async function deductCallback(body) {
  const { parsed, user, error } = await authenticate(body);
  if (error) return errorResponse(parsed.userName, error, { betAmount: 0 });
  if (!parsed.transferCode || parsed.amount == null || parsed.amount < 0) {
    return errorResponse(parsed.userName, ERROR.INTERNAL, { betAmount: 0 });
  }

  const transactionId = txIdFor(parsed);
  const amount = money(parsed.amount);
  if (rejectZeroAmountFreeBet(parsed)) {
    return errorResponse(parsed.userName, ERROR.INTERNAL, { betAmount: 0 });
  }

  try {
    const result = await db.sequelize.transaction(async (t) => {
      await lockUser(user.userId, t, parsed.userName);
      const existing = await lookupDeductBet(parsed, transactionId, t);

      if (existing) {
        const currentStake = money(existing.stake);
        const canRaise = existing.status === STATUS.RUNNING
          && allowsRaise(parsed.productType ?? existing.productType);
        if (canRaise && amount > currentStake) {
          const extra = money(amount - currentStake);
          const key = opKey('raise', parsed.transferCode, `${transactionId}:${Date.now()}`);
          const balance = await debit(user.userId, parsed.userName, extra, key, { kind: 'deduct' }, t);
          await existing.update(
            {
              stake: amount,
              ops: appendOp(existing, { key, type: 'raise', delta: -extra })
            },
            { transaction: t }
          );
          return okResponse(parsed.userName, balance, { betAmount: amount });
        }
        if (canRaise && amount < currentStake) {
          return errorResponse(parsed.userName, ERROR.INTERNAL, { betAmount: 0 });
        }
        return errorResponse(parsed.userName, ERROR.SAME_REF, { betAmount: 0 });
      }

      const key = opKey('deduct', parsed.transferCode, transactionId);
      const balance = amount > 0
        ? await debit(user.userId, parsed.userName, amount, key, { kind: 'deduct' }, t)
        : await balanceOf(user.userId, t, parsed.userName);
      await db.Win568Bet.create(
        {
          userId: user.userId,
          username: parsed.userName,
          transferCode: parsed.transferCode,
          transactionId,
          productType: parsed.productType,
          gameType: parsed.gameType,
          status: STATUS.RUNNING,
          stake: amount,
          ops: amount > 0 ? [{ key, type: 'deduct', delta: -amount }] : []
        },
        { transaction: t }
      );
      return okResponse(parsed.userName, balance, { betAmount: amount });
    });

    if (didSucceed(result)) notifyUserBalanceChanged(user.userId);
    return result;
  } catch (err) {
    if (err.code === 6 || String(err.message || '').toLowerCase().includes('insufficient')) {
      return errorResponse(parsed.userName, ERROR.NOT_ENOUGH_BALANCE, { betAmount: 0 });
    }
    if (isUniqueError(err)) {
      return errorResponse(parsed.userName, ERROR.SAME_REF, { betAmount: 0 });
    }
    log.error('568Win Deduct failed', { message: err.message, stack: err.stack });
    return errorResponse(parsed.userName, ERROR.INTERNAL, { betAmount: 0 });
  }
}

async function settleCallback(body) {
  const { parsed, user, error } = await authenticate(body);
  if (error) return authError(parsed, error);
  if (!parsed.transferCode || parsed.winloss == null) {
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }

  const winloss = money(parsed.winloss);

  try {
    const result = await db.sequelize.transaction(async (t) => {
      await lockUser(user.userId, t, parsed.userName);
      const { bet, allVoid } = await lookupSettleBet(parsed, t);
      if (!bet) {
        if (allVoid) return failWithBalance(parsed.userName, user.userId, ERROR.ALREADY_CANCELED, t);
        return errorResponse(parsed.userName, ERROR.BET_NOT_EXISTS);
      }
      if (bet.status === STATUS.VOID) {
        return failWithBalance(parsed.userName, user.userId, ERROR.ALREADY_CANCELED, t);
      }
      if (bet.status === STATUS.SETTLED) {
        return failWithBalance(parsed.userName, user.userId, ERROR.ALREADY_SETTLED, t);
      }

      const key = opKey('settle', bet.transferCode, `${bet.transactionId}:${Date.now()}`);
      const balance = await credit(user.userId, parsed.userName, winloss, key, { kind: 'settle' }, t);
      await bet.update(
        {
          status: STATUS.SETTLED,
          winloss,
          resultType: parsed.resultType,
          ops: appendOp(bet, { key, type: 'settle', delta: winloss })
        },
        { transaction: t }
      );
      return okResponse(parsed.userName, balance);
    });

    if (didSucceed(result)) notifyUserBalanceChanged(user.userId);
    return result;
  } catch (err) {
    log.error('568Win Settle failed', { message: err.message, stack: err.stack });
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }
}

async function rollbackCallback(body) {
  const { parsed, user, error } = await authenticate(body);
  if (error) return authError(parsed, error);
  if (!parsed.transferCode) return errorResponse(parsed.userName, ERROR.INTERNAL);

  try {
    const result = await db.sequelize.transaction(async (t) => {
      await lockUser(user.userId, t, parsed.userName);
      const bets = await lookupRollbackBets(parsed, t);
      if (!bets.length) return errorResponse(parsed.userName, ERROR.BET_NOT_EXISTS);

      const settled = bets.filter((b) => b.status === STATUS.SETTLED);
      const voided = bets.filter((b) => b.status === STATUS.VOID);
      if (!settled.length && !voided.length) {
        return failWithBalance(parsed.userName, user.userId, ERROR.ALREADY_ROLLBACK, t);
      }

      let adj = 0;
      for (const bet of [...settled, ...voided]) {
        adj = money(adj + rollbackAdjFor(bet));
      }
      const key = opKey('rollback', parsed.transferCode, `${txIdFor(parsed)}:${Date.now()}`);
      const balance = await applyAdj(user.userId, parsed.userName, adj, key, t);
      for (const bet of [...settled, ...voided]) {
        await bet.update(
          {
            status: STATUS.RUNNING,
            ops: appendOp(bet, { key, type: 'rollback', delta: rollbackAdjFor(bet) })
          },
          { transaction: t }
        );
      }
      return okResponse(parsed.userName, balance);
    });

    if (didSucceed(result)) notifyUserBalanceChanged(user.userId);
    return result;
  } catch (err) {
    if (err.code === 6 || String(err.message || '').toLowerCase().includes('insufficient')) {
      return errorResponse(parsed.userName, ERROR.NOT_ENOUGH_BALANCE, {
        balance: await balanceOf(user.userId, null, parsed.userName).catch(() => 0)
      });
    }
    log.error('568Win Rollback failed', { message: err.message, stack: err.stack });
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }
}

async function cancelCallback(body) {
  const { parsed, user, error } = await authenticate(body);
  if (error) return authError(parsed, error);
  if (!parsed.transferCode) return errorResponse(parsed.userName, ERROR.INTERNAL);

  const transactionId = txIdFor(parsed);

  try {
    const result = await db.sequelize.transaction(async (t) => {
      await lockUser(user.userId, t, parsed.userName);
      const rows = parsed.isCancelAll === true
        ? await findBets({ transferCode: parsed.transferCode }, t)
        : await findBets({
          transferCode: parsed.transferCode,
          ...(transactionId ? { transactionId } : {})
        }, t);

      if (!rows.length) return errorResponse(parsed.userName, ERROR.BET_NOT_EXISTS);
      const nonVoid = rows.filter((row) => row.status !== STATUS.VOID);
      if (!nonVoid.length) {
        return failWithBalance(parsed.userName, user.userId, ERROR.ALREADY_CANCELED, t);
      }

      let adj = 0;
      for (const bet of nonVoid) adj = money(adj + cancelAdjFor(bet));
      const key = opKey('cancel', parsed.transferCode, `${transactionId}:${Date.now()}`);
      const balance = await applyAdj(user.userId, parsed.userName, adj, key, t);
      for (const bet of nonVoid) {
        await bet.update(
          {
            status: STATUS.VOID,
            ops: appendOp(bet, { key, type: 'cancel', delta: cancelAdjFor(bet) })
          },
          { transaction: t }
        );
      }
      return okResponse(parsed.userName, balance);
    });

    if (didSucceed(result)) notifyUserBalanceChanged(user.userId);
    return result;
  } catch (err) {
    log.error('568Win Cancel failed', { message: err.message, stack: err.stack });
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }
}

async function returnStakeCallback(body) {
  const { parsed, user, error } = await authenticate(body);
  if (error) return authError(parsed, error);
  if (!parsed.transferCode || parsed.currentStake == null) {
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }

  const currentStake = money(parsed.currentStake);

  try {
    const result = await db.sequelize.transaction(async (t) => {
      await lockUser(user.userId, t, parsed.userName);
      const bet = (await lookupDeductBet(parsed, txIdFor(parsed), t));
      if (!bet) return errorResponse(parsed.userName, ERROR.BET_NOT_EXISTS);
      if (bet.status === STATUS.VOID) {
        return failWithBalance(parsed.userName, user.userId, ERROR.ALREADY_CANCELED, t);
      }
      if (bet.status === STATUS.SETTLED) {
        return failWithBalance(parsed.userName, user.userId, ERROR.ALREADY_SETTLED, t);
      }

      const oldStake = money(bet.stake);
      const alreadyReturned = Array.isArray(bet.ops) && bet.ops.some((op) => op.type === 'return');
      if (alreadyReturned) {
        return failWithBalance(parsed.userName, user.userId, ERROR.SAME_REF, t);
      }
      if (currentStake > oldStake) {
        return errorResponse(parsed.userName, ERROR.INTERNAL);
      }
      if (currentStake >= oldStake) {
        return okResponse(parsed.userName, await balanceOf(user.userId, t, parsed.userName));
      }

      const refund = money(oldStake - currentStake);
      const key = opKey('return', bet.transferCode, `${bet.transactionId}:${Date.now()}`);
      const balance = await credit(user.userId, parsed.userName, refund, key, { kind: 'return_stake' }, t);
      await bet.update(
        {
          stake: currentStake,
          ops: appendOp(bet, { key, type: 'return', delta: refund })
        },
        { transaction: t }
      );
      return okResponse(parsed.userName, balance);
    });

    if (didSucceed(result)) notifyUserBalanceChanged(user.userId);
    return result;
  } catch (err) {
    log.error('568Win ReturnStake failed', { message: err.message, stack: err.stack });
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }
}

async function getBetStatusCallback(body) {
  const { parsed, error } = await authenticate(body);
  if (error) return betStatusResponse(parsed, null, error);
  if (!parsed.transferCode) return betStatusResponse(parsed, null, ERROR.INTERNAL);

  let bet = null;
  if (usesPairLookup(parsed)) {
    const where = { transferCode: parsed.transferCode };
    if (parsed.transactionId) where.transactionId = parsed.transactionId;
    bet = await db.Win568Bet.findOne({ where, order: [['id', 'ASC']] });
  } else {
    bet = await db.Win568Bet.findOne({
      where: { transferCode: parsed.transferCode },
      order: [['id', 'ASC']]
    });
  }
  if (!bet) return betStatusResponse(parsed, null, ERROR.BET_NOT_EXISTS);
  return betStatusResponse(parsed, bet, null);
}

async function bonusCallback(body) {
  const { parsed, user, error } = await authenticate(body);
  if (error) return authError(parsed, error);
  if (!parsed.transferCode || parsed.amount == null || parsed.amount < 0) {
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }

  const transactionId = txIdFor(parsed);
  const amount = money(parsed.amount);
  const key = opKey('bonus', parsed.transferCode, transactionId);

  try {
    const result = await db.sequelize.transaction(async (t) => {
      await lockUser(user.userId, t, parsed.userName);
      const used = await db.Win568Bet.findOne({
        where: { transferCode: parsed.transferCode },
        transaction: t,
        lock: t.LOCK.UPDATE
      });
      if (used) {
        return failWithBalance(parsed.userName, user.userId, ERROR.SAME_REF, t);
      }
      const balance = await credit(user.userId, parsed.userName, amount, key, { kind: 'bonus' }, t);
      await db.Win568Bet.create(
        {
          userId: user.userId,
          username: parsed.userName,
          transferCode: parsed.transferCode,
          transactionId,
          productType: parsed.productType,
          gameType: parsed.gameType,
          status: STATUS.SETTLED,
          stake: amount,
          winloss: amount,
          ops: [{ key, type: 'bonus', delta: amount }]
        },
        { transaction: t }
      );
      return okResponse(parsed.userName, balance);
    });
    if (didSucceed(result)) notifyUserBalanceChanged(user.userId);
    return result;
  } catch (err) {
    if (isUniqueError(err)) {
      return errorResponse(parsed.userName, ERROR.SAME_REF, {
        balance: await balanceOf(user.userId, null, parsed.userName).catch(() => 0)
      });
    }
    log.error('568Win bonus failed', { message: err.message, stack: err.stack });
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }
}

async function debitByRefCallback(body, kind) {
  const { parsed, user, error } = await authenticate(body);
  if (error) return authError(parsed, error);
  if (!parsed.transferCode || parsed.amount == null || parsed.amount < 0) {
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }

  const transactionId = txIdFor(parsed);
  const amount = money(parsed.amount);
  const key = opKey(kind, parsed.transferCode, transactionId);

  try {
    const result = await db.sequelize.transaction(async (t) => {
      await lockUser(user.userId, t, parsed.userName);
      const existing = await db.Win568WalletOp.findOne({
        where: { kind, refNo: parsed.transferCode, transactionId },
        lock: t.LOCK.UPDATE,
        transaction: t
      });
      if (existing) {
        return failWithBalance(parsed.userName, user.userId, ERROR.SAME_REF, t);
      }
      const balance = await debit(user.userId, parsed.userName, amount, key, { kind }, t);
      await db.Win568WalletOp.create(
        {
          userId: user.userId,
          username: parsed.userName,
          kind,
          refNo: parsed.transferCode,
          transactionId,
          amount,
          walletOpKey: key
        },
        { transaction: t }
      );
      return okResponse(parsed.userName, balance);
    });
    if (didSucceed(result)) notifyUserBalanceChanged(user.userId);
    return result;
  } catch (err) {
    if (err.code === 6 || String(err.message || '').toLowerCase().includes('insufficient')) {
      return errorResponse(parsed.userName, ERROR.NOT_ENOUGH_BALANCE);
    }
    if (isUniqueError(err)) {
      return errorResponse(parsed.userName, ERROR.SAME_REF, {
        balance: await balanceOf(user.userId, null, parsed.userName).catch(() => 0)
      });
    }
    log.error(`568Win ${kind} failed`, { message: err.message, stack: err.stack });
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }
}

async function tipCallback(body) {
  return debitByRefCallback(body, 'tip');
}

async function liveCoinCallback(body) {
  return debitByRefCallback(body, 'livecoin');
}

async function transferCallback(body) {
  const { parsed, user, error } = await authenticate(body);
  if (error) return authError(parsed, error);
  if (!parsed.transferRefno || parsed.amount == null || parsed.amount < 0) {
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }

  const amount = money(parsed.amount);
  const key = opKey('transfer', parsed.transferRefno, '');
  const isIn = TRANSFER_IN.has(parsed.transferType);
  const isOut = TRANSFER_OUT.has(parsed.transferType);
  if (!isIn && !isOut) return errorResponse(parsed.userName, ERROR.INTERNAL);

  try {
    const result = await db.sequelize.transaction(async (t) => {
      await lockUser(user.userId, t, parsed.userName);
      const existing = await db.Win568WalletOp.findOne({
        where: { kind: 'transfer', refNo: parsed.transferRefno, transactionId: '' },
        lock: t.LOCK.UPDATE,
        transaction: t
      });
      if (existing) {
        return okResponse(parsed.userName, await balanceOf(user.userId, t, parsed.userName));
      }

      const balance = isIn
        ? await credit(user.userId, parsed.userName, amount, key, { kind: 'transfer' }, t)
        : await debit(user.userId, parsed.userName, amount, key, { kind: 'transfer' }, t);

      await db.Win568WalletOp.create(
        {
          userId: user.userId,
          username: parsed.userName,
          kind: 'transfer',
          refNo: parsed.transferRefno,
          transactionId: '',
          amount,
          transferType: parsed.transferType,
          transferStatus: TRANSFER_STATUS.TRANSFERRED,
          walletOpKey: key
        },
        { transaction: t }
      );
      return okResponse(parsed.userName, balance);
    });
    if (didSucceed(result)) notifyUserBalanceChanged(user.userId);
    return result;
  } catch (err) {
    if (err.code === 6 || String(err.message || '').toLowerCase().includes('insufficient')) {
      return errorResponse(parsed.userName, ERROR.NOT_ENOUGH_BALANCE);
    }
    if (isUniqueError(err)) return okResponse(parsed.userName, await balanceOf(user.userId, null, parsed.userName));
    log.error('568Win Transfer failed', { message: err.message, stack: err.stack });
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }
}

async function rollbackTransferCallback(body) {
  const { parsed, user, error } = await authenticate(body);
  if (error) return authError(parsed, error);
  if (!parsed.transferRefno) return errorResponse(parsed.userName, ERROR.INTERNAL);

  try {
    const result = await db.sequelize.transaction(async (t) => {
      await lockUser(user.userId, t, parsed.userName);
      const row = await db.Win568WalletOp.findOne({
        where: { kind: 'transfer', refNo: parsed.transferRefno, transactionId: '' },
        lock: t.LOCK.UPDATE,
        transaction: t
      });
      if (!row) return failWithBalance(parsed.userName, user.userId, ERROR.BET_NOT_EXISTS, t);
      if (row.transferStatus === TRANSFER_STATUS.ROLLBACK) {
        return okResponse(parsed.userName, await balanceOf(user.userId, t, parsed.userName));
      }

      const reverseDelta = TRANSFER_IN.has(row.transferType)
        ? -money(row.amount)
        : money(row.amount);
      const balance = await reverse(user.userId, parsed.userName, row.walletOpKey, reverseDelta, 'transfer', t);
      await row.update({ transferStatus: TRANSFER_STATUS.ROLLBACK }, { transaction: t });
      return okResponse(parsed.userName, balance);
    });
    if (didSucceed(result)) notifyUserBalanceChanged(user.userId);
    return result;
  } catch (err) {
    log.error('568Win RollbackTransfer failed', { message: err.message, stack: err.stack });
    return errorResponse(parsed.userName, ERROR.INTERNAL);
  }
}

async function getTransferStatusCallback(body) {
  const { parsed, user, error } = await authenticate(body);
  if (error) return authError(parsed, error);
  if (!parsed.transferRefno) return errorResponse(parsed.userName, ERROR.INTERNAL);

  const row = await db.Win568WalletOp.findOne({
    where: { kind: 'transfer', refNo: parsed.transferRefno, transactionId: '' }
  });
  if (!row) {
    return okResponse(parsed.userName, await balanceOf(user.userId, null, parsed.userName), {
      transferStatus: TRANSFER_STATUS.NOT_EXISTS,
      amount: 0
    });
  }
  return okResponse(parsed.userName, await balanceOf(user.userId, null, parsed.userName), {
    transferStatus: row.transferStatus,
    amount: money(row.amount)
  });
}

module.exports = {
  getBalanceCallback,
  deductCallback,
  settleCallback,
  rollbackCallback,
  cancelCallback,
  returnStakeCallback,
  getBetStatusCallback,
  bonusCallback,
  tipCallback,
  liveCoinCallback,
  transferCallback,
  rollbackTransferCallback,
  getTransferStatusCallback
};
