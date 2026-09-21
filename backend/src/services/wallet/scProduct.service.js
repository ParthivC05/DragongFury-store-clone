'use strict';

const {
  isJuwaFamilyGame,
  isJuwa20FamilyGame,
  isGameVaultFamilyGame
} = require('../../utils/gameIntegration.helpers');
const { isGoldenDragonGame } = require('../games/goldenDragon.helpers');
const {
  PRODUCT_IDS,
  PRODUCT_TYPES,
  USED_EVENT_BY_PRODUCT,
  WIN_EVENT_BY_PRODUCT
} = require('../../constants/walletScLedger');

const PRODUCT_LABELS = {
  [PRODUCT_IDS.JUWA]: 'Juwa',
  [PRODUCT_IDS.GAMEVAULT]: 'Game Vault',
  [PRODUCT_IDS.GOLDEN_DRAGON]: 'Golden Dragon',
  [PRODUCT_IDS.DIRECT]: 'Direct Games',
  [PRODUCT_IDS.OTHER]: 'Other'
};

function compactId(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function classifyProduct(game, extras = {}) {
  if (extras.productId && PRODUCT_IDS[extras.productId]) {
    const productId = extras.productId;
    return {
      productId,
      productType: extras.productType || (productId === PRODUCT_IDS.DIRECT ? PRODUCT_TYPES.DIRECT : PRODUCT_TYPES.EXTERNAL),
      label: PRODUCT_LABELS[productId] || productId,
      providerId: extras.providerId || null,
      gameId: extras.gameId != null ? extras.gameId : (game?.id || null)
    };
  }

  if (extras.direct === true) {
    return {
      productId: PRODUCT_IDS.DIRECT,
      productType: PRODUCT_TYPES.DIRECT,
      label: PRODUCT_LABELS.DIRECT,
      providerId: extras.providerId || 'KA',
      gameId: extras.gameId != null ? extras.gameId : (game?.id || null)
    };
  }

  if (game) {
    if (isJuwaFamilyGame(game) || isJuwa20FamilyGame(game)) {
      return {
        productId: PRODUCT_IDS.JUWA,
        productType: PRODUCT_TYPES.EXTERNAL,
        label: PRODUCT_LABELS.JUWA,
        providerId: compactId(game.gameKey || game.name) || 'juwa',
        gameId: game.id || null
      };
    }
    if (isGameVaultFamilyGame(game)) {
      return {
        productId: PRODUCT_IDS.GAMEVAULT,
        productType: PRODUCT_TYPES.EXTERNAL,
        label: PRODUCT_LABELS.GAMEVAULT,
        providerId: compactId(game.gameKey || game.name) || 'gamevault',
        gameId: game.id || null
      };
    }
    if (isGoldenDragonGame(game.name, game.gameKey) || compactId(game.gameKey).includes('goldendragon') || compactId(game.name).includes('goldendragon')) {
      return {
        productId: PRODUCT_IDS.GOLDEN_DRAGON,
        productType: PRODUCT_TYPES.EXTERNAL,
        label: PRODUCT_LABELS.GOLDEN_DRAGON,
        providerId: compactId(game.gameKey || game.name) || 'goldendragon',
        gameId: game.id || null
      };
    }
    return {
      productId: PRODUCT_IDS.OTHER,
      productType: PRODUCT_TYPES.EXTERNAL,
      label: String(game.name || 'Other').trim() || PRODUCT_LABELS.OTHER,
      providerId: compactId(game.gameKey || game.name) || null,
      gameId: game.id || null
    };
  }

  return {
    productId: PRODUCT_IDS.OTHER,
    productType: PRODUCT_TYPES.EXTERNAL,
    label: PRODUCT_LABELS.OTHER,
    providerId: extras.providerId || null,
    gameId: extras.gameId || null
  };
}

function usedEventForProduct(productId) {
  return USED_EVENT_BY_PRODUCT[productId] || USED_EVENT_BY_PRODUCT.OTHER;
}

function winEventForProduct(productId) {
  return WIN_EVENT_BY_PRODUCT[productId] || WIN_EVENT_BY_PRODUCT.OTHER;
}

module.exports = {
  PRODUCT_LABELS,
  classifyProduct,
  usedEventForProduct,
  winEventForProduct
};
