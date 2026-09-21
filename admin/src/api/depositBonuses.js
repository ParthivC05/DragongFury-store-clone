import { request } from './client'

const BASE = '/api/deposit-bonuses'

export function getDepositBonusSettings() {
  return request(`${BASE}/admin/settings`)
}

export function updateDepositBonusSettings(payload) {
  return request(`${BASE}/admin/settings`, { method: 'PUT', body: JSON.stringify(payload) })
}

export function resetDepositBonusSettingsToDefault() {
  return request(`${BASE}/admin/settings/reset-to-default`, { method: 'POST', body: JSON.stringify({}) })
}
