const SIMPLE_GAME_NAMES = ['Vblink', 'UltraPanda', 'Egame99']

/** Internal keys for games that use the external agent API. */
const AGENT_API_GAME_KEYS = new Set(['gamevaultagent', 'gamevault2', 'juwa20agent', 'juwaagent'])

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
}

const GAMEVAULT_AGENT_GAME_KEYS = new Set(['gamevaultagent', 'gamevault2'])
const GAMEVAULT_BOT_AUTOMATION_GAME_KEYS = new Set([
  'gamevault',
  'gamevaultbot',
  'gamevaultautomation',
  'gamevaultlegacy'
])
const JUWA20_AGENT_GAME_KEYS = new Set(['juwa20agent'])
const JUWA20_BOT_AUTOMATION_GAME_KEYS = new Set([
  'juwa20',
  'juwa20bot',
  'juwa20automation',
  'juwa20legacy'
])
const JUWA_AGENT_GAME_KEYS = new Set(['juwaagent'])
const JUWA_BOT_AUTOMATION_GAME_KEYS = new Set([
  'juwa',
  'juwabot',
  'juwaautomation',
  'juwalegacy',
  'juwanewbot'
])

const PANDAMASTER_BOT_AUTOMATION_GAME_KEYS = new Set([
  'pandamaster',
  'pandamasterbot',
  'pandamasterautomation',
  'pandamasterlegacy'
])

const PANDAMASTER_NEW_BOT_GAME_KEYS = new Set([
  'pandamaster2',
  'pandamasternewbot'
])

function compactGameKey(nameOrTemplate) {
  if (nameOrTemplate && typeof nameOrTemplate === 'object') {
    const explicit = String(nameOrTemplate.gameKey || '').trim()
    if (explicit) return explicit.toLowerCase().replace(/[^a-z0-9]/g, '')
    return String(nameOrTemplate.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  }
  return String(nameOrTemplate || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function compactNameKey(nameOrTemplate) {
  if (nameOrTemplate && typeof nameOrTemplate === 'object') {
    return String(nameOrTemplate.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  }
  return compactGameKey(nameOrTemplate)
}

export function resolveAgentTemplateGameKey(name, explicitGameKey) {
  const trimmed = String(explicitGameKey || '').trim()
  if (trimmed) return trimmed
  const compact = compactGameKey(name)
  return AGENT_TEMPLATE_GAME_KEYS[compact] || null
}

export function isSimpleGame(name) {
  const n = (name || '').trim()
  return SIMPLE_GAME_NAMES.some((g) => g.toLowerCase() === n.toLowerCase())
}

/** Agent API games use agentId + apiSecretKey (GameVault agent, Juwa 2.0 Agent API, etc.). */
export function isAgentCredentialGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  const nameKey = compactNameKey(nameOrTemplate)
  // Terminal-agent / cashier-login games use store username+password, not agentId/apiSecretKey.
  if (
    key.includes('orionstar') || nameKey.includes('orionstar')
    || key.includes('firekirin') || nameKey.includes('firekirin')
    || key.includes('milkyway') || nameKey.includes('milkyway')
    || key.includes('gameroom') || nameKey.includes('gameroom')
    || key.includes('cashmachine') || nameKey.includes('cashmachine')
    || key.includes('mafia') || nameKey.includes('mafia')
  ) return false
  if (AGENT_API_GAME_KEYS.has(key)) return true
  return key.endsWith('agent')
}

/** VegasX uses POST /cashier/login with store username/password (no streamlit token). */
export function isVegasXCashierGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  return key === 'vegasx' || key.startsWith('vegasx')
}

/** VegasX is agent (cashier) API only. */
export function isVegasXGame(nameOrTemplate) {
  return isVegasXCashierGame(nameOrTemplate)
}

export function isGameVaultAgentGame(nameOrTemplate) {
  return GAMEVAULT_AGENT_GAME_KEYS.has(compactGameKey(nameOrTemplate))
}

export function isGameVaultBotAutomationGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  if (GAMEVAULT_AGENT_GAME_KEYS.has(key)) return false
  if (GAMEVAULT_BOT_AUTOMATION_GAME_KEYS.has(key)) return true
  return key.includes('gamevault') && !key.includes('agent') && !key.includes('2')
}

export function isGameVaultFamilyGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  return isGameVaultAgentGame(nameOrTemplate)
    || isGameVaultBotAutomationGame(nameOrTemplate)
    || key.includes('gamevault')
}

