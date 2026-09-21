import { API_BASE } from '../config/api';
import { getRequest, postRequest } from '../services/request';

const BASE = `${API_BASE}/api/daily-bonus`;

/** Opens/starts campaign by default. Pass { start: false } to peek without starting. */
export function getDailyBonusStatus(params = {}) {
  const query = {};
  if (params.start === false) query.start = 'false';
  return getRequest(`${BASE}/status`, Object.keys(query).length ? query : undefined);
}

export function claimDailyBonus(dayIndex) {
  return postRequest(`${BASE}/claim`, { dayIndex });
}

export function spinDailyBonus() {
  return Promise.reject(new Error('Use the Daily Spin wheel for free spins.'));
}

export function listDailyBonusVouchers() {
  return getRequest(`${BASE}/vouchers`);
}
