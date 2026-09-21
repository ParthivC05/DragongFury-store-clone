'use strict';

const db = require('../../db/models');
const { sendSuccess, sendError } = require('../../helpers/response.helpers');
const {
  addGame,
  addCustomManualGame,
  updateGameProviderCredentials,
  isSimpleGame,
  isAgentCredentialGame,
  isDirectStoreCredentialGame,
  isGoldenDragonGame,
  resolveKioskIdForGoldenDragon,
  GOLDEN_DRAGON_KIOSK_ID_HELP
} = require('../../services/games/addGame.service');
const { decodePasswordBody } = require('../../utils/passwordEncryption');
const {
  getGameIntegrationLabel,
  resolveAgentTemplateGameKey,
  resolveGameIntegrationKey,
  compactGameKey,
  isVegasXCashierGame,
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
  normalizePandamasterApiMode,
  pandamasterTemplateMatchesApiMode,
  isPandamasterBotAutomationGame,
  isPandamasterFamilyGame,
  isCustomManualGame,
  getStoreGameDisplayName,
  getAdminGameDisplayName,
  getGameRecordNameFromTemplate
} = require('../../utils/gameIntegration.helpers');
const { isJuwaNewBotGame } = require('../../services/games/juwa.helpers');
const { isPandamasterNewBotGame } = require('../../services/games/pandamaster.helpers');
const { uploadImageBuffer } = require('../../utils/s3Upload');
const { can } = require('../../utils/permissionHelpers');
const { STORE_FEATURE_KEYS } = require('../../constants/permissions');
const { sendAutomationUpdateInAppNotifications } = require('../../services/games/gameAutomationInAppNotify.service');
const { changeGamePassword: changeGamePasswordService } = require('../../services/games/changeGamePassword.service');
const { getGameManualModeLogs } = require('../../services/games/getGameManualModeLogs.service');
const { getGameBotAutomationFailureLogs } = require('../../services/games/getGameBotAutomationFailureLogs.service');
const { getGameHistory } = require('../../services/games/getGameHistory.service');
const { recordGameManualModeLog } = require('../../services/games/recordGameManualModeLog.service');
const { clearGameBotAutomationFailures } = require('../../services/games/recordBotAutomationFailure.service');
const {
  recordGameHistoryFromUpdates,
  recordGameHistoryCreated,
  recordGameHistoryDeleted,
  recordGameHistoryModeSwitch,
  recordGameHistoryPasswordChanged,
  recordGameHistoryRedeemModeSwitch
} = require('../../services/games/recordGameHistory.service');
const { ROLES, isMasterAdmin } = require('../../constants/roles');

async function resolveAdminDisplayName(userId) {
  if (!userId) return null;
  const u = await db.User.findByPk(userId, {
    attributes: ['userId', 'username', 'email', 'firstName', 'lastName']
  });
  if (!u) return null;
  const name = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  return name || u.username || u.email || `User #${u.userId}`;
}

async function buildHistoryActor(req, triggerSource = 'admin_panel') {
  const changedByName = await resolveAdminDisplayName(req.user?.userId);
  return {
    changedByUserId: req.user?.userId ?? null,
    changedByName,
    changedByRole: req.user?.role || null,
    triggerSource
  };
}

function resolvePersistedGameName(template, game, templateGameKey) {
  return String(getGameRecordNameFromTemplate(
    template?.name || game?.name,
    templateGameKey || template?.gameKey || game?.gameKey,
    game?.name
  ) || '').trim().slice(0, 128);
}

async function findStoreJuwaFamilyGame(storeCode) {
  const games = await db.Game.findAll({
    where: { isActive: true, addedByStoreCode: storeCode || null },
    attributes: ['id', 'name', 'gameKey', 'gameTemplateId']
  });
  return games.find((row) => isJuwaFamilyGame(row)) || null;
}

async function findStorePandamasterFamilyGame(storeCode) {
  const games = await db.Game.findAll({
    where: { isActive: true, addedByStoreCode: storeCode || null },
    attributes: ['id', 'name', 'gameKey', 'gameTemplateId']
  });
  return games.find((row) => isPandamasterFamilyGame(row)) || null;
}

/** Technical staff: master_admin assigned to an admin role (not full super admin). */
function isPlatformTechnicalStaff(req) {
  return isMasterAdmin(req.role) && !!req.adminRoleId;
}

function gameHasStorePartner(game) {
  const c = game.addedByStoreCode != null ? String(game.addedByStoreCode).trim() : '';
  return c.length > 0;
}

function normalizeRoleSlug(slug) {
  if (slug == null || slug === '') return '';
  return String(slug).trim().toLowerCase().replace(/_/g, '-');
}

/** Store role slug for “technical staff” — may manage any game for that store (same as primary owner). */
function isTechnicalStaffSlug(slug) {
  const n = normalizeRoleSlug(slug);
  return n === 'technical-staff' || n === 'techincal-staff';
}

function isTechnicalStaffStoreRole(req) {
  if (isTechnicalStaffSlug(req.storeRoleSlug)) return true;
  const name = req.storeRoleName != null ? String(req.storeRoleName).trim().toLowerCase() : '';
  return name === 'technical staff' || name === 'techincal staff';
}

/** master_admin with no admin_role_id: super admin — mutates platform games only; store games view-only. Scoped master_admin may manage all games. */
function isFullPlatformSuperAdmin(req) {
  return isMasterAdmin(req.role) && !req.adminRoleId;
}

async function getStorePrimaryOwnerUserId(storeCode) {
  const sc = storeCode != null ? String(storeCode).trim() : '';
  if (!sc) return null;
  const u = await db.User.findOne({
    where: { role: ROLES.STORE_ADMIN, storeCode: sc, storeRoleId: null },
    attributes: ['userId']
  });
  return u?.userId != null ? u.userId : null;
}

async function getCredentialScopeForStoreGame(game, reqUser) {
  let distributorCode = reqUser.distributorCode != null ? String(reqUser.distributorCode).trim() : '';
  let storeCode = reqUser.storeCode != null ? String(reqUser.storeCode).trim() : '';
  const addedBy = game.addedByStoreCode != null ? String(game.addedByStoreCode).trim() : '';
  if (!addedBy || (distributorCode && storeCode)) {
    return { distributorCode: distributorCode || null, storeCode: storeCode || null };
  }
  const partner = await db.User.findOne({
    where: { role: ROLES.STORE_ADMIN, storeCode: addedBy, storeRoleId: null },
    attributes: ['distributorCode', 'storeCode']
  });
  if (!distributorCode && partner?.distributorCode) {
    distributorCode = String(partner.distributorCode).trim();
  }
  if (!storeCode) {
    storeCode = (partner?.storeCode != null && String(partner.storeCode).trim()) || addedBy || '';
  }
  return { distributorCode: distributorCode || null, storeCode: storeCode || null };
}

function computeMutationsAllowed(req, row, storeOwnerUserId) {
  if (isMasterAdmin(req.role)) {
    if (!gameHasStorePartner(row)) return true;
    return !isFullPlatformSuperAdmin(req);
  }
  if (req.user.role !== 'store_admin') return false;
  if (row.addedByStoreCode !== req.user.storeCode) return false;
  if (!req.storeRoleId) return true;
  if (isTechnicalStaffStoreRole(req)) return true;
  const by = row.addedByUserId != null ? Number(row.addedByUserId) : null;
  if (by == null || Number.isNaN(by)) return true;
  const oid = storeOwnerUserId != null ? Number(storeOwnerUserId) : NaN;
  const selfId = req.user.userId != null ? Number(req.user.userId) : NaN;
  if (!Number.isNaN(oid) && by === oid) return true;
  if (!Number.isNaN(selfId) && by === selfId) return true;
  return false;
}

async function canStoreStaffMutateGame(req, game) {
  if (isTechnicalStaffStoreRole(req)) return true;
  const ownerId = await getStorePrimaryOwnerUserId(req.user.storeCode);
  const by = game.addedByUserId != null ? Number(game.addedByUserId) : null;
  if (by == null || Number.isNaN(by)) return true;
  const oid = ownerId != null ? Number(ownerId) : NaN;
  const selfId = req.user.userId != null ? Number(req.user.userId) : NaN;
  if (!Number.isNaN(oid) && by === oid) return true;
  if (!Number.isNaN(selfId) && by === selfId) return true;
  return false;
}

async function ensureCanMutateGame(req, res, game) {
  if (req.user.role === 'store_admin') {
    if (game.addedByStoreCode !== req.user.storeCode) {
      sendError(res, 'You can only change games that belong to your store.', 403);
      return false;
    }
    if (req.storeRoleId && !(await canStoreStaffMutateGame(req, game))) {
      sendError(
        res,
        'Only the primary store account can change games another staff member added, or use the account that added this game.',
        403
      );
      return false;
    }
    return true;
  }
  if (isFullPlatformSuperAdmin(req) && gameHasStorePartner(game)) {
    sendError(
      res,
      'Store-owned games can only be changed by technical staff (master admin with an assigned admin role) or the store.',
      403
    );
    return false;
  }
  return true;
}

/**
 * GET /api/admin/game-templates
 * List available game templates for the "Add game" dropdown. Returns id, name, gameKey, gameLink only (no token/url).
 * Token and bot base URL are resolved server-side when adding a game via gameTemplateId.
 */
