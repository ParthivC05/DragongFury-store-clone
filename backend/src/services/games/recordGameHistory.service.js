'use strict';

const db = require('../../db/models');
const { logger } = require('../../libs/logger');

const SENSITIVE_FIELDS = new Set(['botPassword', 'botApiKey', 'streamlitToken', 'appSecret', 'agentId', 'apiSecretKey']);

const FIELD_LABELS = {
  name: 'Game name',
  platformGameUrl: 'Platform game URL',
  imageUrl: 'Game image',
  botUsername: 'Game store username',
  botPassword: 'Game store password',
  botApiKey: 'Bot API key',
  botApiUrl: 'Bot / API base URL',
  streamlitToken: 'Streamlit token',
  minWithdrawalLimit: 'Min withdrawal',
  maxWithdrawalLimit: 'Max withdrawal',
  minDepositLimit: 'Min deposit',
  maxDepositLimit: 'Max deposit',
  depositDiscountPercent: 'Deposit discount %',
  isActive: 'Active',
  displayOrder: 'Display order',
  botOffline: 'Automation mode',
  manualRedeemOnly: 'Manual redeem only',
  appId: 'App ID',
  appSecret: 'App secret',
  kioskId: 'Kiosk ID',
  gameKey: 'Game key',
  gameTemplateId: 'Game config',
  agentId: 'Agent ID',
  apiSecretKey: 'API secret key'
};

const ACTION_LABELS = {
  created: 'Game created',
  updated: 'Field updated',
  deleted: 'Game deleted',
  mode_switched: 'Automation mode switched',
  password_changed: 'Password changed',
  redeem_mode_switched: 'Manual redeem switched'
};

function getStoreCodeFromGame(game) {
  const code = game?.addedByStoreCode != null ? String(game.addedByStoreCode).trim() : '';
  return code || null;
}

function normalizeComparable(fieldName, value) {
  if (value == null || value === '') return null;
  if (fieldName === 'botOffline' || fieldName === 'manualRedeemOnly' || fieldName === 'isActive') {
    return Boolean(value);
  }
  if (fieldName === 'minWithdrawalLimit' || fieldName === 'maxWithdrawalLimit' || fieldName === 'minDepositLimit' || fieldName === 'maxDepositLimit' || fieldName === 'depositDiscountPercent') {
    const n = Number(value);
    return Number.isNaN(n) ? String(value) : n;
  }
  if (fieldName === 'displayOrder') {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? String(value) : n;
  }
  return String(value).trim();
}

function formatValueForHistory(fieldName, value) {
  if (value == null || value === '') return '—';
  if (fieldName === 'botPassword') {
    const trimmed = String(value).trim();
    return trimmed || '—';
  }
  if (SENSITIVE_FIELDS.has(fieldName)) {
    return '••••••••';
  }
  if (fieldName === 'botOffline') return value ? 'Manual' : 'Automation';
  if (fieldName === 'manualRedeemOnly') return value ? 'Enabled' : 'Disabled';
  if (fieldName === 'isActive') return value ? 'Yes' : 'No';
  if (fieldName === 'depositDiscountPercent') {
    const n = Number(value);
    return Number.isNaN(n) ? String(value) : `${n}%`;
  }
  if (fieldName === 'minWithdrawalLimit' || fieldName === 'maxWithdrawalLimit' || fieldName === 'minDepositLimit' || fieldName === 'maxDepositLimit') {
    const n = Number(value);
    return Number.isNaN(n) ? String(value) : String(n);
  }
  return String(value);
}

function valuesChanged(fieldName, oldVal, newVal) {
  return normalizeComparable(fieldName, oldVal) !== normalizeComparable(fieldName, newVal);
}

function snapshotGame(game) {
  const json = game?.toJSON ? game.toJSON() : game || {};
  return {
    id: json.id,
    name: json.name || null,
    addedByStoreCode: json.addedByStoreCode || null,
    botUsername: json.botUsername || null,
    botPassword: json.botPassword || null,
    botApiKey: json.botApiKey || null,
    platformGameUrl: json.platformGameUrl || null,
    minWithdrawalLimit: json.minWithdrawalLimit,
    maxWithdrawalLimit: json.maxWithdrawalLimit,
    minDepositLimit: json.minDepositLimit,
    maxDepositLimit: json.maxDepositLimit,
    depositDiscountPercent: json.depositDiscountPercent,
    isActive: json.isActive,
    displayOrder: json.displayOrder,
    botOffline: json.botOffline,
    manualRedeemOnly: json.manualRedeemOnly,
    appId: json.appId || null,
    appSecret: json.appSecret || null,
    kioskId: json.kioskId || null,
    gameKey: json.gameKey || null,
    gameTemplateId: json.gameTemplateId || null,
    agentId: json.agentId || null
  };
}

