'use strict';

const db = require('../../db/models');
const { Op } = require('sequelize');
const { toDateRangeStart, toDateRangeEnd } = require('../../utils/dateRangeFilters');
const { getGamesList } = require('../gitslotpark/getGamesList.service');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

/** Map friendly type filter → gitslotpark_transactions.operation values. */
const TYPE_FILTER_MAP = {
  all: null,
  bet: ['withdraw'],
  win: ['deposit'],
  betwin: ['betwin'],
  rollback: ['rollback']
};

/** Map friendly type filter → one_game_hub_transactions.operation values. */
const OGH_TYPE_FILTER_MAP = {
  all: null,
  bet: ['bet'],
  win: ['win'],
  rollback: ['cancel'],
  betwin: []
};

function normalizeProviderKey(provider) {
  const key = String(provider || 'all').trim().toLowerCase();
  if (key === '1gamehub' || key === 'one_game_hub' || key === 'gamehub1') return 'onegamehub';
  if (key === 'scorpioplay' || key === 'scorpio_play' || key === 'scorpio-play') return 'scorpio';
  return key || 'all';
}

function includeGspProvider(providerKey) {
  return providerKey === 'all' || providerKey === 'gitslotpark' || providerKey === 'bona';
}

function includeOghProvider(providerKey) {
  return providerKey === 'all' || providerKey === 'onegamehub';
}

function includeScorpioProvider(providerKey) {
  return providerKey === 'all' || providerKey === 'scorpio';
}

function providerLabelFor(provider) {
  if (provider === 'bona') return 'Bona Games';
  if (provider === 'onegamehub') return '1GameHub';
  if (provider === 'scorpio') return 'Scorpio Play';
  return 'GitSlotPark';
}

function mapOperation(operation) {
  const op = String(operation || '').toLowerCase();
  if (op === 'withdraw') {
    return {
      type: 'bet',
      typeLabel: 'Bet',
      typeHint: 'Player spent SC while playing this slots game',
      amountSign: -1
    };
  }
  if (op === 'deposit') {
    return {
      type: 'win',
      typeLabel: 'Win',
      typeHint: 'Player won SC back to their wallet',
      amountSign: 1
    };
  }
  if (op === 'betwin') {
    return {
      type: 'betwin',
      typeLabel: 'Bet & win',
      typeHint: 'One play that includes both a bet and a win',
      amountSign: 0
    };
  }
  if (op === 'bet') {
    return {
      type: 'bet',
      typeLabel: 'Bet',
      typeHint: 'Player spent SC while playing this slots game',
      amountSign: -1
    };
  }
  if (op === 'win') {
    return {
      type: 'win',
      typeLabel: 'Win',
      typeHint: 'Player won SC back to their wallet',
      amountSign: 1
    };
  }
  if (op === 'rollback' || op === 'cancel') {
    return {
      type: 'rollback',
      typeLabel: 'Reversed',
      typeHint: 'A previous play was cancelled / reversed',
      amountSign: 0
    };
  }
  if (op === 'transfer_out') {
    return {
      type: 'transfer_out',
      typeLabel: 'Transfer to game',
      typeHint: 'SC moved into the game wallet to play',
      amountSign: -1
    };
  }
  if (op === 'transfer_in') {
    return {
      type: 'transfer_in',
      typeLabel: 'Transfer from game',
      typeHint: 'SC returned from the game wallet after play',
      amountSign: 1
    };
  }
  return {
    type: op || 'other',
    typeLabel: op || 'Other',
    typeHint: '',
    amountSign: 0
  };
}