async function listGameTemplates(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) return sendError(res, 'You don\'t have access to Games. Please contact your administrator if you need access.', 403);
    const templates = await db.GameTemplate.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']],
      attributes: ['id', 'name', 'gameKey', 'gameLink']
    });
    const list = templates.map((t) => {
      const json = t.toJSON();
      json.integrationLabel = getGameIntegrationLabel(json);
      return json;
    });
    sendSuccess(res, { list, total: list.length });
  } catch (err) {
    sendError(res, err.message || 'Failed to list game templates', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/game-templates/all (master_admin only)
 * List all game templates for management (including inactive). Returns id, name, gameKey, gameLink, isActive, created_at, updated_at.
 */
async function listAllGameTemplates(req, res) {
  try {
    const templates = await db.GameTemplate.findAll({
      order: [['name', 'ASC']],
      attributes: [
        'id', 'name', 'gameKey', 'gameLink', 'isActive',
        [db.sequelize.col('created_at'), 'createdAt'],
        [db.sequelize.col('updated_at'), 'updatedAt']
      ]
    });
    const list = templates.map((t) => t.toJSON());
    sendSuccess(res, { list, total: list.length });
  } catch (err) {
    sendError(res, err.message || 'Failed to list game templates', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/game-templates/:id (master_admin only)
 * Get one game template by id (for edit form). Returns all fields including streamlitToken, botBaseUrl.
 */
async function getGameTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid game template id', 400);
    const template = await db.GameTemplate.findByPk(id);
    if (!template) return sendError(res, 'Game template not found', 404);
    sendSuccess(res, template.toJSON());
  } catch (err) {
    sendError(res, err.message || 'Failed to get game template', err.statusCode || 500);
  }
}

/**
 * PUT /api/admin/game-templates/:id (master_admin only)
 * Update a game template. Body: name?, gameKey?, streamlitToken?, botBaseUrl?, gameLink?, isActive?.
 */
async function updateGameTemplate(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid game template id', 400);
    const template = await db.GameTemplate.findByPk(id);
    if (!template) return sendError(res, 'Game template not found', 404);
    const body = req.body || {};
    const updates = {};
    if (body.name != null) updates.name = String(body.name).trim().slice(0, 128);
    if (body.gameKey != null) updates.gameKey = String(body.gameKey).trim().slice(0, 64);
    if (body.streamlitToken != null) updates.streamlitToken = String(body.streamlitToken).trim().slice(0, 512);
    if (body.botBaseUrl != null) updates.botBaseUrl = String(body.botBaseUrl).trim().slice(0, 512);
    if (body.gameLink != null) updates.gameLink = String(body.gameLink).trim().slice(0, 512) || null;
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
    await template.update(updates);
    const json = template.toJSON();
    delete json.streamlitToken;
    sendSuccess(res, { message: 'Game template updated', template: json });
  } catch (err) {
    sendError(res, err.message || 'Failed to update game template', err.statusCode || 500);
  }
}

/**
 * POST /api/admin/game-templates
 * Create a game template. Master admin only.
 * For Vblink/UltraPanda/Egame99: name, botBaseUrl, gameLink only (no gameKey, no streamlitToken).
 * For other games: name, gameKey, streamlitToken, botBaseUrl, gameLink.
 */
async function createGameTemplate(req, res) {
  try {
    const body = req.body || {};
    const name = body.name != null ? String(body.name).trim() : '';
    let gameKey = body.gameKey != null ? String(body.gameKey).trim() : null;
    const streamlitToken = body.streamlitToken != null ? String(body.streamlitToken).trim() : null;
    const botBaseUrl = body.botBaseUrl != null ? String(body.botBaseUrl).trim() : '';
    const gameLink = body.gameLink != null ? String(body.gameLink).trim() : null;
    const isActive = body.isActive !== false;

    if (!name) return sendError(res, 'name is required', 400);
    if (!botBaseUrl) return sendError(res, 'botBaseUrl is required', 400);

    const simpleGame = isSimpleGame(name);
    const agentCredGame = isAgentCredentialGame({ name, gameKey });
    const vegasxCashierGame = isVegasXCashierGame({ name, gameKey });
    const orionStarsTerminalGame = isOrionStarsTerminalGame({ name, gameKey });
    const firekirinTerminalGame = isFirekirinTerminalGame({ name, gameKey });
    const milkywayTerminalGame = isMilkywayTerminalGame({ name, gameKey });
    const gameroomAgentGame = isGameroomAgentGame({ name, gameKey });
    const cashmachineAgentGame = isCashmachineAgentGame({ name, gameKey });
    const mafiaAgentGame = isMafiaAgentGame({ name, gameKey });
    if (agentCredGame) {
      gameKey = resolveAgentTemplateGameKey(name, gameKey);
      if (!gameKey) {
        return sendError(res, 'Could not resolve gameKey for this agent API template. Use a name like "Game Vault (Agent)" / gamevault_agent or "Juwa 2.0 (Agent)", or pass gameKey explicitly.', 400);
      }
    }
    if (!simpleGame && !agentCredGame && !vegasxCashierGame && !orionStarsTerminalGame && !firekirinTerminalGame && !milkywayTerminalGame && !gameroomAgentGame && !cashmachineAgentGame && !mafiaAgentGame) {
      if (!gameKey) return sendError(res, 'gameKey is required for this game', 400);
      if (!streamlitToken) return sendError(res, 'streamlitToken is required for this game', 400);
    }
    if ((vegasxCashierGame || orionStarsTerminalGame || firekirinTerminalGame || milkywayTerminalGame || gameroomAgentGame || cashmachineAgentGame || mafiaAgentGame) && !gameKey) {
      return sendError(res, 'gameKey is required for this game', 400);
    }

    const template = await db.GameTemplate.create({
      name: name.slice(0, 128),
      gameKey: gameKey ? gameKey.slice(0, 64) : null,
      streamlitToken: streamlitToken ? streamlitToken.slice(0, 512) : null,
      botBaseUrl: botBaseUrl.slice(0, 512),
      gameLink: gameLink ? gameLink.slice(0, 512) : null,
      isActive
    });
    const json = template.toJSON();
    delete json.streamlitToken;
    sendSuccess(res, { message: 'Game template created', template: json }, 201);
  } catch (err) {
    sendError(res, err.message || 'Failed to create game template', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/games
 * List all games (for store admin UI). Sensitive fields (botPassword, botApiKey, streamlitToken) are excluded.
 */
async function list(req, res) {
  try {
    const where = {};
    if (req.user.role === 'store_admin') {
      where.addedByStoreCode = req.user.storeCode;
    }

    if (!can(req, STORE_FEATURE_KEYS.GAMES)) return sendError(res, 'You don\'t have access to Games. Please contact your administrator if you need access.', 403);
    const games = await db.Game.findAll({
      where,
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
      attributes: getGameListQueryAttributes()
    });
    let storeOwnerUserId = null;
    if (req.user.role === 'store_admin' && req.storeRoleId && req.user.storeCode) {
      storeOwnerUserId = await getStorePrimaryOwnerUserId(req.user.storeCode);
    }
    const list = games.map((g) => {
      const row = toSafeJson(g);
      row.mutationsAllowed = computeMutationsAllowed(req, row, storeOwnerUserId);
      return row;
    });
    sendSuccess(res, { list, total: list.length });
  } catch (err) {
    sendError(res, err.message || 'Failed to list games', err.statusCode || 500);
  }
}

/** DB columns created_at / updated_at; Sequelize aliases table as model name "Game" in FROM. */
function getGameListQueryAttributes() {
  const alias = db.Game.name;
  return [
    'id',
    'name',
    'imageUrl',
    'botType',
    'botApiUrl',
    'botUsername',
    'minWithdrawalLimit',
    'maxWithdrawalLimit',
    'minDepositLimit',
    'maxDepositLimit',
    'depositDiscountPercent',
    'platformGameUrl',
    'isActive',
    'botOffline',
    'manualRedeemOnly',
    'displayOrder',
    'addedByStoreCode',
    'addedByUserId',
    'gameKey',
    'gameTemplateId',
    'kioskId',
    [db.sequelize.col(`${alias}.created_at`), 'createdAt'],
    [db.sequelize.col(`${alias}.updated_at`), 'updatedAt']
  ];
}

function getGameDetailQueryAttributes() {
  const base = getGameListQueryAttributes();
  const ts = base.slice(-2);
  const core = base.slice(0, -2);
  return [...core, 'botPassword', 'appId', 'appSecret', 'agentId', 'apiSecretKey', ...ts];
}

const LIST_RESPONSE_KEYS = [
  'id',
  'name',
  'imageUrl',
  'botType',
  'botApiUrl',
  'botUsername',
  'minWithdrawalLimit',
  'maxWithdrawalLimit',
  'minDepositLimit',
  'maxDepositLimit',
  'depositDiscountPercent',
  'platformGameUrl',
  'isActive',
  'botOffline',
  'manualRedeemOnly',
  'displayOrder',
  'addedByStoreCode',
  'addedByUserId',
  'gameKey',
  'gameTemplateId',
  'kioskId',
  'createdAt',
  'updatedAt'
];

const DETAIL_RESPONSE_KEYS = [...LIST_RESPONSE_KEYS, 'botPassword', 'appId', 'appSecret', 'agentId', 'apiSecretKey'];

function enrichGameJson(game) {
  const json = game.toJSON ? game.toJSON() : game;
  return {
    ...json,
    integrationLabel: getGameIntegrationLabel(json)
  };
}

function toSafeJson(game) {
  const json = enrichGameJson(game);
  const row = Object.fromEntries(
    LIST_RESPONSE_KEYS.filter((k) => json[k] !== undefined).map((k) => [k, json[k]])
  );
  row.integrationLabel = json.integrationLabel;
  row.displayName = getAdminGameDisplayName(json.name);
  return row;
}

function toDetailJson(game) {
  const json = enrichGameJson(game);
  const row = Object.fromEntries(
    DETAIL_RESPONSE_KEYS.filter((k) => json[k] !== undefined).map((k) => [k, json[k]])
  );
  row.integrationLabel = json.integrationLabel;
  row.displayName = getAdminGameDisplayName(json.name);
  return row;
}

/**
 * GET /api/admin/games/:id
 * Get one game including game password (for details modal). Scoped like toggle-bot-offline.
 */
async function get(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) return sendError(res, 'You don\'t have access to Games. Please contact your administrator if you need access.', 403);
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid game id', 400);
    const game = await db.Game.findByPk(id, { attributes: getGameDetailQueryAttributes() });
    if (!game) return sendError(res, 'Game not found', 404);
    if (req.user.role === 'store_admin' && game.addedByStoreCode !== req.user.storeCode) {
      return sendError(res, 'You can only view games that belong to your store.', 403);
    }
    let storeOwnerUserId = null;
    if (req.user.role === 'store_admin' && req.storeRoleId && req.user.storeCode) {
      storeOwnerUserId = await getStorePrimaryOwnerUserId(req.user.storeCode);
    }
    const detail = toDetailJson(game);
    detail.mutationsAllowed = computeMutationsAllowed(req, { ...detail, addedByUserId: game.addedByUserId }, storeOwnerUserId);
    sendSuccess(res, detail);
  } catch (err) {
    sendError(res, err.message || 'Failed to get game', err.statusCode || 500);
  }
}

/**
 * PUT /api/admin/games/:id
 * Update game. Allowed: name, platformGameUrl, minWithdrawalLimit, maxWithdrawalLimit, isActive, displayOrder,
 * gameUsername, gamePassword (when either changes: verify client via getAdminClients, generateKey, update botApiKey).
 */
async function update(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) return sendError(res, 'You don\'t have access to Games. Please contact your administrator if you need access.', 403);
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid game id', 400);
    const game = await db.Game.findByPk(id);
    if (!game) return sendError(res, 'Game not found', 404);
    if (!(await ensureCanMutateGame(req, res, game))) return;
    const body = decodePasswordBody(req.body || {});
    const gamePasswordField = body.gamePassword;
    const updates = {};
    if (body.name != null) updates.name = String(body.name).trim().slice(0, 128);
    if (body.platformGameUrl != null) updates.platformGameUrl = String(body.platformGameUrl).trim().slice(0, 512) || null;
    if (body.imageUrl != null) {
      const nextImage = String(body.imageUrl).trim().slice(0, 512);
      if (isCustomManualGame(game) && !nextImage) {
        return sendError(res, 'Game image is required for custom games.', 400);
      }
      updates.imageUrl = nextImage || null;
    }
    if (body.minWithdrawalLimit != null) {
      const v = Number(body.minWithdrawalLimit);
      if (!Number.isNaN(v) && v >= 0) updates.minWithdrawalLimit = v;
    }
    if (body.maxWithdrawalLimit != null) {
      const v = Number(body.maxWithdrawalLimit);
      if (!Number.isNaN(v) && v >= 0) updates.maxWithdrawalLimit = v;
    }
    if (body.minDepositLimit != null) {
      const v = Number(body.minDepositLimit);
      if (!Number.isNaN(v) && v >= 0) updates.minDepositLimit = v;
    }
    if (body.maxDepositLimit != null) {
      const v = Number(body.maxDepositLimit);
      if (!Number.isNaN(v) && v >= 0) updates.maxDepositLimit = v;
    }
    if (body.depositDiscountPercent != null && body.depositDiscountPercent !== '') {
      const v = Number(body.depositDiscountPercent);
      if (!Number.isFinite(v) || v < 0 || v > 100) {
        return sendError(res, 'Deposit discount must be between 0 and 100 percent.', 400);
      }
      updates.depositDiscountPercent = Math.round(v * 100) / 100;
    }
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);
    if (body.botOffline !== undefined) updates.botOffline = Boolean(body.botOffline);
    if (body.manualRedeemOnly !== undefined) updates.manualRedeemOnly = Boolean(body.manualRedeemOnly);
    if (body.displayOrder != null) {
      const v = parseInt(body.displayOrder, 10);
      if (!Number.isNaN(v) && v >= 0) updates.displayOrder = v;
    }
    // Use post-update identity so renaming bot → agent (e.g. Gamevault → GameVault2) in one
    // request still persists agentId / apiSecretKey / game_key / agent API URL.
    const nextName = updates.name != null ? updates.name : game.name;
    if (body.gameKey != null && !isCustomManualGame(game)) {
      const gk = String(body.gameKey).trim().slice(0, 64);
      updates.gameKey = gk || null;
    }
    let nextGameKey = updates.gameKey !== undefined ? updates.gameKey : game.gameKey;
    const effectiveRef = { name: nextName, gameKey: nextGameKey };
    const wasAgentCred = isAgentCredentialGame(game);
    let isAgentCred = isAgentCredentialGame(effectiveRef);
    const isSimple = isSimpleGame(nextName);
    const customManual = isCustomManualGame(game);

    if (customManual) {
      // Custom games stay manual-only; skip provider credential flows.
      if (updates.botOffline === false) {
        return sendError(res, 'Custom games stay in manual mode (no agent/bot APIs).', 400);
      }
      const actor = await buildHistoryActor(req);
      await recordGameHistoryFromUpdates(game, updates, actor);
      await game.update(updates);
      await game.reload();
      let storeOwnerUserId = null;
      if (req.user.role === 'store_admin' && req.storeRoleId && req.user.storeCode) {
        storeOwnerUserId = await getStorePrimaryOwnerUserId(req.user.storeCode);
      }
      const row = toSafeJson(game);
      row.mutationsAllowed = computeMutationsAllowed(req, row, storeOwnerUserId);
      return sendSuccess(res, { message: 'Game updated successfully', game: row });
    }

    if (isAgentCred && !wasAgentCred) {
      const resolvedKey = resolveAgentTemplateGameKey(nextName, nextGameKey)
        || (isAgentCredentialGame(effectiveRef) ? resolveGameIntegrationKey(effectiveRef) : null);
      if (resolvedKey) {
        updates.gameKey = String(resolvedKey).slice(0, 64);
        nextGameKey = updates.gameKey;
        effectiveRef.gameKey = nextGameKey;
        isAgentCred = isAgentCredentialGame(effectiveRef);
      }

      const compactTarget = compactGameKey(updates.gameKey || nextName);
      const templates = await db.GameTemplate.findAll({
        where: { isActive: true },
        attributes: ['id', 'name', 'gameKey', 'botBaseUrl', 'gameLink']
      });
      const agentTemplate = templates.find((t) => {
        const tk = compactGameKey(t.gameKey) || compactGameKey(t.name);
        return isAgentCredentialGame(t) && tk === compactTarget;
      }) || templates.find((t) => compactGameKey(t.gameKey) === compactTarget);

      if (agentTemplate) {
        updates.gameTemplateId = agentTemplate.id;
        const baseUrl = agentTemplate.botBaseUrl != null ? String(agentTemplate.botBaseUrl).trim() : '';
        if (baseUrl) updates.botApiUrl = baseUrl.slice(0, 512);
        if (body.platformGameUrl == null) {
          const gameLink = agentTemplate.gameLink != null ? String(agentTemplate.gameLink).trim() : '';
          if (gameLink) updates.platformGameUrl = gameLink.slice(0, 512);
        }
      }

      // Agent API games do not use Streamlit / bot automation keys.
      updates.botApiKey = null;
      updates.streamlitToken = null;
    }

    if (isSimple) {
      if (body.appId != null && String(body.appId).trim() !== '') {
        updates.appId = String(body.appId).trim().slice(0, 256);
      }
      // Empty string means "keep current" (UI: leave blank to keep).
      if (body.appSecret != null && String(body.appSecret).trim() !== '') {
        updates.appSecret = String(body.appSecret).slice(0, 512);
      }
    }
    if (isAgentCred) {
      if (body.agentId != null && String(body.agentId).trim() !== '') {
        updates.agentId = String(body.agentId).trim().slice(0, 256);
      }
      // Empty string means "keep current" (UI: leave blank to keep).
      if (body.apiSecretKey != null && String(body.apiSecretKey).trim() !== '') {
        updates.apiSecretKey = String(body.apiSecretKey).trim().slice(0, 512);
      }
    }

    if (isAgentCred && !wasAgentCred) {
      const nextAgentId = updates.agentId != null ? updates.agentId : game.agentId;
      const nextSecret = updates.apiSecretKey != null ? updates.apiSecretKey : game.apiSecretKey;
      if (!nextAgentId || !String(nextAgentId).trim()) {
        return sendError(res, 'agentId is required when switching to an agent API game.', 400);
      }
      if (!nextSecret || !String(nextSecret).trim()) {
        return sendError(res, 'apiSecretKey is required when switching to an agent API game.', 400);
      }
    }
    if (updates.minWithdrawalLimit != null && updates.maxWithdrawalLimit != null && updates.minWithdrawalLimit > updates.maxWithdrawalLimit) {
      return sendError(res, 'Min withdrawal limit cannot be greater than max', 400);
    }
    if (game.minWithdrawalLimit != null && updates.maxWithdrawalLimit != null && game.minWithdrawalLimit > updates.maxWithdrawalLimit) {
      return sendError(res, 'Min withdrawal limit cannot be greater than max', 400);
    }
    if (updates.minWithdrawalLimit != null && game.maxWithdrawalLimit != null && updates.minWithdrawalLimit > game.maxWithdrawalLimit) {
      return sendError(res, 'Min withdrawal limit cannot be greater than max', 400);
    }
    const nextMinDeposit = updates.minDepositLimit != null ? updates.minDepositLimit : Number(game.minDepositLimit);
    const nextMaxDeposit = updates.maxDepositLimit != null ? updates.maxDepositLimit : Number(game.maxDepositLimit);
    if (nextMaxDeposit > 0 && nextMinDeposit > nextMaxDeposit) {
      return sendError(res, 'Min deposit limit cannot be greater than max', 400);
    }

    if (body.kioskId != null || body.kiosk_id != null) {
      if (!isGoldenDragonGame(game.name, game.gameKey)) {
        return sendError(res, 'kiosk_id can only be set on Golden Dragon games.', 400);
      }
      const kioskNorm = resolveKioskIdForGoldenDragon(
        game.name,
        body.kioskId ?? body.kiosk_id,
        game.gameKey
      );
      if (!kioskNorm) return sendError(res, GOLDEN_DRAGON_KIOSK_ID_HELP, 400);
      updates.kioskId = kioskNorm;
    }

    const currentUser = String(game.botUsername || '').trim();
    const nextUser =
      body.gameUsername != null ? String(body.gameUsername).trim() : currentUser;
    if (!nextUser) {
      return sendError(res, 'Game username cannot be empty.', 400);
    }
    const userChanged = nextUser !== currentUser;
    const passChanged =
      gamePasswordField != null && String(gamePasswordField).trim() !== '';
    let credentialsHandled = false;

    const requestedOrionStarsMode = body.orionStarsApiMode != null
      ? String(body.orionStarsApiMode).trim().toLowerCase()
      : '';
    const requestedOrionStarsTemplateId = body.orionStarsGameTemplateId != null
      ? parseInt(body.orionStarsGameTemplateId, 10)
      : null;
    const requestedFirekirinMode = body.firekirinApiMode != null
      ? String(body.firekirinApiMode).trim().toLowerCase()
      : '';
    const requestedFirekirinTemplateId = body.firekirinGameTemplateId != null
      ? parseInt(body.firekirinGameTemplateId, 10)
      : null;
    const requestedMilkywayMode = body.milkywayApiMode != null
      ? String(body.milkywayApiMode).trim().toLowerCase()
      : '';
    const requestedMilkywayTemplateId = body.milkywayGameTemplateId != null
      ? parseInt(body.milkywayGameTemplateId, 10)
      : null;
    const requestedGameroomMode = body.gameroomApiMode != null
      ? String(body.gameroomApiMode).trim().toLowerCase()
      : '';
    const requestedGameroomTemplateId = body.gameroomGameTemplateId != null
      ? parseInt(body.gameroomGameTemplateId, 10)
      : null;
    const requestedCashmachineMode = body.cashmachineApiMode != null
      ? String(body.cashmachineApiMode).trim().toLowerCase()
      : '';
    const requestedCashmachineTemplateId = body.cashmachineGameTemplateId != null
      ? parseInt(body.cashmachineGameTemplateId, 10)
      : null;
    const requestedGameVaultMode = body.gameVaultApiMode != null
      ? String(body.gameVaultApiMode).trim().toLowerCase()
      : '';
    const requestedGameVaultTemplateId = body.gameVaultGameTemplateId != null
      ? parseInt(body.gameVaultGameTemplateId, 10)
      : null;
    const requestedJuwa20Mode = body.juwa20ApiMode != null
      ? String(body.juwa20ApiMode).trim().toLowerCase()
      : '';
    const requestedJuwa20TemplateId = body.juwa20GameTemplateId != null
      ? parseInt(body.juwa20GameTemplateId, 10)
      : null;
    const requestedJuwaMode = body.juwaApiMode != null
      ? String(body.juwaApiMode).trim().toLowerCase()
      : '';
    const requestedJuwaTemplateId = body.juwaGameTemplateId != null
      ? parseInt(body.juwaGameTemplateId, 10)
      : null;
    const requestedPandamasterMode = body.pandamasterApiMode != null
      ? String(body.pandamasterApiMode).trim().toLowerCase()
      : '';
    const requestedPandamasterTemplateId = body.pandamasterGameTemplateId != null
      ? parseInt(body.pandamasterGameTemplateId, 10)
      : null;

    if (requestedOrionStarsMode) {
      if (!['agent', 'bot'].includes(requestedOrionStarsMode)) {
        return sendError(res, 'Invalid OrionStars API mode. Use agent or bot.', 400);
      }
      if (!isOrionStarsGame(game)) {
        return sendError(res, 'API mode switching is only available for OrionStars games.', 400);
      }
      if (!requestedOrionStarsTemplateId || Number.isNaN(requestedOrionStarsTemplateId)) {
        return sendError(res, 'Select an OrionStars game config to apply.', 400);
      }
      const template = await db.GameTemplate.findByPk(requestedOrionStarsTemplateId);
      if (!template) return sendError(res, 'Selected OrionStars game config was not found.', 404);
      const templateGameKey = template.gameKey != null ? String(template.gameKey).trim() : '';
      const templateBotBaseUrl = template.botBaseUrl != null ? String(template.botBaseUrl).trim() : '';
      const templateStreamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
      const templateMatchesMode = requestedOrionStarsMode === 'agent'
        ? isOrionStarsTerminalGame(template)
        : isOrionStarsBotAutomationGame(template);
      if (!templateMatchesMode) {
        return sendError(res, 'Selected config does not match the requested OrionStars API mode.', 400);
      }
      if (!templateGameKey) return sendError(res, 'Selected OrionStars config is missing gameKey.', 400);
      if (!templateBotBaseUrl) return sendError(res, 'Selected OrionStars config is missing Bot base URL.', 400);
      if (requestedOrionStarsMode === 'bot' && !templateStreamlitToken) {
        return sendError(res, 'Selected OrionStars bot config is missing Streamlit token.', 400);
      }

      const nextPass = passChanged
        ? String(gamePasswordField)
        : String(game.botPassword || '');
      if (!nextPass) {
        return sendError(res, 'Existing game password is missing. Enter the store game password to switch OrionStars API mode.', 400);
      }

      const stableOrionStarsName = (
        getStoreGameDisplayName(game.name)
        || getStoreGameDisplayName(template.name)
        || String(game.name || template.name || '').trim()
      ).slice(0, 128);

      const modeGame = {
        ...(game.toJSON ? game.toJSON() : game),
        name: stableOrionStarsName || game.name,
        gameKey: templateGameKey,
        gameTemplateId: template.id,
        botApiUrl: templateBotBaseUrl,
        streamlitToken: requestedOrionStarsMode === 'bot' ? templateStreamlitToken : null,
        botUsername: nextUser,
        botPassword: nextPass
      };

      try {
        const scope = await getCredentialScopeForStoreGame(game, req.user);
        const credUpdates = await updateGameProviderCredentials(
          modeGame,
          {
            gameUsername: nextUser,
            gamePassword: nextPass
          },
          {
            moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
            kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id,
            distributorCode: scope.distributorCode,
            storeCode: scope.storeCode
          }
        );
        // Keep a stable store-facing name (e.g. "Orionstars"), never the admin
        // template title ("OrionStars Agent"). Otherwise connect-account looks up
        // the display name from GET /games and gets "Game not found."
        Object.assign(updates, {
          name: stableOrionStarsName,
          gameKey: templateGameKey.slice(0, 64),
          gameTemplateId: template.id,
          botApiUrl: templateBotBaseUrl.slice(0, 512),
          streamlitToken: requestedOrionStarsMode === 'bot' ? templateStreamlitToken.slice(0, 512) : null,
          botApiKey: requestedOrionStarsMode === 'bot' ? null : null,
          agentId: requestedOrionStarsMode === 'agent' ? null : null,
          apiSecretKey: null,
          ...credUpdates
        });
        if (requestedOrionStarsMode === 'agent') {
          updates.botApiKey = null;
          updates.streamlitToken = null;
        } else {
          updates.agentId = null;
        }
        credentialsHandled = true;
      } catch (e) {
        if (e.providerPassthrough) {
          return sendError(res, '', e.statusCode || 502, null, { passthrough: e.providerBody });
        }
        return sendError(res, e.message || 'Failed to switch OrionStars API mode', e.statusCode || 500);
      }
    }

    if (requestedFirekirinMode) {
      if (!['agent', 'bot'].includes(requestedFirekirinMode)) {
        return sendError(res, 'Invalid Firekirin API mode. Use agent or bot.', 400);
      }
      if (!isFirekirinGame(game)) {
        return sendError(res, 'API mode switching is only available for Firekirin games.', 400);
      }
      if (!requestedFirekirinTemplateId || Number.isNaN(requestedFirekirinTemplateId)) {
        return sendError(res, 'Select a Firekirin game config to apply.', 400);
      }
      const template = await db.GameTemplate.findByPk(requestedFirekirinTemplateId);
      if (!template) return sendError(res, 'Selected Firekirin game config was not found.', 404);
      const templateGameKey = template.gameKey != null ? String(template.gameKey).trim() : '';
      const templateBotBaseUrl = template.botBaseUrl != null ? String(template.botBaseUrl).trim() : '';
      const templateStreamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
      const templateMatchesMode = requestedFirekirinMode === 'agent'
        ? isFirekirinTerminalGame(template)
        : isFirekirinBotAutomationGame(template);
      if (!templateMatchesMode) {
        return sendError(res, 'Selected config does not match the requested Firekirin API mode.', 400);
      }
      if (!templateGameKey) return sendError(res, 'Selected Firekirin config is missing gameKey.', 400);
      if (!templateBotBaseUrl) return sendError(res, 'Selected Firekirin config is missing Bot base URL.', 400);
      if (requestedFirekirinMode === 'bot' && !templateStreamlitToken) {
        return sendError(res, 'Selected Firekirin bot config is missing Streamlit token.', 400);
      }

      const nextPass = passChanged
        ? String(gamePasswordField)
        : String(game.botPassword || '');
      if (!nextPass) {
        return sendError(res, 'Existing game password is missing. Enter the store game password to switch Firekirin API mode.', 400);
      }

      const modeGame = {
        ...(game.toJSON ? game.toJSON() : game),
        name: template.name || game.name,
        gameKey: templateGameKey,
        gameTemplateId: template.id,
        botApiUrl: templateBotBaseUrl,
        streamlitToken: requestedFirekirinMode === 'bot' ? templateStreamlitToken : null,
        botUsername: nextUser,
        botPassword: nextPass
      };

      try {
        const scope = await getCredentialScopeForStoreGame(game, req.user);
        const credUpdates = await updateGameProviderCredentials(
          modeGame,
          {
            gameUsername: nextUser,
            gamePassword: nextPass
          },
          {
            moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
            kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id,
            distributorCode: scope.distributorCode,
            storeCode: scope.storeCode
          }
        );
        Object.assign(updates, {
          name: resolvePersistedGameName(template, game, templateGameKey),
          gameKey: templateGameKey.slice(0, 64),
          gameTemplateId: template.id,
          botApiUrl: templateBotBaseUrl.slice(0, 512),
          streamlitToken: requestedFirekirinMode === 'bot' ? templateStreamlitToken.slice(0, 512) : null,
          apiSecretKey: null,
          ...credUpdates
        });
        if (requestedFirekirinMode === 'agent') {
          updates.botApiKey = null;
          updates.streamlitToken = null;
        } else {
          updates.agentId = null;
        }
        credentialsHandled = true;
      } catch (e) {
        if (e.providerPassthrough) {
          return sendError(res, '', e.statusCode || 502, null, { passthrough: e.providerBody });
        }
        return sendError(res, e.message || 'Failed to switch Firekirin API mode', e.statusCode || 500);
      }
    }

    if (requestedMilkywayMode) {
      if (!['agent', 'bot'].includes(requestedMilkywayMode)) {
        return sendError(res, 'Invalid Milkyway API mode. Use agent or bot.', 400);
      }
      if (!isMilkywayGame(game)) {
        return sendError(res, 'API mode switching is only available for Milkyway games.', 400);
      }
      if (!requestedMilkywayTemplateId || Number.isNaN(requestedMilkywayTemplateId)) {
        return sendError(res, 'Select a Milkyway game config to apply.', 400);
      }
      const template = await db.GameTemplate.findByPk(requestedMilkywayTemplateId);
      if (!template) return sendError(res, 'Selected Milkyway game config was not found.', 404);
      const templateGameKey = template.gameKey != null ? String(template.gameKey).trim() : '';
      const templateBotBaseUrl = template.botBaseUrl != null ? String(template.botBaseUrl).trim() : '';
      const templateStreamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
      const templateMatchesMode = requestedMilkywayMode === 'agent'
        ? isMilkywayTerminalGame(template)
        : isMilkywayBotAutomationGame(template);
      if (!templateMatchesMode) {
        return sendError(res, 'Selected config does not match the requested Milkyway API mode.', 400);
      }
      if (!templateGameKey) return sendError(res, 'Selected Milkyway config is missing gameKey.', 400);
      if (!templateBotBaseUrl) return sendError(res, 'Selected Milkyway config is missing Bot base URL.', 400);
      if (requestedMilkywayMode === 'bot' && !templateStreamlitToken) {
        return sendError(res, 'Selected Milkyway bot config is missing Streamlit token.', 400);
      }

      const nextPass = passChanged
        ? String(gamePasswordField)
        : String(game.botPassword || '');
      if (!nextPass) {
        return sendError(res, 'Existing game password is missing. Enter the store game password to switch Milkyway API mode.', 400);
      }

      const modeGame = {
        ...(game.toJSON ? game.toJSON() : game),
        name: template.name || game.name,
        gameKey: templateGameKey,
        gameTemplateId: template.id,
        botApiUrl: templateBotBaseUrl,
        streamlitToken: requestedMilkywayMode === 'bot' ? templateStreamlitToken : null,
        botUsername: nextUser,
        botPassword: nextPass
      };

      try {
        const scope = await getCredentialScopeForStoreGame(game, req.user);
        const credUpdates = await updateGameProviderCredentials(
          modeGame,
          {
            gameUsername: nextUser,
            gamePassword: nextPass
          },
          {
            moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
            kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id,
            distributorCode: scope.distributorCode,
            storeCode: scope.storeCode
          }
        );
        Object.assign(updates, {
          name: resolvePersistedGameName(template, game, templateGameKey),
          gameKey: templateGameKey.slice(0, 64),
          gameTemplateId: template.id,
          botApiUrl: templateBotBaseUrl.slice(0, 512),
          streamlitToken: requestedMilkywayMode === 'bot' ? templateStreamlitToken.slice(0, 512) : null,
          apiSecretKey: null,
          ...credUpdates
        });
        if (requestedMilkywayMode === 'agent') {
          updates.botApiKey = null;
          updates.streamlitToken = null;
        } else {
          updates.agentId = null;
        }
        credentialsHandled = true;
      } catch (e) {
        if (e.providerPassthrough) {
          return sendError(res, '', e.statusCode || 502, null, { passthrough: e.providerBody });
        }
        return sendError(res, e.message || 'Failed to switch Milkyway API mode', e.statusCode || 500);
      }
    }

    if (requestedGameroomMode) {
      if (!['agent', 'bot'].includes(requestedGameroomMode)) {
        return sendError(res, 'Invalid Gameroom API mode. Use agent or bot.', 400);
      }
      if (!isGameroomGame(game)) {
        return sendError(res, 'API mode switching is only available for Gameroom games.', 400);
      }
      if (!requestedGameroomTemplateId || Number.isNaN(requestedGameroomTemplateId)) {
        return sendError(res, 'Select a Gameroom game config to apply.', 400);
      }
      const template = await db.GameTemplate.findByPk(requestedGameroomTemplateId);
      if (!template) return sendError(res, 'Selected Gameroom game config was not found.', 404);
      const templateGameKey = template.gameKey != null ? String(template.gameKey).trim() : '';
      const templateBotBaseUrl = template.botBaseUrl != null ? String(template.botBaseUrl).trim() : '';
      const templateStreamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
      const templateMatchesMode = requestedGameroomMode === 'agent'
        ? isGameroomAgentGame(template)
        : isGameroomBotAutomationGame(template);
      if (!templateMatchesMode) {
        return sendError(res, 'Selected config does not match the requested Gameroom API mode.', 400);
      }
      if (!templateGameKey) return sendError(res, 'Selected Gameroom config is missing gameKey.', 400);
      if (!templateBotBaseUrl) return sendError(res, 'Selected Gameroom config is missing Bot base URL.', 400);
      if (requestedGameroomMode === 'bot' && !templateStreamlitToken) {
        return sendError(res, 'Selected Gameroom bot config is missing Streamlit token.', 400);
      }

      const nextPass = passChanged
        ? String(gamePasswordField)
        : String(game.botPassword || '');
      if (!nextPass) {
        return sendError(res, 'Existing game password is missing. Enter the store game password to switch Gameroom API mode.', 400);
      }

      const modeGame = {
        ...(game.toJSON ? game.toJSON() : game),
        name: template.name || game.name,
        gameKey: templateGameKey,
        gameTemplateId: template.id,
        botApiUrl: templateBotBaseUrl,
        streamlitToken: requestedGameroomMode === 'bot' ? templateStreamlitToken : null,
        botUsername: nextUser,
        botPassword: nextPass
      };

      try {
        const scope = await getCredentialScopeForStoreGame(game, req.user);
        const credUpdates = await updateGameProviderCredentials(
          modeGame,
          {
            gameUsername: nextUser,
            gamePassword: nextPass
          },
          {
            moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
            kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id,
            distributorCode: scope.distributorCode,
            storeCode: scope.storeCode
          }
        );
        Object.assign(updates, {
          name: resolvePersistedGameName(template, game, templateGameKey),
          gameKey: templateGameKey.slice(0, 64),
          gameTemplateId: template.id,
          botApiUrl: templateBotBaseUrl.slice(0, 512),
          streamlitToken: requestedGameroomMode === 'bot' ? templateStreamlitToken.slice(0, 512) : null,
          apiSecretKey: null,
          ...credUpdates
        });
        if (requestedGameroomMode === 'agent') {
          updates.botApiKey = null;
        } else {
          updates.agentId = null;
        }
        credentialsHandled = true;
      } catch (e) {
        if (e.providerPassthrough) {
          return sendError(res, '', e.statusCode || 502, null, { passthrough: e.providerBody });
        }
        return sendError(res, e.message || 'Failed to switch Gameroom API mode', e.statusCode || 500);
      }
    }

    if (requestedCashmachineMode) {
      if (!['agent', 'bot'].includes(requestedCashmachineMode)) {
        return sendError(res, 'Invalid CashMachine777 API mode. Use agent or bot.', 400);
      }
      if (!isCashmachineGame(game)) {
        return sendError(res, 'API mode switching is only available for CashMachine777 games.', 400);
      }
      if (!requestedCashmachineTemplateId || Number.isNaN(requestedCashmachineTemplateId)) {
        return sendError(res, 'Select a CashMachine777 game config to apply.', 400);
      }
      const template = await db.GameTemplate.findByPk(requestedCashmachineTemplateId);
      if (!template) return sendError(res, 'Selected CashMachine777 game config was not found.', 404);
      const templateGameKey = template.gameKey != null ? String(template.gameKey).trim() : '';
      const templateBotBaseUrl = template.botBaseUrl != null ? String(template.botBaseUrl).trim() : '';
      const templateStreamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
      const templateMatchesMode = requestedCashmachineMode === 'agent'
        ? isCashmachineAgentGame(template)
        : isCashmachineBotAutomationGame(template);
      if (!templateMatchesMode) {
        return sendError(res, 'Selected config does not match the requested CashMachine777 API mode.', 400);
      }
      if (!templateGameKey) return sendError(res, 'Selected CashMachine777 config is missing gameKey.', 400);
      if (!templateBotBaseUrl) return sendError(res, 'Selected CashMachine777 config is missing Bot base URL.', 400);
      if (requestedCashmachineMode === 'bot' && !templateStreamlitToken) {
        return sendError(res, 'Selected CashMachine777 bot config is missing Streamlit token.', 400);
      }

      const nextPass = passChanged
        ? String(gamePasswordField)
        : String(game.botPassword || '');
      if (!nextPass) {
        return sendError(res, 'Existing game password is missing. Enter the store game password to switch CashMachine777 API mode.', 400);
      }

      const modeGame = {
        ...(game.toJSON ? game.toJSON() : game),
        name: template.name || game.name,
        gameKey: templateGameKey,
        gameTemplateId: template.id,
        botApiUrl: templateBotBaseUrl,
        streamlitToken: requestedCashmachineMode === 'bot' ? templateStreamlitToken : null,
        botUsername: nextUser,
        botPassword: nextPass
      };

      try {
        const scope = await getCredentialScopeForStoreGame(game, req.user);
        const credUpdates = await updateGameProviderCredentials(
          modeGame,
          {
            gameUsername: nextUser,
            gamePassword: nextPass
          },
          {
            moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
            kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id,
            distributorCode: scope.distributorCode,
            storeCode: scope.storeCode
          }
        );
        Object.assign(updates, {
          name: resolvePersistedGameName(template, game, templateGameKey),
          gameKey: templateGameKey.slice(0, 64),
          gameTemplateId: template.id,
          botApiUrl: templateBotBaseUrl.slice(0, 512),
          streamlitToken: requestedCashmachineMode === 'bot' ? templateStreamlitToken.slice(0, 512) : null,
          apiSecretKey: null,
          ...credUpdates
        });
        if (requestedCashmachineMode === 'agent') {
          updates.botApiKey = null;
        } else {
          updates.agentId = null;
        }
        credentialsHandled = true;
      } catch (e) {
        if (e.providerPassthrough) {
          return sendError(res, '', e.statusCode || 502, null, { passthrough: e.providerBody });
        }
        return sendError(res, e.message || 'Failed to switch CashMachine777 API mode', e.statusCode || 500);
      }
    }

    if (requestedGameVaultMode) {
      if (!['agent', 'bot'].includes(requestedGameVaultMode)) {
        return sendError(res, 'Invalid Game Vault API mode. Use agent or bot.', 400);
      }
      if (!isGameVaultFamilyGame(game)) {
        return sendError(res, 'API mode switching is only available for Game Vault games.', 400);
      }
      if (!requestedGameVaultTemplateId || Number.isNaN(requestedGameVaultTemplateId)) {
        return sendError(res, 'Select a Game Vault game config to apply.', 400);
      }
      const template = await db.GameTemplate.findByPk(requestedGameVaultTemplateId);
      if (!template) return sendError(res, 'Selected Game Vault game config was not found.', 404);
      const templateGameKey = template.gameKey != null ? String(template.gameKey).trim() : '';
      const templateBotBaseUrl = template.botBaseUrl != null ? String(template.botBaseUrl).trim() : '';
      const templateStreamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
      const templateMatchesMode = requestedGameVaultMode === 'agent'
        ? isGameVaultAgentGame(template)
        : isGameVaultBotAutomationGame(template);
      if (!templateMatchesMode) {
        return sendError(res, 'Selected config does not match the requested Game Vault API mode.', 400);
      }
      if (!templateGameKey) return sendError(res, 'Selected Game Vault config is missing gameKey.', 400);
      if (!templateBotBaseUrl) return sendError(res, 'Selected Game Vault config is missing Bot base URL.', 400);
      if (requestedGameVaultMode === 'bot' && !templateStreamlitToken) {
        return sendError(res, 'Selected Game Vault bot config is missing Streamlit token.', 400);
      }

      const nextPass = passChanged
        ? String(gamePasswordField)
        : String(game.botPassword || '');
      if (!nextPass) {
        return sendError(res, 'Existing game password is missing. Enter the store game password to switch Game Vault API mode.', 400);
      }

      try {
        if (requestedGameVaultMode === 'agent') {
          const nextAgentId = body.agentId != null
            ? String(body.agentId).trim()
            : String(game.agentId || '').trim();
          const nextApiSecret = body.apiSecretKey != null && String(body.apiSecretKey).trim()
            ? String(body.apiSecretKey).trim()
            : String(game.apiSecretKey || '').trim();
          if (!nextAgentId) return sendError(res, 'Agent ID is required when switching to Game Vault Agent API.', 400);
          if (!nextApiSecret) return sendError(res, 'API secret key is required when switching to Game Vault Agent API.', 400);
          const { validateGameVaultAgentCredentials } = require('../../services/games/gamevault.helpers');
          await validateGameVaultAgentCredentials(templateBotBaseUrl, nextAgentId, nextApiSecret);
          Object.assign(updates, {
            name: resolvePersistedGameName(template, game, templateGameKey),
            gameKey: templateGameKey.slice(0, 64),
            gameTemplateId: template.id,
            botApiUrl: templateBotBaseUrl.slice(0, 512),
            botUsername: nextUser.slice(0, 256),
            botPassword: nextPass.slice(0, 256),
            streamlitToken: null,
            botApiKey: null,
            agentId: nextAgentId.slice(0, 256),
            apiSecretKey: nextApiSecret.slice(0, 512)
          });
        } else {
          const scope = await getCredentialScopeForStoreGame(game, req.user);
          const modeGame = {
            ...(game.toJSON ? game.toJSON() : game),
            name: template.name || game.name,
            gameKey: templateGameKey,
            gameTemplateId: template.id,
            botApiUrl: templateBotBaseUrl,
            streamlitToken: templateStreamlitToken,
            botUsername: nextUser,
            botPassword: nextPass,
            agentId: null,
            apiSecretKey: null
          };
          const credUpdates = await updateGameProviderCredentials(
            modeGame,
            { gameUsername: nextUser, gamePassword: nextPass },
            {
              moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
              kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id,
              distributorCode: scope.distributorCode,
              storeCode: scope.storeCode
            }
          );
          Object.assign(updates, {
            name: resolvePersistedGameName(template, game, templateGameKey),
            gameKey: templateGameKey.slice(0, 64),
            gameTemplateId: template.id,
            botApiUrl: templateBotBaseUrl.slice(0, 512),
            streamlitToken: templateStreamlitToken.slice(0, 512),
            agentId: null,
            apiSecretKey: null,
            ...credUpdates
          });
        }
        credentialsHandled = true;
      } catch (e) {
        if (e.providerPassthrough) {
          return sendError(res, '', e.statusCode || 502, null, { passthrough: e.providerBody });
        }
        return sendError(res, e.message || 'Failed to switch Game Vault API mode', e.statusCode || 500);
      }
    }

    if (requestedJuwa20Mode) {
      if (!['agent', 'bot'].includes(requestedJuwa20Mode)) {
        return sendError(res, 'Invalid Juwa 2.0 API mode. Use agent or bot.', 400);
      }
      if (!isJuwa20FamilyGame(game)) {
        return sendError(res, 'API mode switching is only available for Juwa 2.0 games.', 400);
      }
      if (!requestedJuwa20TemplateId || Number.isNaN(requestedJuwa20TemplateId)) {
        return sendError(res, 'Select a Juwa 2.0 game config to apply.', 400);
      }
      const template = await db.GameTemplate.findByPk(requestedJuwa20TemplateId);
      if (!template) return sendError(res, 'Selected Juwa 2.0 game config was not found.', 404);
      const templateGameKey = template.gameKey != null ? String(template.gameKey).trim() : '';
      const templateBotBaseUrl = template.botBaseUrl != null ? String(template.botBaseUrl).trim() : '';
      const templateStreamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
      const templateMatchesMode = requestedJuwa20Mode === 'agent'
        ? isJuwa20AgentGame(template)
        : isJuwa20BotAutomationGame(template);
      if (!templateMatchesMode) {
        return sendError(res, 'Selected config does not match the requested Juwa 2.0 API mode.', 400);
      }
      if (!templateGameKey) return sendError(res, 'Selected Juwa 2.0 config is missing gameKey.', 400);
      if (!templateBotBaseUrl) return sendError(res, 'Selected Juwa 2.0 config is missing Bot base URL.', 400);
      if (requestedJuwa20Mode === 'bot' && !templateStreamlitToken) {
        return sendError(res, 'Selected Juwa 2.0 bot config is missing Streamlit token.', 400);
      }

      const nextPass = passChanged
        ? String(gamePasswordField)
        : String(game.botPassword || '');
      if (!nextPass) {
        return sendError(res, 'Existing game password is missing. Enter the store game password to switch Juwa 2.0 API mode.', 400);
      }

      try {
        if (requestedJuwa20Mode === 'agent') {
          const nextAgentId = body.agentId != null
            ? String(body.agentId).trim()
            : String(game.agentId || '').trim();
          const nextApiSecret = body.apiSecretKey != null && String(body.apiSecretKey).trim()
            ? String(body.apiSecretKey).trim()
            : String(game.apiSecretKey || '').trim();
          if (!nextAgentId) return sendError(res, 'Agent ID is required when switching to Juwa 2.0 Agent API.', 400);
          if (!nextApiSecret) return sendError(res, 'API secret key is required when switching to Juwa 2.0 Agent API.', 400);
          const { validateGameVaultAgentCredentials } = require('../../services/games/gamevault.helpers');
          await validateGameVaultAgentCredentials(templateBotBaseUrl, nextAgentId, nextApiSecret);
          Object.assign(updates, {
            name: resolvePersistedGameName(template, game, templateGameKey),
            gameKey: templateGameKey.slice(0, 64),
            gameTemplateId: template.id,
            botApiUrl: templateBotBaseUrl.slice(0, 512),
            botUsername: nextUser.slice(0, 256),
            botPassword: nextPass.slice(0, 256),
            streamlitToken: null,
            botApiKey: null,
            agentId: nextAgentId.slice(0, 256),
            apiSecretKey: nextApiSecret.slice(0, 512)
          });
        } else {
          const scope = await getCredentialScopeForStoreGame(game, req.user);
          const modeGame = {
            ...(game.toJSON ? game.toJSON() : game),
            name: template.name || game.name,
            gameKey: templateGameKey,
            gameTemplateId: template.id,
            botApiUrl: templateBotBaseUrl,
            streamlitToken: templateStreamlitToken,
            botUsername: nextUser,
            botPassword: nextPass,
            agentId: null,
            apiSecretKey: null
          };
          const credUpdates = await updateGameProviderCredentials(
            modeGame,
            { gameUsername: nextUser, gamePassword: nextPass },
            {
              moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
              kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id,
              distributorCode: scope.distributorCode,
              storeCode: scope.storeCode
            }
          );
          Object.assign(updates, {
            name: resolvePersistedGameName(template, game, templateGameKey),
            gameKey: templateGameKey.slice(0, 64),
            gameTemplateId: template.id,
            botApiUrl: templateBotBaseUrl.slice(0, 512),
            streamlitToken: templateStreamlitToken.slice(0, 512),
            agentId: null,
            apiSecretKey: null,
            ...credUpdates
          });
        }
        credentialsHandled = true;
      } catch (e) {
        if (e.providerPassthrough) {
          return sendError(res, '', e.statusCode || 502, null, { passthrough: e.providerBody });
        }
        return sendError(res, e.message || 'Failed to switch Juwa 2.0 API mode', e.statusCode || 500);
      }
    }

    if (requestedJuwaMode) {
      const normalizedJuwaMode = normalizeJuwaApiMode(requestedJuwaMode);
      if (!normalizedJuwaMode) {
        return sendError(res, 'Invalid Juwa API mode. Use bot or agent.', 400);
      }
      if (!isJuwaFamilyGame(game)) {
        return sendError(res, 'API mode switching is only available for Juwa games.', 400);
      }
      if (!requestedJuwaTemplateId || Number.isNaN(requestedJuwaTemplateId)) {
        return sendError(res, 'Select a Juwa game config to apply.', 400);
      }
      const template = await db.GameTemplate.findByPk(requestedJuwaTemplateId);
      if (!template) return sendError(res, 'Selected Juwa game config was not found.', 404);
      const templateGameKey = template.gameKey != null ? String(template.gameKey).trim() : '';
      const templateBotBaseUrl = template.botBaseUrl != null ? String(template.botBaseUrl).trim() : '';
      let templateStreamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
      if (!juwaTemplateMatchesApiMode(template, normalizedJuwaMode)) {
        return sendError(res, 'Selected config does not match the requested Juwa API mode.', 400);
      }
      if (!templateGameKey) return sendError(res, 'Selected Juwa config is missing gameKey.', 400);
      if (!templateBotBaseUrl) return sendError(res, 'Selected Juwa config is missing Bot base URL.', 400);
      if (normalizedJuwaMode === 'bot' && isJuwaNewBotGame(template.name, templateGameKey)) {
        const { resolveJuwaNewBotAdminToken } = require('../../services/games/juwa.config');
        templateStreamlitToken = resolveJuwaNewBotAdminToken(template.streamlitToken) || '';
        if (!templateStreamlitToken) {
          return sendError(
            res,
            'Juwa new bot admin token is not configured. Master admin must set streamlit_token on the Juwa new bot template.',
            400
          );
        }
      } else if (normalizedJuwaMode === 'bot' && !templateStreamlitToken) {
        return sendError(res, 'Selected Juwa bot config is missing Streamlit token.', 400);
      }

      const nextPass = passChanged
        ? String(gamePasswordField)
        : String(game.botPassword || '');
      if (!nextPass) {
        return sendError(res, 'Existing game password is missing. Enter the store game password to switch Juwa API mode.', 400);
      }

      try {
        if (normalizedJuwaMode === 'agent') {
          const nextAgentId = body.agentId != null
            ? String(body.agentId).trim()
            : String(game.agentId || '').trim();
          const nextApiSecret = body.apiSecretKey != null && String(body.apiSecretKey).trim()
            ? String(body.apiSecretKey).trim()
            : String(game.apiSecretKey || '').trim();
          if (!nextAgentId) return sendError(res, 'Agent ID is required when switching to Juwa Agent API.', 400);
          if (!nextApiSecret) return sendError(res, 'API secret key is required when switching to Juwa Agent API.', 400);
          const { validateGameVaultAgentCredentials } = require('../../services/games/gamevault.helpers');
          await validateGameVaultAgentCredentials(templateBotBaseUrl, nextAgentId, nextApiSecret);
          Object.assign(updates, {
            name: resolvePersistedGameName(template, game, templateGameKey),
            gameKey: templateGameKey.slice(0, 64),
            gameTemplateId: template.id,
            botApiUrl: templateBotBaseUrl.slice(0, 512),
            botUsername: nextUser.slice(0, 256),
            botPassword: nextPass.slice(0, 256),
            streamlitToken: null,
            botApiKey: null,
            agentId: nextAgentId.slice(0, 256),
            apiSecretKey: nextApiSecret.slice(0, 512)
          });
        } else {
          const scope = await getCredentialScopeForStoreGame(game, req.user);
          const modeGame = {
            ...(game.toJSON ? game.toJSON() : game),
            name: template.name || game.name,
            gameKey: templateGameKey,
            gameTemplateId: template.id,
            botApiUrl: templateBotBaseUrl,
            streamlitToken: templateStreamlitToken,
            botUsername: nextUser,
            botPassword: nextPass,
            agentId: null,
            apiSecretKey: null
          };
          const credUpdates = await updateGameProviderCredentials(
            modeGame,
            { gameUsername: nextUser, gamePassword: nextPass },
            {
              moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
              kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id,
              distributorCode: scope.distributorCode,
              storeCode: scope.storeCode
            }
          );
          Object.assign(updates, {
            name: resolvePersistedGameName(template, game, templateGameKey),
            gameKey: templateGameKey.slice(0, 64),
            gameTemplateId: template.id,
            botApiUrl: templateBotBaseUrl.slice(0, 512),
            streamlitToken: templateStreamlitToken.slice(0, 512),
            agentId: null,
            apiSecretKey: null,
            ...credUpdates
          });
        }
        credentialsHandled = true;
      } catch (e) {
        if (e.providerPassthrough) {
          return sendError(res, '', e.statusCode || 502, null, { passthrough: e.providerBody });
        }
        return sendError(res, e.message || 'Failed to switch Juwa API mode', e.statusCode || 500);
      }
    }

    if (requestedPandamasterMode) {
      const normalizedPandamasterMode = normalizePandamasterApiMode(requestedPandamasterMode);
      if (!normalizedPandamasterMode) {
        return sendError(res, 'Invalid Pandamaster API mode. Use legacy or newbot.', 400);
      }
      if (!isPandamasterFamilyGame(game)) {
        return sendError(res, 'API mode switching is only available for Pandamaster games.', 400);
      }
      if (!requestedPandamasterTemplateId || Number.isNaN(requestedPandamasterTemplateId)) {
        return sendError(res, 'Select a Pandamaster game config to apply.', 400);
      }
      const template = await db.GameTemplate.findByPk(requestedPandamasterTemplateId);
      if (!template) return sendError(res, 'Selected Pandamaster game config was not found.', 404);
      const templateGameKey = template.gameKey != null ? String(template.gameKey).trim() : '';
      const templateBotBaseUrl = template.botBaseUrl != null ? String(template.botBaseUrl).trim() : '';
      let templateStreamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
      if (!pandamasterTemplateMatchesApiMode(template, normalizedPandamasterMode)) {
        return sendError(res, 'Selected config does not match the requested Pandamaster API mode.', 400);
      }
      if (!templateGameKey) return sendError(res, 'Selected Pandamaster config is missing gameKey.', 400);
      if (!templateBotBaseUrl) return sendError(res, 'Selected Pandamaster config is missing Bot base URL.', 400);
      if (normalizedPandamasterMode === 'newbot' && isPandamasterNewBotGame(template.name, templateGameKey)) {
        const { resolvePandamasterNewBotAdminToken } = require('../../services/games/pandamaster.config');
        templateStreamlitToken = resolvePandamasterNewBotAdminToken(template.streamlitToken) || '';
        if (!templateStreamlitToken) {
          return sendError(
            res,
            'Pandamaster new bot admin token is not configured. Master admin must set streamlit_token on the Pandamaster new bot template.',
            400
          );
        }
      } else if (!templateStreamlitToken) {
        return sendError(res, 'Selected Pandamaster bot config is missing Streamlit token.', 400);
      }

      const nextPass = passChanged
        ? String(gamePasswordField)
        : String(game.botPassword || '');
      if (!nextPass) {
        return sendError(res, 'Existing game password is missing. Enter the store game password to switch Pandamaster API mode.', 400);
      }

      try {
        const scope = await getCredentialScopeForStoreGame(game, req.user);
        const modeGame = {
          ...(game.toJSON ? game.toJSON() : game),
          name: template.name || game.name,
          gameKey: templateGameKey,
          gameTemplateId: template.id,
          botApiUrl: templateBotBaseUrl,
          streamlitToken: templateStreamlitToken,
          botUsername: nextUser,
          botPassword: nextPass
        };
        const credUpdates = await updateGameProviderCredentials(
          modeGame,
          { gameUsername: nextUser, gamePassword: nextPass },
          {
            moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
            kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id,
            distributorCode: scope.distributorCode,
            storeCode: scope.storeCode
          }
        );
        Object.assign(updates, {
          name: resolvePersistedGameName(template, game, templateGameKey),
          gameKey: templateGameKey.slice(0, 64),
          gameTemplateId: template.id,
          botApiUrl: templateBotBaseUrl.slice(0, 512),
          streamlitToken: templateStreamlitToken.slice(0, 512),
          ...credUpdates
        });
        credentialsHandled = true;
      } catch (e) {
        if (e.providerPassthrough) {
          return sendError(res, '', e.statusCode || 502, null, { passthrough: e.providerBody });
        }
        return sendError(res, e.message || 'Failed to switch Pandamaster API mode', e.statusCode || 500);
      }
    }

    if (!credentialsHandled && (userChanged || passChanged)) {
      if (isSimple || isAgentCred) {
        updates.botUsername = nextUser.slice(0, 256);
        if (passChanged) updates.botPassword = String(gamePasswordField).slice(0, 256);
      } else {
        if (userChanged && !passChanged) {
          return sendError(
            res,
            'When changing the game username, enter the password for that account.',
            400
          );
        }
        const nextPass = passChanged
          ? String(gamePasswordField)
          : String(game.botPassword || '');
        if (!nextPass) {
          return sendError(
            res,
            'Provide the game password to update credentials (or only password).',
            400
          );
        }
        try {
          const scope = await getCredentialScopeForStoreGame(game, req.user);
          const credUpdates = await updateGameProviderCredentials(
          game,
          {
            gameUsername: nextUser,
            gamePassword: nextPass
          },
          {
            moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
            kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id,
            distributorCode: scope.distributorCode,
            storeCode: scope.storeCode
          }
        );
          Object.assign(updates, credUpdates);
        } catch (e) {
          if (e.providerPassthrough) {
            return sendError(res, '', e.statusCode || 502, null, { passthrough: e.providerBody });
          }
          return sendError(res, e.message || 'Failed to update game credentials', e.statusCode || 500);
        }
      }
    }

    const agentCredsChanging = updates.agentId != null || updates.apiSecretKey != null || (isAgentCred && !wasAgentCred);
    if (isAgentCred && agentCredsChanging) {
      const { validateGameVaultAgentCredentials } = require('../../services/games/gamevault.helpers');
      const nextAgentId = updates.agentId != null ? updates.agentId : game.agentId;
      const nextSecret = updates.apiSecretKey != null ? updates.apiSecretKey : game.apiSecretKey;

      // Prefer template agent API base URL when converting or when store still has a legacy bot URL.
      if (updates.botApiUrl == null) {
        const compactTarget = compactGameKey(updates.gameKey != null ? updates.gameKey : (game.gameKey || nextName));
        const templates = await db.GameTemplate.findAll({
          where: { isActive: true },
          attributes: ['id', 'name', 'gameKey', 'botBaseUrl']
        });
        const agentTemplate = templates.find((t) => {
          const tk = compactGameKey(t.gameKey) || compactGameKey(t.name);
          return isAgentCredentialGame(t) && tk === compactTarget;
        }) || templates.find((t) => compactGameKey(t.gameKey) === compactTarget);
        const baseUrl = agentTemplate?.botBaseUrl != null ? String(agentTemplate.botBaseUrl).trim() : '';
        if (baseUrl) {
          updates.botApiUrl = baseUrl.slice(0, 512);
          if (agentTemplate.id && updates.gameTemplateId == null && game.gameTemplateId == null) {
            updates.gameTemplateId = agentTemplate.id;
          }
          if (updates.gameKey == null && !game.gameKey) {
            const resolvedKey = resolveAgentTemplateGameKey(nextName, game.gameKey)
              || resolveGameIntegrationKey({ name: nextName, gameKey: agentTemplate.gameKey });
            if (resolvedKey) updates.gameKey = String(resolvedKey).slice(0, 64);
          }
        }
      }

      const validateUrl = updates.botApiUrl != null ? updates.botApiUrl : game.botApiUrl;
      if (nextAgentId && nextSecret) {
        try {
          await validateGameVaultAgentCredentials(validateUrl, nextAgentId, nextSecret);
        } catch (e) {
          return sendError(res, e.message || 'Invalid GameVault agent credentials', e.statusCode || 400);
        }
      }
      // Drop leftover bot-automation credentials once agent API creds are in use.
      if (updates.botApiKey === undefined && game.botApiKey) updates.botApiKey = null;
      if (updates.streamlitToken === undefined && game.streamlitToken) updates.streamlitToken = null;
    }

    const actor = await buildHistoryActor(req);
    await recordGameHistoryFromUpdates(game, updates, actor);
    await game.update(updates);
    await game.reload();
    let storeOwnerUserId = null;
    if (req.user.role === 'store_admin' && req.storeRoleId && req.user.storeCode) {
      storeOwnerUserId = await getStorePrimaryOwnerUserId(req.user.storeCode);
    }
    const row = toSafeJson(game);
    row.mutationsAllowed = computeMutationsAllowed(req, row, storeOwnerUserId);
    sendSuccess(res, { message: 'Game updated successfully', game: row });
  } catch (err) {
    sendError(res, err.message || 'Failed to update game', err.statusCode || 500);
  }
}

