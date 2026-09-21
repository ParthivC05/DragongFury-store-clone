import { request } from './client'

const BASE = '/api/deposit-packages'

function scopeQuery(scope) {
  const q = new URLSearchParams()
  if (scope?.distributorCode) q.set('distributorCode', scope.distributorCode)
  if (scope?.storeCode) q.set('storeCode', scope.storeCode)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function getDepositPackagesCatalog(scope) {
  return request(`${BASE}/admin/catalog${scopeQuery(scope)}`)
}

export function updateDepositPackageSettings(scope, body) {
  return request(`${BASE}/admin/settings${scopeQuery(scope)}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  })
}

export function patchDepositPackageGroup(scope, groupId, body) {
  return request(`${BASE}/admin/groups/${groupId}${scopeQuery(scope)}`, {
    method: 'PATCH',
    body: JSON.stringify(body)
  })
}

export function createDepositPackage(scope, body) {
  return request(`${BASE}/admin/packages${scopeQuery(scope)}`, {
    method: 'POST',
    body: JSON.stringify({
      ...body,
      distributorCode: scope?.distributorCode,
      storeCode: scope?.storeCode
    })
  })
}

export function patchDepositPackage(scope, packageId, body) {
  return request(`${BASE}/admin/packages/${packageId}${scopeQuery(scope)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...body,
      distributorCode: scope?.distributorCode,
      storeCode: scope?.storeCode
    })
  })
}

export function deleteDepositPackage(scope, packageId) {
  return request(`${BASE}/admin/packages/${packageId}${scopeQuery(scope)}`, {
    method: 'DELETE'
  })
}
