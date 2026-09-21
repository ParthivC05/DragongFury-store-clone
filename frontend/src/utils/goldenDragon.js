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

/** Match Golden Dragon game name from API (e.g. Golden Dragon, goldenDragonNewBot). */
export function isGoldenDragonGameName(nameOrGame) {
  if (nameOrGame && typeof nameOrGame === 'object') {
    return isGoldenDragonGameName(nameOrGame.name) || isGoldenDragonGameName(nameOrGame.gameKey);
  }
  const key = compactGameName(nameOrGame);
  return key === 'goldendragon' || key === 'goldendragonnewbot' || key === 'goldendragon2';
}

/** Match Firekirin game name from API (e.g. Firekirin, fire_kirin, Firekirin Agent). */
export function isFirekirinGameName(name) {
  return compactGameName(name).includes('firekirin');
}

/**
 * Milkyway Agent API only — explicit agent keys/names.
 * Bare "Milkyway" / milkyway stays on the streamlit bot.
 */
export function isMilkywayAgentGameName(nameOrGame) {
  if (nameOrGame && typeof nameOrGame === 'object') {
    return isMilkywayAgentGameName(nameOrGame.gameKey) || isMilkywayAgentGameName(nameOrGame.name);
  }
  const key = compactGameName(nameOrGame);
  if (key === 'milkywayagent') return true;
  return key.includes('milkyway') && key.includes('agent');
}

/** True when top-up/redeem amounts must be whole numbers (no decimals). */
export function isIntegerScGameName(name) {
  const key = compactGameName(name);
  if (INTEGER_SC_GAME_KEYS.has(key)) return true;
  return key.includes('firekirin')
    || key.includes('milkyway')
    || (key.includes('cashmachine') && key.includes('agent'));
}

export function getIntegerScGameLabel(name) {
  const key = compactGameName(name);
  if (key === 'goldendragon' || key === 'goldendragonnewbot') return 'Golden Dragon';
  if (key.includes('firekirin')) return 'Firekirin';
  if (key.includes('milkyway')) return 'Milkyway';
  if (key === 'orionstar' || key === 'orionstars') return 'Orion Stars';
  if (key === 'vegasx') return 'VegasX';
  if (key.includes('gameroom')) return 'Gameroom';
  if (key.includes('cashmachine')) return 'CashMachine777';
  return 'This game';
}

/** Golden Dragon bot expects whole-number SC amounts (no decimals). */
export function isGoldenDragonIntegerScAmount(amount) {
  return isIntegerScAmount(amount);
}

export function isIntegerScAmount(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && Number.isInteger(n) && n >= 1;
}

export const GAME_DEPOSIT_AMOUNT_HINT = 'Enter a full SC amount.';
export const GAME_DEPOSIT_AMOUNT_ERROR = 'Please enter at least 1 SC as a full amount.';
export const GAME_WITHDRAW_AMOUNT_HINT = 'Enter a full SC amount to redeem.';
export const GAME_WITHDRAW_AMOUNT_ERROR = 'Please enter at least 1 SC as a full amount.';

export function getDepositDiscountPercent(game) {
  const n = Number(game?.depositDiscountPercent);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/** Display label without trailing zeros: 10, 10.5, 12.25 */
export function formatDepositDiscountPercentLabel(gameOrPercent) {
  const n = typeof gameOrPercent === 'object'
    ? getDepositDiscountPercent(gameOrPercent)
    : Number(gameOrPercent);
  if (!Number.isFinite(n) || n <= 0) return '';
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Wallet pays `walletAmount`; game is credited extra when a discount % is set. 10% on 10 → 11. */
export function computeGameDepositCredit(walletAmount, game) {
  const paid = Number(walletAmount);
  const percent = getDepositDiscountPercent(game);
  if (!Number.isFinite(paid) || paid < 1) return Number.isFinite(paid) ? paid : 0;
  if (percent <= 0) return paid;
  return Math.max(paid, Math.round(paid * (1 + percent / 100)));
}

/** Strip to digits only for amount inputs (empty allowed while typing). */
export function constrainGoldenDragonIntegerInput(inputValue) {
  return constrainIntegerScInput(inputValue);
}

export function constrainIntegerScInput(inputValue) {
  if (inputValue === '') return '';
  const digits = String(inputValue).replace(/\D/g, '');
  if (digits === '') return '';
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? String(n) : '';
}
