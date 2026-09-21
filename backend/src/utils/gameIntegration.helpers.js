'use strict';

const { isJuwaNewBotGame } = require('../services/games/juwa.helpers');
const {
  isPandamasterNewBotGame,
  isPandamasterLegacyBotGame,
  isPandamasterFamilyGame: isPandamasterFamilyGameByKey
} = require('../services/games/pandamaster.helpers');

/** Internal keys for games that use the external agent API (agentId + apiSecretKey). */
const AGENT_API_GAME_KEYS = new Set(['gamevaultagent', 'gamevault2', 'juwa20agent', 'juwaagent']);

/** Games that authenticate stores via POST /cashier/login (VegasX agent API). */
const CASHIER_LOGIN_GAME_KEYS = new Set(['vegasx']);

/** Game Vault Agent API keys (gamevault_agent preferred; gamevault2 legacy). */
const GAMEVAULT_AGENT_GAME_KEYS = new Set(['gamevaultagent', 'gamevault2']);

/** Game Vault streamlit bot automation keys. */
const GAMEVAULT_BOT_AUTOMATION_GAME_KEYS = new Set([
  'gamevault',
  'gamevaultbot',
  'gamevaultautomation',
  'gamevaultlegacy'
]);

/** Juwa 2.0 Agent API keys. */
const JUWA20_AGENT_GAME_KEYS = new Set(['juwa20agent']);

/** Juwa 2.0 streamlit bot automation keys. */
const JUWA20_BOT_AUTOMATION_GAME_KEYS = new Set([
  'juwa20',
  'juwa20bot',
  'juwa20automation',
  'juwa20legacy'
]);

/** Original Juwa Agent API keys (same GameVault-style /api/external/* as Juwa 2.0). */
const JUWA_AGENT_GAME_KEYS = new Set([
  'juwaagent'
]);

/** Original Juwa streamlit bot automation keys. Never include juwa20*. */
const JUWA_BOT_AUTOMATION_GAME_KEYS = new Set([
  'juwa',
  'juwabot',
  'juwaautomation',
  'juwalegacy',
  'juwanewbot'
]);

/** Orion Stars keys that use Terminal Agent API (agentLogin + registerUser). */
const ORION_STARS_TERMINAL_GAME_KEYS = new Set([
  'orionstars',
  'orionstar',
  'orionstarsagent',
  'orionstaragent'
]);

/** Orion Stars keys that should use the legacy bot automation API. */
const ORION_STARS_BOT_AUTOMATION_GAME_KEYS = new Set([
  'orionstarsbot',
  'orionstarbot',
  'orionstarsautomation',
  'orionstarautomation',
  'orionstarslegacy',
  'orionstarlegacy'
]);

/**
 * Firekirin keys that use Terminal Agent API (agentLogin + registerUser).
 * Explicit agent keys only — plain "firekirin" stays on the existing bot path.
 */
const FIREKIRIN_TERMINAL_GAME_KEYS = new Set([
  'firekirinagent'
]);

/** Firekirin keys that use the existing streamlit bot automation API. */
const FIREKIRIN_BOT_AUTOMATION_GAME_KEYS = new Set([
  'firekirin',
  'firekirinbot',
  'firekirinautomation',
  'firekirinlegacy'
]);

/**
 * Milkyway keys that use Terminal Agent API (agentLogin + registerUser).
 * Explicit agent keys only — plain "milkyway" stays on the existing bot path.
 */
const MILKYWAY_TERMINAL_GAME_KEYS = new Set([
  'milkywayagent'
]);

/** Milkyway keys that use the existing streamlit bot automation API. */
const MILKYWAY_BOT_AUTOMATION_GAME_KEYS = new Set([
  'milkyway',
  'milkywaybot',
  'milkywayautomation',
  'milkywaylegacy'
]);

/** Gameroom keys that use the official Agent API (store login + player APIs). */
const GAMEROOM_AGENT_GAME_KEYS = new Set([
  'gameroomagent'
]);

