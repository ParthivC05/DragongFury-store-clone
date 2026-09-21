'use strict';

/** Games whose bot APIs expect whole-number SC amounts (no decimals). */
const INTEGER_SC_GAME_KEYS = new Set([
  'goldendragon',
  'goldendragonnewbot',
  'goldendragon2',
  'firekirin',
  'firekirinagent',
  'milkyway',
  'milkywayagent',
  'orionstar',
  'orionstars',
  'vegasx',
  'gameroomagent',
  'cashmachineagent',
  'cashmachine777agent'
]);

function compactGameName(name) {
  return String(name || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function isIntegerScGame(gameName) {
  const key = compactGameName(gameName);
  if (INTEGER_SC_GAME_KEYS.has(key)) return true;
  return key.includes('firekirin')
    || key.includes('milkyway')
    || (key.includes('cashmachine') && key.includes('agent'));
}

function getIntegerScGameLabel(gameName) {
  const key = compactGameName(gameName);
  if (key === 'goldendragon' || key === 'goldendragonnewbot' || key === 'goldendragon2') return 'Golden Dragon';
  if (key.includes('firekirin')) return 'Firekirin';
  if (key.includes('milkyway')) return 'Milkyway';
  if (key === 'orionstar' || key === 'orionstars') return 'Orion Stars';
  if (key === 'vegasx') return 'VegasX';
  if (key.includes('gameroom')) return 'Gameroom';
  if (key.includes('cashmachine')) return 'CashMachine777';
  return 'This game';
}

const GAME_DEPOSIT_AMOUNT_ERROR = 'Please enter at least 1 SC as a full amount.';
const GAME_WITHDRAW_AMOUNT_ERROR = 'Please enter at least 1 SC as a full amount.';

function assertWholeScAmount(amount, errorMessage) {
  const n = Number(amount);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    const err = new Error(errorMessage);
    err.statusCode = 400;
    err.internalValidation = true;
    throw err;
  }
}

function assertIntegerScAmount(amount, gameName) {
  const n = Number(amount);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    const label = getIntegerScGameLabel(gameName);
    const err = new Error(`${label} requires at least 1 SC as a full amount.`);
    err.statusCode = 400;
    err.internalValidation = true;
    throw err;
  }
}

/** All game deposits must be a full SC amount (no fractional cents). */
function assertGameDepositAmount(amount) {
  assertWholeScAmount(amount, GAME_DEPOSIT_AMOUNT_ERROR);
}

/**
 * Enforce store-admin min/max deposit for a game.
 * max <= 0 means unlimited.
 */
function assertGameDepositLimits(amount, game) {
  const n = Number(amount);
  const min = Number(game?.minDepositLimit);
  const max = Number(game?.maxDepositLimit);
  if (Number.isFinite(min) && min > 0 && n < min) {
    const err = new Error(`The minimum deposit for this game is ${min} SC.`);
    err.statusCode = 400;
    err.internalValidation = true;
    throw err;
  }
  if (Number.isFinite(max) && max > 0 && n > max) {
    const err = new Error(`The maximum deposit for this game is ${max} SC.`);
    err.statusCode = 400;
    err.internalValidation = true;
    throw err;
  }
}

/** All game withdrawals/redeems must be a full SC amount (no fractional cents). */
function assertGameWithdrawAmount(amount) {
  assertWholeScAmount(amount, GAME_WITHDRAW_AMOUNT_ERROR);
}

module.exports = {
  isIntegerScGame,
  assertIntegerScAmount,
  assertGameDepositAmount,
  assertGameDepositLimits,
  assertGameWithdrawAmount,
  GAME_DEPOSIT_AMOUNT_ERROR,
  GAME_WITHDRAW_AMOUNT_ERROR,
};