export function isJuwa20AgentGame(nameOrTemplate) {
  return JUWA20_AGENT_GAME_KEYS.has(compactGameKey(nameOrTemplate))
}

export function isJuwa20BotAutomationGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  if (JUWA20_AGENT_GAME_KEYS.has(key)) return false
  if (JUWA20_BOT_AUTOMATION_GAME_KEYS.has(key)) return true
  return (key === 'juwa20' || key.includes('juwa20')) && !key.includes('agent')
}

export function isJuwa20FamilyGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  const nameKey = compactNameKey(nameOrTemplate)
  return isJuwa20AgentGame(nameOrTemplate)
    || isJuwa20BotAutomationGame(nameOrTemplate)
    || key.includes('juwa20')
    || nameKey.includes('juwa20')
}

function isOriginalJuwaKey(key) {
  return Boolean(key) && key.includes('juwa') && !key.includes('juwa20') && key !== 'juwanewbot'
}

/** Juwa 4.0 bot on port 8023 — separate from legacy Juwa bot/agent templates. */
export function isJuwaNewBotGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  const nameKey = compactNameKey(nameOrTemplate)
  return key === 'juwanewbot' || nameKey === 'juwanewbot'
}

/** Original Juwa Agent API — same GameVault-style agentId + apiSecretKey as Juwa 2.0. */
export function isJuwaAgentGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  const nameKey = compactNameKey(nameOrTemplate)
  if (key.includes('juwa20') || nameKey.includes('juwa20')) return false
  if (JUWA_BOT_AUTOMATION_GAME_KEYS.has(key)) return false
  if (JUWA_AGENT_GAME_KEYS.has(key)) return true
  return isOriginalJuwaKey(nameKey) && nameKey.includes('agent')
}

export function isJuwaBotAutomationGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  const nameKey = compactNameKey(nameOrTemplate)
  if (isJuwaNewBotGame(nameOrTemplate)) return true
  if (key.includes('juwa20') || nameKey.includes('juwa20')) return false
  if (JUWA_AGENT_GAME_KEYS.has(key)) return false
  if (JUWA_BOT_AUTOMATION_GAME_KEYS.has(key)) return true
  return isOriginalJuwaKey(nameKey) && !nameKey.includes('agent')
}

export function isJuwaLegacyBotAutomationGame(nameOrTemplate) {
  return isJuwaBotAutomationGame(nameOrTemplate) && !isJuwaNewBotGame(nameOrTemplate)
}

export function normalizeJuwaApiMode(mode) {
  const raw = String(mode || '').trim().toLowerCase()
  if (raw === 'agent') return 'agent'
  if (raw === 'bot' || raw === 'legacy' || raw === 'legacy_bot' || raw === 'newbot' || raw === 'new_bot') return 'bot'
  return ''
}

export function isJuwaFamilyGame(nameOrTemplate) {
  if (isJuwaNewBotGame(nameOrTemplate)) return false
  const key = compactGameKey(nameOrTemplate)
  const nameKey = compactNameKey(nameOrTemplate)
  if (key.includes('juwa20') || nameKey.includes('juwa20')) return false
  return isJuwaAgentGame(nameOrTemplate)
    || isJuwaBotAutomationGame(nameOrTemplate)
    || isOriginalJuwaKey(key)
    || isOriginalJuwaKey(nameKey)
}

/** Existing store Juwa game (including Juwa new bot row) — for edit / API mode UI. */
export function isJuwaStoreGame(nameOrTemplate) {
  if (isJuwaNewBotGame(nameOrTemplate)) return true
  return isJuwaFamilyGame(nameOrTemplate)
}

/** Pandamaster 2.0 bot on port 8024 — separate from legacy Pandamaster bot. */
export function isPandamasterNewBotGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  const nameKey = compactNameKey(nameOrTemplate)
  return PANDAMASTER_NEW_BOT_GAME_KEYS.has(key)
    || nameKey === 'pandamaster2'
    || nameKey.includes('pandamasternewbot')
}

