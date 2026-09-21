import { request } from './client'

const SPINWHEEL = '/api/spinwheel'

function scopeQuery(scope) {
  const q = new URLSearchParams()
  if (scope?.distributorCode) q.set('distributorCode', scope.distributorCode)
  if (scope?.storeCode) q.set('storeCode', scope.storeCode)
  const s = q.toString()
  return s ? `?${s}` : ''
}

/** Get spin wheel settings. Master can pass a store scope; store admin always gets their store. */
export function getSpinWheelSettings(scope) {
  return request(`${SPINWHEEL}/settings${scopeQuery(scope)}`)
}

/** Update spin wheel settings for the given scope. */
export function updateSpinWheelSettings(payload, scope) {
  return request(`${SPINWHEEL}/settings${scopeQuery(scope)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...payload, ...(scope || {}) })
  })
}

/** Reset spin wheel to platform default for the store (store admin, or master targeting a store). */
export function resetSpinWheelSettingsToDefault(scope) {
  return request(`${SPINWHEEL}/settings/reset-to-default${scopeQuery(scope)}`, {
    method: 'POST',
    body: JSON.stringify(scope || {})
  })
}
