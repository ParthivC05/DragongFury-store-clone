import { request } from './client'

const BASE = '/api/daily-bonus'

export function listDailyBonusStores() {
  return request(`${BASE}/admin/stores`)
}

export function updateDailyBonusStore(payload) {
  return request(`${BASE}/admin/stores`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function listDailyBonusPackages({ storeCode, distributorCode } = {}) {
  const params = new URLSearchParams()
  if (storeCode) params.set('store_code', storeCode)
  if (distributorCode) params.set('distributor_code', distributorCode)
  const qs = params.toString()
  return request(`${BASE}/admin/packages${qs ? `?${qs}` : ''}`)
}