/** Gameroom keys that use the existing streamlit bot automation API. */
const GAMEROOM_BOT_AUTOMATION_GAME_KEYS = new Set([
  'gameroom',
  'gameroombot',
  'gameroomautomation',
  'gameroomlegacy'
]);

/**
 * Cashmachine keys that use the official Agent API (store login + player APIs).
 * Explicit agent keys only — plain "CashMachine777" stays on the existing bot path.
 */
const CASHMACHINE_AGENT_GAME_KEYS = new Set([
  'cashmachineagent',
  'cashmachine777agent'
]);

/** Cashmachine keys that use the existing streamlit bot automation API. */
const CASHMACHINE_BOT_AUTOMATION_GAME_KEYS = new Set([
  'cashmachine',
  'cashmachine777',
  'cashmachinebot',
  'cashmachine777bot',
  'cashmachineautomation',
  'cashmachine777automation',
  'cashmachinelegacy',
  'cashmachine777legacy'
]);

/** Mafia keys that use the official Agent API (store login + player APIs). */
const MAFIA_AGENT_GAME_KEYS = new Set([
  'mafiaagent'
]);

/** Default game_key stored on templates (compact name → DB game_key). */
const AGENT_TEMPLATE_GAME_KEYS = {
  gamevaultagent: 'gamevault_agent',
  gamevault2: 'gamevault_agent',
  juwa20agent: 'juwa20_agent',
  juwaagent: 'juwa_agent',
  firekirinagent: 'firekirin_agent',
  milkywayagent: 'milkyway_agent',
  gameroomagent: 'gameroom_agent',
  cashmachineagent: 'cashmachine_agent',
  cashmachine777agent: 'cashmachine_agent',
  mafiaagent: 'mafia_agent'
};

function compactGameKey(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve integration key from game row or template (gameKey preferred, then name).
 */
function resolveGameIntegrationKey(gameOrTemplate) {
  if (!gameOrTemplate) return '';
  if (typeof gameOrTemplate === 'string') {
    return compactGameKey(gameOrTemplate);
  }
  const explicit = compactGameKey(gameOrTemplate.gameKey);
  if (explicit) return explicit;
  return compactGameKey(gameOrTemplate.name);
}

/** game_key for agent API templates when not explicitly provided (e.g. "Juwa 2.0 (Agent)"). */
function resolveAgentTemplateGameKey(name, explicitGameKey) {
  const trimmed = String(explicitGameKey || '').trim();
  if (trimmed) return trimmed;
  const compact = compactGameKey(name);
  return AGENT_TEMPLATE_GAME_KEYS[compact] || null;
}

/** True when the game uses agentId + apiSecretKey and /api/external/* endpoints. */
function isAgentCredentialGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  const nameKey = gameOrTemplate && typeof gameOrTemplate === 'object'
    ? compactGameKey(gameOrTemplate.name)
    : key;
  // Terminal-agent / cashier-login games use store username+password, not agentId/apiSecretKey.
  if (
    key.includes('orionstar') || nameKey.includes('orionstar')
    || key.includes('firekirin') || nameKey.includes('firekirin')
    || key.includes('milkyway') || nameKey.includes('milkyway')
    || key.includes('gameroom') || nameKey.includes('gameroom')
    || key.includes('cashmachine') || nameKey.includes('cashmachine')
    || key.includes('mafia') || nameKey.includes('mafia')
  ) return false;
  if (AGENT_API_GAME_KEYS.has(key)) return true;
  return key.endsWith('agent');
}

/** True when the game uses POST /cashier/login with store username/password (VegasX). */
function isVegasXCashierGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return CASHIER_LOGIN_GAME_KEYS.has(key) || key.startsWith('vegasx');
}

/** VegasX is agent (cashier) API only — no separate bot automation mode. */
function isVegasXGame(gameOrTemplate) {
  return isVegasXCashierGame(gameOrTemplate);
}