export function isPandamasterLegacyBotGame(nameOrTemplate) {
  if (isPandamasterNewBotGame(nameOrTemplate)) return false
  const key = compactGameKey(nameOrTemplate)
  const nameKey = compactNameKey(nameOrTemplate)
  if (PANDAMASTER_BOT_AUTOMATION_GAME_KEYS.has(key)) return true
  return (key === 'pandamaster' || nameKey === 'pandamaster' || nameKey === 'pandamaster')
    && !key.includes('pandamaster2')
}

export function isPandamasterBotAutomationGame(nameOrTemplate) {
  return isPandamasterNewBotGame(nameOrTemplate) || isPandamasterLegacyBotGame(nameOrTemplate)
}

export function isPandamasterFamilyGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  const nameKey = compactNameKey(nameOrTemplate)
  return isPandamasterBotAutomationGame(nameOrTemplate)
    || key.includes('pandamaster')
    || nameKey.includes('pandamaster')
}

/** Existing store Pandamaster game — for edit / API mode UI. */
export function isPandamasterStoreGame(nameOrTemplate) {
  return isPandamasterFamilyGame(nameOrTemplate)
}

export function normalizePandamasterApiMode(mode) {
  const raw = String(mode || '').trim().toLowerCase()
  if (raw === 'legacy' || raw === 'bot' || raw === 'legacy_bot') return 'legacy'
  if (raw === 'newbot' || raw === 'new_bot' || raw === 'new') return 'newbot'
  return ''
}

const ORION_STARS_TERMINAL_GAME_KEYS = new Set([
  'orionstars',
  'orionstar',
  'orionstarsagent',
  'orionstaragent'
])

const ORION_STARS_BOT_AUTOMATION_GAME_KEYS = new Set([
  'orionstarsbot',
  'orionstarbot',
  'orionstarsautomation',
  'orionstarautomation',
  'orionstarslegacy',
  'orionstarlegacy'
])

/** Firekirin Agent API — explicit agent keys only (plain firekirin stays bot). */
const FIREKIRIN_TERMINAL_GAME_KEYS = new Set([
  'firekirinagent'
])

const FIREKIRIN_BOT_AUTOMATION_GAME_KEYS = new Set([
  'firekirin',
  'firekirinbot',
  'firekirinautomation',
  'firekirinlegacy'
])

/** Milkyway Agent API — explicit agent keys only (plain milkyway stays bot). */
const MILKYWAY_TERMINAL_GAME_KEYS = new Set([
  'milkywayagent'
])

const MILKYWAY_BOT_AUTOMATION_GAME_KEYS = new Set([
  'milkyway',
  'milkywaybot',
  'milkywayautomation',
  'milkywaylegacy'
])

/** Gameroom Agent API — explicit agent keys only (plain gameroom stays bot). */
const GAMEROOM_AGENT_GAME_KEYS = new Set([
  'gameroomagent'
])

const GAMEROOM_BOT_AUTOMATION_GAME_KEYS = new Set([
  'gameroom',
  'gameroombot',
  'gameroomautomation',
  'gameroomlegacy'
])

/** Cashmachine Agent API — explicit agent keys only (plain CashMachine777 stays bot). */
const CASHMACHINE_AGENT_GAME_KEYS = new Set([
  'cashmachineagent',
  'cashmachine777agent'
])

const CASHMACHINE_BOT_AUTOMATION_GAME_KEYS = new Set([
  'cashmachine',
  'cashmachine777',
  'cashmachinebot',
  'cashmachine777bot',
  'cashmachineautomation',
  'cashmachine777automation',
  'cashmachinelegacy',
  'cashmachine777legacy'
])

/** Orion Stars Terminal API — agentLogin + registerUser (no streamlit token). */
export function isOrionStarsTerminalGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  return ORION_STARS_TERMINAL_GAME_KEYS.has(key)
}

/** Orion Stars legacy bot automation API — /create-user, /deposit, /redeem, /balance. */
export function isOrionStarsBotAutomationGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  return ORION_STARS_BOT_AUTOMATION_GAME_KEYS.has(key)
}

export function isOrionStarsGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  return isOrionStarsTerminalGame(nameOrTemplate)
    || isOrionStarsBotAutomationGame(nameOrTemplate)
    || key.includes('orionstar')
}

/** Firekirin Terminal Agent API — agentLogin + registerUser (no streamlit token). */
export function isFirekirinTerminalGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  return FIREKIRIN_TERMINAL_GAME_KEYS.has(key)
}

