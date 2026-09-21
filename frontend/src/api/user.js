import { API_BASE } from '../config/api';
import { getRequest, patchRequest, postRequest } from '../services/request';
import { encodePasswordsInBody } from '../utils/passwordEncrypt';

const USER_BASE = `${API_BASE}/api/user`;

export function getProfile() {
  return getRequest(`${USER_BASE}/profile`);
}

export function updateProfile(data) {
  return patchRequest(`${USER_BASE}/profile`, data);
}

export function updateProfilePhoto(profileImageUrl) {
  return patchRequest(`${USER_BASE}/profile-photo`, { profileImageUrl });
}

export function changePassword(currentPassword, newPassword) {
  const body = encodePasswordsInBody({ currentPassword, newPassword });
  return postRequest(`${USER_BASE}/change-password`, body);
}
