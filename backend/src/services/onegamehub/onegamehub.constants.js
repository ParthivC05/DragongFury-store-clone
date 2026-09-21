'use strict';

/** Outbound calls we make to 1GameHub (Game Provider API). */
const PROVIDER_ACTIONS = {
  AVAILABLE_GAMES: 'available_games',
  REAL_PLAY: 'real_play'
};

/** Inbound callbacks 1GameHub makes to us (GAP wallet API). */
const WALLET_ACTIONS = {
  BALANCE: 'balance',
  BET: 'bet',
  WIN: 'win',
  CANCEL: 'cancel'
};

/** 1GameHub wire currency for Sweep Coins (SSC) and Gold Coins (GOC). */
const HUB_CURRENCY = 'SSC';
const HUB_CURRENCY_GC = 'GOC';
const PLATFORM_COIN = 'SC';
const SUPPORTED_HUB_CURRENCIES = new Set([HUB_CURRENCY, HUB_CURRENCY_GC]);

const SESSION_PREFIX = 'og';
const SESSION_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours

const TX_STATUS = {
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

const OPERATIONS = {
  BET: 'bet',
  WIN: 'win',
  CANCEL: 'cancel'
};

/** 1GameHub brands we do not list or launch. */
const BLOCKED_BRANDS = ['mrslotty', 'netgame', 'spinoro', '7777gaming'];

function normalizeBrand(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isBlockedBrand(gameOrId) {
  const haystacks = [
    typeof gameOrId === 'string' ? gameOrId : null,
    gameOrId?.brand,
    gameOrId?.brandId,
    gameOrId?.brand_id,
    gameOrId?.provider,
    gameOrId?.id,
    gameOrId?.gameid,
    gameOrId?.alias
  ]
    .map(normalizeBrand)
    .filter(Boolean);

  return haystacks.some((value) =>
    BLOCKED_BRANDS.some((blocked) => value === blocked || value.startsWith(blocked))
  );
}

function hubError(code, message, display, action) {
  return {
    status: 500,
    error: { code, message, display, action }
  };
}

const ERRORS = {
  unknown: hubError('ERR001', 'Unknown error occurred.', false, 'restart'),
  sessionTimeout: hubError('ERR002', 'The session has timed out. Please login again to continue playing.', true, 'restart'),
  insufficientFunds: hubError(
    'ERR003',
    'Insufficient funds to place current wager. Please reduce the stake or add more funds to your balance.',
    true,
    'continue'
  ),
  authenticationFailed: hubError('ERR005', 'Player authentication failed.', true, 'restart'),
  unauthorized: {
    status: 401,
    error: {
      code: 'ERR006',
      message: 'Unauthorized request.',
      display: false,
      action: 'restart'
    }
  },
  unsupportedCurrency: hubError('ERR008', 'Unsupported currency.', true, 'restart')
};

module.exports = {
  PROVIDER_ACTIONS,
  WALLET_ACTIONS,
  HUB_CURRENCY,
  HUB_CURRENCY_GC,
  PLATFORM_COIN,
  SUPPORTED_HUB_CURRENCIES,
  SESSION_PREFIX,
  SESSION_TTL_MS,
  TX_STATUS,
  OPERATIONS,
  BLOCKED_BRANDS,
  isBlockedBrand,
  ERRORS
};