function buildTxWhere({ startDate, endDate, type, status, gameFilter, provider }) {
  const and = [];

  // Always use the physical column — attribute "createdAt" breaks on joined queries.
  const from = toDateRangeStart(startDate);
  const to = toDateRangeEnd(endDate);
  if (from) {
    and.push(db.sequelize.where(db.sequelize.col('GitslotparkTransaction.created_at'), Op.gte, from));
  }
  if (to) {
    and.push(db.sequelize.where(db.sequelize.col('GitslotparkTransaction.created_at'), Op.lte, to));
  }

  const typeKey = String(type || 'all').toLowerCase();
  const ops = TYPE_FILTER_MAP[typeKey];
  if (ops) {
    and.push({
      operation: ops.length === 1 ? ops[0] : { [Op.in]: ops }
    });
  }

  const statusKey = String(status || 'all').toLowerCase();
  if (statusKey === 'completed' || statusKey === 'rolled_back') {
    and.push({ status: statusKey });
  }

  const providerKey = String(provider || 'all').trim().toLowerCase();
  if (providerKey && providerKey !== 'all') {
    if (providerKey === 'bona') {
      and.push({ provider: 'bona' });
    } else if (providerKey === 'gitslotpark') {
      and.push({
        [Op.or]: [
          { provider: 'gitslotpark' },
          { provider: null },
          { provider: '' }
        ]
      });
    } else {
      and.push({ provider: providerKey });
    }
  }

  if (gameFilter) {
    and.push(gameFilter);
  }

  if (and.length === 0) return {};
  if (and.length === 1) return and[0];
  return { [Op.and]: and };
}

function buildOghTxWhere({ startDate, endDate, type, status, gameFilter }) {
  const and = [];

  const from = toDateRangeStart(startDate);
  const to = toDateRangeEnd(endDate);
  if (from) {
    and.push(db.sequelize.where(db.sequelize.col('OneGameHubTransaction.created_at'), Op.gte, from));
  }
  if (to) {
    and.push(db.sequelize.where(db.sequelize.col('OneGameHubTransaction.created_at'), Op.lte, to));
  }

  const typeKey = String(type || 'all').toLowerCase();
  const ops = OGH_TYPE_FILTER_MAP[typeKey];
  if (Array.isArray(ops)) {
    if (ops.length === 0) {
      and.push({ id: -1 });
    } else {
      and.push({
        operation: ops.length === 1 ? ops[0] : { [Op.in]: ops }
      });
    }
  }

  const statusKey = String(status || 'all').toLowerCase();
  if (statusKey === 'completed') {
    and.push({ status: 'completed' });
  } else if (statusKey === 'rolled_back') {
    and.push({ status: { [Op.in]: ['cancelled', 'rolled_back'] } });
  }

  if (gameFilter) {
    and.push(gameFilter);
  }

  if (and.length === 0) return {};
  if (and.length === 1) return and[0];
  return { [Op.and]: and };
}

function buildScorpioTxWhere({ startDate, endDate, type, status, gameFilter }) {
  const and = [];

  const from = toDateRangeStart(startDate);
  const to = toDateRangeEnd(endDate);
  if (from) {
    and.push(db.sequelize.where(db.sequelize.col('ScorpioTransaction.created_at'), Op.gte, from));
  }
  if (to) {
    and.push(db.sequelize.where(db.sequelize.col('ScorpioTransaction.created_at'), Op.lte, to));
  }

  const typeKey = String(type || 'all').toLowerCase();
  const ops = OGH_TYPE_FILTER_MAP[typeKey];
  if (Array.isArray(ops)) {
    if (ops.length === 0) {
      and.push({ id: -1 });
    } else {
      and.push({
        command: ops.length === 1 ? ops[0] : { [Op.in]: ops }
      });
    }
  }

  const statusKey = String(status || 'all').toLowerCase();
  if (statusKey === 'completed') {
    and.push({ status: 'completed' });
  } else if (statusKey === 'rolled_back') {
    and.push({ status: { [Op.in]: ['cancelled', 'cancel', 'rolled_back'] } });
  }

  if (gameFilter) {
    and.push(gameFilter);
  }

  if (and.length === 0) return {};
  if (and.length === 1) return and[0];
  return { [Op.and]: and };
}

function emptyResult(pageNum, limitNum) {
  return {
    rows: [],
    summary: {
      betAmount: 0,
      betCount: 0,
      winAmount: 0,
      winCount: 0,
      totalCount: 0
    },
    total: 0,
    page: pageNum,
    limit: limitNum,
    totalPages: 1
  };
}

function buildUserWhere(scope, username) {
  const userWhere = {};
  if (scope?.storeCode) userWhere.storeCode = scope.storeCode;
  if (scope?.distributorCode) userWhere.distributorCode = scope.distributorCode;
  const q = typeof username === 'string' ? username.trim() : '';
  if (q) {
    userWhere.username = { [Op.iLike]: `%${q}%` };
  }
  return userWhere;
}

