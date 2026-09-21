'use strict';

const WALLET_ADJUST_TX_TYPES = ['admin_add', 'admin_deduct'];

const TYPE_LABELS = {
  admin_add: 'Added',
  admin_deduct: 'Removed'
};

const TYPE_HINTS = {
  admin_add: 'PSC, BSC, or RSC credited to a player wallet by an admin or staff member',
  admin_deduct: 'PSC, BSC, or RSC taken from a player wallet by an admin or staff member'
};

const WALLET_OPTIONS = [
  { value: 'PSC', label: 'Purchased SC (PSC)', hint: 'Purchased coins' },
  { value: 'BSC', label: 'Bonus SC (BSC)', hint: 'Bonus / free coins' },
  { value: 'RSC', label: 'Redeemable SC (RSC)', hint: 'Redeemable coins' },
  { value: 'SC', label: 'Combined SC (PSC+BSC)', hint: 'Legacy combined deduct from Purchased + Bonus only' }
];

const ROLE_LABELS = {
  master_admin: 'Super admin / technical staff',
  distributor_admin: 'Distributor admin',
  store_admin: 'Store admin / staff',
  user: 'User'
};

module.exports = {
  WALLET_ADJUST_TX_TYPES,
  TYPE_LABELS,
  TYPE_HINTS,
  WALLET_OPTIONS,
  ROLE_LABELS
};
