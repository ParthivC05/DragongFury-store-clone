'use strict';

const { JUWA_NEW_BOT_GAME_KEY } = require('./juwa.config');

const JUWA_NEW_BOT_GAME_KEYS = new Set([
  JUWA_NEW_BOT_GAME_KEY,
  'juwanewbot'
]);

function compactProviderGameId(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function isJuwaNewBotGame(name, gameKey) {
  const ids = [name, gameKey].map(compactProviderGameId).filter(Boolean);
  return ids.some((id) => JUWA_NEW_BOT_GAME_KEYS.has(id) || id.includes('juwanewbot'));
}

function isJuwaNewBotAutomationReady(game) {
  if (!game || !isJuwaNewBotGame(game.name, game.gameKey)) return false;
  return Boolean(String(game.botApiUrl || '').trim() && String(game.botApiKey || '').trim());
}

/** Legacy Juwa bot (not Juwa 2.0, not agent API, not Juwa new bot). */
function isLegacyJuwaBotGame(name, gameKey) {
  if (isJuwaNewBotGame(name, gameKey)) return false;
  const key = compactProviderGameId(gameKey);
  const compact = compactProviderGameId(name);
  if (key.includes('juwa20') || compact.includes('juwa20')) return false;
  if (key === 'juwaagent' || (compact.includes('juwa') && compact.includes('agent'))) return false;
  return key === 'juwa' || key === 'juwabot' || key === 'juwaautomation' || key === 'juwalegacy'
    || (compact.includes('juwa') && !compact.includes('juwa20') && !compact.includes('juwanewbot'));
}

/** Player sites show one "Juwa" card — reuse legacy Juwa artwork when the new bot has none. */
function resolveJuwaNewBotImageUrl(game, peerGames) {
  if (!isJuwaNewBotGame(game.name, game.gameKey)) {
    return game.imageUrl;
  }
  const existing = String(game.imageUrl || '').trim();
  if (existing) return existing;
  for (const peer of peerGames || []) {
    if (isJuwaNewBotGame(peer.name, peer.gameKey)) continue;
    if (!isLegacyJuwaBotGame(peer.name, peer.gameKey)) continue;
    const url = String(peer.imageUrl || '').trim();
    if (url) return url;
  }
  return game.imageUrl;
}

async function findLegacyJuwaImageUrlForStore(storeCode) {
  const db = require('../../db/models');
  const games = await db.Game.findAll({
    where: { isActive: true, addedByStoreCode: storeCode || null },
    attributes: ['name', 'gameKey', 'imageUrl'],
    order: [['id', 'ASC']]
  });
  for (const g of games) {
    if (!isLegacyJuwaBotGame(g.name, g.gameKey)) continue;
    const url = String(g.imageUrl || '').trim();
    if (url) return url;
  }
  return null;
}

module.exports = {
  isJuwaNewBotGame,
  isJuwaNewBotAutomationReady,
  isLegacyJuwaBotGame,
  resolveJuwaNewBotImageUrl,
  findLegacyJuwaImageUrlForStore
};