/** Game Vault Agent API (agentId + apiSecretKey). */
function isGameVaultAgentGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return GAMEVAULT_AGENT_GAME_KEYS.has(key);
}

/** Game Vault streamlit bot automation. */
function isGameVaultBotAutomationGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (GAMEVAULT_AGENT_GAME_KEYS.has(explicit)) return false;
    if (GAMEVAULT_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return true;
    if (explicit) return false;
    const nameKey = compactGameKey(gameOrTemplate.name);
    if (nameKey.includes('gamevault') && !nameKey.includes('agent') && !nameKey.includes('2')) return true;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return GAMEVAULT_BOT_AUTOMATION_GAME_KEYS.has(key);
}

/** True for any Game Vault integration (bot or agent). */
function isGameVaultFamilyGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return (
    isGameVaultAgentGame(gameOrTemplate)
    || isGameVaultBotAutomationGame(gameOrTemplate)
    || key.includes('gamevault')
  );
}

/** Juwa 2.0 Agent API. */
function isJuwa20AgentGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return JUWA20_AGENT_GAME_KEYS.has(key);
}

/** Juwa 2.0 streamlit bot automation. */
function isJuwa20BotAutomationGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (JUWA20_AGENT_GAME_KEYS.has(explicit)) return false;
    if (JUWA20_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return true;
    if (explicit) return false;
    const nameKey = compactGameKey(gameOrTemplate.name);
    if ((nameKey === 'juwa20' || nameKey.includes('juwa20')) && !nameKey.includes('agent')) return true;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return JUWA20_BOT_AUTOMATION_GAME_KEYS.has(key);
}

/** True for any Juwa 2.0 integration (bot or agent). */
function isJuwa20FamilyGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  const nameKey = gameOrTemplate && typeof gameOrTemplate === 'object'
    ? compactGameKey(gameOrTemplate.name)
    : key;
  return (
    isJuwa20AgentGame(gameOrTemplate)
    || isJuwa20BotAutomationGame(gameOrTemplate)
    || key.includes('juwa20')
    || nameKey.includes('juwa20')
  );
}

function isOriginalJuwaKey(key) {
  return Boolean(key) && key.includes('juwa') && !key.includes('juwa20') && key !== 'juwanewbot';
}

/** Original Juwa Agent API (agentId + apiSecretKey). Explicit agent keys or name "Juwa (Agent)" only. */
function isJuwaAgentGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (explicit.includes('juwa20') || JUWA_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return false;
    if (JUWA_AGENT_GAME_KEYS.has(explicit)) return true;
    const nameKey = compactGameKey(gameOrTemplate.name);
    return isOriginalJuwaKey(nameKey) && nameKey.includes('agent');
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  if (!isOriginalJuwaKey(key)) return false;
  return JUWA_AGENT_GAME_KEYS.has(key) || (key.includes('juwa') && key.includes('agent'));
}

/** Original Juwa streamlit bot automation. */
function isJuwaBotAutomationGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (explicit.includes('juwa20') || JUWA_AGENT_GAME_KEYS.has(explicit)) return false;
    if (JUWA_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return true;
    const nameKey = compactGameKey(gameOrTemplate.name);
    return isOriginalJuwaKey(nameKey) && !nameKey.includes('agent');
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  if (!isOriginalJuwaKey(key) || JUWA_AGENT_GAME_KEYS.has(key)) return false;
  if (JUWA_BOT_AUTOMATION_GAME_KEYS.has(key)) return true;
  return isOriginalJuwaKey(key) && !key.includes('agent');
}

/** True for original Juwa (not Juwa 2.0) — includes legacy bot, new bot 4.0, and agent. */
function isJuwaFamilyGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  const nameKey = gameOrTemplate && typeof gameOrTemplate === 'object'
    ? compactGameKey(gameOrTemplate.name)
    : key;
  if (key.includes('juwa20') || nameKey.includes('juwa20')) return false;
  return (
    isJuwaAgentGame(gameOrTemplate)
    || isJuwaBotAutomationGame(gameOrTemplate)
    || isJuwaNewBotGame(
      gameOrTemplate && typeof gameOrTemplate === 'object' ? gameOrTemplate.name : gameOrTemplate,
      gameOrTemplate && typeof gameOrTemplate === 'object' ? gameOrTemplate.gameKey : key
    )
    || isOriginalJuwaKey(key)
    || isOriginalJuwaKey(nameKey)
  );
}

