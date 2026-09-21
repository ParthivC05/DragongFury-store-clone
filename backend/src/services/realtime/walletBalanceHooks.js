'use strict';

const { notifyUserBalanceChanged } = require('./notifyBalance.service');

function extractUserIdFromWhere(where) {
  if (!where || typeof where !== 'object') return null;
  const raw = where.userId ?? where.user_id;
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Push live balance whenever a wallet row is created/updated.
 * @param {object} db - Sequelize models bag
 */
function attachWalletBalanceHooks(db) {
  if (!db?.Wallet || db.Wallet.__balanceHooksAttached) return;

  const onInstance = (wallet) => {
    const userId = wallet?.userId ?? wallet?.get?.('userId');
    if (userId != null) notifyUserBalanceChanged(userId);
  };

  db.Wallet.addHook('afterCreate', onInstance);
  db.Wallet.addHook('afterUpdate', onInstance);
  db.Wallet.addHook('afterBulkCreate', (instances) => {
    if (!Array.isArray(instances)) return;
    const seen = new Set();
    for (const row of instances) {
      const userId = row?.userId ?? row?.get?.('userId');
      if (userId == null || seen.has(userId)) continue;
      seen.add(userId);
      notifyUserBalanceChanged(userId);
    }
  });
  db.Wallet.addHook('afterBulkUpdate', (options) => {
    const userId = extractUserIdFromWhere(options?.where);
    if (userId != null) notifyUserBalanceChanged(userId);
  });

  db.Wallet.__balanceHooksAttached = true;
}

module.exports = { attachWalletBalanceHooks };
