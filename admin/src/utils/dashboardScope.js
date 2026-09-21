/**
 * Single source of truth for dashboard scope from logged-in user.
 * Used for: API params, dashboard subtitle, which cards/charts to show.
 */

import { ROLES } from '../constants/roles'

/**
 * @param {object} user - Logged-in user from useAuth() (role, distributorCode, storeCode)
 * @returns {{ level: 'platform'|'distributor'|'store', distributorCode?: string, storeCode?: string }}
 */
export function getScopeFromUser(user) {
  if (!user || !user.role) {
    return { level: 'platform', distributorCode: undefined, storeCode: undefined }
  }
  if (user.role === ROLES.MASTER_ADMIN) {
    return { level: 'platform', distributorCode: undefined, storeCode: undefined }
  }
  if (user.role === ROLES.DISTRIBUTOR_ADMIN) {
    return {
      level: 'distributor',
      distributorCode: user.distributorCode ?? undefined,
      storeCode: undefined
    }
  }
  if (user.role === ROLES.STORE_ADMIN) {
    return {
      level: 'store',
      distributorCode: user.distributorCode ?? undefined,
      storeCode: user.storeCode ?? undefined
    }
  }
  return { level: 'platform', distributorCode: undefined, storeCode: undefined }
}

/**
 * Human-readable scope label for dashboard subtitle.
 * @param {{ level: string, distributorCode?: string, storeCode?: string }} scope
 * @returns {string}
 */
export function getScopeLabel(scope) {
  if (!scope) return 'Platform'
  if (scope.level === 'platform') return 'Platform'
  if (scope.level === 'distributor' && scope.distributorCode) {
    return `Distributor ${scope.distributorCode}`
  }
  if (scope.level === 'store' && scope.distributorCode != null && scope.storeCode != null) {
    return `Store ${scope.storeCode}`
  }
  return 'Platform'
}