/** Legacy Juwa streamlit bot (not Juwa 4.0 new bot). */
function isJuwaLegacyBotAutomationGame(gameOrTemplate) {
  return isJuwaBotAutomationGame(gameOrTemplate)
    && !isJuwaNewBotGame(
      gameOrTemplate && typeof gameOrTemplate === 'object' ? gameOrTemplate.name : gameOrTemplate,
      gameOrTemplate && typeof gameOrTemplate === 'object' ? gameOrTemplate.gameKey : resolveGameIntegrationKey(gameOrTemplate)
    );
}

function normalizeJuwaApiMode(mode) {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'agent') return 'agent';
  if (raw === 'bot' || raw === 'legacy' || raw === 'legacy_bot' || raw === 'newbot' || raw === 'new_bot') return 'bot';
  return '';
}

function juwaTemplateMatchesApiMode(template, mode) {
  const normalized = normalizeJuwaApiMode(mode);
  if (!normalized) return false;
  if (normalized === 'agent') return isJuwaAgentGame(template);
  return isJuwaBotAutomationGame(template);
}

function normalizePandamasterApiMode(mode) {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'legacy' || raw === 'bot' || raw === 'legacy_bot') return 'legacy';
  if (raw === 'newbot' || raw === 'new_bot' || raw === 'new') return 'newbot';
  return '';
}

function pandamasterTemplateMatchesApiMode(template, mode) {
  const normalized = normalizePandamasterApiMode(mode);
  if (!normalized) return false;
  if (normalized === 'newbot') return isPandamasterNewBotGame(template.name, template.gameKey);
  return isPandamasterLegacyBotAutomationGame(template);
}

/** Pandamaster streamlit bot automation keys (legacy + 2.0). */
function isPandamasterBotAutomationGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (PANDAMASTER_NEW_BOT_GAME_KEYS.has(explicit) || PANDAMASTER_BOT_AUTOMATION_GAME_KEYS.has(explicit)) {
      return true;
    }
    if (explicit) return false;
    const nameKey = compactGameKey(gameOrTemplate.name);
    return nameKey.includes('pandamaster');
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return PANDAMASTER_NEW_BOT_GAME_KEYS.has(key)
    || PANDAMASTER_BOT_AUTOMATION_GAME_KEYS.has(key)
    || key.includes('pandamaster');
}

/** Pandamaster legacy streamlit bot automation only (not 2.0). */
function isPandamasterLegacyBotAutomationGame(gameOrTemplate) {
  if (isPandamasterNewBotGame(
    gameOrTemplate && typeof gameOrTemplate === 'object' ? gameOrTemplate.name : gameOrTemplate,
    gameOrTemplate && typeof gameOrTemplate === 'object' ? gameOrTemplate.gameKey : gameOrTemplate
  )) return false;
  return isPandamasterBotAutomationGame(gameOrTemplate);
}

/** True for any Pandamaster integration (legacy or 2.0 bot). */
function isPandamasterFamilyGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    return isPandamasterFamilyGameByKey(gameOrTemplate.name, gameOrTemplate.gameKey);
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return key.includes('pandamaster');
}

/** True when the game uses Orion Stars Terminal API (agentLogin / registerUser). */
function isOrionStarsTerminalGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (ORION_STARS_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return false;
    if (explicit) return ORION_STARS_TERMINAL_GAME_KEYS.has(explicit);

    const nameKey = compactGameKey(gameOrTemplate.name);
    const hasBotAutomationCreds = Boolean(
      gameOrTemplate.botApiKey
      && gameOrTemplate.streamlitToken
      && !gameOrTemplate.agentId
    );
    if (nameKey.includes('orionstar') && hasBotAutomationCreds) return false;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return ORION_STARS_TERMINAL_GAME_KEYS.has(key);
}