/**
 * @param {{
 *   game: object,
 *   action: string,
 *   fieldName?: string|null,
 *   oldValue?: string|null,
 *   newValue?: string|null,
 *   changedByUserId?: number|null,
 *   changedByName?: string|null,
 *   changedByRole?: string|null,
 *   triggerSource?: string,
 *   details?: string|null
 * }} opts
 */
async function recordGameHistory(opts) {
  const {
    game,
    action,
    fieldName = null,
    oldValue = null,
    newValue = null,
    changedByUserId = null,
    changedByName = null,
    changedByRole = null,
    triggerSource = 'admin_panel',
    details = null
  } = opts;

  if (!game?.id && action !== 'deleted') return;

  try {
    await db.GameHistory.create({
      gameId: game?.id ?? null,
      gameName: game?.name || null,
      storeCode: getStoreCodeFromGame(game),
      action,
      fieldName,
      oldValue,
      newValue,
      changedByUserId,
      changedByName,
      changedByRole,
      triggerSource,
      details,
      createdAt: new Date()
    });
  } catch (err) {
    logger.error({ err, gameId: game?.id, action }, 'Failed to record game history');
  }
}

/**
 * Record one row per changed field after a game update.
 */
async function recordGameHistoryFromUpdates(game, updates, actor = {}) {
  if (!game?.id || !updates || typeof updates !== 'object') return;

  const before = snapshotGame(game);
  const entries = [];

  for (const [fieldName, newRaw] of Object.entries(updates)) {
    if (!FIELD_LABELS[fieldName]) continue;
    const oldRaw = before[fieldName];
    if (!valuesChanged(fieldName, oldRaw, newRaw)) continue;
    entries.push({
      action: 'updated',
      fieldName,
      oldValue: formatValueForHistory(fieldName, oldRaw),
      newValue: formatValueForHistory(fieldName, newRaw)
    });
  }

  for (const entry of entries) {
    await recordGameHistory({
      game,
      ...entry,
      ...actor
    });
  }
}

async function recordGameHistoryCreated(game, actor = {}) {
  await recordGameHistory({
    game,
    action: 'created',
    details: 'New game added',
    ...actor
  });
}

async function recordGameHistoryDeleted(game, actor = {}) {
  await recordGameHistory({
    game,
    action: 'deleted',
    details: 'Game and linked data removed',
    ...actor
  });
}

async function recordGameHistoryModeSwitch(game, { wasManual, isManual, details }, actor = {}) {
  await recordGameHistory({
    game,
    action: 'mode_switched',
    fieldName: 'botOffline',
    oldValue: wasManual ? 'Manual' : 'Automation',
    newValue: isManual ? 'Manual' : 'Automation',
    details,
    ...actor
  });
}

async function recordGameHistoryPasswordChanged(game, { oldPassword, newPassword, ...actor } = {}) {
  const oldVal =
    oldPassword != null && String(oldPassword).trim() !== ''
      ? String(oldPassword).trim()
      : game?.botPassword != null && String(game.botPassword).trim() !== ''
        ? String(game.botPassword).trim()
        : null;
  const newVal =
    newPassword != null && String(newPassword).trim() !== ''
      ? String(newPassword).trim()
      : null;

  await recordGameHistory({
    game,
    action: 'password_changed',
    fieldName: 'botPassword',
    oldValue: oldVal || '—',
    newValue: newVal || '—',
    details: 'Game store account password updated',
    ...actor
  });
}

async function recordGameHistoryRedeemModeSwitch(game, { wasEnabled, isEnabled }, actor = {}) {
  await recordGameHistory({
    game,
    action: 'redeem_mode_switched',
    fieldName: 'manualRedeemOnly',
    oldValue: wasEnabled ? 'Enabled' : 'Disabled',
    newValue: isEnabled ? 'Enabled' : 'Disabled',
    ...actor
  });
}

module.exports = {
  FIELD_LABELS,
  ACTION_LABELS,
  formatValueForHistory,
  recordGameHistory,
  recordGameHistoryFromUpdates,
  recordGameHistoryCreated,
  recordGameHistoryDeleted,
  recordGameHistoryModeSwitch,
  recordGameHistoryPasswordChanged,
  recordGameHistoryRedeemModeSwitch
};
