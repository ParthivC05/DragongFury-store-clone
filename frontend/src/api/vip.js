import { API_BASE } from '../config/api';
import { getRequest } from '../services/request';

const VIP_BASE = `${API_BASE}/api/vip`;

/** Get current user VIP status and levels. Requires auth. */
export function getVipStatus() {
  return getRequest(`${VIP_BASE}/status`);
}

/** Get VIP ledger history. Requires auth. */
export function getVipHistory(params) {
  return getRequest(`${VIP_BASE}/history`, params || {});
}

/** Get VIP FAQ. Public. */
export function getVipFaq() {
  return getRequest(`${VIP_BASE}/faq`);
}

/** Get VIP levels config. Public. */
export function getVipLevels() {
  return getRequest(`${VIP_BASE}/levels`);
}
