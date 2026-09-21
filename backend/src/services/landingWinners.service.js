'use strict';

const { Op } = require('sequelize');
const db = require('../db/models');
const { isAdminPanelAccount } = require('../constants/roles');

const AVATARS = ['👑', '🎰', '💎', '🌟', '🎲'];
const DONE_STATUSES = ['completed', 'approved', 'paid', 'success'];
const ADMIN_ROLES = ['master_admin', 'distributor_admin', 'store_admin'];

function displayName(user) {
  const first = String(user?.firstName || '').trim();
  const last = String(user?.lastName || '').trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  const username = String(user?.username || '').trim();
  return username || '';
}

function locationOf(user) {
  const city = String(user?.city || '').trim();
  const state = String(user?.state || '').trim();
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  return 'USA';
}

function mapWin(user, amount, gameName, index) {
  const prize = Math.max(Math.round(Number(amount) || 0), 1);
  return {
    player: displayName(user),
    location: locationOf(user),
    game: String(gameName || 'Sweepstakes').trim() || 'Sweepstakes',
    prize: `${prize.toLocaleString('en-US')} SC`,
    trend: 'up',
    avatar: AVATARS[index % AVATARS.length],
  };
}

function isCustomer(user) {
  if (!user) return false;
  return !isAdminPanelAccount(user.role, user.isAdmin);
}

const USER_NAME_ATTRS = ['userId', 'username', 'firstName', 'lastName', 'city', 'state', 'role', 'isAdmin'];

async function fetchWithdrawalWins(store, since, limit) {
  if (!db.WithdrawalRequest) return [];
  return db.WithdrawalRequest.findAll({
    where: {
      status: { [Op.in]: DONE_STATUSES },
      created_at: { [Op.gte]: since },
    },
    include: [{
      model: db.User,
      as: 'User',
      required: true,
      where: {
        storeCode: { [Op.iLike]: store },
        isAdmin: false,
        role: { [Op.notIn]: ADMIN_ROLES },
      },
      attributes: USER_NAME_ATTRS,
    }],
    order: [['created_at', 'DESC']],
    limit,
  });
}

async function fetchChimeWins(store, since, limit) {
  if (!db.ChimeCashappWithdrawalRequest) return [];
  return db.ChimeCashappWithdrawalRequest.findAll({
    where: {
      storeCode: { [Op.iLike]: store },
      status: { [Op.in]: DONE_STATUSES },
      created_at: { [Op.gte]: since },
    },
    include: [{
      model: db.User,
      as: 'User',
      required: false,
      attributes: USER_NAME_ATTRS,
    }],
    order: [['created_at', 'DESC']],
    limit,
  });
}

async function fetchRecentPlayers(store, limit) {
  return db.User.findAll({
    where: {
      storeCode: { [Op.iLike]: store },
      isAdmin: false,
      role: { [Op.notIn]: ADMIN_ROLES },
      [Op.or]: [
        { firstName: { [Op.ne]: null } },
        { username: { [Op.ne]: null } },
      ],
    },
    attributes: USER_NAME_ATTRS,
    order: [['user_id', 'DESC']],
    limit: Math.max(limit * 6, 30),
  });
}

function mergeWins(rows) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const user = row.User || {};
    if (user.userId && !isCustomer(user)) continue;
    const name = displayName(user);
    if (!name) continue;
    const key = String(user.userId || `${name}-${row.amount}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      user,
      amount: row.amount,
      gameName: row.gameName,
      createdAt: row.createdAt || row.created_at,
    });
  }
  return out.sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0));
}

function takeDistinct(rows, cap, excludeIds) {
  const out = [];
  const seen = new Set(excludeIds);
  for (const row of rows) {
    const id = String(row.user?.userId || '');
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    out.push(row);
    if (out.length >= cap) break;
  }
  return out;
}

function fillFromPlayers(winners, players, cap, used, period) {
  for (const user of players) {
    if (winners.length >= cap) break;
    if (!isCustomer(user)) continue;
    const name = displayName(user);
    if (!name) continue;
    const id = String(user.userId || '');
    if (id && used.has(id)) continue;
    if (id) used.add(id);
    const seed = Number(user.userId) || winners.length + 1;
    const amount = period === 'weekly' ? 800 + (seed % 3200) : 80 + (seed % 420);
    winners.push(mapWin(user, amount, 'Sweepstakes', winners.length));
  }
  return winners;
}

async function getPublicWinnerBoards(storeCode, limit = 5) {
  const store = String(storeCode || '').trim();
  const cap = Math.min(Math.max(Number(limit) || 5, 1), 8);
  if (!store) return { today: [], weekly: [] };

  const daySince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [wr, chime] = await Promise.all([
    fetchWithdrawalWins(store, weekSince, 80),
    fetchChimeWins(store, weekSince, 80),
  ]);
  const weekMerged = mergeWins([...wr, ...chime]);
  const todayMerged = weekMerged.filter((row) => {
    const at = row.createdAt ? new Date(row.createdAt).getTime() : 0;
    return at >= daySince.getTime();
  });

  const todayRows = takeDistinct(todayMerged, cap, new Set());
  const todayIds = new Set(todayRows.map((row) => String(row.user?.userId || '')).filter(Boolean));
  const weeklyRows = takeDistinct(weekMerged, cap, todayIds);

  const today = todayRows.map((row, i) => mapWin(row.user, row.amount, row.gameName, i));
  const weekly = weeklyRows.map((row, i) => mapWin(row.user, row.amount, row.gameName, i));

  const used = new Set([
    ...todayIds,
    ...weeklyRows.map((row) => String(row.user?.userId || '')).filter(Boolean),
  ]);

  if (today.length < cap || weekly.length < cap) {
    const extras = await fetchRecentPlayers(store, cap);
    const leftover = extras.filter((user) => {
      const id = String(user.userId || '');
      return !id || !used.has(id);
    });
    fillFromPlayers(today, leftover, cap, used, 'today');
    fillFromPlayers(weekly, leftover, cap, used, 'weekly');
  }

  return { today, weekly };
}

async function getPublicWinners(storeCode, { limit = 5, period = 'today' } = {}) {
  const boards = await getPublicWinnerBoards(storeCode, limit);
  return String(period).toLowerCase() === 'weekly' ? boards.weekly : boards.today;
}

module.exports = {
  getPublicWinnerBoards,
  getPublicWinners,
};
