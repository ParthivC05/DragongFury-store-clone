'use strict';

const { EVENT_TYPES } = require('../../constants/walletScLedger');

const MAX_RANGE_DAYS = 92;

const CASINO_PRODUCTS = new Set([
  'DIRECT',
  'GITSLOTPARK',
  'ONEGAMEHUB',
  'BONA',
  'WIN568'
]);

const BONUS_CREDIT_EVENTS = new Set([
  EVENT_TYPES.PACKAGE_BONUS,
  EVENT_TYPES.WELCOME_BONUS,
  EVENT_TYPES.SPIN_BONUS,
  EVENT_TYPES.REFERRAL_BONUS,
  EVENT_TYPES.COINBACK,
  EVENT_TYPES.DAILY_BONUS,
  EVENT_TYPES.VIP_BONUS,
  EVENT_TYPES.BONUS_CODE,
  EVENT_TYPES.MANUAL_BONUS,
  EVENT_TYPES.OTHER_BONUS
].filter(Boolean));

const ADMIN_CREDIT_EVENTS = new Set([
  EVENT_TYPES.MANUAL_CREDIT,
  EVENT_TYPES.ADJUSTMENT_CREDIT
]);

const ADMIN_DEBIT_EVENTS = new Set([
  EVENT_TYPES.MANUAL_DEBIT,
  EVENT_TYPES.ADJUSTMENT_DEBIT
]);

const PRODUCT_LABELS = {
  JUWA: 'Juwa',
  JUWA20: 'Juwa 2.0',
  GAMEVAULT: 'Game Vault',
  GAMEVAULT2: 'Game Vault 2',
  GOLDEN_DRAGON: 'Golden Dragon',
  ORIONSTARS: 'Orion Stars',
  EGAME99: 'Egame99',
  FIRE_KIRIN: 'Fire Kirin',
  PANDA: 'Panda',
  PANDA_MASTER: 'Panda Master',
  VBLINK: 'VBlink',
  MILKYWAY: 'Milky Way',
  ULTRA_PANDA: 'Ultra Panda',
  CASH_MACHINE_777: 'Cash Machine 777',
  RIVER_SWEEPS: 'River Sweeps',
  VEGASX: 'VegasX',
  GAMEROOM: 'Game Room',
  MAFIA: 'Mafia',
  LUCKY_PARADISE: 'Lucky Paradise',
  GITSLOTPARK: 'GitSlotPark',
  ONEGAMEHUB: '1GameHub',
  BONA: 'Bona',
  WIN568: 'Win568',
  DIRECT: 'Other casino',
  OTHER: 'Other games'
};

const CASINO_HUB_LABELS = {
  onegamehub: '1GameHub',
  '1gamehub': '1GameHub',
  bona: 'Bona',
  win568: 'Win568',
  gitslotpark: 'GitSlotPark',
  pragmatic: 'GitSlotPark',
  pgsoft: 'GitSlotPark',
  amatic: 'GitSlotPark',
  amusnet: 'GitSlotPark',
  amusement: 'GitSlotPark',
  amusment: 'GitSlotPark',
  ka: 'GitSlotPark',
  direct: 'GitSlotPark'
};

const GSP_HUB_KEYS = new Set([
  'gitslotpark',
  'pragmatic',
  'pgsoft',
  'amatic',
  'amusnet',
  'ka',
  'direct'
]);

const BONUS_LABELS = {
  PACKAGE_BONUS: 'Package bonus',
  WELCOME_BONUS: 'Welcome bonus',
  SPIN_BONUS: 'Spin bonus',
  REFERRAL_BONUS: 'Referral bonus',
  COINBACK: 'Coinback',
  DAILY_BONUS: 'Daily bonus',
  VIP_BONUS: 'VIP bonus',
  BONUS_CODE: 'Bonus code',
  MANUAL_BONUS: 'Manual bonus',
  OTHER_BONUS: 'Other bonus',
  LEGACY_BALANCE: 'Legacy bonus'
};