/** Firekirin streamlit bot automation API — /create-user, /deposit, /redeem, /balance. */
export function isFirekirinBotAutomationGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  if (FIREKIRIN_TERMINAL_GAME_KEYS.has(key)) return false
  if (FIREKIRIN_BOT_AUTOMATION_GAME_KEYS.has(key)) return true
  // Bare "Firekirin" name (no gameKey) stays on the existing bot path.
  return key === 'firekirin' || (key.includes('firekirin') && !key.includes('agent'))
}

export function isFirekirinGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  return isFirekirinTerminalGame(nameOrTemplate)
    || isFirekirinBotAutomationGame(nameOrTemplate)
    || key.includes('firekirin')
}

/** Milkyway Terminal Agent API — agentLogin + registerUser (no streamlit token). */
export function isMilkywayTerminalGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  return MILKYWAY_TERMINAL_GAME_KEYS.has(key)
}

/** Milkyway streamlit bot automation API — /create-user, /deposit, /redeem, /balance. */
export function isMilkywayBotAutomationGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  if (MILKYWAY_TERMINAL_GAME_KEYS.has(key)) return false
  if (MILKYWAY_BOT_AUTOMATION_GAME_KEYS.has(key)) return true
  return key === 'milkyway' || (key.includes('milkyway') && !key.includes('agent'))
}

export function isMilkywayGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  return isMilkywayTerminalGame(nameOrTemplate)
    || isMilkywayBotAutomationGame(nameOrTemplate)
    || key.includes('milkyway')
}

/** Gameroom Agent API — explicit agent keys only (plain Gameroom stays bot). */
export function isGameroomAgentGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  return GAMEROOM_AGENT_GAME_KEYS.has(key)
}

/** Gameroom streamlit bot automation API. */
export function isGameroomBotAutomationGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  if (GAMEROOM_AGENT_GAME_KEYS.has(key)) return false
  if (GAMEROOM_BOT_AUTOMATION_GAME_KEYS.has(key)) return true
  return key === 'gameroom' || (key.includes('gameroom') && !key.includes('agent'))
}

export function isGameroomGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  return isGameroomAgentGame(nameOrTemplate)
    || isGameroomBotAutomationGame(nameOrTemplate)
    || key.includes('gameroom')
}

/** Cashmachine Agent API — explicit agent keys or name like "CashMachine777 (Agent)". */
export function isCashmachineAgentGame(nameOrTemplate) {
  if (nameOrTemplate && typeof nameOrTemplate === 'object') {
    const explicit = compactGameKey(nameOrTemplate.gameKey)
    if (CASHMACHINE_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return false
    if (explicit && CASHMACHINE_AGENT_GAME_KEYS.has(explicit)) return true
    const nameKey = compactNameKey(nameOrTemplate)
    return nameKey.includes('cashmachine') && nameKey.includes('agent')
  }
  const key = compactGameKey(nameOrTemplate)
  if (CASHMACHINE_AGENT_GAME_KEYS.has(key)) return true
  return key.includes('cashmachine') && key.includes('agent')
}

/** Cashmachine streamlit bot automation API. */
export function isCashmachineBotAutomationGame(nameOrTemplate) {
  if (nameOrTemplate && typeof nameOrTemplate === 'object') {
    const explicit = compactGameKey(nameOrTemplate.gameKey)
    if (CASHMACHINE_AGENT_GAME_KEYS.has(explicit)) return false
    if (CASHMACHINE_BOT_AUTOMATION_GAME_KEYS.has(explicit)) return true
    const nameKey = compactNameKey(nameOrTemplate)
    return nameKey.includes('cashmachine') && !nameKey.includes('agent')
  }
  const key = compactGameKey(nameOrTemplate)
  if (CASHMACHINE_AGENT_GAME_KEYS.has(key)) return false
  if (CASHMACHINE_BOT_AUTOMATION_GAME_KEYS.has(key)) return true
  return key === 'cashmachine' || key === 'cashmachine777' || (key.includes('cashmachine') && !key.includes('agent'))
}

export function isCashmachineGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  const nameKey = compactNameKey(nameOrTemplate)
  return isCashmachineAgentGame(nameOrTemplate)
    || isCashmachineBotAutomationGame(nameOrTemplate)
    || key.includes('cashmachine')
    || nameKey.includes('cashmachine')
}

