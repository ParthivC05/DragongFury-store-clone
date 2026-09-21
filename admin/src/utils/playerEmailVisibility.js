import { ROLES } from '../constants/roles'

/**
 * Only master_admin (super admin + platform technical staff) may see end-user / player emails.
 * Store admin / store staff manage users by userId — email is hidden.
 */
export function canViewPlayerEmail(role) {
  return role === ROLES.MASTER_ADMIN
}

/** Email column is only for master_admin (full email). Store roles: hide email, use userId. */
export function canShowPlayerEmailColumn(role) {
  return role === ROLES.MASTER_ADMIN
}
