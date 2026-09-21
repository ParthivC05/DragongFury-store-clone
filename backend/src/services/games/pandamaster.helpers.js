'use strict';

const { PANDAMASTER_NEW_BOT_GAME_KEY } = require('./pandamaster.config');

const PANDAMASTER_NEW_BOT_GAME_KEYS = new Set([
  PANDAMASTER_NEW_BOT_GAME_KEY,
  'pandamasternewbot'
]);

const PANDAMASTER_LEGACY_BOT_GAME_KEYS = new Set([
  'pandamaster',
  'pandamasterbot',
  'pandamasterautomation',
  'pandamasterlegacy'
]);

function compactProviderGameId(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function isPandamasterNewBotGame(name, gameKey) {
  const ids = [name, gameKey].map(compactProviderGameId).filter(Boolean);
  return ids.some((id) => PANDAMASTER_NEW_BOT_GAME_KEYS.has(id) || id.includes('pandamaster2'));
}

function isPandamasterLegacyBotGame(name, gameKey) {
  if (isPandamasterNewBotGame(name, gameKey)) return false;
  const ids = [name, gameKey].map(compactProviderGameId).filter(Boolean);
  if (ids.some((id) => PANDAMASTER_LEGACY_BOT_GAME_KEYS.has(id))) return true;
  return ids.some((id) => id === 'pandamaster' || (id.includes('pandamaster') && !id.includes('pandamaster2')));
}

function isPandamasterFamilyGame(name, gameKey) {
  return isPandamasterNewBotGame(name, gameKey) || isPandamasterLegacyBotGame(name, gameKey);
}

function isPandamasterNewBotAutomationReady(game) {
  if (!game || !isPandamasterNewBotGame(game.name, game.gameKey)) return false;
  return Boolean(String(game.botApiUrl || '').trim() && String(game.botApiKey || '').trim());
}

/** Player sites show one "Panda Master" card — reuse legacy artwork when the new bot has none. */
function resolvePandamasterNewBotImageUrl(game, peerGames) {
  if (!isPandamasterNewBotGame(game.name, game.gameKey)) {
    return game.imageUrl;
  }
  const existing = String(game.imageUrl || '').trim();
  if (existing) return existing;
  for (const peer of peerGames || []) {
    if (isPandamasterNewBotGame(peer.name, peer.gameKey)) continue;
    if (!isPandamasterLegacyBotGame(peer.name, peer.gameKey)) continue;
    const url = String(peer.imageUrl || '').trim();
    if (url) return url;
  }
  return game.imageUrl;
}

async function findLegacyPandamasterImageUrlForStore(storeCode) {
  const db = require('../../db/models');
  const games = await db.Game.findAll({
    where: { isActive: true, addedByStoreCode: storeCode || null },
    attributes: ['name', 'gameKey', 'imageUrl'],
    order: [['id', 'ASC']]
  });
  for (const g of games) {
    if (!isPandamasterLegacyBotGame(g.name, g.gameKey)) continue;
    const url = String(g.imageUrl || '').trim();
    if (url) return url;
  }
  return null;
}

module.exports = {
  isPandamasterNewBotGame,
  isPandamasterLegacyBotGame,
  isPandamasterFamilyGame,
  isPandamasterNewBotAutomationReady,
  resolvePandamasterNewBotImageUrl,
  findLegacyPandamasterImageUrlForStore
};