function round2(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function humanizeKey(id, labels) {
  const key = String(id || '').trim();
  if (!key) return 'Other';
  if (labels[key]) return labels[key];
  return key
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeProductId(id) {
  return humanizeKey(id, PRODUCT_LABELS);
}

function humanizeBonusType(id) {
  return humanizeKey(id, BONUS_LABELS);
}

function normalizeCasinoHubKey(raw) {
  const key = String(raw || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!key) return '';
  if (key === '1gamehub' || key === 'onegamehub' || key === 'gamehub1') return 'onegamehub';
  if (key === '568win' || key === 'win568') return 'win568';
  if (key === 'bona' || key === 'bonagames') return 'bona';
  if (
    key === 'gitslot' ||
    key === 'gitslotpark' ||
    key === 'slotgames' ||
    key === 'pragmatic' ||
    key === 'pragmaticplay' ||
    key === 'pp' ||
    key === 'pgsoft' ||
    key === 'pg' ||
    key === 'amatic' ||
    key === 'amusnet' ||
    key === 'amusment' ||
    key === 'amusement' ||
    key === 'ka' ||
    key === 'direct'
  ) {
    return 'gitslotpark';
  }
  if (CASINO_HUB_LABELS[key]) return key;
  return '';
}

function firstCasinoHubKey(...values) {
  for (const value of values) {
    const key = normalizeCasinoHubKey(value);
    if (key) return key;
  }
  return '';
}

/**
 * Main casino hub (GitSlotPark, 1GameHub, Bona, Win568), not studio codes like KA.
 */
function casinoHubFromRow(row) {
  const productId = String(row.product_id || row.productId || '');
  const sourceType = String(row.source_type || row.sourceType || '');
  const metaProvider = String(row.meta_provider || row.metaProvider || '');
  const providerId = String(row.provider_id || row.providerId || '');

  const source = sourceType.toLowerCase();
  const product = productId.toUpperCase();
  if (product === 'ONEGAMEHUB' || source.includes('onegamehub') || source.includes('1gamehub')) {
    return 'onegamehub';
  }
  if (product === 'BONA' || source.startsWith('bona') || normalizeCasinoHubKey(metaProvider) === 'bona') {
    return 'bona';
  }
  if (product === 'WIN568' || source.includes('win568') || source.includes('568win')) {
    return 'win568';
  }
  const fromBrand = firstCasinoHubKey(metaProvider, providerId, sourceType, productId);
  if (fromBrand === 'onegamehub' || fromBrand === 'bona' || fromBrand === 'win568') return fromBrand;
  if (product === 'GITSLOTPARK' || source.includes('gitslotpark') || source.includes('gitslot') || GSP_HUB_KEYS.has(fromBrand)) {
    return 'gitslotpark';
  }
  if (product === 'DIRECT' || String(row.product_type || row.productType || '').toUpperCase() === 'DIRECT') {
    return 'gitslotpark';
  }
  return fromBrand || 'gitslotpark';
}

function humanizeCasinoHub(id) {
  const key = normalizeCasinoHubKey(id) || String(id || '').trim().toLowerCase() || 'gitslotpark';
  return CASINO_HUB_LABELS[key] || 'GitSlotPark';
}

function casinoHubSql(alias = 'l') {
  const meta = `LOWER(COALESCE(${alias}.metadata->>'provider', ''))`;
  const source = `LOWER(COALESCE(${alias}.source_type, ''))`;
  const product = `UPPER(COALESCE(${alias}.product_id, ''))`;
  const compact = (expr) => `REGEXP_REPLACE(${expr}, '[\\s_-]+', '', 'g')`;
  return `
    CASE
      WHEN ${product} = 'ONEGAMEHUB'
        OR ${source} LIKE '%onegamehub%'
        OR ${source} LIKE '%1gamehub%'
        OR ${compact(meta)} IN ('onegamehub', '1gamehub')
        THEN 'onegamehub'
      WHEN ${product} = 'BONA' OR ${source} LIKE 'bona%' OR ${compact(meta)} = 'bona'
        THEN 'bona'
      WHEN ${product} = 'WIN568' OR ${source} LIKE '%win568%' OR ${source} LIKE '%568win%'
        THEN 'win568'
      ELSE 'gitslotpark'
    END
  `;
}

function isCasinoProduct(productId, productType, eventType) {
  const product = String(productId || '').toUpperCase();
  const type = String(productType || '').toUpperCase();
  const event = String(eventType || '').toUpperCase();
  if (CASINO_PRODUCTS.has(product) || type === 'DIRECT') return true;
  return event === 'USED_DIRECT' || event === 'WIN_DIRECT';
}

function compactGameBlob(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * One line per platform game family (VegasX, Juwa, Juwa 2.0, …),
 * not the coarse ledger product_id (OTHER / JUWA).
 */
function platformGameFamily(row) {
  const product = String(row.product_id || row.productId || '').toUpperCase();
  const name = String(row.game_name || row.gameName || '');
  const key = String(row.game_key || row.gameKey || '');
  const provider = String(row.provider_id || row.providerId || '');
  const blob = compactGameBlob(`${name} ${key} ${provider}`);

  if (blob.includes('juwa2') || blob.includes('juwa20')) return 'JUWA20';
  if (blob.includes('juwa')) return 'JUWA';
  if (blob.includes('gamevault2') || blob.includes('gamevaultagent')) return 'GAMEVAULT2';
  if (blob.includes('gamevault')) return 'GAMEVAULT';
  if (blob.includes('goldendragon')) return 'GOLDEN_DRAGON';
  if (blob.includes('orionstar')) return 'ORIONSTARS';
  if (blob.includes('egame')) return 'EGAME99';
  if (blob.includes('firekirin')) return 'FIRE_KIRIN';
  if (blob.includes('ultrapanda')) return 'ULTRA_PANDA';
  if (blob.includes('pandamaster')) return 'PANDA_MASTER';
  if (blob.includes('panda')) return 'PANDA';
  if (blob.includes('vblink')) return 'VBLINK';
  if (blob.includes('milky')) return 'MILKYWAY';
  if (blob.includes('cashmachine')) return 'CASH_MACHINE_777';
  if (blob.includes('riversweep')) return 'RIVER_SWEEPS';
  if (blob.includes('vegas')) return 'VEGASX';
  if (blob.includes('gameroom')) return 'GAMEROOM';
  if (blob.includes('mafia')) return 'MAFIA';
  if (blob.includes('luckyparadise')) return 'LUCKY_PARADISE';

  if (product.includes('JUWA2') || product === 'JUWA20') return 'JUWA20';
  if (product === 'JUWA') return 'JUWA';
  if (product === 'GAMEVAULT2') return 'GAMEVAULT2';
  if (product && product !== 'OTHER' && !CASINO_PRODUCTS.has(product)) {
    if (PRODUCT_LABELS[product]) return product;
    return product;
  }
  if (name.trim()) {
    return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_') || 'OTHER';
  }
  return 'OTHER';
}

function platformGameSql(ledgerAlias = 'l', gameAlias = 'g') {
  const blob = `REGEXP_REPLACE(LOWER(CONCAT_WS('',
    COALESCE(${gameAlias}.name, ''),
    COALESCE(${gameAlias}.game_key, ''),
    COALESCE(${ledgerAlias}.provider_id, ''),
    COALESCE(${ledgerAlias}.product_id, '')
  )), '[^a-z0-9]', '', 'g')`;
  const product = `UPPER(COALESCE(${ledgerAlias}.product_id, ''))`;
  return `
    CASE
      WHEN ${blob} LIKE '%juwa2%' OR ${blob} LIKE '%juwa20%' OR ${product} IN ('JUWA20', 'JUWA2') THEN 'JUWA20'
      WHEN ${blob} LIKE '%juwa%' OR ${product} = 'JUWA' THEN 'JUWA'
      WHEN ${blob} LIKE '%gamevault2%' OR ${blob} LIKE '%gamevaultagent%' OR ${product} = 'GAMEVAULT2' THEN 'GAMEVAULT2'
      WHEN ${blob} LIKE '%gamevault%' OR ${product} = 'GAMEVAULT' THEN 'GAMEVAULT'
      WHEN ${blob} LIKE '%goldendragon%' OR ${product} = 'GOLDEN_DRAGON' THEN 'GOLDEN_DRAGON'
      WHEN ${blob} LIKE '%orionstar%' OR ${product} = 'ORIONSTARS' THEN 'ORIONSTARS'
      WHEN ${blob} LIKE '%egame%' OR ${product} = 'EGAME99' THEN 'EGAME99'
      WHEN ${blob} LIKE '%firekirin%' OR ${product} = 'FIRE_KIRIN' THEN 'FIRE_KIRIN'
      WHEN ${blob} LIKE '%ultrapanda%' OR ${product} = 'ULTRA_PANDA' THEN 'ULTRA_PANDA'
      WHEN ${blob} LIKE '%pandamaster%' OR ${product} = 'PANDA_MASTER' THEN 'PANDA_MASTER'
      WHEN ${blob} LIKE '%panda%' OR ${product} = 'PANDA' THEN 'PANDA'
      WHEN ${blob} LIKE '%vblink%' OR ${product} = 'VBLINK' THEN 'VBLINK'
      WHEN ${blob} LIKE '%milky%' OR ${product} = 'MILKYWAY' THEN 'MILKYWAY'
      WHEN ${blob} LIKE '%cashmachine%' OR ${product} = 'CASH_MACHINE_777' THEN 'CASH_MACHINE_777'
      WHEN ${blob} LIKE '%riversweep%' OR ${product} = 'RIVER_SWEEPS' THEN 'RIVER_SWEEPS'
      WHEN ${blob} LIKE '%vegas%' OR ${product} = 'VEGASX' THEN 'VEGASX'
      WHEN ${blob} LIKE '%gameroom%' OR ${product} = 'GAMEROOM' THEN 'GAMEROOM'
      WHEN ${blob} LIKE '%mafia%' OR ${product} = 'MAFIA' THEN 'MAFIA'
      WHEN ${blob} LIKE '%luckyparadise%' OR ${product} = 'LUCKY_PARADISE' THEN 'LUCKY_PARADISE'
      WHEN ${product} <> '' AND ${product} <> 'OTHER' THEN ${product}
      ELSE 'OTHER'
    END
  `;
}

function platformGameKeySql(ledgerAlias = 'l', gameAlias = 'g') {
  const cleanedName = `NULLIF(TRIM(REGEXP_REPLACE(COALESCE(${gameAlias}.name, ''), '\\s*\\(agent\\)\\s*$', '', 'i')), '')`;
  return `REGEXP_REPLACE(LOWER(COALESCE(${cleanedName}, REPLACE(${platformGameSql(ledgerAlias, gameAlias)}, '_', ''), 'other')), '[^a-z0-9]', '', 'g')`;
}

function platformGameFromRow(row) {
  const rawName = String(row.game_name || row.gameName || '').replace(/\s*\(agent\)\s*$/i, '').trim();
  const family = platformGameFamily(row);
  const label = rawName || humanizeProductId(family);
  const key = compactGameBlob(label) || 'other';
  return { key, label, productId: key };
}

function isWinEvent(eventType) {
  return String(eventType || '').startsWith('WIN_');
}

function isUsedEvent(eventType) {
  return String(eventType || '').startsWith('USED_');
}

function scTypeFromWallet(walletType) {
  const w = String(walletType || '').toUpperCase();
  if (w === 'BONUS') return 'bonus';
  if (w === 'RSC') return 'win';
  return 'bought';
}

function emptyFlow() {
  return {
    deposits: 0,
    bonuses: 0,
    gameWins: 0,
    casinoWins: 0,
    platformWins: 0,
    adminAdd: 0,
    otherIn: 0,
    totalIn: 0,
    casinoUsed: 0,
    platformUsed: 0,
    withdrawals: 0,
    adminRemove: 0,
    otherOut: 0,
    totalOut: 0,
    unclassifiedIn: 0,
    unclassifiedOut: 0,
    bonusByType: {},
    casinoBetsByProvider: {},
    casinoWinsByProvider: {},
    platformTopupByGame: {},
    platformRedeemedByGame: {},
    scTypes: emptyScTypes()
  };
}

function emptyScTypes() {
  return {
    bought: { credits: 0, debits: 0 },
    bonus: { credits: 0, debits: 0 },
    win: { credits: 0, debits: 0 }
  };
}

function addToMap(map, key, amount, extra) {
  const k = key || 'OTHER';
  if (!map[k]) map[k] = { key: k, amount: 0, count: 0, ...extra };
  map[k].amount = round2(map[k].amount + amount);
  map[k].count += 1;
  if (extra) Object.assign(map[k], extra);
}

/**
 * Every row amount is added to totalIn or totalOut first, then to a named bucket.
 * Nothing is dropped.
 */
function applyRow(target, row) {
  const amount = round2(Math.abs(num(row.total != null ? row.total : row.amount)));
  const count = Math.max(1, parseInt(row.entry_count, 10) || 1);
  if (!(amount > 0.0001) && count <= 0) return;

  const direction = String(row.direction || '').toUpperCase();
  const eventType = String(row.event_type || row.eventType || '').toUpperCase();
  const bonusType = String(row.bonus_type || row.bonusType || '').toUpperCase();
  const productId = String(row.product_id || row.productId || '').toUpperCase();
  const productType = String(row.product_type || row.productType || '').toUpperCase();
  const gameId = row.game_id != null ? row.game_id : row.gameId;
  const gameName = row.game_name || row.gameName || '';
  const walletType = String(row.wallet_type || row.walletType || '').toUpperCase();
  const casino = isCasinoProduct(productId, productType, eventType);
  const casinoHub = casinoHubFromRow(row);
  const scType = scTypeFromWallet(walletType);

  if (!target.bonusByType) target.bonusByType = {};
  if (!target.casinoBetsByProvider) target.casinoBetsByProvider = {};
  if (!target.casinoWinsByProvider) target.casinoWinsByProvider = {};
  if (!target.platformTopupByGame) target.platformTopupByGame = {};
  if (!target.platformRedeemedByGame) target.platformRedeemedByGame = {};
  if (!target.scTypes) target.scTypes = emptyScTypes();

  if (direction === 'CREDIT') {
    target.totalIn = round2(target.totalIn + amount);
    target.scTypes[scType].credits = round2(target.scTypes[scType].credits + amount);
    if (eventType === EVENT_TYPES.PURCHASE) {
      target.deposits = round2(target.deposits + amount);
    } else if (BONUS_CREDIT_EVENTS.has(eventType) || (walletType === 'BONUS' && !isWinEvent(eventType))) {
      target.bonuses = round2(target.bonuses + amount);
      addToMap(target.bonusByType, bonusType || eventType || 'OTHER_BONUS', amount, {
        label: humanizeBonusType(bonusType || eventType)
      });
    } else if (isWinEvent(eventType)) {
      target.gameWins = round2(target.gameWins + amount);
      if (casino) {
        target.casinoWins = round2(target.casinoWins + amount);
        addToMap(target.casinoWinsByProvider, casinoHub, amount, {
          label: humanizeCasinoHub(casinoHub)
        });
      } else {
        target.platformWins = round2(target.platformWins + amount);
        const game = platformGameFromRow(row);
        addToMap(target.platformRedeemedByGame, game.key, amount, {
          label: game.label,
          productId: game.key
        });
      }
    } else if (ADMIN_CREDIT_EVENTS.has(eventType)) {
      target.adminAdd = round2(target.adminAdd + amount);
      target.otherIn = round2(target.otherIn + amount);
    } else {
      target.otherIn = round2(target.otherIn + amount);
      if (eventType === EVENT_TYPES.UNCLASSIFIED || !eventType) {
        target.unclassifiedIn = round2(target.unclassifiedIn + amount);
      }
    }
    return;
  }

  if (direction === 'DEBIT') {
    target.totalOut = round2(target.totalOut + amount);
    target.scTypes[scType].debits = round2(target.scTypes[scType].debits + amount);
    if (isUsedEvent(eventType) && casino) {
      target.casinoUsed = round2(target.casinoUsed + amount);
      addToMap(target.casinoBetsByProvider, casinoHub, amount, {
        label: humanizeCasinoHub(casinoHub)
      });
    } else if (isUsedEvent(eventType)) {
      target.platformUsed = round2(target.platformUsed + amount);
      const game = platformGameFromRow(row);
      addToMap(target.platformTopupByGame, game.key, amount, {
        label: game.label,
        productId: game.key
      });
    } else if (eventType === EVENT_TYPES.WITHDRAWAL) {
      target.withdrawals = round2(target.withdrawals + amount);
    } else if (ADMIN_DEBIT_EVENTS.has(eventType)) {
      target.adminRemove = round2(target.adminRemove + amount);
      target.otherOut = round2(target.otherOut + amount);
    } else {
      target.otherOut = round2(target.otherOut + amount);
      if (eventType === EVENT_TYPES.UNCLASSIFIED || !eventType) {
        target.unclassifiedOut = round2(target.unclassifiedOut + amount);
      }
    }
  }
}

function mapToList(map) {
  return Object.values(map || {})
    .map((row) => ({ ...row, amount: round2(row.amount) }))
    .filter((row) => row.amount > 0.0001)
    .sort((a, b) => b.amount - a.amount);
}

function inPartsMatch(flow) {
  return Math.abs(round2(flow.deposits + flow.bonuses + flow.gameWins + flow.otherIn - flow.totalIn)) < 0.009;
}

function outPartsMatch(flow) {
  return Math.abs(round2(flow.casinoUsed + flow.platformUsed + flow.withdrawals + flow.otherOut - flow.totalOut)) < 0.009;
}

function listDatesInclusive(startStr, endStr) {
  const dates = [];
  const matchStart = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startStr || ''));
  const matchEnd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(endStr || ''));
  if (!matchStart || !matchEnd) return dates;
  const cursor = new Date(Date.UTC(Number(matchStart[1]), Number(matchStart[2]) - 1, Number(matchStart[3])));
  const last = new Date(Date.UTC(Number(matchEnd[1]), Number(matchEnd[2]) - 1, Number(matchEnd[3])));
  while (cursor.getTime() <= last.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (dates.length > MAX_RANGE_DAYS + 1) break;
  }
  return dates;
}

module.exports = {
  MAX_RANGE_DAYS,
  CASINO_PRODUCTS,
  BONUS_CREDIT_EVENTS,
  ADMIN_CREDIT_EVENTS,
  ADMIN_DEBIT_EVENTS,
  PRODUCT_LABELS,
  CASINO_HUB_LABELS,
  BONUS_LABELS,
  round2,
  num,
  humanizeProductId,
  humanizeBonusType,
  humanizeCasinoHub,
  casinoHubFromRow,
  casinoHubSql,
  platformGameFamily,
  platformGameSql,
  platformGameKeySql,
  platformGameFromRow,
  isCasinoProduct,
  isWinEvent,
  isUsedEvent,
  scTypeFromWallet,
  emptyFlow,
  emptyScTypes,
  applyRow,
  mapToList,
  inPartsMatch,
  outPartsMatch,
  listDatesInclusive
};