async function buildGamesMap(req) {
  const gamesMap = {};
  try {
    const { games } = await getGamesList(req || {});
    if (Array.isArray(games)) {
      for (const g of games) {
        const gId = g.id ?? g.gameId ?? g.gameid;
        const gName = g.name || g.title || g.gameName;
        if (gId != null && gName) {
          gamesMap[String(gId)] = String(gName);
        }
      }
    }
  } catch (_) {
    // Catalog is optional enrichment; report still works with Game {id}.
  }

  try {
    const bona = require('../bona');
    if (bona.isBonaConfigured()) {
      const { games } = await bona.getGamesList({});
      if (Array.isArray(games)) {
        for (const g of games) {
          const gId = g.id ?? g.gameId ?? g.gameid;
          const gName = g.name || g.nameLang || g.nameCn || g.title || g.gameName;
          if (gId != null && gName) {
            gamesMap[String(gId)] = String(gName);
          }
        }
      }
    }
  } catch (_) {
    // optional
  }

  const oghGamesMap = {};
  try {
    const ogh = require('../onegamehub/getGamesList.service');
    const storeCode = String(req?.storeCode || req?.query?.storeCode || '').trim();
    const { games } = await ogh.getGamesList(storeCode);
    if (Array.isArray(games)) {
      for (const g of games) {
        const gId = g.id ?? g.gameId ?? g.gameid;
        const gName = g.name || g.title || g.gameName;
        if (gId != null && gName) {
          oghGamesMap[String(gId)] = String(gName);
        }
      }
    }
  } catch (_) {
    // optional
  }

  const scorpioGamesMap = {};
  try {
    const scorpio = require('../scorpioplay/getGamesList.service');
    const { games } = await scorpio.getGamesList();
    if (Array.isArray(games)) {
      for (const g of games) {
        const gId = g.gameCode || g.gameId || g.id;
        const gName = g.name || g.title || g.gameName;
        if (gId != null && gName) {
          scorpioGamesMap[String(gId)] = String(gName);
        }
      }
    }
  } catch (_) {
    // optional
  }

  return { gamesMap, oghGamesMap, scorpioGamesMap };
}

function resolveGameNameFilter(gameName, gamesMap) {
  const q = typeof gameName === 'string' ? gameName.trim() : '';
  if (!q) return null;

  if (/^\d+$/.test(q)) {
    return { gameId: Number(q) };
  }

  const lower = q.toLowerCase();
  const matchedIds = Object.entries(gamesMap)
    .filter(([, name]) => String(name).toLowerCase().includes(lower))
    .map(([id]) => Number(id))
    .filter((id) => Number.isFinite(id));

  if (matchedIds.length === 0) {
    return { gameId: -1 }; // force empty result
  }
  return { gameId: { [Op.in]: matchedIds } };
}

function resolveOghGameNameFilter(gameName, oghGamesMap) {
  const q = typeof gameName === 'string' ? gameName.trim() : '';
  if (!q) return null;

  const lower = q.toLowerCase();
  const matchedIds = Object.entries(oghGamesMap)
    .filter(([id, name]) => String(id).toLowerCase().includes(lower) || String(name).toLowerCase().includes(lower))
    .map(([id]) => id);

  if (matchedIds.length === 0) {
    return { gameId: q };
  }
  if (!matchedIds.includes(q)) {
    matchedIds.push(q);
  }
  return { gameId: { [Op.in]: matchedIds } };
}

function resolveScorpioGameNameFilter(gameName, scorpioGamesMap) {
  const q = typeof gameName === 'string' ? gameName.trim() : '';
  if (!q) return null;

  const lower = q.toLowerCase();
  const matchedIds = Object.entries(scorpioGamesMap)
    .filter(([id, name]) => String(id).toLowerCase().includes(lower) || String(name).toLowerCase().includes(lower))
    .map(([id]) => id);

  if (matchedIds.length === 0) {
    return { gameCode: q };
  }
  if (!matchedIds.includes(q)) {
    matchedIds.push(q);
  }
  return { gameCode: { [Op.in]: matchedIds } };
}