/**
 * DELETE /api/admin/games/:id
 * Deletes all linked data (user accounts, activity, manual requests, alerts) then the game.
 * Store/master scope same as update.
 */
async function remove(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) return sendError(res, 'You don\'t have access to Games. Please contact your administrator if you need access.', 403);
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid game id', 400);
    const game = await db.Game.findByPk(id);
    if (!game) return sendError(res, 'Game not found', 404);
    if (!(await ensureCanMutateGame(req, res, game))) return;

    const actor = await buildHistoryActor(req);

    const t = await db.sequelize.transaction();
    try {
      if (db.GameManualRequest) {
        await db.GameManualRequest.destroy({ where: { gameId: id }, transaction: t });
      }
      if (db.GameManualModeAlertSent) {
        await db.GameManualModeAlertSent.destroy({ where: { gameId: id }, transaction: t });
      }
      if (db.GameBalanceAlertSent) {
        await db.GameBalanceAlertSent.destroy({ where: { gameId: id }, transaction: t });
      }
      if (db.GameActivity) {
        await db.GameActivity.destroy({ where: { gameId: id }, transaction: t });
      }
      if (db.UserGameAccount) {
        await db.UserGameAccount.destroy({ where: { gameId: id }, transaction: t });
      }
      await game.destroy({ transaction: t });
      await t.commit();
      await recordGameHistoryDeleted(game, actor);
      sendSuccess(res, { message: 'Game and all linked accounts and activity have been deleted successfully.' });
    } catch (innerErr) {
      await t.rollback();
      throw innerErr;
    }
  } catch (err) {
    if (err.name === 'SequelizeForeignKeyConstraintError') {
      return sendError(res, 'Cannot delete game: it has linked data that could not be removed.', 400);
    }
    sendError(res, err.message || 'Failed to delete game', err.statusCode || 500);
  }
}

