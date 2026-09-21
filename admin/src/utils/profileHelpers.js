import { ROLES } from '../constants/roles'

/** Human-readable label for admin role. */
export function getRoleDisplayLabel(role) {
  if (!role) return '—'
  const labels = {
    [ROLES.MASTER_ADMIN]: 'Master Admin',
    [ROLES.DISTRIBUTOR_ADMIN]: 'Distributor Admin',
    [ROLES.STORE_ADMIN]: 'Store Admin',
    [ROLES.USER]: 'User'
  }
  return labels[role] || role
}

/** Whether to show distributor code for the given role. */
export function showDistributorCode(role) {
  return role === ROLES.DISTRIBUTOR_ADMIN || role === ROLES.STORE_ADMIN
}

/** Whether to show store code for the given role. */
export function showStoreCode(role) {
  return role === ROLES.STORE_ADMIN
}

/** Password rules aligned with backend (min 8 chars, upper, lower, number, special). Returns list of { label, met }. */
export function getNewPasswordRuleChecks(password) {
  const p = password || ''
  return [
    { label: 'At least 8 characters', met: p.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(p) },
    { label: 'One lowercase letter', met: /[a-z]/.test(p) },
    { label: 'One number', met: /\d/.test(p) },
    { label: 'One special character', met: /[\W_]/.test(p) }
  ]
}

/** True if all password rules are met (same logic as backend). */
export function isNewPasswordValid(password) {
  return getNewPasswordRuleChecks(password).every((r) => r.met)
}