function mapGspRow(r, gamesMap) {
  const j = r.get ? r.get({ plain: true }) : r;
  const u = j.User || {};
  const mapped = mapOperation(j.operation);
  const gameId = j.gameId != null ? j.gameId : null;
  const provider = String(j.provider || 'gitslotpark').toLowerCase();
  const gameNameResolved = gameId != null
    ? (gamesMap[String(gameId)] || `Game ${gameId}`)
    : providerLabelFor(provider);
  const statusKey = String(j.status || 'completed').toLowerCase();
  const amountNum = j.amount != null ? Number(j.amount) : null;
  const betAmountNum = j.betAmount != null ? Number(j.betAmount) : null;
  const winAmountNum = j.winAmount != null ? Number(j.winAmount) : null;

  return {
    id: `gsp-${j.id}`,
    userId: u.userId || j.userId,
    username: u.username || null,
    storeCode: u.storeCode || null,
    distributorCode: u.distributorCode || null,
    provider,
    providerLabel: providerLabelFor(provider),
    operation: j.operation,
    type: mapped.type,
    typeLabel: mapped.typeLabel,
    typeHint: mapped.typeHint,
    amount: amountNum,
    betAmount: betAmountNum,
    winAmount: winAmountNum,
    amountSign: mapped.amountSign,
    currencyCode: 'SC',
    balanceAfter: j.balanceAfter != null ? Number(j.balanceAfter) : null,
    gameId,
    gameName: gameNameResolved,
    roundId: j.roundId || null,
    transactionId: j.transactionId || null,
    status: statusKey,
    statusLabel: statusKey === 'rolled_back' ? 'Reversed' : 'Completed',
    createdAt: j.createdAt || j.created_at
  };
}

function mapOghRow(r, oghGamesMap) {
  const j = r.get ? r.get({ plain: true }) : r;
  const u = j.User || {};
  const mapped = mapOperation(j.operation);
  const gameId = j.gameId != null ? String(j.gameId) : null;
  const statusRaw = String(j.status || 'completed').toLowerCase();
  const statusKey = statusRaw === 'cancelled' ? 'rolled_back' : statusRaw;
  const amountNum = j.amount != null ? Number(j.amount) : null;

  return {
    id: `ogh-${j.id}`,
    userId: u.userId || j.userId,
    username: u.username || null,
    storeCode: u.storeCode || j.storeCode || null,
    distributorCode: u.distributorCode || null,
    provider: 'onegamehub',
    providerLabel: providerLabelFor('onegamehub'),
    operation: j.operation,
    type: mapped.type,
    typeLabel: mapped.typeLabel,
    typeHint: mapped.typeHint,
    amount: amountNum,
    betAmount: mapped.type === 'bet' ? amountNum : null,
    winAmount: mapped.type === 'win' ? amountNum : null,
    amountSign: mapped.amountSign,
    currencyCode: 'SC',
    balanceAfter: j.balanceAfter != null ? Number(j.balanceAfter) : null,
    gameId,
    gameName: gameId ? (oghGamesMap[gameId] || `Game ${gameId}`) : '1GameHub',
    roundId: j.roundId || null,
    transactionId: j.transactionId || null,
    status: statusKey,
    statusLabel: statusKey === 'rolled_back' ? 'Reversed' : 'Completed',
    createdAt: j.createdAt || j.created_at
  };
}

function mapScorpioRow(r, scorpioGamesMap) {
  const j = r.get ? r.get({ plain: true }) : r;
  const u = j.User || {};
  const mapped = mapOperation(j.command);
  const gameId = j.gameCode != null ? String(j.gameCode) : null;
  const statusRaw = String(j.status || 'completed').toLowerCase();
  const statusKey = statusRaw === 'cancel' || statusRaw === 'cancelled' ? 'rolled_back' : statusRaw;
  const amountNum = j.amount != null ? Number(j.amount) : null;

  return {
    id: `scorpio-${j.id}`,
    userId: u.userId || j.userId,
    username: u.username || null,
    storeCode: u.storeCode || null,
    distributorCode: u.distributorCode || null,
    provider: 'scorpio',
    providerLabel: providerLabelFor('scorpio'),
    operation: j.command,
    type: mapped.type,
    typeLabel: mapped.typeLabel,
    typeHint: mapped.typeHint,
    amount: amountNum,
    betAmount: mapped.type === 'bet' ? amountNum : null,
    winAmount: mapped.type === 'win' ? amountNum : null,
    amountSign: mapped.amountSign,
    currencyCode: 'SC',
    balanceAfter: j.balanceAfter != null ? Number(j.balanceAfter) : null,
    gameId,
    gameName: gameId ? (scorpioGamesMap[gameId] || `Game ${gameId}`) : 'Scorpio Play',
    roundId: j.roundId || null,
    transactionId: j.transactionId || null,
    status: statusKey,
    statusLabel: statusKey === 'rolled_back' ? 'Reversed' : 'Completed',
    createdAt: j.createdAt || j.created_at
  };
}