/** Mafia Agent API — explicit mafia_agent key or name like "Mafia (Agent)". */
export function isMafiaAgentGame(nameOrTemplate) {
  if (nameOrTemplate && typeof nameOrTemplate === 'object') {
    const explicit = compactGameKey(nameOrTemplate.gameKey)
    if (explicit === 'mafiaagent') return true
    const nameKey = compactNameKey(nameOrTemplate)
    return nameKey.includes('mafia') && nameKey.includes('agent')
  }
  const key = compactGameKey(nameOrTemplate)
  return key === 'mafiaagent' || (key.includes('mafia') && key.includes('agent'))
}

export function isMafiaGame(nameOrTemplate) {
  const key = compactGameKey(nameOrTemplate)
  const nameKey = compactNameKey(nameOrTemplate)
  return isMafiaAgentGame(nameOrTemplate) || key.includes('mafia') || nameKey.includes('mafia')
}

export function getGameIntegrationLabel(nameOrTemplate) {
  if (
    isVegasXCashierGame(nameOrTemplate)
    || isOrionStarsTerminalGame(nameOrTemplate)
    || isFirekirinTerminalGame(nameOrTemplate)
    || isMilkywayTerminalGame(nameOrTemplate)
    || isGameroomAgentGame(nameOrTemplate)
    || isCashmachineAgentGame(nameOrTemplate)
    || isMafiaAgentGame(nameOrTemplate)
    || isAgentCredentialGame(nameOrTemplate)
  ) return 'Agent'
  return ''
}

export function formatGameDisplayName(nameOrTemplate) {
  const ref = typeof nameOrTemplate === 'object' ? nameOrTemplate : { name: nameOrTemplate }
  if (ref?.displayName) return String(ref.displayName).trim()
  return String(ref?.name || '').trim()
}

export function usesVegasXTemplateFields(nameOrTemplate) {
  return isVegasXCashierGame(nameOrTemplate)
}

export function usesOrionStarsTerminalTemplateFields(nameOrTemplate) {
  return isOrionStarsTerminalGame(nameOrTemplate)
}

export function usesOrionStarsBotAutomationTemplateFields(nameOrTemplate) {
  return isOrionStarsBotAutomationGame(nameOrTemplate)
}

export function usesFirekirinTerminalTemplateFields(nameOrTemplate) {
  return isFirekirinTerminalGame(nameOrTemplate)
}

export function usesFirekirinBotAutomationTemplateFields(nameOrTemplate) {
  return isFirekirinBotAutomationGame(nameOrTemplate)
}

export function usesMilkywayTerminalTemplateFields(nameOrTemplate) {
  return isMilkywayTerminalGame(nameOrTemplate)
}

export function usesMilkywayBotAutomationTemplateFields(nameOrTemplate) {
  return isMilkywayBotAutomationGame(nameOrTemplate)
}

export function usesGameroomAgentTemplateFields(nameOrTemplate) {
  return isGameroomAgentGame(nameOrTemplate)
}

export function usesGameroomBotAutomationTemplateFields(nameOrTemplate) {
  return isGameroomBotAutomationGame(nameOrTemplate)
}

export function usesCashmachineAgentTemplateFields(nameOrTemplate) {
  return isCashmachineAgentGame(nameOrTemplate)
}

export function usesCashmachineBotAutomationTemplateFields(nameOrTemplate) {
  return isCashmachineBotAutomationGame(nameOrTemplate)
}

export function usesMafiaAgentTemplateFields(nameOrTemplate) {
  return isMafiaAgentGame(nameOrTemplate)
}

export function usesStreamlitTemplateFields(nameOrTemplate) {
  const ref = typeof nameOrTemplate === 'object'
    ? nameOrTemplate
    : { name: nameOrTemplate }
  return !isSimpleGame(ref.name)
    && !isAgentCredentialGame(ref)
    && !isVegasXCashierGame(ref)
    && !isOrionStarsTerminalGame(ref)
    && !isFirekirinTerminalGame(ref)
    && !isMilkywayTerminalGame(ref)
    && !isGameroomAgentGame(ref)
    && !isCashmachineAgentGame(ref)
    && !isMafiaAgentGame(ref)
}

