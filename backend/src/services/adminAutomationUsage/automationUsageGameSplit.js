'use strict';

const { Op } = require('sequelize');
const {
  compactGameKey,
  isOrionStarsGame,
  isOrionStarsBotAutomationGame,
  isOrionStarsTerminalGame,
  isFirekirinGame,
  isFirekirinBotAutomationGame,
  isFirekirinTerminalGame,
  isMilkywayGame,
  isMilkywayBotAutomationGame,
  isMilkywayTerminalGame,
  isAgentCredentialGame,
  getStoreGameDisplayName
} = require('../../utils/gameIntegration.helpers');
const {
  isPandamasterNewBotGame,
  isPandamasterLegacyBotGame
} = require('../../services/games/pandamaster.helpers');

function normalizeGameKey(name) {
  return String(name || '').trim().toLowerCase();
}

/** goldendragon vs goldenDragonNewBot — same player-facing name, different bot base URLs. */
function getGoldenDragonBotVariant(game) {
  const ids = [compactGameKey(game?.gameKey), compactGameKey(game?.name)].filter(Boolean);
  if (ids.some((id) => id === 'goldendragonnewbot' || id === 'goldendragon2')) return 'newbot';
  if (ids.some((id) => id === 'goldendragon')) return 'legacy';
  return null;
}

function isGoldenDragonNewBotGame(game) {
  return getGoldenDragonBotVariant(game) === 'newbot';
}

function isGoldenDragonLegacyBotGame(game) {
  return getGoldenDragonBotVariant(game) === 'legacy';
}

function getPandamasterBotVariant(game) {
  if (isPandamasterNewBotGame(game?.name, game?.gameKey)) return 'newbot';
  if (isPandamasterLegacyBotGame(game?.name, game?.gameKey)) return 'legacy';
  return null;
}

function isPandamasterNewBotAutomationGame(game) {
  return getPandamasterBotVariant(game) === 'newbot';
}

function getAutomationUsageDisplayName(game, fallbackName = null) {
  if (!game) return fallbackName;
  if (isOrionStarsBotAutomationGame(game)) return 'Orionstars (Bot API)';
  if (isOrionStarsTerminalGame(game)) return 'Orionstars (Agent API)';
  if (isOrionStarsGame(game)) return getStoreGameDisplayName(game.name || fallbackName);
  if (isFirekirinBotAutomationGame(game)) return 'Firekirin (Bot API)';
  if (isFirekirinTerminalGame(game)) return 'Firekirin (Agent API)';
  if (isFirekirinGame(game)) return getStoreGameDisplayName(game.name || fallbackName);
  if (isMilkywayBotAutomationGame(game)) return 'Milkyway (Bot API)';
  if (isMilkywayTerminalGame(game)) return 'Milkyway (Agent API)';
  if (isMilkywayGame(game)) return getStoreGameDisplayName(game.name || fallbackName);
  if (isGoldenDragonNewBotGame(game)) return 'Golden Dragon (New Bot)';
  if (isGoldenDragonLegacyBotGame(game)) return 'Golden Dragon';
  if (isPandamasterNewBotAutomationGame(game)) return 'Pandamaster (New Bot)';
  if (isPandamasterLegacyBotGame(game?.name, game?.gameKey)) return 'Pandamaster';
  if (isAgentCredentialGame(game)) {
    const baseName = getStoreGameDisplayName(game.name || fallbackName);
    return /\(agent\)/i.test(baseName) ? baseName : `${baseName} (Agent)`;
  }
  return getStoreGameDisplayName(fallbackName || game.name);
}

