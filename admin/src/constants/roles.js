export const ROLES = {
  MASTER_ADMIN: 'master_admin',
  DISTRIBUTOR_ADMIN: 'distributor_admin',
  STORE_ADMIN: 'store_admin',
  USER: 'user'
}

export const ADMIN_PANEL_ROLES = [ROLES.MASTER_ADMIN, ROLES.DISTRIBUTOR_ADMIN, ROLES.STORE_ADMIN]

export function canAccessAdminPanel(role) {
  return role && ADMIN_PANEL_ROLES.includes(role)
}

export function canAccessDistributors(role) {
  return role === ROLES.MASTER_ADMIN
}

export function canAccessUsersList(role) {
  return role === ROLES.MASTER_ADMIN || role === ROLES.DISTRIBUTOR_ADMIN || role === ROLES.STORE_ADMIN
}

export function canAccessStoreSettings(role) {
  return role === ROLES.STORE_ADMIN
}
