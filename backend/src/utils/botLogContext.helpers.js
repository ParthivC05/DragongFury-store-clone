'use strict';

/**
 * Build log context for third-party bot API usage tracking.
 * @param {object} params
 * @param {object} params.game - Game model or plain object with id, name, addedByStoreCode
 * @param {string} params.operation - deposit, redeem, register, balance, link_account, password_reset, withdraw
 * @param {string} [params.storeCode]
 * @param {string} [params.gameUsername]
 * @param {string} [params.apiEndpoint]
 */
function buildBotLogContext({ game, operation, storeCode = null, gameUsername = null, apiEndpoint = null } = {}) {
  if (!game || game.id == null) return null;
  const code = storeCode != null && String(storeCode).trim()
    ? String(storeCode).trim()
    : (game.addedByStoreCode != null ? String(game.addedByStoreCode).trim() : null);
  return {
    gameId: game.id,
    gameName: game.name || null,
    storeCode: code || null,
    gameUsername: gameUsername != null && String(gameUsername).trim()
      ? String(gameUsername).trim().slice(0, 128)
      : null,
    operation: String(operation || 'unknown').slice(0, 32),
    apiEndpoint: apiEndpoint || null
  };
}

module.exports = { buildBotLogContext };
