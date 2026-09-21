import { applyStoreWinnerHandles } from './storeWinnerNames';
import { STORE_CODE } from '../config/site';

const WINNERS_LEADERBOARD = {
  today: [
    { player: 'ELO*****', location: 'Phoenix, AZ', game: 'Juwa', prize: '3,527 SC', trend: 'up', avatar: '👑' },
    { player: 'ARI*****', location: 'Austin, TX', game: 'Firekirin', prize: '3,045 SC', trend: 'up', avatar: '🎰' },
    { player: 'CED*****', location: 'Tampa, FL', game: 'Orionstars', prize: '2,525 SC', trend: 'down', avatar: '🃏' },
    { player: 'BRI*****', location: 'Miami, FL', game: 'Golden Dragon', prize: '2,417 SC', trend: 'flat', avatar: '💎' },
    { player: 'BRY*****', location: 'San Diego, CA', game: 'Milkyway', prize: '1,163 SC', trend: 'up', avatar: '🎲' },
  ],
  weekly: [
    { player: 'DWN*****', location: 'Chicago, IL', game: 'Juwa 2.0', prize: '12,400 SC', trend: 'up', avatar: '👑' },
    { player: 'HTR*****', location: 'Atlanta, GA', game: 'Pandamasters', prize: '9,850 SC', trend: 'up', avatar: '🔥' },
    { player: 'MCK*****', location: 'Las Vegas, NV', game: 'Ultra Panda', prize: '8,120 SC', trend: 'down', avatar: '💰' },
    { player: 'SLO*****', location: 'Portland, OR', game: 'Vblink', prize: '6,540 SC', trend: 'flat', avatar: '⭐' },
    { player: 'BRN*****', location: 'Nashville, TN', game: 'Gameroom', prize: '5,200 SC', trend: 'up', avatar: '🎲' },
  ],
};

const WINNERS_EXTRA_POOL = {
  today: [
    { player: 'QTR*****', location: 'Boston, MA', game: 'CashMachine777', prize: '1,120 SC', trend: 'up', avatar: '🎯' },
    { player: 'ZAP*****', location: 'Dallas, TX', game: 'Gamevault', prize: '890 SC', trend: 'up', avatar: '⚡' },
    { player: 'FLY*****', location: 'San Diego, CA', game: 'Milkyway', prize: '760 SC', trend: 'flat', avatar: '🚀' },
    { player: 'WIN*****', location: 'Tampa, FL', game: 'Orionstars', prize: '1,340 SC', trend: 'down', avatar: '🏆' },
  ],
  weekly: [
    { player: 'GLD*****', location: 'Houston, TX', game: 'Golden Dragon', prize: '7,800 SC', trend: 'up', avatar: '🐉' },
    { player: 'SKY*****', location: 'Charlotte, NC', game: 'Firekirin', prize: '6,950 SC', trend: 'up', avatar: '☁️' },
    { player: 'VIP*****', location: 'Orlando, FL', game: 'Juwa', prize: '5,880 SC', trend: 'flat', avatar: '💫' },
  ],
};

const assignedWinnerBoards = applyStoreWinnerHandles(STORE_CODE, {
  today: WINNERS_LEADERBOARD.today,
  weekly: WINNERS_LEADERBOARD.weekly,
  todayExtra: WINNERS_EXTRA_POOL.today,
  weeklyExtra: WINNERS_EXTRA_POOL.weekly,
});

export const GUEST_WINNER_LEADERBOARD = {
  today: assignedWinnerBoards.today,
  weekly: assignedWinnerBoards.weekly,
};

const GUEST_WINNER_POOL = {
  today: assignedWinnerBoards.todayExtra,
  weekly: assignedWinnerBoards.weeklyExtra,
};

let winnerRowIdSeq = 0;

export function parseWinnerPrize(prize) {
  return Number.parseInt(String(prize).replace(/[^\d]/g, ''), 10) || 0;
}

export function formatWinnerPrize(amount) {
  return `${Math.max(500, amount).toLocaleString('en-US')} SC`;
}

export function getWinnerRowKey(entry) {
  return `${entry.player}-${entry.game}`;
}

export function cloneGuestWinnerRows(tabId = 'today') {
  return GUEST_WINNER_LEADERBOARD[tabId].map((row, i) => ({ ...row, _id: `${tabId}-${i}` }));
}

export function tickGuestWinnerRows(rows, tabId = 'today') {
  const pool = GUEST_WINNER_POOL[tabId] ?? [];
  const next = rows.map((row) => ({ ...row }));
  const updateCount = Math.random() > 0.45 ? 2 : 1;

  for (let i = 0; i < updateCount; i += 1) {
    const index = Math.floor(Math.random() * next.length);
    const currentAmount = parseWinnerPrize(next[index].prize);
    const delta = Math.floor(Math.random() * 220) - 60;
    const updatedAmount = Math.max(500, currentAmount + delta);

    next[index] = {
      ...next[index],
      prize: formatWinnerPrize(updatedAmount),
      trend: delta > 30 ? 'up' : delta < -30 ? 'down' : next[index].trend,
    };
  }

  if (pool.length && Math.random() < 0.4) {
    const onBoard = new Set(next.map(getWinnerRowKey));
    const candidates = pool.filter((entry) => !onBoard.has(getWinnerRowKey(entry)));

    if (candidates.length) {
      const replacement = candidates[Math.floor(Math.random() * candidates.length)];
      const replacementAmount = parseWinnerPrize(replacement.prize) + Math.floor(Math.random() * 500);
      next[next.length - 1] = {
        ...replacement,
        prize: formatWinnerPrize(replacementAmount),
        _id: `pool-${(winnerRowIdSeq += 1)}`,
      };
    }
  }

  next.sort((a, b) => parseWinnerPrize(b.prize) - parseWinnerPrize(a.prize));
  return next;
}