/** True when the game is Orion Stars but should use legacy bot automation endpoints. */
function isOrionStarsBotAutomationGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (ORION_STARS_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return true;
    if (explicit) return false;

    const nameKey = compactGameKey(gameOrTemplate.name);
    const hasBotAutomationCreds = Boolean(
      gameOrTemplate.botApiKey
      && gameOrTemplate.streamlitToken
      && !gameOrTemplate.agentId
    );
    if (nameKey.includes('orionstar') && hasBotAutomationCreds) return true;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return ORION_STARS_BOT_AUTOMATION_GAME_KEYS.has(key);
}

/** True for any Orion Stars integration key or display name. */
function isOrionStarsGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return (
    isOrionStarsTerminalGame(gameOrTemplate)
    || isOrionStarsBotAutomationGame(gameOrTemplate)
    || key.includes('orionstar')
  );
}

/**
 * True when the game uses Firekirin Terminal Agent API (agentLogin / registerUser).
 * Only explicit agent game_keys — never treat bare "Firekirin" as agent (preserves bot).
 */
function isFirekirinTerminalGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (FIREKIRIN_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return false;
    if (explicit) return FIREKIRIN_TERMINAL_GAME_KEYS.has(explicit);
    const nameKey = compactGameKey(gameOrTemplate.name);
    // Name like "Firekirin (Agent)" without game_key still counts as agent.
    if (nameKey.includes('firekirin') && nameKey.includes('agent')) return true;
    return false;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return FIREKIRIN_TERMINAL_GAME_KEYS.has(key);
}

/** True when the game is Firekirin but should use streamlit bot automation endpoints. */
function isFirekirinBotAutomationGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (FIREKIRIN_TERMINAL_GAME_KEYS.has(explicit)) return false;
    if (FIREKIRIN_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return true;
    if (explicit) return false;

    const nameKey = compactGameKey(gameOrTemplate.name);
    if (nameKey.includes('firekirin') && !nameKey.includes('agent')) return true;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return FIREKIRIN_BOT_AUTOMATION_GAME_KEYS.has(key);
}

/** True for any Firekirin integration key or display name. */
function isFirekirinGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return (
    isFirekirinTerminalGame(gameOrTemplate)
    || isFirekirinBotAutomationGame(gameOrTemplate)
    || key.includes('firekirin')
  );
}

/**
 * True when the game uses Milkyway Terminal Agent API (agentLogin / registerUser).
 * Only explicit agent game_keys — never treat bare "Milkyway" as agent (preserves bot).
 */
function isMilkywayTerminalGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (MILKYWAY_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return false;
    if (explicit) return MILKYWAY_TERMINAL_GAME_KEYS.has(explicit);
    const nameKey = compactGameKey(gameOrTemplate.name);
    if (nameKey.includes('milkyway') && nameKey.includes('agent')) return true;
    return false;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return MILKYWAY_TERMINAL_GAME_KEYS.has(key);
}

/** True when the game is Milkyway but should use streamlit bot automation endpoints. */
function isMilkywayBotAutomationGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (MILKYWAY_TERMINAL_GAME_KEYS.has(explicit)) return false;
    if (MILKYWAY_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return true;
    if (explicit) return false;

    const nameKey = compactGameKey(gameOrTemplate.name);
    if (nameKey.includes('milkyway') && !nameKey.includes('agent')) return true;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return MILKYWAY_BOT_AUTOMATION_GAME_KEYS.has(key);
}

/** True for any Milkyway integration key or display name. */
function isMilkywayGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return (
    isMilkywayTerminalGame(gameOrTemplate)
    || isMilkywayBotAutomationGame(gameOrTemplate)
    || key.includes('milkyway')
  );
}