/** Resolve store scope when creating a game (store admin uses own store; master admin may pass storeCode). */
async function resolveCreateGameStoreScope(req, body) {
  if (req.user.role === ROLES.STORE_ADMIN) {
    const sc = req.user.storeCode != null ? String(req.user.storeCode).trim() : '';
    const dc = req.user.distributorCode != null ? String(req.user.distributorCode).trim() : '';
    return {
      addedByStoreCode: sc || null,
      distributorCode: dc || null,
      storeCode: sc || null
    };
  }
  if (!isMasterAdmin(req.role)) {
    const sc = req.user.storeCode != null ? String(req.user.storeCode).trim() : '';
    return {
      addedByStoreCode: sc || null,
      distributorCode: req.user.distributorCode || null,
      storeCode: sc || null
    };
  }

  const requested = body.storeCode != null ? String(body.storeCode).trim() : '';
  if (!requested) {
    return { addedByStoreCode: null, distributorCode: null, storeCode: null };
  }

  const partner = await db.User.findOne({
    where: { role: ROLES.STORE_ADMIN, storeCode: requested, storeRoleId: null },
    attributes: ['distributorCode', 'storeCode']
  });
  if (!partner) {
    const err = new Error('Selected store was not found.');
    err.statusCode = 400;
    throw err;
  }
  const sc = String(partner.storeCode).trim();
  const dc = partner.distributorCode != null ? String(partner.distributorCode).trim() : null;
  return {
    addedByStoreCode: sc,
    distributorCode: dc,
    storeCode: sc
  };
}

