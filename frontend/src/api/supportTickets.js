import { API_BASE } from '../config/api';
import { getRequest, postRequest } from '../services/request';

const BASE = `${API_BASE}/api/support-tickets`;

export function listSupportTickets(params = {}) {
  return getRequest(BASE, params);
}

export function getSupportTicket(id) {
  return getRequest(`${BASE}/${encodeURIComponent(id)}`);
}

export function createSupportTicket(body) {
  return postRequest(BASE, body || {});
}

export function replySupportTicket(id, body) {
  return postRequest(`${BASE}/${encodeURIComponent(id)}/messages`, body || {});
}

export function uploadSupportTicketImage(file) {
  const form = new FormData();
  form.append('file', file);
  return postRequest(`${BASE}/upload`, form);
}