/**
 * True when the game uses official Gameroom Agent API (agent login + player APIs).
 * Only explicit agent game_keys — never treat bare "Gameroom" as agent (preserves bot).
 */
function isGameroomAgentGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (GAMEROOM_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return false;
    if (explicit) return GAMEROOM_AGENT_GAME_KEYS.has(explicit);
    const nameKey = compactGameKey(gameOrTemplate.name);
    if (nameKey.includes('gameroom') && nameKey.includes('agent')) return true;
    return false;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return GAMEROOM_AGENT_GAME_KEYS.has(key);
}

/** True when the game is Gameroom but should use streamlit bot automation endpoints. */
function isGameroomBotAutomationGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (GAMEROOM_AGENT_GAME_KEYS.has(explicit)) return false;
    if (GAMEROOM_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return true;
    if (explicit) return false;

    const nameKey = compactGameKey(gameOrTemplate.name);
    if (nameKey.includes('gameroom') && !nameKey.includes('agent')) return true;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return GAMEROOM_BOT_AUTOMATION_GAME_KEYS.has(key);
}

/** True for any Gameroom integration key or display name. */
function isGameroomGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return (
    isGameroomAgentGame(gameOrTemplate)
    || isGameroomBotAutomationGame(gameOrTemplate)
    || key.includes('gameroom')
  );
}

/**
 * True when the game uses official Cashmachine Agent API (agent login + player APIs).
 * Only explicit agent game_keys — never treat bare "CashMachine777" as agent (preserves bot).
 */
function isCashmachineAgentGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (CASHMACHINE_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return false;
    if (CASHMACHINE_AGENT_GAME_KEYS.has(explicit)) return true;
    const nameKey = compactGameKey(gameOrTemplate.name);
    if (nameKey.includes('cashmachine') && nameKey.includes('agent')) return true;
    return false;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  if (CASHMACHINE_AGENT_GAME_KEYS.has(key)) return true;
  return key.includes('cashmachine') && key.includes('agent');
}

/** True when the game is Cashmachine but should use streamlit bot automation endpoints. */
function isCashmachineBotAutomationGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (CASHMACHINE_AGENT_GAME_KEYS.has(explicit)) return false;
    if (CASHMACHINE_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return true;

    const nameKey = compactGameKey(gameOrTemplate.name);
    if (nameKey.includes('cashmachine') && !nameKey.includes('agent')) return true;
    return false;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  if (CASHMACHINE_AGENT_GAME_KEYS.has(key)) return false;
  if (CASHMACHINE_BOT_AUTOMATION_GAME_KEYS.has(key)) return true;
  return key.includes('cashmachine') && !key.includes('agent');
}

/** True for any Cashmachine integration key or display name. */
function isCashmachineGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  const nameKey = gameOrTemplate && typeof gameOrTemplate === 'object'
    ? compactGameKey(gameOrTemplate.name)
    : key;
  return (
    isCashmachineAgentGame(gameOrTemplate)
    || isCashmachineBotAutomationGame(gameOrTemplate)
    || key.includes('cashmachine')
    || nameKey.includes('cashmachine')
  );
}

/**
 * True when the game uses official Mafia Agent API (agent login + player APIs).
 */
function isMafiaAgentGame(gameOrTemplate) {
  if (gameOrTemplate && typeof gameOrTemplate === 'object') {
    const explicit = compactGameKey(gameOrTemplate.gameKey);
    if (MAFIA_AGENT_GAME_KEYS.has(explicit)) return true;
    const nameKey = compactGameKey(gameOrTemplate.name);
    if (nameKey.includes('mafia') && nameKey.includes('agent')) return true;
    return false;
  }
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return MAFIA_AGENT_GAME_KEYS.has(key) || (key.includes('mafia') && key.includes('agent'));
}

/** True for any Mafia integration key or display name. */
function isMafiaGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  const nameKey = gameOrTemplate && typeof gameOrTemplate === 'object'
    ? compactGameKey(gameOrTemplate.name)
    : key;
  return isMafiaAgentGame(gameOrTemplate) || key.includes('mafia') || nameKey.includes('mafia');
}