/**
 * POST /api/admin/games
 * Add a new game.
 * - If gameTemplateId is provided: use template's gameKey, streamlitToken, botBaseUrl, gameLink (no token/url in body).
 * - Otherwise (legacy): body must include gameName, gameLink, streamlit-token, bot-base-url.
 * Body (template flow): gameTemplateId, gameUsername, gamePassword, minWithdrawalLimit?, maxWithdrawalLimit?.
 * Body (legacy): gameName, gameUsername, gamePassword, gameLink, streamlit-token, bot-base-url, minWithdrawalLimit?, maxWithdrawalLimit?.
 * Master admin: optional storeCode to assign the game to a store (otherwise platform-wide).
 */
async function create(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) return sendError(res, 'You don\'t have access to Games. Please contact your administrator if you need access.', 403);
    const body = decodePasswordBody(req.body || {});
    const storeScope = await resolveCreateGameStoreScope(req, body);
    const gameTemplateId = body.gameTemplateId != null ? parseInt(body.gameTemplateId, 10) : null;
    let payload;

    if (gameTemplateId != null && !Number.isNaN(gameTemplateId)) {
      const template = await db.GameTemplate.findByPk(gameTemplateId);
      if (!template) return sendError(res, 'Selected game template not found.', 404);
      const botBaseUrl = template.botBaseUrl != null ? String(template.botBaseUrl).trim() : '';
      const gameLink = template.gameLink != null ? String(template.gameLink).trim() : '';
      const templateGameKey = template.gameKey != null ? String(template.gameKey).trim() : '';
      const orionStarsBotAutomationGame = isOrionStarsBotAutomationGame(template);
      const firekirinBotAutomationGame = isFirekirinBotAutomationGame(template);
      const firekirinTerminalGame = isFirekirinTerminalGame(template);
      const milkywayBotAutomationGame = isMilkywayBotAutomationGame(template);
      const milkywayTerminalGame = isMilkywayTerminalGame(template);
      const gameroomBotAutomationGame = isGameroomBotAutomationGame(template);
      const gameroomAgentGame = isGameroomAgentGame(template);
      const cashmachineBotAutomationGame = isCashmachineBotAutomationGame(template);
      const cashmachineAgentGame = isCashmachineAgentGame(template);
      const mafiaAgentGame = isMafiaAgentGame(template);
      const juwaBotAutomationGame = isJuwaBotAutomationGame(template);
      const pandamasterBotAutomationGame = isPandamasterBotAutomationGame(template);
      const gameName = (orionStarsBotAutomationGame || firekirinBotAutomationGame || firekirinTerminalGame
        || milkywayBotAutomationGame || milkywayTerminalGame
        || gameroomBotAutomationGame || gameroomAgentGame
        || cashmachineBotAutomationGame || cashmachineAgentGame || mafiaAgentGame
        || juwaBotAutomationGame || pandamasterBotAutomationGame)
        ? (template.name || '').trim()
        : (templateGameKey || (template.name || '').trim());
      if (!gameName) return sendError(res, 'Game template has no name.', 400);
      if (!gameLink) return sendError(res, 'This game template is missing the game link. Please contact your administrator.', 400);

      if (isJuwaFamilyGame(template) || isJuwaNewBotGame(template.name, templateGameKey)) {
        const existingJuwa = await findStoreJuwaFamilyGame(storeScope.addedByStoreCode);
        if (existingJuwa) {
          return sendError(
            res,
            'This store already has a Juwa game. Edit that game and switch Juwa API mode to "New bot (4.0)" instead of adding a second Juwa game — player accounts stay on the same game.',
            400
          );
        }
      }

      if (isPandamasterFamilyGame(template) || isPandamasterNewBotGame(template.name, templateGameKey)) {
        const existingPandamaster = await findStorePandamasterFamilyGame(storeScope.addedByStoreCode);
        if (existingPandamaster) {
          return sendError(
            res,
            'This store already has a Pandamaster game. Edit that game and switch Pandamaster API mode to "New bot (2.0)" instead of adding a second Pandamaster game — player accounts stay on the same game.',
            400
          );
        }
      }

      const simpleGame = isSimpleGame(template.name);
      const agentCredGame = isAgentCredentialGame(template);
      const vegasxCashierGame = isVegasXCashierGame(template);
      const orionStarsTerminalGame = isOrionStarsTerminalGame(template);
      if (simpleGame) {
        const appId = body.appId != null ? String(body.appId).trim() : '';
        const appSecret = body.appSecret != null ? String(body.appSecret) : '';
        if (!appId) return sendError(res, 'appId is required for this game.', 400);
        if (!appSecret) return sendError(res, 'appSecret is required for this game.', 400);
        payload = {
          gameName: template.name.trim(),
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          botBaseUrl: botBaseUrl || undefined,
          appId,
          appSecret,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope
        };
      } else if (vegasxCashierGame) {
        if (!botBaseUrl) return sendError(res, 'This game template is missing the bot base URL. Please contact your administrator.', 400);
        payload = {
          gameName,
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          botBaseUrl,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope
        };
      } else if (orionStarsTerminalGame) {
        if (!botBaseUrl) return sendError(res, 'This game template is missing the bot base URL. Please contact your administrator.', 400);
        const streamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
        const storeFacingName = getStoreGameDisplayName(template.name || templateGameKey || gameName)
          || String(template.name || templateGameKey || gameName).trim();
        payload = {
          gameName: storeFacingName,
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          botBaseUrl,
          streamlitToken: streamlitToken || undefined,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope
        };
      } else if (firekirinTerminalGame) {
        if (!botBaseUrl) return sendError(res, 'This game template is missing the bot base URL. Please contact your administrator.', 400);
        payload = {
          gameName,
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          botBaseUrl,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope
        };
      } else if (milkywayTerminalGame) {
        if (!botBaseUrl) return sendError(res, 'This game template is missing the bot base URL. Please contact your administrator.', 400);
        payload = {
          gameName,
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          botBaseUrl,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope
        };
      } else if (gameroomAgentGame) {
        if (!botBaseUrl) return sendError(res, 'This game template is missing the bot base URL. Please contact your administrator.', 400);
        payload = {
          gameName,
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          botBaseUrl,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope
        };
      } else if (cashmachineAgentGame) {
        if (!botBaseUrl) return sendError(res, 'This game template is missing the bot base URL. Please contact your administrator.', 400);
        payload = {
          gameName,
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          botBaseUrl,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope
        };
      } else if (mafiaAgentGame) {
        if (!botBaseUrl) return sendError(res, 'This game template is missing the bot base URL. Please contact your administrator.', 400);
        payload = {
          gameName,
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          botBaseUrl,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          ...storeScope
        };
      } else if (agentCredGame) {
        const agentId = body.agentId != null ? String(body.agentId).trim() : '';
        const apiSecretKey = body.apiSecretKey != null ? String(body.apiSecretKey).trim() : '';
        if (!agentId) return sendError(res, 'agentId is required for this game.', 400);
        if (!apiSecretKey) return sendError(res, 'apiSecretKey is required for this game.', 400);
        if (!botBaseUrl) return sendError(res, 'This game template is missing the bot base URL. Please contact your administrator.', 400);
        payload = {
          gameName: template.name.trim(),
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          botBaseUrl,
          agentId,
          apiSecretKey,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope
        };
      } else if (isGoldenDragonGame(template.name, templateGameKey)) {
        const { resolveGoldenDragonAdminToken } = require('../../services/games/goldenDragon.config');
        const streamlitToken = resolveGoldenDragonAdminToken(template.streamlitToken);
        if (!botBaseUrl) {
          return sendError(res, 'This game template is missing the bot base URL. Please contact your administrator.', 400);
        }
        if (!streamlitToken) {
          return sendError(
            res,
            'Golden Dragon admin token is not configured. Master admin must set streamlit_token on the Golden Dragon template (same value as STREAMLIT_ADMIN_PASSWORD on the bot server).',
            400
          );
        }
        payload = {
          gameName,
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          streamlitToken,
          botBaseUrl,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope,
          moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
          kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id
        };
      } else if (juwaBotAutomationGame) {
        if (!botBaseUrl) {
          return sendError(res, 'This game template is missing the bot base URL. Please contact your administrator.', 400);
        }
        let streamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
        if (isJuwaNewBotGame(template.name, templateGameKey)) {
          const { resolveJuwaNewBotAdminToken } = require('../../services/games/juwa.config');
          streamlitToken = resolveJuwaNewBotAdminToken(template.streamlitToken) || '';
          if (!streamlitToken) {
            return sendError(
              res,
              'Juwa new bot admin token is not configured. Master admin must set streamlit_token on the Juwa new bot template (same value as STREAMLIT_ADMIN_PASSWORD on the bot server).',
              400
            );
          }
        } else if (!streamlitToken) {
          return sendError(res, 'This game template is missing Streamlit token. Please contact your administrator.', 400);
        }
        payload = {
          gameName: resolvePersistedGameName(template, null, templateGameKey),
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          streamlitToken,
          botBaseUrl,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope
        };
      } else if (pandamasterBotAutomationGame) {
        if (!botBaseUrl) {
          return sendError(res, 'This game template is missing the bot base URL. Please contact your administrator.', 400);
        }
        let streamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
        if (isPandamasterNewBotGame(template.name, templateGameKey)) {
          const { resolvePandamasterNewBotAdminToken } = require('../../services/games/pandamaster.config');
          streamlitToken = resolvePandamasterNewBotAdminToken(template.streamlitToken) || '';
          if (!streamlitToken) {
            return sendError(
              res,
              'Pandamaster new bot admin token is not configured. Master admin must set streamlit_token on the Pandamaster new bot template (same value as STREAMLIT_ADMIN_PASSWORD on the bot server).',
              400
            );
          }
        } else if (!streamlitToken) {
          return sendError(res, 'This game template is missing Streamlit token. Please contact your administrator.', 400);
        }
        payload = {
          gameName: resolvePersistedGameName(template, null, templateGameKey),
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          streamlitToken,
          botBaseUrl,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope
        };
      } else {
        const streamlitToken = template.streamlitToken != null ? String(template.streamlitToken).trim() : '';
        if (!streamlitToken || !botBaseUrl) {
          return sendError(res, 'This game template is not configured with credentials. Please contact your administrator.', 400);
        }
        payload = {
          gameName,
          gameKey: templateGameKey || undefined,
          gameTemplateId: template.id,
          gameUsername: body.gameUsername,
          gamePassword: body.gamePassword,
          gameLink: gameLink || undefined,
          streamlitToken,
          botBaseUrl,
          minWithdrawalLimit: body.minWithdrawalLimit,
          maxWithdrawalLimit: body.maxWithdrawalLimit,
          minDepositLimit: body.minDepositLimit,
          maxDepositLimit: body.maxDepositLimit,
          ...storeScope,
          moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
          kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id
        };
      }
    } else {
      payload = {
        gameName: body.gameName,
        gameUsername: body.gameUsername,
        gamePassword: body.gamePassword,
        gameLink: body.gameLink,
        streamlitToken: body['streamlit-token'] ?? body.streamlitToken,
        botBaseUrl: body['bot-base-url'] ?? body.botBaseUrl,
        minWithdrawalLimit: body.minWithdrawalLimit,
        maxWithdrawalLimit: body.maxWithdrawalLimit,
        minDepositLimit: body.minDepositLimit,
        maxDepositLimit: body.maxDepositLimit,
        ...storeScope,
        moneybox: body.moneybox != null ? body.moneybox : body.moneyBox,
        kioskId: body.kioskId != null ? body.kioskId : body.kiosk_id
      };
    }

    if (req.user.role === 'store_admin') {
      payload.addedByUserId = req.user.userId;
    }

    payload.depositDiscountPercent = body.depositDiscountPercent;
    const game = await addGame(payload);
    const actor = await buildHistoryActor(req);
    await recordGameHistoryCreated(game, actor);
    let storeOwnerUserId = null;
    if (req.user.role === 'store_admin' && req.storeRoleId && req.user.storeCode) {
      storeOwnerUserId = await getStorePrimaryOwnerUserId(req.user.storeCode);
    }
    const row = toSafeJson(game);
    row.mutationsAllowed = computeMutationsAllowed(req, row, storeOwnerUserId);
    sendSuccess(res, { message: 'Game added successfully', game: row }, 201);
  } catch (err) {
    if (err.providerPassthrough) {
      return sendError(res, '', err.statusCode || 502, null, { passthrough: err.providerBody });
    }
    const statusCode = err.statusCode || 500;
    let message = err.message || 'Failed to add game';
    if (message === 'Unprocessable Entity') {
      message = 'Game provider rejected the request. Check streamlit-token, bot-base-url, and game username.';
    }
    if (message === 'Field required') {
      message = 'Missing required field. When using a template: gameTemplateId, gameUsername, gamePassword. Otherwise: gameName, gameUsername, gamePassword, gameLink, streamlit-token, bot-base-url.';
    }
    sendError(res, message, statusCode);
  }
}

