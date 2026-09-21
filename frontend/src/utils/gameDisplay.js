/** Compact alphanumeric key for display/image aliasing. */
export function compactGameKey(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** User-facing labels for integration variants (bot vs agent API). */
const GAME_DISPLAY_NAMES = {
  gamevault: 'Game Vault',
  gamevault2: 'Game Vault',
  gamevaultagent: 'Game Vault',
  juwa20: 'Juwa 2.0',
  juwa20agent: 'Juwa 2.0',
  juwa: 'Juwa',
  juwaagent: 'Juwa',
  juwabot: 'Juwa',
  juwanewbot: 'Juwa',
  orionstar: 'Orionstars',
  orionstars: 'Orionstars',
  orionstaragent: 'Orionstars',
  orionstarsagent: 'Orionstars',
  orionstarbot: 'Orionstars',
  orionstarsbot: 'Orionstars',
  orionstarautomation: 'Orionstars',
  orionstarsautomation: 'Orionstars',
  orionstarlegacy: 'Orionstars',
  orionstarslegacy: 'Orionstars',
  goldendragon: 'Golden Dragon',
  goldendragon2: 'Golden Dragon',
  goldendragonnewbot: 'Golden Dragon',
  cashmachine: 'CashMachine777',
  cashmachine777: 'CashMachine777',
  cashmachineagent: 'CashMachine777',
  cashmachine777agent: 'CashMachine777',
  mafia: 'Mafia',
  mafiaagent: 'Mafia',
  milkyway: 'Milkyway',
  milkywayagent: 'Milkyway',
  milkywaybot: 'Milkyway',
  milkywayautomation: 'Milkyway',
  milkywaylegacy: 'Milkyway',
  pandamaster: 'Panda Master',
  pandamaster2: 'Panda Master',
  pandamasternewbot: 'Panda Master',
};

/**
 * Returns the label to show users for a game. API calls should still use the real game name.
 * @param {string | object | null | undefined} name
 * @param {string | null | undefined} [gameKey]
 * @returns {string}
 */
export function getGameDisplayName(name, gameKey) {
  if (name && typeof name === 'object') {
    return getGameDisplayName(name.name, name.gameKey);
  }
  const trimmed = String(name || '').trim();
  if (!trimmed && !gameKey) return '';
  const mapped = GAME_DISPLAY_NAMES[compactGameKey(gameKey)]
    || GAME_DISPLAY_NAMES[compactGameKey(trimmed)];
  if (mapped) return mapped;
  return trimmed.replace(/\s*\(agent\)\s*$/i, '').trim() || trimmed;
}

/** Custom / always-manual games (no provider balance or automation APIs). */
export function isCustomManualGame(game) {
  if (!game || typeof game !== 'object') return false;
  if (game.isCustomManual === true) return true;
  const key = compactGameKey(game.gameKey);
  return key === 'custom';
}

/** Store switched the game to manual (bot offline) — no live provider balance. */
export function isBotOfflineManualGame(game) {
  if (!game || typeof game !== 'object') return false;
  return game.botOffline === true || game.bot_offline === true;
}

/**
 * Redeem/deposit UX should not wait on provider balance:
 * custom games or bot-offline (manual mode) games.
 */
export function isManualModeGame(game) {
  return isCustomManualGame(game) || isBotOfflineManualGame(game);
}

/** Juwa 2.0 (bot / agent) — password reset is not offered in the UI. */
export function isJuwa20Game(name) {
  const key = compactGameKey(name);
  return key === 'juwa20' || key === 'juwa20agent';
}

const CASHMACHINE_AGENT_GAME_KEYS = new Set([
  'cashmachineagent',
  'cashmachine777agent',
]);

const CASHMACHINE_BOT_GAME_KEYS = new Set([
  'cashmachine',
  'cashmachine777',
  'cashmachinebot',
  'cashmachine777bot',
  'cashmachineautomation',
  'cashmachine777automation',
  'cashmachinelegacy',
  'cashmachine777legacy',
]);

/**
 * Official CashMachine777 Agent API — password reset is not offered in the UI.
 * Streamlit bot automation still shows Reset password.
 */
export function isCashmachineAgentGame(nameOrGame) {
  if (nameOrGame && typeof nameOrGame === 'object') {
    const explicit = compactGameKey(nameOrGame.gameKey);
    if (CASHMACHINE_BOT_GAME_KEYS.has(explicit)) return false;
    if (CASHMACHINE_AGENT_GAME_KEYS.has(explicit)) return true;
    const nameKey = compactGameKey(nameOrGame.name);
    return nameKey.includes('cashmachine') && nameKey.includes('agent');
  }
  const key = compactGameKey(nameOrGame);
  if (CASHMACHINE_BOT_GAME_KEYS.has(key)) return false;
  if (CASHMACHINE_AGENT_GAME_KEYS.has(key)) return true;
  return key.includes('cashmachine') && key.includes('agent');
}
