import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest, putRequest } from '../services/request';

const PROMOTIONS_BASE = `${API_BASE}/api/promotions`;

/** Get all active promotions (invite-earn copy uses this store's Refer & Earn SC). */
export function getPromotions(storeCode = STORE_CODE) {
  const params = storeCode ? { store_code: storeCode } : {};
  return getRequest(`${PROMOTIONS_BASE}`, params);
}

/** Admin: get all promotions (including inactive). */
export function getPromotionsAdmin(storeCode = STORE_CODE) {
  const params = storeCode ? { store_code: storeCode } : {};
  return getRequest(`${PROMOTIONS_BASE}/admin`, params);
}

/** Admin: update promotion (bonus fields, title, description, etc.). */
export function updatePromotionAdmin(id, data) {
  return putRequest(`${PROMOTIONS_BASE}/admin/${id}`, data);
}
