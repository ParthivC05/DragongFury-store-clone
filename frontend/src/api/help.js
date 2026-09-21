import { API_BASE } from '../config/api';
import { getRequest } from '../services/request';

/**
 * Get help content for display. Optional store_code to show store-specific content.
 * Returns { topics: [{ id, label, sort_order, content, video_url }] }.
 */
export function getHelp(params = {}) {
  const query = {};
  if (params.store_code != null && String(params.store_code).trim()) {
    query.store_code = String(params.store_code).trim();
  }
  return getRequest(`${API_BASE}/api/help`, query);
}