/**
 * POST /api/admin/games/upload-image
 * Upload a custom game image to S3. Returns { url }.
 */
async function uploadImage(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) {
      return sendError(res, 'You don\'t have access to Games. Please contact your administrator if you need access.', 403);
    }
    const file = req.file;
    if (!file || !file.buffer) {
      return sendError(res, 'No image file provided.', 400);
    }
    const url = await uploadImageBuffer(file.buffer, {
      contentType: file.mimetype,
      keyPrefix: 'games'
    });
    return sendSuccess(res, { url });
  } catch (err) {
    return sendError(res, err.message || 'Upload failed.', err.statusCode || 500);
  }
}

/**
 * POST /api/admin/games/custom
 * Add a custom manual-only game (no agent/bot APIs).
 * Body: gameName, gameLink, imageUrl, minWithdrawalLimit?, maxWithdrawalLimit?, storeCode? (master).
 * Register / deposit / redeem always go through Game Manual Requests.
 */
async function createCustom(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) {
      return sendError(res, 'You don\'t have access to Games. Please contact your administrator if you need access.', 403);
    }
    const body = req.body || {};
    const storeScope = await resolveCreateGameStoreScope(req, body);
    if (isMasterAdmin(req.role) && !storeScope.addedByStoreCode) {
      return sendError(res, 'Please select a store for this custom game.', 400);
    }
    const payload = {
      gameName: body.gameName ?? body.name,
      gameLink: body.gameLink ?? body.platformGameUrl,
      imageUrl: body.imageUrl,
      minWithdrawalLimit: body.minWithdrawalLimit,
      maxWithdrawalLimit: body.maxWithdrawalLimit,
      minDepositLimit: body.minDepositLimit,
      maxDepositLimit: body.maxDepositLimit,
      depositDiscountPercent: body.depositDiscountPercent,
      ...storeScope
    };
    if (req.user.role === 'store_admin') {
      payload.addedByUserId = req.user.userId;
    }

    const game = await addCustomManualGame(payload);
    const actor = await buildHistoryActor(req);
    await recordGameHistoryCreated(game, actor);
    let storeOwnerUserId = null;
    if (req.user.role === 'store_admin' && req.storeRoleId && req.user.storeCode) {
      storeOwnerUserId = await getStorePrimaryOwnerUserId(req.user.storeCode);
    }
    const row = toSafeJson(game);
    row.mutationsAllowed = computeMutationsAllowed(req, row, storeOwnerUserId);
    sendSuccess(res, { message: 'Custom game added successfully', game: row }, 201);
  } catch (err) {
    sendError(res, err.message || 'Failed to add custom game', err.statusCode || 500);
  }
}