function getAutomationUsageGroupKey(game) {
  if (isOrionStarsBotAutomationGame(game)) return 'orionstars:bot';
  if (isOrionStarsTerminalGame(game)) return 'orionstars:agent';
  if (isOrionStarsGame(game)) return 'orionstars';
  if (isFirekirinBotAutomationGame(game)) return 'firekirin:bot';
  if (isFirekirinTerminalGame(game)) return 'firekirin:agent';
  if (isFirekirinGame(game)) return 'firekirin';
  if (isMilkywayBotAutomationGame(game)) return 'milkyway:bot';
  if (isMilkywayTerminalGame(game)) return 'milkyway:agent';
  if (isMilkywayGame(game)) return 'milkyway';
  if (isGoldenDragonNewBotGame(game)) return 'goldendragon:newbot';
  if (isGoldenDragonLegacyBotGame(game)) return 'goldendragon';
  if (isPandamasterNewBotAutomationGame(game)) return 'pandamaster:newbot';
  if (isPandamasterLegacyBotGame(game?.name, game?.gameKey)) return 'pandamaster';
  const displayBase = normalizeGameKey(getStoreGameDisplayName(game.name));
  if (isAgentCredentialGame(game)) return `${displayBase}:agent`;
  return displayBase;
}

function isAgentApiEndpoint(apiEndpoint) {
  const endpoint = String(apiEndpoint || '').toLowerCase();
  return (
    endpoint.includes('/ws/service.ashx')
    || endpoint.includes('agentlogin')
    || endpoint.includes('registeruser')
    || endpoint.includes('queryinfo')
    || endpoint.includes('changepasswd')
    || endpoint.includes('action=recharge')
    || endpoint.includes('action=redeem')
    || (endpoint.includes('recharge') && endpoint.includes('service.ashx'))
    || (endpoint.includes('redeem') && endpoint.includes('service.ashx'))
  );
}

function isBotApiEndpoint(apiEndpoint) {
  const endpoint = String(apiEndpoint || '').toLowerCase();
  if (isAgentApiEndpoint(endpoint)) return false;
  return (
    endpoint.includes('/create-user')
    || endpoint.includes('/deposit')
    || endpoint.includes('/redeem')
    || endpoint.includes('/balance')
    || endpoint.includes('/withdraw')
  );
}

function resolveProviderFamily(game) {
  if (isOrionStarsGame(game)) return 'orionstars';
  if (isFirekirinGame(game)) return 'firekirin';
  if (isMilkywayGame(game)) return 'milkyway';
  return null;
}

/**
 * Split Orion/Firekirin log rows into agent vs bot buckets by API endpoint.
 * Falls back to game classification when endpoint is ambiguous.
 */
function resolveAutomationUsageSplitKey(game, apiEndpoint) {
  const family = resolveProviderFamily(game);
  if (!family) return getAutomationUsageGroupKey(game);

  if (isAgentApiEndpoint(apiEndpoint)) return `${family}:agent`;
  if (isBotApiEndpoint(apiEndpoint)) return `${family}:bot`;

  if (family === 'orionstars') {
    if (isOrionStarsBotAutomationGame(game)) return 'orionstars:bot';
    if (isOrionStarsTerminalGame(game)) return 'orionstars:agent';
    return 'orionstars';
  }
  if (family === 'firekirin') {
    if (isFirekirinBotAutomationGame(game)) return 'firekirin:bot';
    if (isFirekirinTerminalGame(game)) return 'firekirin:agent';
    const nameKey = compactGameKey(game?.name);
    if (nameKey.includes('firekirin') && nameKey.includes('agent')) return 'firekirin:agent';
    return 'firekirin';
  }
  if (isMilkywayBotAutomationGame(game)) return 'milkyway:bot';
  if (isMilkywayTerminalGame(game)) return 'milkyway:agent';
  const milkyNameKey = compactGameKey(game?.name);
  if (milkyNameKey.includes('milkyway') && milkyNameKey.includes('agent')) return 'milkyway:agent';
  return 'milkyway';
}

function splitKeyToDisplayName(splitKey) {
  switch (String(splitKey || '')) {
    case 'orionstars:agent':
      return 'Orionstars (Agent API)';
    case 'orionstars:bot':
      return 'Orionstars (Bot API)';
    case 'firekirin:agent':
      return 'Firekirin (Agent API)';
    case 'firekirin:bot':
      return 'Firekirin (Bot API)';
    case 'milkyway:agent':
      return 'Milkyway (Agent API)';
    case 'milkyway:bot':
      return 'Milkyway (Bot API)';
    case 'goldendragon:newbot':
      return 'Golden Dragon (New Bot)';
    case 'goldendragon':
      return 'Golden Dragon';
    default:
      return null;
  }
}

