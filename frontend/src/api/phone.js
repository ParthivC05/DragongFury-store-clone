import { API_BASE } from '../config/api';
import { STORE_CODE } from '../config/site';
import { getRequest, postRequest } from '../services/request';
import { setToken as setStorageToken } from '../services/storageUtils';

const PHONE_BASE = `${API_BASE}/api/phone`;

function withStore(extra = {}) {
  const body = { ...extra };
  if (STORE_CODE) body.clientStoreCode = STORE_CODE;
  return body;
}

export function sendPhoneOtp(phone, opts = {}) {
  return postRequest(
    `${PHONE_BASE}/send`,
    withStore({
      phone,
      ...(opts.phoneChallengeToken ? { phoneChallengeToken: opts.phoneChallengeToken } : {})
    })
  );
}

export function checkPhoneOtp(phone, code) {
  return postRequest(`${PHONE_BASE}/check`, withStore({ phone, code }));
}

/** Finish login after password/SSO phone challenge (issues access token). */
export function completePhoneLogin(phone, code, phoneChallengeToken) {
  return postRequest(
    `${PHONE_BASE}/complete-login`,
    withStore({ phone, code, phoneChallengeToken })
  ).then((json) => {
    if (json.token) setStorageToken(json.token);
    return json;
  });
}

export function getPhoneStatus() {
  return getRequest(`${PHONE_BASE}/status`);
}
