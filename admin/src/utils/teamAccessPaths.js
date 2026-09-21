export const TEAM_PATH = '/team'

const TEAM_FORM_PREFIXES = ['/admin-roles', '/admin-staff', '/store-roles', '/store-staff']

export function teamAccessPath({ scope, tab, distributorCode, storeCode } = {}) {
  const q = new URLSearchParams()
  if (scope) q.set('scope', scope)
  if (tab) q.set('tab', tab)
  if (distributorCode) q.set('distributorCode', distributorCode)
  if (storeCode) q.set('storeCode', storeCode)
  const qs = q.toString()
  return `${TEAM_PATH}${qs ? `?${qs}` : ''}`
}

export function isTeamRelatedPath(pathname) {
  const p = String(pathname || '').replace(/\/$/, '') || '/'
  if (p === TEAM_PATH) return true
  return TEAM_FORM_PREFIXES.some((base) => p === base || p.startsWith(`${base}/`))
}