function getEndpointAwareDisplayName(game, fallbackName, apiEndpoint) {
  const splitKey = resolveAutomationUsageSplitKey(game, apiEndpoint);
  return splitKeyToDisplayName(splitKey) || getAutomationUsageDisplayName(game, fallbackName);
}

function getEndpointWhereForMode(mode) {
  if (mode === 'agent') {
    return {
      [Op.or]: [
        { apiEndpoint: { [Op.iLike]: '%/ws/service.ashx%' } },
        { apiEndpoint: { [Op.iLike]: '%agentLogin%' } },
        { apiEndpoint: { [Op.iLike]: '%registerUser%' } },
        { apiEndpoint: { [Op.iLike]: '%queryInfo%' } },
        { apiEndpoint: { [Op.iLike]: '%changePasswd%' } },
        { apiEndpoint: { [Op.iLike]: '%action=recharge%' } },
        { apiEndpoint: { [Op.iLike]: '%action=redeem%' } }
      ]
    };
  }
  if (mode === 'bot') {
    return {
      [Op.or]: [
        { apiEndpoint: { [Op.iLike]: '%/create-user%' } },
        { apiEndpoint: { [Op.iLike]: '%/deposit%' } },
        { apiEndpoint: { [Op.iLike]: '%/redeem%' } },
        { apiEndpoint: { [Op.iLike]: '%/balance%' } },
        { apiEndpoint: { [Op.iLike]: '%/withdraw%' } }
      ]
    };
  }
  return null;
}

function parseAutomationUsageGameFilter(gameName) {
  const name = String(gameName || '').trim();
  if (!name || name === 'all') return null;

  const wantsAgent = /agent/i.test(name);
  const wantsBot = /bot/i.test(name);
  const isOrion = /orionstars?/i.test(name);
  const isFirekirin = /fire\s*kirin|firekirin/i.test(name);
  const isMilkyway = /milky\s*way|milkyway/i.test(name);
  const isJuwaAgent = /juwa\s*2\.?0/i.test(name) && wantsAgent;
  const isGoldenDragon = /golden\s*dragon/i.test(name);

  if (isGoldenDragon) {
    return {
      family: 'goldendragon',
      mode: /new\s*bot/i.test(name) ? 'newbot' : 'legacy',
      requestedName: name
    };
  }

  if (!isOrion && !isFirekirin && !isMilkyway && !isJuwaAgent) return null;

  let mode = null;
  if (wantsAgent && !wantsBot) mode = 'agent';
  else if (wantsBot && !wantsAgent) mode = 'bot';

  return {
    family: isOrion ? 'orionstars' : (isFirekirin ? 'firekirin' : (isMilkyway ? 'milkyway' : 'juwa20')),
    mode,
    requestedName: name
  };
}

function gameMatchesAutomationFilter(game, filter) {
  if (!filter) return false;
  if (filter.family === 'orionstars') return isOrionStarsGame(game);
  if (filter.family === 'firekirin') return isFirekirinGame(game);
  if (filter.family === 'milkyway') return isMilkywayGame(game);
  if (filter.family === 'juwa20') {
    return compactGameKey(game.name).includes('juwa20') && isAgentCredentialGame(game);
  }
  if (filter.family === 'goldendragon') {
    if (filter.mode === 'newbot') return isGoldenDragonNewBotGame(game);
    return isGoldenDragonLegacyBotGame(game);
  }
  return false;
}

module.exports = {
  normalizeGameKey,
  getAutomationUsageDisplayName,
  getAutomationUsageGroupKey,
  isAgentApiEndpoint,
  isBotApiEndpoint,
  resolveAutomationUsageSplitKey,
  splitKeyToDisplayName,
  getEndpointAwareDisplayName,
  getEndpointWhereForMode,
  parseAutomationUsageGameFilter,
  gameMatchesAutomationFilter
};