/** Pandamaster legacy streamlit bot automation keys. */
const PANDAMASTER_BOT_AUTOMATION_GAME_KEYS = new Set([
  'pandamaster',
  'pandamasterbot',
  'pandamasterautomation',
  'pandamasterlegacy'
]);

/** Pandamaster 2.0 streamlit bot automation keys. */
const PANDAMASTER_NEW_BOT_GAME_KEYS = new Set([
  'pandamaster2',
  'pandamasternewbot'
]);

/** Custom / always-manual games (no agent or bot APIs). */
const CUSTOM_MANUAL_GAME_KEY = 'custom';

/** True when the game is a store-defined custom manual game (no provider automation). */
function isCustomManualGame(gameOrTemplate) {
  const key = resolveGameIntegrationKey(gameOrTemplate);
  return key === CUSTOM_MANUAL_GAME_KEY;
}

/** Human-readable integration label for admin UI (agent only; bot games return empty). */
function getGameIntegrationLabel(gameOrTemplate) {
  if (isCustomManualGame(gameOrTemplate)) return 'Custom';
  if (
    isVegasXCashierGame(gameOrTemplate)
    || isOrionStarsTerminalGame(gameOrTemplate)
    ||     isFirekirinTerminalGame(gameOrTemplate)
    || isMilkywayTerminalGame(gameOrTemplate)
    || isGameroomAgentGame(gameOrTemplate)
    || isCashmachineAgentGame(gameOrTemplate)
    || isMafiaAgentGame(gameOrTemplate)
    || isAgentCredentialGame(gameOrTemplate)
  ) return 'Agent';
  return '';
}

/** User-facing store game name (strip admin "(Agent)" suffix; keep game_key for routing). */
function getStoreGameDisplayName(gameName, gameKey) {
  const trimmed = String(gameName || '').trim();
  if (!trimmed && !gameKey) return '';
  const keyCompact = compactGameKey(gameKey);
  const compact = compactGameKey(trimmed);
  if (keyCompact === 'juwanewbot' || compact === 'juwanewbot') return 'Juwa';
  if (compact === 'juwa20' || compact === 'juwa20agent' || compact === 'juwa20agentapi' || compact.includes('juwa20') || keyCompact.includes('juwa20')) return 'Juwa 2.0';
  if (compact.includes('juwa') || keyCompact.includes('juwa')) return 'Juwa';
  if (compact === 'gamevault2' || compact === 'gamevaultagent') return 'Game Vault';
  if (compact.includes('orionstar')) return 'Orionstars';
  if (compact.includes('firekirin')) return 'Firekirin';
  if (compact.includes('milkyway')) return 'Milkyway';
  if (compact.includes('gameroom')) return 'Gameroom';
  if (compact.includes('cashmachine')) return 'CashMachine777';
  if (compact.includes('mafia')) return 'Mafia';
  if (compact === 'goldendragon' || compact === 'goldendragonnewbot' || compact === 'goldendragon2' || compactGameKey(gameKey) === 'goldendragon' || compactGameKey(gameKey) === 'goldendragonnewbot' || compactGameKey(gameKey) === 'goldendragon2') return 'Golden Dragon';
  if (compact === 'pandamaster2' || compact === 'pandamasternewbot' || keyCompact === 'pandamaster2' || keyCompact === 'pandamasternewbot') return 'Panda Master';
  if (compact.includes('pandamaster') || keyCompact.includes('pandamaster')) return 'Panda Master';
  const withoutAgentSuffix = trimmed.replace(/\s*\(agent\)\s*$/i, '').trim();
  return withoutAgentSuffix || trimmed;
}

/** Admin list — use the stored game name as-is (no extra Juwa labels). */
function getAdminGameDisplayName(gameName) {
  return String(gameName || '').trim();
}