/** Custom / always-manual games (no agent or bot APIs). */
export function isCustomManualGame(nameOrTemplate) {
  return compactGameKey(nameOrTemplate) === 'custom'
}

/** Dropdown / config label: always use the real config name as stored. */
export function formatTemplateOptionLabel(template) {
  const name = typeof template === 'object'
    ? String(template?.name || '').trim()
    : String(template || '').trim()
  return name || 'Game'
}

function isGoldenDragonFamilyGame(nameOrTemplate) {
  const ids = [compactGameKey(nameOrTemplate), compactNameKey(nameOrTemplate)].filter(Boolean)
  return ids.some((id) => id === 'goldendragon' || id === 'goldendragonnewbot' || id === 'goldendragon2')
    || ids.some((id) => id.includes('goldendragon'))
}

function isGoldenDragonNewBotGame(nameOrTemplate) {
  const ids = [compactGameKey(nameOrTemplate), compactNameKey(nameOrTemplate)].filter(Boolean)
  return ids.some((id) => id === 'goldendragon2' || id === 'goldendragonnewbot')
}

/**
 * Human-readable API integration mode for admin games list (per store game row).
 * Reflects the active bot/agent variant, not automation on/off (see botOffline).
 */
export function getGameApiModeLabel(gameOrTemplate) {
  const ref = gameOrTemplate && typeof gameOrTemplate === 'object'
    ? gameOrTemplate
    : { name: gameOrTemplate }

  if (isCustomManualGame(ref)) return 'Manual (custom)'
  if (isSimpleGame(ref.name)) return 'App credentials'

  if (isVegasXCashierGame(ref)) return 'Agent API (cashier)'

  if (isJuwaNewBotGame(ref)) return 'new juwa bot'
  if (isJuwaAgentGame(ref)) return 'Agent API'
  if (isJuwaLegacyBotAutomationGame(ref)) return 'Bot — Legacy'
  if (isJuwaBotAutomationGame(ref)) return 'Bot automation'
  if (isJuwa20AgentGame(ref)) return 'Agent API'
  if (isJuwa20BotAutomationGame(ref)) return 'Bot automation'
  if (isJuwa20FamilyGame(ref)) return 'Bot automation'

  if (isPandamasterNewBotGame(ref)) return 'new pandamaster bot'
  if (isPandamasterLegacyBotGame(ref)) return 'Bot — Legacy'
  if (isPandamasterFamilyGame(ref)) return 'Bot automation'

  if (isGoldenDragonNewBotGame(ref)) return 'Bot — New'
  if (isGoldenDragonFamilyGame(ref)) return 'Bot — Legacy'

  if (isOrionStarsTerminalGame(ref)) return 'Agent API'
  if (isOrionStarsBotAutomationGame(ref)) return 'Bot automation'
  if (isOrionStarsGame(ref)) return 'Agent API'

  if (isFirekirinTerminalGame(ref)) return 'Agent API'
  if (isFirekirinBotAutomationGame(ref)) return 'Bot automation'
  if (isFirekirinGame(ref)) return 'Bot automation'

  if (isMilkywayTerminalGame(ref)) return 'Agent API'
  if (isMilkywayBotAutomationGame(ref)) return 'Bot automation'
  if (isMilkywayGame(ref)) return 'Bot automation'

  if (isGameroomAgentGame(ref)) return 'Agent API'
  if (isGameroomBotAutomationGame(ref)) return 'Bot automation'
  if (isGameroomGame(ref)) return 'Bot automation'

  if (isCashmachineAgentGame(ref)) return 'Agent API'
  if (isCashmachineBotAutomationGame(ref)) return 'Bot automation'
  if (isCashmachineGame(ref)) return 'Bot automation'

  if (isMafiaAgentGame(ref)) return 'Agent API'
  if (isMafiaGame(ref)) return 'Agent API'

  if (isGameVaultAgentGame(ref)) return 'Agent API'
  if (isGameVaultBotAutomationGame(ref)) return 'Bot automation'
  if (isGameVaultFamilyGame(ref)) return 'Bot automation'

  if (isAgentCredentialGame(ref) || (ref.agentId && ref.apiSecretKey)) return 'Agent API'

  const botUrl = String(ref.botApiUrl || '').trim()
  if (botUrl) return 'Bot automation'

  return '—'
}
