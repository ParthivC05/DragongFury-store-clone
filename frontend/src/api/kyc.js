import { API_BASE } from '../config/api';
import { getRequest, postRequest } from '../services/request';

const KYC_BASE = `${API_BASE}/api/kyc`;

export function getKycStatus(params = {}) {
  return getRequest(`${KYC_BASE}/status`, params);
}

export function startKycSession() {
  return postRequest(`${KYC_BASE}/session`, {});
}