/**
 * POST /api/admin/games/:id/change-password
 * Change the game store account password:
 * - GameVault / Juwa 2.0 Agent API: save new password to DB only (no provider API call).
 * - VegasX Agent API: cashier/login with the new password; save on success, else "Invalid password"
 *   (including provider "Wrong username or password.").
 * - OrionStars Agent API: agentLogin with the new password; save on success, else "Invalid password"
 *   (never surfaces Session timeout / provider session errors).
 * - Other provider games: POST /admin/update-password (+ generate-key) or DB-only for simple games.
 * Body: newPassword (or gamePassword).
 */
async function changePassword(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) {
      return sendError(res, 'You don\'t have access to Games. Please contact your administrator if you need access.', 403);
    }
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid game id', 400);

    const game = await db.Game.findByPk(id);
    if (!game) return sendError(res, 'Game not found', 404);
    if (!(await ensureCanMutateGame(req, res, game))) return;
    if (isCustomManualGame(game)) {
      return sendError(res, 'Custom games have no provider account password to change.', 400);
    }

    const body = decodePasswordBody(req.body || {});
    let newPassword = body.newPassword != null ? body.newPassword : body.gamePassword;
    newPassword = String(newPassword || '').trim();
    if (!newPassword) {
      return sendError(res, 'New password is required.', 400);
    }

    const oldPassword = game.botPassword;

    try {
      const result = await changeGamePasswordService(game.id, newPassword);
      const actor = await buildHistoryActor(req);
      await recordGameHistoryPasswordChanged(game, { ...actor, oldPassword, newPassword });
      sendSuccess(res, {
        message: `Password updated for game "${result.name}".`,
        id: result.id,
        name: result.name
      });
    } catch (e) {
      if (e.providerPassthrough) {
        return sendError(res, '', e.statusCode || 502, null, { passthrough: e.providerBody });
      }
      return sendError(res, e.message || 'Failed to change game password', e.statusCode || 500);
    }
  } catch (err) {
    sendError(res, err.message || 'Failed to change game password', err.statusCode || 500);
  }
}

