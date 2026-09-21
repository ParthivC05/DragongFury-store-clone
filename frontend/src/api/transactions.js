import { API_BASE } from '../config/api';
import { getRequest, postRequest } from '../services/request';

const TRANSACTIONS_BASE = `${API_BASE}/api/transactions`;

/**
 * Get paginated transactions with optional filters.
 * @param {object} params - { page, limit, dateFrom, dateTo, category, gameName }
 * @returns {Promise<{ transactions: array, total: number, page: number, limit: number, total_pages: number }>}
 */
export function getTransactions(params = {}) {
  const q = new URLSearchParams();
  if (params.page != null) q.set('page', params.page);
  if (params.limit != null) q.set('limit', params.limit);
  if (params.dateFrom) q.set('dateFrom', params.dateFrom);
  if (params.dateTo) q.set('dateTo', params.dateTo);
  if (params.category) q.set('category', params.category);
  if (params.gameName) q.set('gameName', params.gameName);
  const query = q.toString();
  return getRequest(`${TRANSACTIONS_BASE}${query ? `?${query}` : ''}`);
}

/**
 * Get paginated topup and redeem transactions for a specific game.
 * @param {object} body - { gameName, page, limit }
 * @returns {Promise<{ game_name: string, transactions: array, total: number, page: number, limit: number, total_pages: number }>}
 */
export function getGameTransactions(body = {}) {
  return postRequest(`${API_BASE}/api/games/transactions`, body);
}

export const TRANSACTION_CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'deposit', label: 'Deposit' },
  { value: 'withdraw', label: 'Withdraw' },
  { value: 'spin_wheel', label: 'Spin Wheel' },
  { value: 'welcome_signup', label: 'Welcome Bonus' },
  { value: 'referral_friend_signup', label: 'Referral Bonus' },
  { value: 'promotion', label: 'Promotions' },
  { value: 'bonus_code', label: 'Deposit bonus' },
  { value: 'affiliate', label: 'Refer & Earn' },
  { value: 'vip_bonus', label: 'VIP Bonus' },
  { value: 'game_deposit', label: 'Game Deposit' },
  { value: 'game_withdraw', label: 'Game Withdraw' }
];