function addGspSummary(summary, row) {
  const operation = String(row.operation || '').toLowerCase();
  const amount = Number(row.amount) || 0;
  const betAmount = Number(row.betAmount ?? row.bet_amount) || 0;
  const winAmount = Number(row.winAmount ?? row.win_amount) || 0;

  if (operation === 'withdraw') {
    summary.betAmount += amount;
    summary.betCount += 1;
  } else if (operation === 'deposit') {
    summary.winAmount += amount;
    summary.winCount += 1;
  } else if (operation === 'betwin') {
    summary.betAmount += betAmount;
    summary.winAmount += winAmount;
    summary.betCount += 1;
    summary.winCount += 1;
  }
}

function addOghSummary(summary, row) {
  const operation = String(row.operation || '').toLowerCase();
  const amount = Number(row.amount) || 0;
  if (operation === 'bet') {
    summary.betAmount += amount;
    summary.betCount += 1;
  } else if (operation === 'win') {
    summary.winAmount += amount;
    summary.winCount += 1;
  }
}

function addScorpioSummary(summary, row) {
  const command = String(row.command || row.operation || '').toLowerCase();
  const amount = Number(row.amount) || 0;
  if (command === 'bet') {
    summary.betAmount += amount;
    summary.betCount += 1;
  } else if (command === 'win') {
    summary.winAmount += amount;
    summary.winCount += 1;
  }
}

function sortMappedRows(rows, orderDir) {
  const dir = orderDir === 'ASC' ? 1 : -1;
  return rows.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime() || 0;
    const tb = new Date(b.createdAt).getTime() || 0;
    if (ta !== tb) return (ta - tb) * dir;
    return String(a.id).localeCompare(String(b.id)) * dir;
  });
}