/**
 * PATCH /api/admin/games/:id/toggle-bot-offline
 * Toggle the bot_offline flag for a game.
 * - When bot_offline = true: all game operations go to manual processing.
 * - When bot_offline = false: all game operations use the bot API (automated).
 * store_admin can only toggle games belonging to their store.
 * master_admin with admin_role_id (technical staff) can toggle any game; full super admin only platform games.
 */
async function toggleBotOffline(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) return sendError(res, 'You don\'t have access to Games.', 403);

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid game id', 400);

    const game = await db.Game.findByPk(id);
    if (!game) return sendError(res, 'Game not found', 404);

    if (!(await ensureCanMutateGame(req, res, game))) return;

    if (isCustomManualGame(game) && game.botOffline) {
      return sendError(res, 'Custom games stay in manual mode (no agent/bot APIs).', 400);
    }

    const wasManual = !!game.botOffline;
    const newValue = !game.botOffline;
    await game.update({ botOffline: newValue });

    const switchedToManual = newValue && !wasManual;
    const switchedToAutomation = !newValue && wasManual;
    if (switchedToAutomation) {
      await clearGameBotAutomationFailures(game.id);
    }
    if (switchedToManual || switchedToAutomation) {
      const switchedByName = await resolveAdminDisplayName(req.user?.userId);
      const automationApiError = switchedToManual
        ? 'An administrator switched this game to manual processing from the admin panel.'
        : 'An administrator switched this game back to automated processing from the admin panel.';
      const actor = await buildHistoryActor(req);
      await recordGameHistoryModeSwitch(game, {
        wasManual,
        isManual: newValue,
        details: automationApiError
      }, actor);
      await recordGameManualModeLog({
        game: {
          id: game.id,
          name: game.name,
          botUsername: game.botUsername,
          botPassword: game.botPassword,
          addedByStoreCode: game.addedByStoreCode
        },
        automationApiError,
        switchedByUserId: req.user?.userId ?? null,
        switchedByName,
        triggerSource: 'admin_panel'
      });
    }

    if (newValue) {
      const displayGameName = game.name || 'Unknown Game';
      const storeCode = game.addedByStoreCode && String(game.addedByStoreCode).trim();
      const hasStorePartner = !!storeCode;
      const gameForRecipients = { id: game.id, name: game.name, addedByStoreCode: game.addedByStoreCode };
      const reason = 'An administrator switched this game to manual processing from the admin panel.';
      const titleForMaster = hasStorePartner
        ? `Store "${storeCode}" – Game "${displayGameName}" switched to manual mode`
        : `Platform game "${displayGameName}" switched to manual mode`;
      const messageForMaster = hasStorePartner
        ? `Store: ${storeCode}. Game: ${displayGameName}. ${reason}`
        : `Platform-level game (no store partner). Game: ${displayGameName}. ${reason}`;
      const titleForStore = `Game "${displayGameName}" switched to manual mode`;
      const messageForStore = `${displayGameName}. ${reason}`;
      await sendAutomationUpdateInAppNotifications(gameForRecipients, {
        titleForMaster,
        messageForMaster,
        titleForStore,
        messageForStore,
        actionUrl: '/admin/games',
        type: 'game_manual_mode'
      });
    }

    const modeLabel = newValue ? 'manual' : 'automated';
    sendSuccess(res, {
      message: `Game "${game.name}" is now in ${modeLabel} mode. ${newValue ? 'All operations will require manual processing.' : 'All operations will be processed automatically by the automation tool.'}`,
      id: game.id,
      name: game.name,
      botOffline: newValue
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to toggle bot status', err.statusCode || 500);
  }
}

/**
 * PATCH /api/admin/games/:id/toggle-manual-redeem-only
 * Toggle manual_redeem_only flag for a game.
 * - true: only redeem operations are queued for manual processing
 * - false: redeem operations continue automated behavior unless bot is offline
 */
async function toggleManualRedeemOnly(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) return sendError(res, 'You don\'t have access to Games.', 403);

    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return sendError(res, 'Invalid game id', 400);

    const game = await db.Game.findByPk(id);
    if (!game) return sendError(res, 'Game not found', 404);

    if (!(await ensureCanMutateGame(req, res, game))) return;

    const wasEnabled = !!game.manualRedeemOnly;
    const newValue = !wasEnabled;
    const actor = await buildHistoryActor(req);
    await recordGameHistoryRedeemModeSwitch(game, { wasEnabled, isEnabled: newValue }, actor);
    await game.update({ manualRedeemOnly: newValue });

    if (newValue) {
      const displayGameName = game.name || 'Unknown Game';
      const storeCode = game.addedByStoreCode && String(game.addedByStoreCode).trim();
      const hasStorePartner = !!storeCode;
      const gameForRecipients = { id: game.id, name: game.name, addedByStoreCode: game.addedByStoreCode };
      const reason =
        'Manual redeem only was enabled. Redeem and withdrawal requests for this game will be queued for staff review.';
      const titleForMaster = hasStorePartner
        ? `Store "${storeCode}" – Manual redeem only: "${displayGameName}"`
        : `Platform game — Manual redeem only: "${displayGameName}"`;
      const messageForMaster = hasStorePartner
        ? `Store: ${storeCode}. Game: ${displayGameName}. ${reason}`
        : `Platform-level game. Game: ${displayGameName}. ${reason}`;
      const titleForStore = `Manual redeem enabled for "${displayGameName}"`;
      const messageForStore = `${displayGameName}. ${reason}`;
      await sendAutomationUpdateInAppNotifications(gameForRecipients, {
        titleForMaster,
        messageForMaster,
        titleForStore,
        messageForStore,
        actionUrl: '/admin/games',
        type: 'game_manual_redeem_only'
      });
    }

    sendSuccess(res, {
      message: `Manual redeem is now ${newValue ? 'enabled' : 'disabled'} for "${game.name}".`,
      id: game.id,
      name: game.name,
      manualRedeemOnly: newValue
    });
  } catch (err) {
    sendError(res, err.message || 'Failed to toggle manual redeem mode', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/games/history
 * Paginated audit trail of all game configuration changes. Platform technical staff only.
 */
async function listGameHistory(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) {
      return sendError(res, 'You don\'t have access to Games.', 403);
    }
    if (!isPlatformTechnicalStaff(req)) {
      return sendError(res, 'Only technical staff can view game history.', 403);
    }

    const data = await getGameHistory({
      page: req.query.page,
      limit: req.query.limit,
      storeCode: req.query.storeCode,
      gameId: req.query.gameId,
      gameName: req.query.gameName,
      action: req.query.action,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      timezoneOffset: req.query.timezoneOffset
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to list game history', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/games/manual-mode-logs
 * Paginated log of games that switched between automation and manual mode. Platform technical staff only.
 */
async function listManualModeLogs(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) {
      return sendError(res, 'You don\'t have access to Games.', 403);
    }
    if (!isPlatformTechnicalStaff(req)) {
      return sendError(res, 'Only technical staff can view manual mode logs.', 403);
    }

    const page = req.query.page;
    const limit = req.query.limit;
    const storeCode = req.query.storeCode;
    const gameId = req.query.gameId;
    const gameName = req.query.gameName;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    const data = await getGameManualModeLogs({
      page,
      limit,
      storeCode,
      gameId,
      gameName,
      startDate,
      endDate,
      timezoneOffset: req.query.timezoneOffset
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to list manual mode logs', err.statusCode || 500);
  }
}

/**
 * GET /api/admin/games/bot-failure-logs
 * Paginated log of bot automation failures per user/game/operation. Platform technical staff only.
 */
async function listBotFailureLogs(req, res) {
  try {
    if (!can(req, STORE_FEATURE_KEYS.GAMES)) {
      return sendError(res, 'You don\'t have access to Games.', 403);
    }
    if (!isPlatformTechnicalStaff(req)) {
      return sendError(res, 'Only technical staff can view bot failure logs.', 403);
    }

    const data = await getGameBotAutomationFailureLogs({
      page: req.query.page,
      limit: req.query.limit,
      storeCode: req.query.storeCode,
      gameId: req.query.gameId,
      gameName: req.query.gameName,
      operation: req.query.operation,
      platformUserId: req.query.platformUserId,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      timezoneOffset: req.query.timezoneOffset
    });
    sendSuccess(res, data);
  } catch (err) {
    sendError(res, err.message || 'Failed to list bot failure logs', err.statusCode || 500);
  }
}

module.exports = {
  listGameTemplates,
  listAllGameTemplates,
  getGameTemplate,
  createGameTemplate,
  updateGameTemplate,
  list,
  listGameHistory,
  listManualModeLogs,
  listBotFailureLogs,
  get,
  create,
  createCustom,
  uploadImage,
  update,
  remove,
  changePassword,
  toggleBotOffline,
  toggleManualRedeemOnly
};