/** Persisted games.name — one Juwa row per store regardless of API mode. */
function getGameRecordNameFromTemplate(templateName, gameKey, fallbackName) {
  const keyCompact = compactGameKey(gameKey);
  const compact = compactGameKey(templateName);
  const isJuwaFamilyKey = (keyCompact.includes('juwa') || compact.includes('juwa'))
    && !keyCompact.includes('juwa20')
    && !compact.includes('juwa20');
  if (isJuwaFamilyKey) return 'Juwa';
  const isPandamasterFamilyKey = keyCompact.includes('pandamaster') || compact.includes('pandamaster');
  if (isPandamasterFamilyKey) return 'Pandamaster';
  const trimmed = String(templateName || fallbackName || '').trim();
  const storeFacing = getStoreGameDisplayName(trimmed, gameKey);
  return storeFacing || trimmed;
}

module.exports = {
  AGENT_API_GAME_KEYS,
  CASHIER_LOGIN_GAME_KEYS,
  GAMEVAULT_AGENT_GAME_KEYS,
  GAMEVAULT_BOT_AUTOMATION_GAME_KEYS,
  JUWA20_AGENT_GAME_KEYS,
  JUWA20_BOT_AUTOMATION_GAME_KEYS,
  JUWA_AGENT_GAME_KEYS,
  JUWA_BOT_AUTOMATION_GAME_KEYS,
  ORION_STARS_TERMINAL_GAME_KEYS,
  ORION_STARS_BOT_AUTOMATION_GAME_KEYS,
  FIREKIRIN_TERMINAL_GAME_KEYS,
  FIREKIRIN_BOT_AUTOMATION_GAME_KEYS,
  MILKYWAY_TERMINAL_GAME_KEYS,
  MILKYWAY_BOT_AUTOMATION_GAME_KEYS,
  GAMEROOM_AGENT_GAME_KEYS,
  GAMEROOM_BOT_AUTOMATION_GAME_KEYS,
  CASHMACHINE_AGENT_GAME_KEYS,
  CASHMACHINE_BOT_AUTOMATION_GAME_KEYS,
  MAFIA_AGENT_GAME_KEYS,
  AGENT_TEMPLATE_GAME_KEYS,
  CUSTOM_MANUAL_GAME_KEY,
  compactGameKey,
  resolveGameIntegrationKey,
  resolveAgentTemplateGameKey,
  isAgentCredentialGame,
  isVegasXCashierGame,
  isVegasXGame,
  isGameVaultAgentGame,
  isGameVaultBotAutomationGame,
  isGameVaultFamilyGame,
  isJuwa20AgentGame,
  isJuwa20BotAutomationGame,
  isJuwa20FamilyGame,
  isJuwaAgentGame,
  isJuwaBotAutomationGame,
  isJuwaLegacyBotAutomationGame,
  isJuwaFamilyGame,
  normalizeJuwaApiMode,
  juwaTemplateMatchesApiMode,
  PANDAMASTER_BOT_AUTOMATION_GAME_KEYS,
  PANDAMASTER_NEW_BOT_GAME_KEYS,
  normalizePandamasterApiMode,
  pandamasterTemplateMatchesApiMode,
  isPandamasterBotAutomationGame,
  isPandamasterLegacyBotAutomationGame,
  isPandamasterFamilyGame,
  isOrionStarsTerminalGame,
  isOrionStarsBotAutomationGame,
  isOrionStarsGame,
  isFirekirinTerminalGame,
  isFirekirinBotAutomationGame,
  isFirekirinGame,
  isMilkywayTerminalGame,
  isMilkywayBotAutomationGame,
  isMilkywayGame,
  isGameroomAgentGame,
  isGameroomBotAutomationGame,
  isGameroomGame,
  isCashmachineAgentGame,
  isCashmachineBotAutomationGame,
  isCashmachineGame,
  isMafiaAgentGame,
  isMafiaGame,
  isCustomManualGame,
  getGameIntegrationLabel,
  getStoreGameDisplayName,
  getAdminGameDisplayName,
  getGameRecordNameFromTemplate
};