async function getGameLogsTransactions({
  req = null,
  scope = {},
  startDate = null,
  endDate = null,
  type = 'all',
  status = 'all',
  provider = 'all',
  username = null,
  gameName = null,
  page = 1,
  limit = DEFAULT_LIMIT,
  sortOrder = 'DESC'
} = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(MAX_LIMIT, Math.max(1, parseInt(limit, 10) || DEFAULT_LIMIT));
  const offset = (pageNum - 1) * limitNum;
  const providerKey = normalizeProviderKey(provider);
  const wantGsp = includeGspProvider(providerKey) && Boolean(db.GitslotparkTransaction);
  const wantOgh = includeOghProvider(providerKey) && Boolean(db.OneGameHubTransaction);
  const wantScorpio = includeScorpioProvider(providerKey) && Boolean(db.ScorpioTransaction);

  if (!wantGsp && !wantOgh && !wantScorpio) {
    return emptyResult(pageNum, limitNum);
  }

  const { gamesMap, oghGamesMap, scorpioGamesMap } = await buildGamesMap(req);
  const gameFilter = resolveGameNameFilter(gameName, gamesMap);
  const oghGameFilter = resolveOghGameNameFilter(gameName, oghGamesMap);
  const scorpioGameFilter = resolveScorpioGameNameFilter(gameName, scorpioGamesMap);
  const txWhere = buildTxWhere({ startDate, endDate, type, status, gameFilter, provider: providerKey });
  const oghWhere = buildOghTxWhere({ startDate, endDate, type, status, gameFilter: oghGameFilter });
  const scorpioWhere = buildScorpioTxWhere({ startDate, endDate, type, status, gameFilter: scorpioGameFilter });

  const userWhere = buildUserWhere(scope, username);
  const hasUserFilter = Object.keys(userWhere).length > 0;
  const orderDir = String(sortOrder || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const includeUser = {
    model: db.User,
    attributes: ['userId', 'username', 'storeCode', 'distributorCode'],
    where: hasUserFilter ? userWhere : undefined,
    required: true
  };

  const sourceCount = [wantGsp, wantOgh, wantScorpio].filter(Boolean).length;
  const fetchTake = sourceCount > 1 ? offset + limitNum : limitNum;
  const fetchOffset = sourceCount > 1 ? 0 : offset;

  const gspPromise = wantGsp
    ? db.GitslotparkTransaction.findAndCountAll({
      where: txWhere,
      include: [{ ...includeUser }],
      order: [[db.sequelize.col('GitslotparkTransaction.created_at'), orderDir]],
      limit: fetchTake,
      offset: fetchOffset,
      distinct: true,
      subQuery: false
    })
    : Promise.resolve({ rows: [], count: 0 });

  const oghPromise = wantOgh
    ? db.OneGameHubTransaction.findAndCountAll({
      where: oghWhere,
      include: [{ ...includeUser }],
      order: [[db.sequelize.col('OneGameHubTransaction.created_at'), orderDir]],
      limit: fetchTake,
      offset: fetchOffset,
      distinct: true,
      subQuery: false
    })
    : Promise.resolve({ rows: [], count: 0 });

  const scorpioPromise = wantScorpio
    ? db.ScorpioTransaction.findAndCountAll({
      where: scorpioWhere,
      include: [{ ...includeUser }],
      order: [[db.sequelize.col('ScorpioTransaction.created_at'), orderDir]],
      limit: fetchTake,
      offset: fetchOffset,
      distinct: true,
      subQuery: false
    })
    : Promise.resolve({ rows: [], count: 0 });

  const gspSummaryPromise = wantGsp
    ? db.GitslotparkTransaction.findAll({
      where: txWhere,
      include: [{
        model: db.User,
        attributes: [],
        where: hasUserFilter ? userWhere : undefined,
        required: true
      }],
      attributes: ['operation', 'amount', 'betAmount', 'winAmount'],
      raw: true,
      subQuery: false
    })
    : Promise.resolve([]);

  const oghSummaryPromise = wantOgh
    ? db.OneGameHubTransaction.findAll({
      where: oghWhere,
      include: [{
        model: db.User,
        attributes: [],
        where: hasUserFilter ? userWhere : undefined,
        required: true
      }],
      attributes: ['operation', 'amount'],
      raw: true,
      subQuery: false
    })
    : Promise.resolve([]);

  const scorpioSummaryPromise = wantScorpio
    ? db.ScorpioTransaction.findAll({
      where: scorpioWhere,
      include: [{
        model: db.User,
        attributes: [],
        where: hasUserFilter ? userWhere : undefined,
        required: true
      }],
      attributes: ['command', 'amount'],
      raw: true,
      subQuery: false
    })
    : Promise.resolve([]);

  const [gspResult, oghResult, scorpioResult, gspSummaryRows, oghSummaryRows, scorpioSummaryRows] = await Promise.all([
    gspPromise,
    oghPromise,
    scorpioPromise,
    gspSummaryPromise,
    oghSummaryPromise,
    scorpioSummaryPromise
  ]);

  const total = Number(gspResult.count || 0) + Number(oghResult.count || 0) + Number(scorpioResult.count || 0);
  const summary = {
    betAmount: 0,
    betCount: 0,
    winAmount: 0,
    winCount: 0,
    totalCount: total
  };
  for (const row of gspSummaryRows) addGspSummary(summary, row);
  for (const row of oghSummaryRows) addOghSummary(summary, row);
  for (const row of scorpioSummaryRows) addScorpioSummary(summary, row);

  let list = [
    ...gspResult.rows.map((r) => mapGspRow(r, gamesMap)),
    ...oghResult.rows.map((r) => mapOghRow(r, oghGamesMap)),
    ...scorpioResult.rows.map((r) => mapScorpioRow(r, scorpioGamesMap))
  ];
  if (sourceCount > 1) {
    list = sortMappedRows(list, orderDir).slice(offset, offset + limitNum);
  }

  return {
    rows: list,
    summary,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1
  };
}

module.exports = { getGameLogsTransactions };
